/** consumptions.ts — rendicontazione CONSUMI MATERIALI via form. */
import type { FastifyInstance } from 'fastify';
import { createConsumptionSchema, type ConsumptionDto } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';

const SELECT = `
  SELECT mc.id, mc.activity_id, mc.material_id, m.name AS material_name, mc.quantity, mcu.code AS unit, mc.occurred_on, mc.created_at
  FROM material_consumption mc LEFT JOIN material m ON m.id = mc.material_id
  LEFT JOIN unit_of_measure mcu ON mcu.id = mc.unit_id
`;
function toDto(r: Record<string, unknown>): ConsumptionDto {
  return {
    id: r.id as string, activityId: (r.activity_id as string) ?? null, materialId: r.material_id as string,
    materialName: (r.material_name as string) ?? null, quantity: Number(r.quantity), unit: r.unit as string,
    occurredOn: r.occurred_on as string, createdAt: r.created_at as string,
  };
}

export async function consumptionRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { activityId?: string; engagementId?: string } }>('/consumptions',
    { preHandler: [app.authenticate, requirePermission('material_consumption:read')] },
    async (request) => {
      const rows = await withRls(request.ctx, (db) => {
        const params: unknown[] = [];
        const conds: string[] = [];
        if (request.query.activityId) { params.push(request.query.activityId); conds.push(`mc.activity_id = $${params.length}`); }
        if (request.query.engagementId) { params.push(request.query.engagementId); conds.push(`mc.activity_id IN (SELECT id FROM activity WHERE engagement_id = $${params.length})`); }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        return db.query(`${SELECT} ${where} ORDER BY mc.occurred_on DESC, mc.created_at DESC LIMIT 500`, params).then((r) => r.rows);
      });
      return { items: rows.map(toDto) };
    });

  app.post('/consumptions', { preHandler: [app.authenticate, requirePermission('material_consumption:create')] },
    async (request, reply) => {
      const input = createConsumptionSchema.parse(request.body);
      const ctx = request.ctx;
      const dto = await withRls(ctx, async (db) => {
        const ins = await db.query(
          `INSERT INTO material_consumption (tenant_id, activity_id, material_id, quantity, unit_id, occurred_on, created_by, updated_by)
           VALUES ($1,$2,$3,$4,public.app_resolve_unit(public.app_current_tenant(),$5),$6,$7,$7) RETURNING id`,
          [ctx.tenantId, input.activityId ?? null, input.materialId, input.quantity, input.unit, input.occurredOn, ctx.userId],
        );
        const r = await db.query(`${SELECT} WHERE mc.id = $1`, [ins.rows[0].id]);
        return toDto(r.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  app.delete<{ Params: { id: string } }>('/consumptions/:id',
    { preHandler: [app.authenticate, requirePermission('material_consumption:delete')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`DELETE FROM material_consumption WHERE id = $1`, [request.params.id]));
      return reply.code(204).send();
    });
}
