/**
 * engagements.ts — entità PILOTA end-to-end (create + list).
 * Dietro RBAC (requirePermission) + RLS (withRls). Il `code` umano arriva da
 * number_series; gli UUID non si mostrano in UI.
 */
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from '../db/pool.js';
import {
  createEngagementSchema,
  updateEngagementSchema,
  listQuerySchema,
  type EngagementDto,
} from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { nextNumber } from '../numberSeries.js';
import { validateAttributes } from '../fields.js';
import { buildOrderBy } from '../sortSql.js';
import { buildFilter } from '../filterSql.js';
import { logAudit } from '../context/audit.js';

const SORTABLE: Record<string, string> = { code: 'e.code', title: 'e.title', createdAt: 'e.created_at' };
const FILTER_FIELDS: Record<string, string> = {
  code: 'e.code', title: 'e.title', type: 'e.type', startedOn: 'e.started_on', endedOn: 'e.ended_on', createdAt: 'e.created_at',
  company: 'c.display_name', status: 'lv.canonical',
};
const FILTER_ANY = ['e.code', 'e.title', 'c.display_name'];

const SELECT_DTO = `
  SELECT e.id, e.code, e.title, e.type, e.company_id,
         c.display_name AS company_name,
         e.status_id, lv.canonical AS status_canonical,
         e.started_on, e.ended_on, e.created_at, e.attributes,
         e.archived_at, au.full_name AS archived_by_name
  FROM engagement e
  LEFT JOIN company c       ON c.id = e.company_id
  LEFT JOIN lookup_value lv ON lv.id = e.status_id
  LEFT JOIN app_user au     ON au.id = e.archived_by
`;

interface DbRow {
  id: string; code: string; title: string; type: 'build' | 'maintenance';
  company_id: string; company_name: string | null;
  status_id: string; status_canonical: string | null;
  started_on: string | null; ended_on: string | null; created_at: string;
  attributes: Record<string, unknown> | null;
  archived_at: Date | null; archived_by_name: string | null;
}

// campi DATE → 'yyyy-MM-dd' (pg li dà come Date → ISO completo, rifiutato da <input type=date>)
const dayN = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

function toDto(r: DbRow): EngagementDto {
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    type: r.type,
    companyId: r.company_id,
    companyName: r.company_name,
    statusId: r.status_id,
    statusCanonical: r.status_canonical,
    startedOn: dayN(r.started_on),
    endedOn: dayN(r.ended_on),
    createdAt: r.created_at,
    attributes: r.attributes ?? {},
    archivedAt: r.archived_at?.toISOString() ?? null,
    archivedByName: r.archived_by_name ?? null,
  };
}

async function defaultStatusId(db: PoolClient): Promise<string> {
  const { rows } = await db.query(
    `SELECT id FROM lookup_value
     WHERE category = 'engagement_status' AND canonical = 'open'
     ORDER BY (tenant_id IS NOT NULL) DESC, sequence ASC
     LIMIT 1`,
  );
  if (rows.length === 0) throw new Error("Stato 'engagement_status/open' di default non trovato");
  return rows[0].id as string;
}

