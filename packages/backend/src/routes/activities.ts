/** activities.ts — CRUD attività + checklist + assegnazione risorse.
 *  L'attività è l'unica unità schedulabile (porta ore/risorse/materiali, va in agenda).
 *  FISSA se scheduled_start è valorizzato; DINAMICA altrimenti (la colloca il motore di flusso).
 */
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from '../db/pool.js';
import {
  createActivitySchema, updateActivitySchema, updateChecklistSchema, assignResourceSchema,
  type ActivityDto, type ActivityResourceDto,
} from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { lookupDefaultId } from '../status.js';

const SELECT = `
  SELECT a.id, a.engagement_id, a.phase_id, a.asset_id, a.title, a.kind,
         a.status_id, s.canonical AS status_canonical,
         a.priority_id, pr.canonical AS priority_canonical,
         a.estimated_minutes, a.scheduled_start, a.scheduled_end, a.earliest_start, a.due_by,
         a.checklist, a.created_at
  FROM activity a
  LEFT JOIN lookup_value s  ON s.id  = a.status_id
  LEFT JOIN lookup_value pr ON pr.id = a.priority_id
`;

function toDto(r: Record<string, unknown>): ActivityDto {
  return {
    id: r.id as string, engagementId: r.engagement_id as string,
    phaseId: (r.phase_id as string) ?? null, assetId: (r.asset_id as string) ?? null,
    title: r.title as string, kind: (r.kind as string) ?? null,
    statusId: r.status_id as string, statusCanonical: (r.status_canonical as string) ?? null,
    priorityId: (r.priority_id as string) ?? null, priorityCanonical: (r.priority_canonical as string) ?? null,
    estimatedMinutes: (r.estimated_minutes as number) ?? null,
    scheduledStart: (r.scheduled_start as string) ?? null, scheduledEnd: (r.scheduled_end as string) ?? null,
    earliestStart: (r.earliest_start as string) ?? null, dueBy: (r.due_by as string) ?? null,
    isFixed: r.scheduled_start != null,
    checklist: (r.checklist as { text: string; done: boolean }[]) ?? [],
    createdAt: r.created_at as string,
  };
}
function arDto(r: Record<string, unknown>): ActivityResourceDto {
  return {
    id: r.id as string, activityId: r.activity_id as string, resourceId: r.resource_id as string,
    resourceLabel: (r.resource_label as string) ?? null,
    plannedFrom: (r.planned_from as string) ?? null, plannedTo: (r.planned_to as string) ?? null,
  };
}
async function loadOne(db: PoolClient, id: string): Promise<ActivityDto | null> {
  const r = await db.query(`${SELECT} WHERE a.id = $1`, [id]);
  return r.rows.length ? toDto(r.rows[0]) : null;
}

