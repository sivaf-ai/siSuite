/** sites.ts — Anagrafica Siti/Località (brief Blocco C-bis). Gerarchia per
 *  soggetto (company): GET ?company_id ritorna l'albero piatto (parent_id);
 *  CRUD standard. RLS isola per tenant. */
import type { FastifyInstance } from 'fastify';
import { createSiteSchema, updateSiteSchema, treeDeleteMode, type SiteDto } from '@sisuite/shared';
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
/** SiteDto + campi del contratto EntityTree (active/sequence/isSystem/directCount + kind/address
 *  già presenti come passthrough). EntityList ignora i campi extra; EntityTree li usa. */
function toTreeDto(r: Record<string, unknown>): SiteDto & Record<string, unknown> {
  return {
    ...toDto(r),
    active: true,                                  // i siti non hanno un flag "disattivato"
    isSystem: false,
    sequence: Number(r.sequence ?? 0),
    ...(r.direct_count != null ? { directCount: Number(r.direct_count) } : {}),
  };
}
const asJson = (v: unknown): string | null => (v == null ? null : JSON.stringify(v));

export async function siteRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { company_id?: string; q?: string; archived?: string; includeArchived?: string } }>('/sites',
    { preHandler: [app.authenticate, requirePermission('site:read')] }, async (request) =>
      withRls(request.ctx, async (db) => {
        const archivedParam = String((request.query as Record<string, unknown>).archived ?? '');
        const onlyArchived = archivedParam === '1' || archivedParam === 'only' || archivedParam === 'true';
        // EntityTree usa ?includeArchived=true: mostra attivi + archiviati insieme (vista albero)
        const includeArchived = request.query.includeArchived === 'true' || request.query.includeArchived === '1';
        const archivedCond = includeArchived ? 'TRUE' : onlyArchived ? 's.archived_at IS NOT NULL' : 's.archived_at IS NULL';
        const params: unknown[] = [];
        let where = `WHERE ${archivedCond}`;
        if (request.query.company_id) { params.push(request.query.company_id); where += ` AND s.company_id = $${params.length}`; }
        if (request.query.q && request.query.q.trim()) { params.push(`%${request.query.q.trim()}%`); where += ` AND s.name ILIKE $${params.length}`; }
        const rows = await db.query(
          `SELECT s.id, s.company_id, s.parent_id, s.name, s.kind, s.address, s.attributes, s.sequence,
                  s.archived_at, au.full_name AS archived_by_name, c.display_name AS company_name,
                  ((SELECT count(*) FROM asset a WHERE a.site_id = s.id) +
                   (SELECT count(*) FROM work_order w WHERE w.site_id = s.id))::int AS direct_count
           FROM site s
             LEFT JOIN app_user au ON au.id = s.archived_by
             LEFT JOIN company c ON c.id = s.company_id
           ${where} ORDER BY c.display_name NULLS FIRST, s.sequence, s.name`, params);
        return { items: rows.rows.map(toTreeDto) };
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
      let seq = input.sequence;
      if (seq === undefined) {
        const m = await db.query(
          `SELECT COALESCE(max(sequence), -1) + 1 AS seq FROM site
           WHERE tenant_id = $1 AND company_id = $2 AND parent_id IS NOT DISTINCT FROM $3`,
          [ctx.tenantId, input.companyId, input.parentId ?? null]);
        seq = Number(m.rows[0].seq);
      }
      const r = await db.query(
        `INSERT INTO site (tenant_id, company_id, parent_id, name, kind, address, attributes, sequence, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
         RETURNING id, company_id, parent_id, name, kind, address, attributes, sequence`,
        [ctx.tenantId, input.companyId, input.parentId ?? null, input.name, input.kind, asJson(input.address) ?? '{}', input.attributes ?? {}, seq, ctx.userId]);
      return toTreeDto(r.rows[0]);
    });
    return reply.code(201).send(dto);
  });

  app.patch<{ Params: { id: string } }>('/sites/:id', { preHandler: [app.authenticate, requirePermission('site:update')] },
    async (request) => withRls(request.ctx, async (db) => {
      const input = updateSiteSchema.parse(request.body);
      const raw = (request.body ?? {}) as Record<string, unknown>;
      const sets: string[] = []; const vals: unknown[] = [request.params.id];
      const add = (col: string, val: unknown) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
      if (input.name !== undefined) add('name', input.name);
      if (input.kind !== undefined) add('kind', input.kind);
      if ('parentId' in raw) add('parent_id', input.parentId ?? null);   // null = sposta a radice (no COALESCE!)
      if (input.address !== undefined) add('address', asJson(input.address));
      if (input.attributes !== undefined) add('attributes', input.attributes);
      if (input.sequence !== undefined) add('sequence', input.sequence);
      vals.push(request.ctx.userId); sets.push(`updated_by = $${vals.length}`);
      const r = await db.query(
        `UPDATE site SET ${sets.join(', ')} WHERE id=$1
         RETURNING id, company_id, parent_id, name, kind, address, attributes, sequence`, vals);
      return toTreeDto(r.rows[0]);
    }));

  // DELETE a TRE MODI (STANDARD entità ad albero §7), in transazione, conteggi ricorsivi.
  //  block   : se figli o asset/ordini collegati nel sottoalbero → 409; altrimenti archivia.
  //  reassign: figli al nonno, asset/ordini del nodo al genitore, archivia solo il nodo.
  //  cascade : archivia nodo + discendenti; asset/ordini del ramo → site_id NULL.
  app.delete<{ Params: { id: string }; Querystring: { mode?: string } }>('/sites/:id',
    { preHandler: [app.authenticate, requirePermission('site:delete')] },
    async (request, reply) => {
      const mode = treeDeleteMode.catch('block').parse(request.query.mode);
      const id = request.params.id; const userId = request.ctx.userId;
      const res = await withRls(request.ctx, async (db) => {
        const cur = await db.query(`SELECT name, parent_id FROM site WHERE id = $1 AND archived_at IS NULL`, [id]);
        if (!cur.rows.length) return { code: 'notfound' as const };
        const name = cur.rows[0].name as string;
        const parentId = (cur.rows[0].parent_id as string) ?? null;
        const sub = await db.query(
          `WITH RECURSIVE tree AS (
             SELECT id FROM site WHERE id = $1
             UNION ALL SELECT s.id FROM site s JOIN tree t ON s.parent_id = t.id WHERE s.archived_at IS NULL
           ) SELECT array_agg(id) AS ids FROM tree`, [id]);
        const ids: string[] = sub.rows[0].ids ?? [id];
        const children = (await db.query(`SELECT count(*)::int AS n FROM site WHERE parent_id = $1 AND archived_at IS NULL`, [id])).rows[0].n as number;
        const subRefs = (await db.query(
          `SELECT ((SELECT count(*) FROM asset WHERE site_id = ANY($1)) + (SELECT count(*) FROM work_order WHERE site_id = ANY($1)))::int AS n`, [ids])).rows[0].n as number;

        if (mode === 'block') {
          // SITE_REFS copre già sotto-siti + asset + ordini di lavoro
          const used = await findUsage(db, id, SITE_REFS);
          if (used.length) return { code: 'blocked' as const, name, parts: used };
          await db.query(`UPDATE site SET archived_at = now(), archived_by=$2, updated_by=$2 WHERE id=$1`, [id, userId]);
          await logAudit(db, request.ctx, { entity: 'site', entityId: id, action: 'archive', label: name });
          return { code: 'ok' as const, result: { ok: true, archivedNodes: 1 } };
        }
        if (mode === 'reassign') {
          await db.query(`UPDATE site SET parent_id = $2, updated_by = $3 WHERE parent_id = $1 AND archived_at IS NULL`, [id, parentId, userId]);
          await db.query(`UPDATE asset SET site_id = $2 WHERE site_id = $1`, [id, parentId]);
          await db.query(`UPDATE work_order SET site_id = $2 WHERE site_id = $1`, [id, parentId]);
          await db.query(`UPDATE site SET archived_at = now(), archived_by=$2, updated_by=$2 WHERE id=$1`, [id, userId]);
          await logAudit(db, request.ctx, { entity: 'site', entityId: id, action: 'archive', label: name });
          return { code: 'ok' as const, result: { ok: true, reassigned: children } };
        }
        await db.query(`UPDATE asset SET site_id = NULL WHERE site_id = ANY($1)`, [ids]);
        await db.query(`UPDATE work_order SET site_id = NULL WHERE site_id = ANY($1)`, [ids]);
        await db.query(`UPDATE site SET archived_at = now(), archived_by=$2, updated_by=$2 WHERE id = ANY($1) AND archived_at IS NULL`, [ids, userId]);
        await logAudit(db, request.ctx, { entity: 'site', entityId: id, action: 'archive', label: name });
        return { code: 'ok' as const, result: { ok: true, archivedNodes: ids.length, orphaned: subRefs } };
      });
      if (res.code === 'notfound') return reply.code(404).send({ error: 'not_found', message: 'Sito non trovato', statusCode: 404 });
      if (res.code === 'blocked') return reply.code(409).send({ error: 'conflict', message: `Impossibile eliminare «${res.name}»: contiene ${res.parts.join(' e ')}. Scegli «Riassegna» o «Elimina tutto il ramo».`, statusCode: 409 });
      return reply.send(res.result);
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

  // DUPLICA (regole C/D dello standard albero): copia stesso genitore/cliente, suffisso «(copia)» se serve.
  app.post<{ Params: { id: string } }>('/sites/:id/duplicate', { preHandler: [app.authenticate, requirePermission('site:create')] },
    async (request, reply) => {
      const ctx = request.ctx;
      const dto = await withRls(ctx, async (db) => {
        const src = await db.query(`SELECT company_id, parent_id, name, kind, address, attributes FROM site WHERE id = $1`, [request.params.id]);
        if (!src.rows.length) return null;
        const s = src.rows[0] as Record<string, unknown>;
        const companyId = s.company_id as string; const parentId = (s.parent_id as string) ?? null;
        const taken = new Set((await db.query(
          `SELECT name FROM site WHERE tenant_id=$1 AND company_id=$2 AND parent_id IS NOT DISTINCT FROM $3 AND archived_at IS NULL`,
          [ctx.tenantId, companyId, parentId])).rows.map((r) => r.name as string));
        let name = s.name as string;
        if (taken.has(name)) { let n = `${name} (copia)`; let i = 2; while (taken.has(n)) n = `${name} (copia ${i++})`; name = n; }
        const seq = Number((await db.query(
          `SELECT COALESCE(max(sequence), -1) + 1 AS seq FROM site WHERE tenant_id=$1 AND company_id=$2 AND parent_id IS NOT DISTINCT FROM $3`,
          [ctx.tenantId, companyId, parentId])).rows[0].seq);
        const r = await db.query(
          `INSERT INTO site (tenant_id, company_id, parent_id, name, kind, address, attributes, sequence, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
           RETURNING id, company_id, parent_id, name, kind, address, attributes, sequence`,
          [ctx.tenantId, companyId, parentId, name, s.kind, asJson(s.address) ?? '{}', s.attributes ?? {}, seq, ctx.userId]);
        return toTreeDto(r.rows[0]);
      });
      if (!dto) return reply.code(404).send({ error: 'not_found', message: 'Sito non trovato', statusCode: 404 });
      return reply.code(201).send(dto);
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
