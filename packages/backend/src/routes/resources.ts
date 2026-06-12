/** resources.ts — CRUD risorse (persone, mezzi, attrezzature). */
import type { FastifyInstance } from 'fastify';
import { createResourceSchema, updateResourceSchema, listQuerySchema, type ResourceDto } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { validateAttributes } from '../fields.js';

const SELECT = `SELECT id, kind, label, user_id, active, attributes FROM resource`;
const SORTABLE: Record<string, string> = { label: 'label', kind: 'kind' };
function toDto(r: Record<string, unknown>): ResourceDto {
  return {
    id: r.id as string, kind: r.kind as ResourceDto['kind'], label: r.label as string,
    userId: (r.user_id as string) ?? null, active: r.active as boolean,
    attributes: (r.attributes as Record<string, unknown>) ?? {},
  };
}

export async function resourceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/resources', { preHandler: [app.authenticate, requirePermission('resource:read')] }, async (request) => {
    const q = listQuerySchema.parse(request.query);
    const sortCol = SORTABLE[q.sortBy ?? ''] ?? 'label';
    return withRls(request.ctx, async (db) => {
      const params: unknown[] = [];
      let where = `WHERE archived_at IS NULL`;
      if (q.q) { params.push(`%${q.q}%`); where += ` AND label ILIKE $${params.length}`; }
      const total = await db.query(`SELECT count(*)::int AS n FROM resource ${where}`, params);
      params.push(q.limit, q.offset);
      const rows = await db.query(`${SELECT} ${where} ORDER BY ${sortCol} ${q.sortDir} NULLS LAST LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
      return { items: rows.rows.map(toDto), total: total.rows[0].n as number, limit: q.limit, offset: q.offset };
    });
  });

  app.get<{ Params: { id: string } }>('/resources/:id',
    { preHandler: [app.authenticate, requirePermission('resource:read')] },
    async (request, reply) => {
      const rows = await withRls(request.ctx, (db) => db.query(`${SELECT} WHERE id = $1`, [request.params.id]).then((r) => r.rows));
      if (!rows.length) return reply.code(404).send({ error: 'not_found', message: 'Risorsa non trovata', statusCode: 404 });
      return toDto(rows[0]);
    });

  app.post('/resources', { preHandler: [app.authenticate, requirePermission('resource:create')] },
    async (request, reply) => {
      const input = createResourceSchema.parse(request.body);
      const ctx = request.ctx;
      const dto = await withRls(ctx, async (db) => {
        const attrs = await validateAttributes(db, ctx.tenantId, 'resource', input.attributes);
        const ins = await db.query(
          `INSERT INTO resource (tenant_id, kind, label, user_id, attributes, active, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id, kind, label, user_id, active, attributes`,
          [ctx.tenantId, input.kind, input.label, input.userId ?? null, attrs, input.active ?? true, ctx.userId],
        );
        return toDto(ins.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  app.patch<{ Params: { id: string } }>('/resources/:id',
    { preHandler: [app.authenticate, requirePermission('resource:update')] },
    async (request) =>
      withRls(request.ctx, async (db) => {
        const input = updateResourceSchema.parse(request.body);
        const attrs = input.attributes ? await validateAttributes(db, request.ctx.tenantId, 'resource', input.attributes) : null;
        const r = await db.query(
          `UPDATE resource SET kind = COALESCE($2, kind), label = COALESCE($3, label),
             user_id = COALESCE($4, user_id), attributes = COALESCE($5, attributes),
             active = COALESCE($6, active), updated_by = $7
           WHERE id = $1 RETURNING id, kind, label, user_id, active, attributes`,
          [request.params.id, input.kind ?? null, input.label ?? null, input.userId ?? null,
           attrs, input.active ?? null, request.ctx.userId],
        );
        return toDto(r.rows[0]);
      }));

  app.delete<{ Params: { id: string } }>('/resources/:id',
    { preHandler: [app.authenticate, requirePermission('resource:delete')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`UPDATE resource SET archived_at = now(), updated_by = $2 WHERE id = $1`, [request.params.id, request.ctx.userId]));
      return reply.code(204).send();
    });
}
