/** schedule.ts — agenda calcolata: colloca le attività dinamiche di una commessa. */
import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { schedule, type FlowActivity, type WorkingHours } from '../flow/scheduler.js';

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
}
