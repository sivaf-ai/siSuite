/** assets.ts — CRUD asset (l'oggetto gestito: piscina, impianto, sistema software). */
import type { FastifyInstance } from 'fastify';
import { createAssetSchema, updateAssetSchema, listQuerySchema, type AssetDto } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { findUsage, usageMessage, ASSET_REFS } from '../context/usageGuard.js';
import { logAudit } from '../context/audit.js';
import { validateAttributes } from '../fields.js';
import { buildFilter } from '../filterSql.js';
import { buildOrderBy } from '../sortSql.js';

const SORTABLE: Record<string, string> = { label: 'a.label', kind: 'a.kind', createdAt: 'a.created_at' };
const FILTER_FIELDS: Record<string, string> = { label: 'a.label', kind: 'a.kind', installedOn: 'a.installed_at' };
const FILTER_ANY = ['a.label', 'a.kind'];

const SELECT = `
  SELECT a.id, a.company_id, c.display_name AS company_name, a.kind, a.label,
         a.site_id, s.name AS site_name, a.work_order_subject_id, a.parent_asset_id,
         a.model, a.manufacturer, a.warranty_until, a.status, a.installed_at, a.attributes, a.created_at,
         a.archived_at, au.full_name AS archived_by_name
  FROM asset a
  LEFT JOIN company c ON c.id = a.company_id
  LEFT JOIN site s ON s.id = a.site_id
  LEFT JOIN app_user au ON au.id = a.archived_by
`;
function toDto(r: Record<string, unknown>): AssetDto {
  const d = (v: unknown): string | null => (v instanceof Date ? v.toISOString().slice(0, 10) : (v as string) ?? null);
  return {
    id: r.id as string, companyId: (r.company_id as string) ?? null, companyName: (r.company_name as string) ?? null,
    kind: r.kind as string, label: r.label as string,
    siteId: (r.site_id as string) ?? null, siteName: (r.site_name as string) ?? null,
    workOrderSubjectId: (r.work_order_subject_id as string) ?? null, parentAssetId: (r.parent_asset_id as string) ?? null,
    model: (r.model as string) ?? null, manufacturer: (r.manufacturer as string) ?? null,
    warrantyUntil: d(r.warranty_until), status: (r.status as string) ?? null,
    installedOn: d(r.installed_at),
    attributes: (r.attributes as Record<string, unknown>) ?? {}, createdAt: r.created_at as string,
    archivedAt: (r.archived_at as Date | null)?.toISOString() ?? null,
    archivedByName: (r.archived_by_name as string) ?? null,
  };
}

