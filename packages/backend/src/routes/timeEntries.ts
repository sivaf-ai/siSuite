/** timeEntries.ts — rendicontazione ORE via form (percorso deterministico). */
import type { FastifyInstance } from 'fastify';
import { createTimeEntrySchema, type TimeEntryDto } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';

const SELECT = `SELECT id, engagement_id, activity_id, resource_id, typology, minutes, occurred_on, notes, created_at FROM time_entry`;
function toDto(r: Record<string, unknown>): TimeEntryDto {
  return {
    id: r.id as string, engagementId: (r.engagement_id as string) ?? null, activityId: (r.activity_id as string) ?? null,
    resourceId: (r.resource_id as string) ?? null, typology: r.typology as string, minutes: r.minutes as number,
    occurredOn: r.occurred_on as string, notes: (r.notes as string) ?? null, createdAt: r.created_at as string,
  };
}

export async function timeEntryRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { engagementId?: string; activityId?: string } }>('/time-entries',
    { preHandler: [app.authenticate, requirePermission('time_entry:read')] },
    async (request) => {
      const rows = await withRls(request.ctx, (db) => {
        const params: unknown[] = [];
        const conds: string[] = [];
        if (request.query.engagementId) { params.push(request.query.engagementId); conds.push(`engagement_id = $${params.length}`); }
        if (request.query.activityId) { params.push(request.query.activityId); conds.push(`activity_id = $${params.length}`); }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        return db.query(`${SELECT} ${where} ORDER BY occurred_on DESC, created_at DESC LIMIT 500`, params).then((r) => r.rows);
      });
      return { items: rows.map(toDto) };
    });

  app.post('/time-entries', { preHandler: [app.authenticate, requirePermission('time_entry:create')] },
    async (request, reply) => {
      const input = createTimeEntrySchema.parse(request.body);
      const ctx = request.ctx;
      const dto = await withRls(ctx, async (db) => {
        const ins = await db.query(
          `INSERT INTO time_entry (tenant_id, engagement_id, activity_id, resource_id, typology, minutes, occurred_on, notes, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
           RETURNING id, engagement_id, activity_id, resource_id, typology, minutes, occurred_on, notes, created_at`,
          [ctx.tenantId, input.engagementId ?? null, input.activityId ?? null, input.resourceId ?? null,
           input.typology, input.minutes, input.occurredOn, input.notes ?? null, ctx.userId],
        );
        return toDto(ins.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  app.delete<{ Params: { id: string } }>('/time-entries/:id',
    { preHandler: [app.authenticate, requirePermission('time_entry:delete')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`DELETE FROM time_entry WHERE id = $1`, [request.params.id]));
      return reply.code(204).send();
    });
}
