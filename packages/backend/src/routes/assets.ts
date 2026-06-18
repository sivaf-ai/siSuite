/** assets.ts — CRUD asset (l'oggetto gestito: piscina, impianto, sistema software). */
import type { FastifyInstance } from 'fastify';
import { createAssetSchema, updateAssetSchema, listQuerySchema, type AssetDto } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { validateAttributes } from '../fields.js';
import { buildFilter } from '../filterSql.js';

const SORTABLE: Record<string, string> = { label: 'a.label', kind: 'a.kind', createdAt: 'a.created_at' };
const FILTER_FIELDS: Record<string, string> = { label: 'a.label', kind: 'a.kind', installedOn: 'a.installed_at' };
const FILTER_ANY = ['a.label', 'a.kind'];

const SELECT = `
  SELECT a.id, a.company_id, c.display_name AS company_name, a.kind, a.label,
         a.site_id, s.name AS site_name, a.installed_at, a.attributes, a.created_at
  FROM asset a
  LEFT JOIN company c ON c.id = a.company_id
  LEFT JOIN site s ON s.id = a.site_id
`;
function toDto(r: Record<string, unknown>): AssetDto {
  return {
    id: r.id as string, companyId: r.company_id as string, companyName: (r.company_name as string) ?? null,
    kind: r.kind as string, label: r.label as string,
    siteId: (r.site_id as string) ?? null, siteName: (r.site_name as string) ?? null,
    installedOn: (r.installed_at as string) ?? null,
    attributes: (r.attributes as Record<string, unknown>) ?? {}, createdAt: r.created_at as string,
  };
}

export async function assetRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { companyId?: string } }>('/assets',
    { preHandler: [app.authenticate, requirePermission('asset:read')] },
    async (request) => {
      const q = listQuerySchema.parse(request.query);
      const sortCol = SORTABLE[q.sortBy ?? ''] ?? 'a.label';
      return withRls(request.ctx, async (db) => {
        const params: unknown[] = [];
        let where = `WHERE a.archived_at IS NULL`;
        if (request.query.companyId) { params.push(request.query.companyId); where += ` AND a.company_id = $${params.length}`; }
        if (q.q) { params.push(`%${q.q}%`); where += ` AND (a.label ILIKE $${params.length} OR a.kind ILIKE $${params.length})`; }
        const fsql = buildFilter((request.query as Record<string, unknown>).filter as string | undefined, FILTER_FIELDS, FILTER_ANY, params);
        if (fsql) where += ` AND ${fsql}`;
        const total = await db.query(`SELECT count(*)::int AS n FROM asset a ${where}`, params);
        params.push(q.limit, q.offset);
        const rows = await db.query(`${SELECT} ${where} ORDER BY ${sortCol} ${q.sortDir} NULLS LAST LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
        return { items: rows.rows.map(toDto), total: total.rows[0].n as number, limit: q.limit, offset: q.offset };
      });
    });

  app.get<{ Params: { id: string } }>('/assets/:id',
    { preHandler: [app.authenticate, requirePermission('asset:read')] },
    async (request, reply) => {
      const rows = await withRls(request.ctx, (db) => db.query(`${SELECT} WHERE a.id = $1`, [request.params.id]).then((r) => r.rows));
      if (!rows.length) return reply.code(404).send({ error: 'not_found', message: 'Asset non trovato', statusCode: 404 });
      return toDto(rows[0]);
    });

  app.post('/assets', { preHandler: [app.authenticate, requirePermission('asset:create')] },
    async (request, reply) => {
      const input = createAssetSchema.parse(request.body);
      const ctx = request.ctx;
      const dto = await withRls(ctx, async (db) => {
        const attrs = await validateAttributes(db, ctx.tenantId, 'asset', input.attributes);
        const ins = await db.query(
          `INSERT INTO asset (tenant_id, company_id, kind, label, site_id, installed_at, attributes, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id`,
          [ctx.tenantId, input.companyId, input.kind, input.label, input.siteId ?? null, input.installedOn ?? null, attrs, ctx.userId],
        );
        const r = await db.query(`${SELECT} WHERE a.id = $1`, [ins.rows[0].id]);
        return toDto(r.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  app.patch<{ Params: { id: string } }>('/assets/:id',
    { preHandler: [app.authenticate, requirePermission('asset:update')] },
    async (request, reply) => {
      const input = updateAssetSchema.parse(request.body);
      const out = await withRls(request.ctx, async (db) => {
        const ex = await db.query(`SELECT 1 FROM asset WHERE id = $1`, [request.params.id]);
        if (!ex.rows.length) return null;
        const attrs = input.attributes ? await validateAttributes(db, request.ctx.tenantId, 'asset', input.attributes) : null;
        await db.query(
          `UPDATE asset SET kind = COALESCE($2, kind), label = COALESCE($3, label),
             site_id = CASE WHEN $4::uuid IS NOT NULL OR $7 THEN $4 ELSE site_id END,
             installed_at = COALESCE($5, installed_at), attributes = COALESCE($6, attributes), updated_by = $8
           WHERE id = $1`,
          [request.params.id, input.kind ?? null, input.label ?? null, input.siteId ?? null,
           input.installedOn ?? null, attrs, input.siteId === null, request.ctx.userId],
        );
        const r = await db.query(`${SELECT} WHERE a.id = $1`, [request.params.id]);
        return toDto(r.rows[0]);
      });
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Asset non trovato', statusCode: 404 });
      return out;
    });

  app.delete<{ Params: { id: string } }>('/assets/:id',
    { preHandler: [app.authenticate, requirePermission('asset:delete')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`UPDATE asset SET archived_at = now(), updated_by = $2 WHERE id = $1`, [request.params.id, request.ctx.userId]));
      return reply.code(204).send();
    });
}
