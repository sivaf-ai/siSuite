/** phases.ts — CRUD fasi (work-package) di una commessa. */
import type { FastifyInstance } from 'fastify';
import { createPhaseSchema, updatePhaseSchema, type PhaseDto } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { lookupDefaultId } from '../status.js';

const SELECT = `
  SELECT p.id, p.engagement_id, p.name, p.seq, p.parent_phase_id,
         p.planned_start, p.planned_end, p.status_id, lv.canonical AS status_canonical
  FROM phase p LEFT JOIN lookup_value lv ON lv.id = p.status_id
`;
function toDto(r: Record<string, unknown>): PhaseDto {
  return {
    id: r.id as string, engagementId: r.engagement_id as string, name: r.name as string, seq: r.seq as number,
    parentPhaseId: (r.parent_phase_id as string) ?? null,
    plannedStart: (r.planned_start as string) ?? null, plannedEnd: (r.planned_end as string) ?? null,
    statusId: r.status_id as string, statusCanonical: (r.status_canonical as string) ?? null,
  };
}

export async function phaseRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>('/engagements/:id/phases',
    { preHandler: [app.authenticate, requirePermission('phase:read')] },
    async (request) => {
      const rows = await withRls(request.ctx, (db) =>
        db.query(`${SELECT} WHERE p.engagement_id = $1 ORDER BY p.seq ASC`, [request.params.id]).then((r) => r.rows));
      return { items: rows.map(toDto) };
    });

  app.post('/phases', { preHandler: [app.authenticate, requirePermission('phase:create')] },
    async (request, reply) => {
      const input = createPhaseSchema.parse(request.body);
      const ctx = request.ctx;
      const dto = await withRls(ctx, async (db) => {
        const statusId = input.statusId ?? (await lookupDefaultId(db, 'phase_status', 'pending'));
        const ins = await db.query(
          `INSERT INTO phase (tenant_id, engagement_id, parent_phase_id, name, seq, planned_start, planned_end, status_id, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id`,
          [ctx.tenantId, input.engagementId, input.parentPhaseId ?? null, input.name, input.seq ?? 0,
           input.plannedStart ?? null, input.plannedEnd ?? null, statusId, ctx.userId],
        );
        const r = await db.query(`${SELECT} WHERE p.id = $1`, [ins.rows[0].id]);
        return toDto(r.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  app.patch<{ Params: { id: string } }>('/phases/:id',
    { preHandler: [app.authenticate, requirePermission('phase:update')] },
    async (request) =>
      withRls(request.ctx, async (db) => {
        const input = updatePhaseSchema.parse(request.body);
        await db.query(
          `UPDATE phase SET name = COALESCE($2, name), seq = COALESCE($3, seq),
             parent_phase_id = COALESCE($4, parent_phase_id), planned_start = COALESCE($5, planned_start),
             planned_end = COALESCE($6, planned_end), status_id = COALESCE($7, status_id), updated_by = $8
           WHERE id = $1`,
          [request.params.id, input.name ?? null, input.seq ?? null, input.parentPhaseId ?? null,
           input.plannedStart ?? null, input.plannedEnd ?? null, input.statusId ?? null, request.ctx.userId],
        );
        const r = await db.query(`${SELECT} WHERE p.id = $1`, [request.params.id]);
        return toDto(r.rows[0]);
      }));

  app.delete<{ Params: { id: string } }>('/phases/:id',
    { preHandler: [app.authenticate, requirePermission('phase:delete')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`DELETE FROM phase WHERE id = $1`, [request.params.id]));
      return reply.code(204).send();
    });
}
