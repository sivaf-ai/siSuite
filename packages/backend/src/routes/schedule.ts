/** schedule.ts — agenda calcolata.
 *  - GET /engagements/:id/schedule : timeline classica di una commessa (invariata).
 *  - GET /schedule/week?from=YYYY-MM-DD : pianificazione PER-RISORSA settimanale
 *    (griglia risorse×giorni, mock 03) + narrazione/proposte AI sui conflitti. */
import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import {
  schedule, scheduleResources,
  type FlowActivity, type WorkingHours, type FlowResource, type FlowAssignedActivity,
} from '../flow/scheduler.js';
import { narrateWeek } from '../ai/narrator.js';

const PRIORITY_SEQ: Record<string, number> = { urgent: 1, high: 2, medium: 3, low: 4 };

export async function scheduleRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>('/engagements/:id/schedule',
    { preHandler: [app.authenticate, requirePermission('activity:read')] },
    async (request) => {
      const result = await withRls(request.ctx, async (db) => {
        const wh = await db.query(`SELECT working_hours FROM tenant WHERE id = $1`, [request.ctx.tenantId]);
        const workingHours = (wh.rows[0]?.working_hours ?? {}) as WorkingHours;
        const acts = await db.query(
          `SELECT a.id, a.title, a.estimated_minutes, a.scheduled_start, a.earliest_start, a.due_by, a.created_at,
                  pr.canonical AS priority_canonical
           FROM activity a
           LEFT JOIN lookup_value s  ON s.id  = a.status_id
           LEFT JOIN lookup_value pr ON pr.id = a.priority_id
           WHERE a.engagement_id = $1 AND (s.canonical IS NULL OR s.canonical NOT IN ('done','cancelled'))`,
          [request.params.id],
        );
        const flowActs: FlowActivity[] = acts.rows.map((r) => ({
          id: r.id, title: r.title,
          estimatedMinutes: r.estimated_minutes ?? null,
          scheduledStart: r.scheduled_start ? new Date(r.scheduled_start).toISOString() : null,
          earliestStart: r.earliest_start ? new Date(r.earliest_start).toISOString() : null,
          dueBy: r.due_by ? new Date(r.due_by).toISOString() : null,
          prioritySeq: PRIORITY_SEQ[r.priority_canonical as string] ?? 3,
          createdAt: new Date(r.created_at).toISOString(),
        }));
        return schedule(flowActs, workingHours, new Date());
      });
      const conflicts = result.filter((r) => r.conflict !== 'none');
      return { items: result, conflicts };
    });

  // ── Pianificazione PER-RISORSA, settimanale (mock 03) ──────────────
  app.get<{ Querystring: { from?: string } }>('/schedule/week',
    { preHandler: [app.authenticate, requirePermission('activity:read')] },
    async (request) => {
      const fromStr = request.query.from;
      const weekFrom = fromStr && /^\d{4}-\d{2}-\d{2}$/.test(fromStr) ? fromStr : new Date().toISOString().slice(0, 10);

      const week = await withRls(request.ctx, async (db) => {
        const tw = await db.query(`SELECT working_hours FROM tenant WHERE id = $1`, [request.ctx.tenantId]);
        const tenantWH = (tw.rows[0]?.working_hours ?? {}) as WorkingHours;

        const res = await db.query(`SELECT id, label, kind, working_hours FROM resource WHERE active AND archived_at IS NULL ORDER BY kind, label`);
        const av = await db.query(`SELECT resource_id, starts_at, ends_at FROM resource_availability WHERE kind = 'unavailable'`);
        const avByRes = new Map<string, { start: string; end: string }[]>();
        for (const a of av.rows) {
          const arr = avByRes.get(a.resource_id) ?? [];
          arr.push({ start: new Date(a.starts_at).toISOString(), end: new Date(a.ends_at).toISOString() });
          avByRes.set(a.resource_id, arr);
        }
        const resources: FlowResource[] = res.rows.map((r) => ({
          id: r.id, label: r.label, resourceKind: r.kind,
          workingHours: (r.working_hours as WorkingHours | null) ?? null,
          unavailable: avByRes.get(r.id) ?? [],
        }));

        const acts = await db.query(
          `SELECT a.id, a.title, a.estimated_minutes, a.scheduled_start, a.earliest_start, a.due_by, a.created_at,
                  pr.canonical AS priority_canonical,
                  array_remove(array_agg(ar.resource_id), NULL) AS resource_ids
           FROM activity a
           LEFT JOIN lookup_value s  ON s.id  = a.status_id
           LEFT JOIN lookup_value pr ON pr.id = a.priority_id
           LEFT JOIN activity_resource ar ON ar.activity_id = a.id
           WHERE (s.canonical IS NULL OR s.canonical NOT IN ('done','cancelled'))
           GROUP BY a.id, pr.canonical`,
        );
        const flowActs: FlowAssignedActivity[] = acts.rows.map((r) => ({
          id: r.id, title: r.title,
          estimatedMinutes: r.estimated_minutes ?? null,
          scheduledStart: r.scheduled_start ? new Date(r.scheduled_start).toISOString() : null,
          earliestStart: r.earliest_start ? new Date(r.earliest_start).toISOString() : null,
          dueBy: r.due_by ? new Date(r.due_by).toISOString() : null,
          prioritySeq: PRIORITY_SEQ[r.priority_canonical as string] ?? 3,
          createdAt: new Date(r.created_at).toISOString(),
          resourceIds: (r.resource_ids as string[]) ?? [],
        }));

        return scheduleResources(resources, flowActs, tenantWH, new Date());
      });

      // layer AI: racconta la settimana e PROPONE la riprogrammazione sui conflitti
      const narrative = await narrateWeek(request.ctx, {
        resources: week.resources.map((r) => ({ label: r.label, blocks: r.blocks.map((b) => ({ title: b.title, atRisk: b.atRisk })) })),
        conflicts: week.conflicts.map((c) => ({ title: c.title, reason: c.reason })),
      });

      return { weekFrom, resources: week.resources, conflicts: week.conflicts, narrative };
    });
}