export async function activityRoutes(app: FastifyInstance): Promise<void> {
  // LISTA (filtri: engagementId, phaseId)
  app.get<{ Querystring: { engagementId?: string; phaseId?: string } }>('/activities',
    { preHandler: [app.authenticate, requirePermission('activity:read')] },
    async (request) => {
      const rows = await withRls(request.ctx, (db) => {
        const params: unknown[] = [];
        const conds: string[] = [];
        if (request.query.engagementId) { params.push(request.query.engagementId); conds.push(`a.engagement_id = $${params.length}`); }
        if (request.query.phaseId) { params.push(request.query.phaseId); conds.push(`a.phase_id = $${params.length}`); }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        return db.query(`${SELECT} ${where} ORDER BY a.scheduled_start NULLS LAST, a.created_at LIMIT 500`, params).then((r) => r.rows);
      });
      return { items: rows.map(toDto) };
    });

  // OGGI (agenda del tecnico): fisse di oggi + dinamiche non concluse. RLS scope=own filtra al singolo.
  app.get('/activities/today', { preHandler: [app.authenticate, requirePermission('activity:read')] },
    async (request) => {
      const rows = await withRls(request.ctx, (db) =>
        db.query(
          `${SELECT}
           WHERE (a.scheduled_start::date = current_date)
              OR (a.scheduled_start IS NULL AND s.canonical NOT IN ('done','cancelled'))
           ORDER BY a.scheduled_start NULLS LAST, a.created_at LIMIT 200`,
        ).then((r) => r.rows));
      return { items: rows.map(toDto) };
    });

  // DETTAGLIO (+ risorse assegnate)
  app.get<{ Params: { id: string } }>('/activities/:id',
    { preHandler: [app.authenticate, requirePermission('activity:read')] },
    async (request, reply) => {
      const out = await withRls(request.ctx, async (db) => {
        const a = await loadOne(db, request.params.id);
        if (!a) return null;
        const res = await db.query(
          `SELECT ar.id, ar.activity_id, ar.resource_id, r.label AS resource_label, ar.planned_from, ar.planned_to
           FROM activity_resource ar LEFT JOIN resource r ON r.id = ar.resource_id
           WHERE ar.activity_id = $1`, [request.params.id]);
        return { ...a, resources: res.rows.map(arDto) };
      });
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Attività non trovata', statusCode: 404 });
      return out;
    });

  // CREA
  app.post('/activities', { preHandler: [app.authenticate, requirePermission('activity:create')] },
    async (request, reply) => {
      const input = createActivitySchema.parse(request.body);
      const ctx = request.ctx;
      const dto = await withRls(ctx, async (db) => {
        const statusId = input.statusId ?? (await lookupDefaultId(db, 'activity_status', 'planned'));
        const ins = await db.query(
          `INSERT INTO activity
             (tenant_id, engagement_id, phase_id, asset_id, title, kind, status_id, priority_id,
              estimated_minutes, scheduled_start, earliest_start, due_by, checklist, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) RETURNING id`,
          [ctx.tenantId, input.engagementId, input.phaseId ?? null, input.assetId ?? null, input.title,
           input.kind ?? null, statusId, input.priorityId ?? null, input.estimatedMinutes ?? null,
           input.scheduledStart ?? null, input.earliestStart ?? null, input.dueBy ?? null,
           JSON.stringify(input.checklist ?? []), ctx.userId],
        );
        return (await loadOne(db, ins.rows[0].id))!;
      });
      return reply.code(201).send(dto);
    });

  // MODIFICA
  app.patch<{ Params: { id: string } }>('/activities/:id',
    { preHandler: [app.authenticate, requirePermission('activity:update')] },
    async (request, reply) => {
      const input = updateActivitySchema.parse(request.body);
      const out = await withRls(request.ctx, async (db) => {
        const ex = await db.query(`SELECT 1 FROM activity WHERE id = $1`, [request.params.id]);
        if (!ex.rows.length) return null;
        await db.query(
          `UPDATE activity SET
             title = COALESCE($2, title), kind = COALESCE($3, kind),
             phase_id = COALESCE($4, phase_id), asset_id = COALESCE($5, asset_id),
             status_id = COALESCE($6, status_id), priority_id = COALESCE($7, priority_id),
             estimated_minutes = COALESCE($8, estimated_minutes),
             scheduled_start = COALESCE($9, scheduled_start),
             earliest_start = COALESCE($10, earliest_start), due_by = COALESCE($11, due_by),
             updated_by = $12
           WHERE id = $1`,
          [request.params.id, input.title ?? null, input.kind ?? null, input.phaseId ?? null, input.assetId ?? null,
           input.statusId ?? null, input.priorityId ?? null, input.estimatedMinutes ?? null,
           input.scheduledStart ?? null, input.earliestStart ?? null, input.dueBy ?? null, request.ctx.userId],
        );
        if (input.checklist) {
          await db.query(`UPDATE activity SET checklist = $2 WHERE id = $1`, [request.params.id, JSON.stringify(input.checklist)]);
        }
        return loadOne(db, request.params.id);
      });
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Attività non trovata', statusCode: 404 });
      return out;
    });

  // CHECKLIST (il tecnico spunta i passi)
  app.patch<{ Params: { id: string } }>('/activities/:id/checklist',
    { preHandler: [app.authenticate, requirePermission('activity:update')] },
    async (request, reply) => {
      const input = updateChecklistSchema.parse(request.body);
      const out = await withRls(request.ctx, async (db) => {
        const r = await db.query(`UPDATE activity SET checklist = $2, updated_by = $3 WHERE id = $1 RETURNING id`,
          [request.params.id, JSON.stringify(input.checklist), request.ctx.userId]);
        if (!r.rows.length) return null;
        return loadOne(db, request.params.id);
      });
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Attività non trovata', statusCode: 404 });
      return out;
    });

  // ASSEGNA RISORSA (rileva la doppia-prenotazione dal vincolo DB)
  app.post<{ Params: { id: string } }>('/activities/:id/resources',
    { preHandler: [app.authenticate, requirePermission('activity:assign')] },
    async (request, reply) => {
      const input = assignResourceSchema.parse(request.body);
      try {
        const dto = await withRls(request.ctx, async (db) => {
          const ins = await db.query(
            `INSERT INTO activity_resource (tenant_id, activity_id, resource_id, planned_from, planned_to)
             VALUES ($1,$2,$3,$4,$5) RETURNING id`,
            [request.ctx.tenantId, request.params.id, input.resourceId, input.plannedFrom ?? null, input.plannedTo ?? null]);
          const r = await db.query(
            `SELECT ar.id, ar.activity_id, ar.resource_id, r.label AS resource_label, ar.planned_from, ar.planned_to
             FROM activity_resource ar LEFT JOIN resource r ON r.id = ar.resource_id WHERE ar.id = $1`, [ins.rows[0].id]);
          return arDto(r.rows[0]);
        });
        return reply.code(201).send(dto);
      } catch (err) {
        if ((err as { code?: string }).code === '23P01') {
          return reply.code(409).send({ error: 'conflict', message: 'Risorsa già impegnata in quell\'intervallo (doppia prenotazione)', statusCode: 409 });
        }
        throw err;
      }
    });

  app.delete<{ Params: { id: string; arId: string } }>('/activities/:id/resources/:arId',
    { preHandler: [app.authenticate, requirePermission('activity:assign')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`DELETE FROM activity_resource WHERE id = $1`, [request.params.arId]));
      return reply.code(204).send();
    });

  // ELIMINA (solo chi vede tutto il tenant; il tecnico own non ha activity:delete)
  app.delete<{ Params: { id: string } }>('/activities/:id',
    { preHandler: [app.authenticate, requirePermission('activity:delete')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`DELETE FROM activity WHERE id = $1`, [request.params.id]));
      return reply.code(204).send();
    });
}
