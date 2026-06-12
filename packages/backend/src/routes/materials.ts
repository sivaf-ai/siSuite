/** materials.ts — CRUD catalogo materiali. */
import type { FastifyInstance } from 'fastify';
import { createMaterialSchema, updateMaterialSchema, listQuerySchema, type MaterialDto } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { validateAttributes } from '../fields.js';

const SORTABLE: Record<string, string> = { name: 'name', unit: 'unit' };

function toDto(r: Record<string, unknown>): MaterialDto {
  return { id: r.id as string, name: r.name as string, unit: r.unit as string, attributes: (r.attributes as Record<string, unknown>) ?? {} };
}

export async function materialRoutes(app: FastifyInstance): Promise<void> {
  app.get('/materials', { preHandler: [app.authenticate, requirePermission('material:read')] }, async (request) => {
    const q = listQuerySchema.parse(request.query);
    const sortCol = SORTABLE[q.sortBy ?? ''] ?? 'name';
    return withRls(request.ctx, async (db) => {
      const params: unknown[] = [];
      let where = `WHERE archived_at IS NULL`;
      if (q.q) { params.push(`%${q.q}%`); where += ` AND name ILIKE $${params.length}`; }
      const total = await db.query(`SELECT count(*)::int AS n FROM material ${where}`, params);
      params.push(q.limit, q.offset);
      const rows = await db.query(`SELECT id, name, unit, attributes FROM material ${where} ORDER BY ${sortCol} ${q.sortDir} NULLS LAST LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
      return { items: rows.rows.map(toDto), total: total.rows[0].n as number, limit: q.limit, offset: q.offset };
    });
  });

  app.post('/materials', { preHandler: [app.authenticate, requirePermission('material:create')] },
    async (request, reply) => {
      const input = createMaterialSchema.parse(request.body);
      const ctx = request.ctx;
      const dto = await withRls(ctx, async (db) => {
        const attrs = await validateAttributes(db, ctx.tenantId, 'material', input.attributes);
        const ins = await db.query(
          `INSERT INTO material (tenant_id, name, unit, attributes, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$5) RETURNING id, name, unit, attributes`,
          [ctx.tenantId, input.name, input.unit, attrs, ctx.userId],
        );
        return toDto(ins.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  app.patch<{ Params: { id: string } }>('/materials/:id',
    { preHandler: [app.authenticate, requirePermission('material:update')] },
    async (request) =>
      withRls(request.ctx, async (db) => {
        const input = updateMaterialSchema.parse(request.body);
        const attrs = input.attributes ? await validateAttributes(db, request.ctx.tenantId, 'material', input.attributes) : null;
        const r = await db.query(
          `UPDATE material SET name = COALESCE($2, name), unit = COALESCE($3, unit),
             attributes = COALESCE($4, attributes), updated_by = $5
           WHERE id = $1 RETURNING id, name, unit, attributes`,
          [request.params.id, input.name ?? null, input.unit ?? null, attrs, request.ctx.userId],
        );
        return toDto(r.rows[0]);
      }));

  app.delete<{ Params: { id: string } }>('/materials/:id',
    { preHandler: [app.authenticate, requirePermission('material:delete')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`UPDATE material SET archived_at = now(), updated_by = $2 WHERE id = $1`, [request.params.id, request.ctx.userId]));
      return reply.code(204).send();
    });
}
