/** sites.ts — Anagrafica Siti/Località (brief Blocco C-bis). Gerarchia per
 *  soggetto (company): GET ?company_id ritorna l'albero piatto (parent_id);
 *  CRUD standard. RLS isola per tenant. */
import type { FastifyInstance } from 'fastify';
import { createSiteSchema, updateSiteSchema, type SiteDto } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { findUsage, usageMessage, SITE_REFS } from '../context/usageGuard.js';
import { logAudit } from '../context/audit.js';

function toDto(r: Record<string, unknown>): SiteDto {
  return {
    id: r.id as string, companyId: (r.company_id as string) ?? null, parentId: (r.parent_id as string) ?? null,
    companyName: (r.company_name as string) ?? null,
    name: r.name as string, kind: r.kind as string, address: (r.address as Record<string, unknown>) ?? {},
    attributes: (r.attributes as Record<string, unknown>) ?? {},
    archivedAt: (r.archived_at as Date | null)?.toISOString() ?? null,
    archivedByName: (r.archived_by_name as string) ?? null,
  };
}
const asJson = (v: unknown): string | null => (v == null ? null : JSON.stringify(v));

export async function siteRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { company_id?: string; q?: string; archived?: string } }>('/sites',
    { preHandler: [app.authenticate, requirePermission('site:read')] }, async (request) =>
      withRls(request.ctx, async (db) => {
        const archivedParam = String((request.query as Record<string, unknown>).archived ?? '');
        const onlyArchived = archivedParam === '1' || archivedParam === 'only' || archivedParam === 'true';
        const archivedCond = onlyArchived ? 's.archived_at IS NOT NULL' : 's.archived_at IS NULL';
        const params: unknown[] = [];
        let where = `WHERE ${archivedCond}`;
        if (request.query.company_id) { params.push(request.query.company_id); where += ` AND s.company_id = $${params.length}`; }
        if (request.query.q && request.query.q.trim()) { params.push(`%${request.query.q.trim()}%`); where += ` AND s.name ILIKE $${params.length}`; }
        const rows = await db.query(
          `SELECT s.id, s.company_id, s.parent_id, s.name, s.kind, s.address, s.attributes,
                  s.archived_at, au.full_name AS archived_by_name, c.display_name AS company_name
           FROM site s
             LEFT JOIN app_user au ON au.id = s.archived_by
             LEFT JOIN company c ON c.id = s.company_id
           ${where} ORDER BY c.display_name NULLS FIRST, s.name`, params);
        return { items: rows.rows.map(toDto) };
      }));

  app.get<{ Params: { id: string } }>('/sites/:id', { preHandler: [app.authenticate, requirePermission('site:read')] },
    async (request, reply) => {
      const dto = await withRls(request.ctx, async (db) => {
        const r = await db.query(
          `SELECT s.id, s.company_id, s.parent_id, s.name, s.kind, s.address, s.attributes,
                  s.archived_at, au.full_name AS archived_by_name, c.display_name AS company_name
           FROM site s
             LEFT JOIN app_user au ON au.id = s.archived_by
             LEFT JOIN company c ON c.id = s.company_id
           WHERE s.id = $1`, [request.params.id]);
        return r.rows.length ? toDto(r.rows[0]) : null;
      });
      if (!dto) return reply.code(404).send({ error: 'not_found', message: 'Sito non trovato', statusCode: 404 });
      return dto;
    });

  app.post('/sites', { preHandler: [app.authenticate, requirePermission('site:create')] }, async (request, reply) => {
    const input = createSiteSchema.parse(request.body);
    const ctx = request.ctx;
    const dto = await withRls(ctx, async (db) => {
      const r = await db.query(
        `INSERT INTO site (tenant_id, company_id, parent_id, name, kind, address, attributes, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
         RETURNING id, company_id, parent_id, name, kind, address, attributes`,
        [ctx.tenantId, input.companyId, input.parentId ?? null, input.name, input.kind, asJson(input.address) ?? '{}', input.attributes ?? {}, ctx.userId]);
      return toDto(r.rows[0]);
    });
    return reply.code(201).send(dto);
  });

  app.patch<{ Params: { id: string } }>('/sites/:id', { preHandler: [app.authenticate, requirePermission('site:update')] },
    async (request) => withRls(request.ctx, async (db) => {
      const input = updateSiteSchema.parse(request.body);
      const r = await db.query(
        `UPDATE site SET name=COALESCE($2,name), kind=COALESCE($3,kind), parent_id=COALESCE($4,parent_id),
           address=COALESCE($5,address), attributes=COALESCE($6,attributes), updated_by=$7
         WHERE id=$1 RETURNING id, company_id, parent_id, name, kind, address, attributes`,
        [request.params.id, input.name ?? null, input.kind ?? null, input.parentId ?? null, asJson(input.address), input.attributes ?? null, request.ctx.userId]);
      return toDto(r.rows[0]);
    }));

  app.delete<{ Params: { id: string } }>('/sites/:id', { preHandler: [app.authenticate, requirePermission('site:delete')] },
    async (request, reply) => {
      const res = await withRls(request.ctx, async (db) => {
        const r = await db.query(`SELECT name FROM site WHERE id = $1`, [request.params.id]);
        if (!r.rows.length) return { code: 'notfound' as const };
        const used = await findUsage(db, request.params.id, SITE_REFS);
        if (used.length) return { code: 'used' as const, name: r.rows[0].name as string, used };
        await db.query(`UPDATE site SET archived_at = now(), archived_by=$2, updated_by=$2 WHERE id=$1`, [request.params.id, request.ctx.userId]);
        await logAudit(db, request.ctx, { entity: 'site', entityId: request.params.id, action: 'archive', label: r.rows[0].name as string });
        return { code: 'ok' as const };
      });
      if (res.code === 'notfound') return reply.code(404).send({ error: 'not_found', message: 'Sito non trovato', statusCode: 404 });
      if (res.code === 'used') return reply.code(409).send({ error: 'conflict', message: usageMessage(res.name, res.used), statusCode: 409 });
      return reply.code(204).send();
    });

  // RIPRISTINA un sito archiviato
  app.post<{ Params: { id: string } }>('/sites/:id/restore', { preHandler: [app.authenticate, requirePermission('site:update')] },
    async (request, reply) => {
      const dto = await withRls(request.ctx, async (db) => {
        const upd = await db.query(
          `UPDATE site SET archived_at = NULL, archived_by = NULL, updated_by = $2 WHERE id = $1 AND archived_at IS NOT NULL RETURNING name`,
          [request.params.id, request.ctx.userId]);
        if (!upd.rows.length) return null;
        await logAudit(db, request.ctx, { entity: 'site', entityId: request.params.id, action: 'restore', label: upd.rows[0].name as string });
        const r = await db.query(
          `SELECT s.id, s.company_id, s.parent_id, s.name, s.kind, s.address, s.attributes,
                  s.archived_at, au.full_name AS archived_by_name, c.display_name AS company_name
           FROM site s
             LEFT JOIN app_user au ON au.id = s.archived_by
             LEFT JOIN company c ON c.id = s.company_id
           WHERE s.id = $1`, [request.params.id]);
        return toDto(r.rows[0]);
      });
      if (!dto) return reply.code(404).send({ error: 'not_found', message: 'Sito non trovato o non archiviato', statusCode: 404 });
      return dto;
    });

  // ELIMINA DEFINITIVAMENTE (solo se archiviato). FK RESTRICT → 23503 → 409 globale.
  app.delete<{ Params: { id: string } }>('/sites/:id/purge', { preHandler: [app.authenticate, requirePermission('site:delete')] },
    async (request, reply) => {
      const res = await withRls(request.ctx, async (db) => {
        const r = await db.query(`SELECT name, archived_at FROM site WHERE id = $1`, [request.params.id]);
        if (!r.rows.length) return { code: 'notfound' as const };
        if (!r.rows[0].archived_at) return { code: 'notarchived' as const };
        await logAudit(db, request.ctx, { entity: 'site', entityId: request.params.id, action: 'purge', label: r.rows[0].name as string });
        await db.query(`DELETE FROM site WHERE id = $1 AND archived_at IS NOT NULL`, [request.params.id]);
        return { code: 'ok' as const };
      });
      if (res.code === 'notfound') return reply.code(404).send({ error: 'not_found', message: 'Sito non trovato', statusCode: 404 });
      if (res.code === 'notarchived') return reply.code(409).send({ error: 'conflict', message: 'Si elimina definitivamente solo un record archiviato', statusCode: 409 });
      return reply.code(204).send();
    });
}