export async function engagementRoutes(app: FastifyInstance): Promise<void> {
  // LISTA
  app.get(
    '/engagements',
    { preHandler: [app.authenticate, requirePermission('engagement:read')] },
    async (request) => {
      const q = listQuerySchema.parse(request.query);
      const type = (request.query as { type?: string }).type;
      const orderBy = buildOrderBy((request.query as Record<string, unknown>).sort as string | undefined, SORTABLE, SORTABLE[q.sortBy ?? ''] ?? 'e.created_at', q.sortBy ? q.sortDir : 'desc', 'e.attributes');
      const archivedParam = String((request.query as Record<string, unknown>).archived ?? '');
      const onlyArchived = archivedParam === '1' || archivedParam === 'only' || archivedParam === 'true';
      return withRls(request.ctx, async (db) => {
        const params: unknown[] = [];
        let where = `WHERE e.archived_at IS ${onlyArchived ? 'NOT NULL' : 'NULL'}`;
        if (type) { params.push(type); where += ` AND e.type = $${params.length}`; }
        if (q.q) { params.push(`%${q.q}%`); where += ` AND (e.title ILIKE $${params.length} OR e.code ILIKE $${params.length})`; }
        const fsql = buildFilter((request.query as Record<string, unknown>).filter as string | undefined, FILTER_FIELDS, FILTER_ANY, params);
        if (fsql) where += ` AND ${fsql}`;
        // join company + lookup nel conteggio per supportare i filtri su cliente/stato
        const total = await db.query(`SELECT count(*)::int AS n FROM engagement e LEFT JOIN company c ON c.id=e.company_id LEFT JOIN lookup_value lv ON lv.id=e.status_id ${where}`, params);
        params.push(q.limit, q.offset);
        const res = await db.query(
          `${SELECT_DTO} ${where} ORDER BY ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`,
          params,
        );
        // conteggi viste per tipo (rispettano ricerca q E filtro attivo, non il filtro tipo)
        const vParams: unknown[] = [];
        let vWhere = `WHERE e.archived_at IS NULL`;
        if (q.q) { vParams.push(`%${q.q}%`); vWhere += ` AND (e.title ILIKE $1 OR e.code ILIKE $1)`; }
        const vfsql = buildFilter((request.query as Record<string, unknown>).filter as string | undefined, FILTER_FIELDS, FILTER_ANY, vParams);
        if (vfsql) vWhere += ` AND ${vfsql}`;
        const vRes = await db.query(
          `SELECT count(*)::int AS all,
                  count(*) FILTER (WHERE e.type='build')::int AS build,
                  count(*) FILTER (WHERE e.type='maintenance')::int AS maintenance
           FROM engagement e LEFT JOIN company c ON c.id=e.company_id LEFT JOIN lookup_value lv ON lv.id=e.status_id ${vWhere}`,
          vParams,
        );
        const v = vRes.rows[0];
        return {
          items: (res.rows as DbRow[]).map(toDto), total: total.rows[0].n as number, limit: q.limit, offset: q.offset,
          views: { all: v.all as number, build: v.build as number, maintenance: v.maintenance as number },
        };
      });
    },
  );

  // CREA
  app.post(
    '/engagements',
    { preHandler: [app.authenticate, requirePermission('engagement:create')] },
    async (request, reply) => {
      const input = createEngagementSchema.parse(request.body);
      const ctx = request.ctx;
      const dto = await withRls(ctx, async (db) => {
        const attrs = await validateAttributes(db, ctx.tenantId, 'engagement', input.attributes);
        const statusId = input.statusId ?? (await defaultStatusId(db));
        const code = await nextNumber(db, 'engagement');
        const ins = await db.query(
          `INSERT INTO engagement
             (tenant_id, company_id, code, type, title, status_id, asset_id, manager_id, started_on, attributes, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
           RETURNING id`,
          [
            ctx.tenantId,
            input.companyId,
            code,
            input.type,
            input.title,
            statusId,
            input.assetId ?? null,
            input.managerId ?? null,
            input.startedOn ?? null,
            attrs,
            ctx.userId,
          ],
        );
        const id = ins.rows[0].id as string;
        const res = await db.query(`${SELECT_DTO} WHERE e.id = $1`, [id]);
        return toDto(res.rows[0] as DbRow);
      });
      return reply.code(201).send(dto);
    },
  );

  // DETTAGLIO
  app.get<{ Params: { id: string } }>(
    '/engagements/:id',
    { preHandler: [app.authenticate, requirePermission('engagement:read')] },
    async (request, reply) => {
      const rows = await withRls(request.ctx, (db) =>
        db.query(`${SELECT_DTO} WHERE e.id = $1`, [request.params.id]).then((r) => r.rows as DbRow[]));
      if (!rows.length) return reply.code(404).send({ error: 'not_found', message: 'Commessa non trovata', statusCode: 404 });
      return toDto(rows[0]!);
    },
  );

  // MODIFICA
  app.patch<{ Params: { id: string } }>(
    '/engagements/:id',
    { preHandler: [app.authenticate, requirePermission('engagement:update')] },
    async (request, reply) => {
      const input = updateEngagementSchema.parse(request.body);
      const out = await withRls(request.ctx, async (db) => {
        const ex = await db.query(`SELECT 1 FROM engagement WHERE id = $1`, [request.params.id]);
        if (!ex.rows.length) return null;
        await db.query(
          `UPDATE engagement SET
             title = COALESCE($2, title), status_id = COALESCE($3, status_id),
             manager_id = COALESCE($4, manager_id), asset_id = COALESCE($5, asset_id),
             started_on = COALESCE($6, started_on), ended_on = COALESCE($7, ended_on),
             attributes = COALESCE($8, attributes), updated_by = $9
           WHERE id = $1`,
          [request.params.id, input.title ?? null, input.statusId ?? null, input.managerId ?? null,
           input.assetId ?? null, input.startedOn ?? null, input.endedOn ?? null, input.attributes ?? null, request.ctx.userId],
        );
        const r = await db.query(`${SELECT_DTO} WHERE e.id = $1`, [request.params.id]);
        return toDto(r.rows[0] as DbRow);
      });
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Commessa non trovata', statusCode: 404 });
      return out;
    },
  );

  // ARCHIVIA
  app.delete<{ Params: { id: string } }>(
    '/engagements/:id',
    { preHandler: [app.authenticate, requirePermission('engagement:delete')] },
    async (request, reply) => {
      await withRls(request.ctx, async (db) => {
        const r = await db.query(
          `UPDATE engagement SET archived_at = now(), archived_by = $2, updated_by = $2
           WHERE id = $1 AND archived_at IS NULL RETURNING title`,
          [request.params.id, request.ctx.userId]);
        if (r.rows.length)
          await logAudit(db, request.ctx, { entity: 'engagement', entityId: request.params.id, action: 'archive', label: r.rows[0].title as string });
      });
      return reply.code(204).send();
    },
  );

  // RIPRISTINA una commessa archiviata
  app.post<{ Params: { id: string } }>(
    '/engagements/:id/restore',
    { preHandler: [app.authenticate, requirePermission('engagement:update')] },
    async (request, reply) => {
      const dto = await withRls(request.ctx, async (db) => {
        const upd = await db.query(
          `UPDATE engagement SET archived_at = NULL, archived_by = NULL, updated_by = $2
           WHERE id = $1 AND archived_at IS NOT NULL RETURNING title`,
          [request.params.id, request.ctx.userId]);
        if (!upd.rows.length) return null;
        await logAudit(db, request.ctx, { entity: 'engagement', entityId: request.params.id, action: 'restore', label: upd.rows[0].title as string });
        const r = await db.query(`${SELECT_DTO} WHERE e.id = $1`, [request.params.id]);
        return toDto(r.rows[0] as DbRow);
      });
      if (!dto) return reply.code(404).send({ error: 'not_found', message: 'Commessa non trovata o non archiviata', statusCode: 404 });
      return dto;
    },
  );

  // ELIMINA DEFINITIVAMENTE (solo se archiviata). FK RESTRICT → 23503 → 409 globale.
  app.delete<{ Params: { id: string } }>(
    '/engagements/:id/purge',
    { preHandler: [app.authenticate, requirePermission('engagement:delete')] },
    async (request, reply) => {
      const res = await withRls(request.ctx, async (db) => {
        const r = await db.query(`SELECT title, archived_at FROM engagement WHERE id = $1`, [request.params.id]);
        if (!r.rows.length) return { code: 'notfound' as const };
        if (!r.rows[0].archived_at) return { code: 'notarchived' as const };
        await logAudit(db, request.ctx, { entity: 'engagement', entityId: request.params.id, action: 'purge', label: r.rows[0].title as string });
        await db.query(`DELETE FROM engagement WHERE id = $1 AND archived_at IS NOT NULL`, [request.params.id]);
        return { code: 'ok' as const };
      });
      if (res.code === 'notfound') return reply.code(404).send({ error: 'not_found', message: 'Commessa non trovata', statusCode: 404 });
      if (res.code === 'notarchived') return reply.code(409).send({ error: 'conflict', message: 'Si elimina definitivamente solo un record archiviato', statusCode: 409 });
      return reply.code(204).send();
    },
  );
}
