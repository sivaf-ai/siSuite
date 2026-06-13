/** numberSeries.ts — numeratori documenti (number_series). CRUD admin
 *  (settings:manage). La PK è (tenant_id, key): l'`id` del DTO È la key.
 *  La GENERAZIONE gapless del prossimo numero vive in ../numberSeries.ts
 *  (nextNumber), qui si configurano solo formato e reset. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createNumberSeriesSchema, updateNumberSeriesSchema, type NumberSeriesDto,
} from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';

function mapRow(r: Record<string, unknown>): NumberSeriesDto {
  return {
    id: r.key as string,
    key: r.key as string,
    format: r.format as string,
    resetPeriod: r.reset_period as string,
    currentPeriod: (r.current_period as string) ?? '',
    lastNumber: Number(r.last_number ?? 0),
  };
}

const listQuery = z.object({
  q: z.string().trim().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function numberSeriesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/number-series', { preHandler: [app.authenticate, requirePermission('settings:read')] },
    async (request) => {
      const qp = listQuery.parse(request.query);
      const sortCol = qp.sortBy === 'format' ? 'format' : 'key';
      return withRls(request.ctx, async (db) => {
        const params: unknown[] = [];
        let where = `WHERE tenant_id = $1`;
        params.push(request.ctx.tenantId);
        if (qp.q) { params.push(`%${qp.q}%`); where += ` AND key ILIKE $${params.length}`; }
        const total = await db.query(`SELECT count(*)::int AS n FROM number_series ${where}`, params);
        params.push(qp.limit, qp.offset);
        const rows = await db.query(
          `SELECT key, format, reset_period, current_period, last_number FROM number_series
           ${where} ORDER BY ${sortCol} ${qp.sortDir} LIMIT $${params.length - 1} OFFSET $${params.length}`,
          params,
        );
        return { items: rows.rows.map(mapRow), total: total.rows[0].n as number, limit: qp.limit, offset: qp.offset };
      });
    });

  app.post('/number-series', { preHandler: [app.authenticate, requirePermission('settings:manage')] },
    async (request, reply) => {
      const input = createNumberSeriesSchema.parse(request.body);
      const dto = await withRls(request.ctx, async (db) => {
        const ins = await db.query(
          `INSERT INTO number_series (tenant_id, key, format, reset_period)
           VALUES ($1,$2,$3,$4)
           RETURNING key, format, reset_period, current_period, last_number`,
          [request.ctx.tenantId, input.key, input.format, input.resetPeriod],
        );
        return mapRow(ins.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  // :id è la KEY
  app.patch<{ Params: { id: string } }>('/number-series/:id',
    { preHandler: [app.authenticate, requirePermission('settings:manage')] },
    async (request, reply) => {
      const input = updateNumberSeriesSchema.parse(request.body);
      const out = await withRls(request.ctx, async (db) => {
        const r = await db.query(
          `UPDATE number_series SET
             format = COALESCE($3, format),
             reset_period = COALESCE($4, reset_period)
           WHERE tenant_id = $1 AND key = $2
           RETURNING key, format, reset_period, current_period, last_number`,
          [request.ctx.tenantId, request.params.id, input.format ?? null, input.resetPeriod ?? null],
        );
        return r.rows.length ? mapRow(r.rows[0]) : null;
      });
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Numeratore non trovato', statusCode: 404 });
      return out;
    });

  app.delete<{ Params: { id: string } }>('/number-series/:id',
    { preHandler: [app.authenticate, requirePermission('settings:manage')] },
    async (request, reply) => {
      const ok = await withRls(request.ctx, async (db) => {
        const r = await db.query(`DELETE FROM number_series WHERE tenant_id = $1 AND key = $2 RETURNING key`,
          [request.ctx.tenantId, request.params.id]);
        return r.rows.length > 0;
      });
      if (!ok) return reply.code(404).send({ error: 'not_found', message: 'Numeratore non trovato', statusCode: 404 });
      return reply.code(204).send();
    });
}