export async function assetRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { companyId?: string } }>('/assets',
    { preHandler: [app.authenticate, requirePermission('asset:read')] },
    async (request) => {
      const q = listQuerySchema.parse(request.query);
      const orderBy = buildOrderBy((request.query as Record<string, unknown>).sort as string | undefined, SORTABLE, SORTABLE[q.sortBy ?? ''] ?? 'a.label', q.sortDir, 'a.attributes');
      const archivedParam = String((request.query as Record<string, unknown>).archived ?? '');
      const onlyArchived = archivedParam === '1' || archivedParam === 'only' || archivedParam === 'true';
      const archivedCond = onlyArchived ? 'a.archived_at IS NOT NULL' : 'a.archived_at IS NULL';
      return withRls(request.ctx, async (db) => {
        const params: unknown[] = [];
        let where = `WHERE ${archivedCond}`;
        if (request.query.companyId) { params.push(request.query.companyId); where += ` AND a.company_id = $${params.length}`; }
        if (q.q) { params.push(`%${q.q}%`); where += ` AND (a.label ILIKE $${params.length} OR a.kind ILIKE $${params.length})`; }
        const fsql = buildFilter((request.query as Record<string, unknown>).filter as string | undefined, FILTER_FIELDS, FILTER_ANY, params);
        if (fsql) where += ` AND ${fsql}`;
        const total = await db.query(`SELECT count(*)::int AS n FROM asset a ${where}`, params);
        params.push(q.limit, q.offset);
        const rows = await db.query(`${SELECT} ${where} ORDER BY ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
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
        const attrs = await validateAttributes(db, ctx.tenantId, 'asset', input.attributes, input.kind);
        const ins = await db.query(
          `INSERT INTO asset (tenant_id, company_id, work_order_subject_id, kind, label, site_id, parent_asset_id,
             model, manufacturer, warranty_until, status, installed_at, attributes, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) RETURNING id`,
          [ctx.tenantId, input.companyId ?? null, input.workOrderSubjectId ?? null, input.kind, input.label,
           input.siteId ?? null, input.parentAssetId ?? null, input.model ?? null, input.manufacturer ?? null,
           input.warrantyUntil ?? null, input.status ?? null, input.installedOn ?? null, attrs, ctx.userId],
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
        const ex = await db.query(`SELECT kind FROM asset WHERE id = $1`, [request.params.id]);
        if (!ex.rows.length) return null;
        const variant = input.kind ?? (ex.rows[0].kind as string);
        const attrs = input.attributes ? await validateAttributes(db, request.ctx.tenantId, 'asset', input.attributes, variant) : null;
        const sets: string[] = []; const vals: unknown[] = [request.params.id];
        const add = (col: string, val: unknown) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
        if (input.kind !== undefined) add('kind', input.kind);
        if (input.label !== undefined) add('label', input.label);
        if (input.companyId !== undefined) add('company_id', input.companyId);
        if (input.workOrderSubjectId !== undefined) add('work_order_subject_id', input.workOrderSubjectId);
        if (input.siteId !== undefined) add('site_id', input.siteId);
        if (input.parentAssetId !== undefined) add('parent_asset_id', input.parentAssetId);
        if (input.model !== undefined) add('model', input.model);
        if (input.manufacturer !== undefined) add('manufacturer', input.manufacturer);
        if (input.warrantyUntil !== undefined) add('warranty_until', input.warrantyUntil);
        if (input.status !== undefined) add('status', input.status);
        if (input.installedOn !== undefined) add('installed_at', input.installedOn);
        if (attrs) add('attributes', attrs);
        add('updated_by', request.ctx.userId);
        await db.query(`UPDATE asset SET ${sets.join(', ')} WHERE id = $1`, vals);
        const r = await db.query(`${SELECT} WHERE a.id = $1`, [request.params.id]);
        return toDto(r.rows[0]);
      });
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Asset non trovato', statusCode: 404 });
      return out;
    });

  app.delete<{ Params: { id: string } }>('/assets/:id',
    { preHandler: [app.authenticate, requirePermission('asset:delete')] },
    async (request, reply) => {
      const res = await withRls(request.ctx, async (db) => {
        const r = await db.query(`SELECT label FROM asset WHERE id = $1`, [request.params.id]);
        if (!r.rows.length) return { code: 'notfound' as const };
        const used = await findUsage(db, request.params.id, ASSET_REFS);
        if (used.length) return { code: 'used' as const, name: r.rows[0].label as string, used };
        await db.query(`UPDATE asset SET archived_at = now(), archived_by = $2, updated_by = $2 WHERE id = $1`, [request.params.id, request.ctx.userId]);
        await logAudit(db, request.ctx, { entity: 'asset', entityId: request.params.id, action: 'archive', label: r.rows[0].label as string });
        return { code: 'ok' as const };
      });
      if (res.code === 'notfound') return reply.code(404).send({ error: 'not_found', message: 'Asset non trovato', statusCode: 404 });
      if (res.code === 'used') return reply.code(409).send({ error: 'conflict', message: usageMessage(res.name, res.used), statusCode: 409 });
      return reply.code(204).send();
    });

  // RIPRISTINA un asset archiviato
  app.post<{ Params: { id: string } }>('/assets/:id/restore',
    { preHandler: [app.authenticate, requirePermission('asset:update')] },
    async (request, reply) => {
      const out = await withRls(request.ctx, async (db) => {
        const upd = await db.query(
          `UPDATE asset SET archived_at = NULL, archived_by = NULL, updated_by = $2 WHERE id = $1 AND archived_at IS NOT NULL RETURNING label`,
          [request.params.id, request.ctx.userId]);
        if (!upd.rows.length) return null;
        await logAudit(db, request.ctx, { entity: 'asset', entityId: request.params.id, action: 'restore', label: upd.rows[0].label as string });
        const r = await db.query(`${SELECT} WHERE a.id = $1`, [request.params.id]);
        return toDto(r.rows[0]);
      });
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Asset non trovato o non archiviato', statusCode: 404 });
      return out;
    });

  // ELIMINA DEFINITIVAMENTE (solo se archiviato). FK RESTRICT → 23503 → 409 globale.
  app.delete<{ Params: { id: string } }>('/assets/:id/purge',
    { preHandler: [app.authenticate, requirePermission('asset:delete')] },
    async (request, reply) => {
      const res = await withRls(request.ctx, async (db) => {
        const r = await db.query(`SELECT label, archived_at FROM asset WHERE id = $1`, [request.params.id]);
        if (!r.rows.length) return { code: 'notfound' as const };
        if (!r.rows[0].archived_at) return { code: 'notarchived' as const };
        await logAudit(db, request.ctx, { entity: 'asset', entityId: request.params.id, action: 'purge', label: r.rows[0].label as string });
        await db.query(`DELETE FROM asset WHERE id = $1 AND archived_at IS NOT NULL`, [request.params.id]);
        return { code: 'ok' as const };
      });
      if (res.code === 'notfound') return reply.code(404).send({ error: 'not_found', message: 'Asset non trovato', statusCode: 404 });
      if (res.code === 'notarchived') return reply.code(409).send({ error: 'conflict', message: 'Si elimina definitivamente solo un record archiviato', statusCode: 409 });
      return reply.code(204).send();
    });
}
