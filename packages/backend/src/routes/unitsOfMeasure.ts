/** unitsOfMeasure.ts — Anagrafica Unità di misura. Le righe di sistema
 *  (tenant_id IS NULL) sono visibili a tutti ma immutabili dal tenant; un tenant
 *  crea/modifica/elimina SOLO le proprie righe. La RLS a DB esclude già le righe
 *  di sistema da UPDATE/DELETE (tenant_id NULL ≠ current_tenant). Riusa i permessi
 *  material:* (è un'anagrafica articolo), come materialCatalog. */
import type { FastifyInstance } from 'fastify';
import { createUnitSchema, updateUnitSchema, type UnitDto } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { logAudit } from '../context/audit.js';

function toDto(r: Record<string, unknown>): UnitDto {
  return {
    id: r.id as string,
    tenantId: (r.tenant_id as string) ?? null,
    code: r.code as string,
    name: r.name as string,
    active: (r.active as boolean) ?? false,
    isSystem: r.tenant_id == null,
    archivedAt: (r.archived_at as Date | null)?.toISOString() ?? null,
    archivedByName: (r.archived_by_name as string) ?? null,
  };
}

const SELECT = `SELECT u.id, u.tenant_id, u.code, u.name, u.active, u.archived_at, au.full_name AS archived_by_name
                FROM unit_of_measure u LEFT JOIN app_user au ON au.id = u.archived_by`;

export async function unitOfMeasureRoutes(app: FastifyInstance): Promise<void> {
  // lista: senza ?archived → sistema (tenant NULL) + righe attive del tenant.
  // con ?archived → SOLO le righe del tenant archiviate. Le righe di sistema non
  // sono mai archiviabili (restano sempre visibili nella lista normale).
  app.get('/units', { preHandler: [app.authenticate, requirePermission('material:read')] },
    async (request) => withRls(request.ctx, async (db) => {
      const archivedParam = String((request.query as Record<string, unknown>).archived ?? '');
      const onlyArchived = archivedParam === '1' || archivedParam === 'only' || archivedParam === 'true';
      const where = onlyArchived
        ? `WHERE u.tenant_id = $1 AND u.archived_at IS NOT NULL`
        : `WHERE (u.tenant_id IS NULL OR u.tenant_id = $1) AND u.archived_at IS NULL`;
      const rows = await db.query(`${SELECT} ${where} ORDER BY u.code`, [request.ctx.tenantId]);
      return { items: rows.rows.map(toDto) };
    }));

  app.post('/units', { preHandler: [app.authenticate, requirePermission('material:create')] },
    async (request, reply) => {
      const input = createUnitSchema.parse(request.body);
      const ctx = request.ctx;
      const out = await withRls(ctx, async (db) => {
        // anti-duplicato: il codice non deve già esistere (né di sistema né del tenant)
        const dup = await db.query(
          `SELECT 1 FROM unit_of_measure WHERE lower(code) = lower($1) AND (tenant_id IS NULL OR tenant_id = $2) LIMIT 1`,
          [input.code, ctx.tenantId]);
        if (dup.rows.length) return { dup: true as const };
        const r = await db.query(
          `INSERT INTO unit_of_measure (tenant_id, code, name, active, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$5)
           RETURNING id, tenant_id, code, name, active`,
          [ctx.tenantId, input.code, input.name, input.active ?? true, ctx.userId]);
        return { dup: false as const, dto: toDto(r.rows[0]) };
      });
      if (out.dup) return reply.code(409).send({ error: 'conflict', message: `Esiste già un'unità di misura con codice «${input.code}».`, statusCode: 409 });
      return reply.code(201).send(out.dto);
    });

  // modifica: SOLO righe del tenant (le righe di sistema sono fuori dalla WHERE)
  app.patch<{ Params: { id: string } }>('/units/:id',
    { preHandler: [app.authenticate, requirePermission('material:update')] },
    async (request, reply) => withRls(request.ctx, async (db) => {
      const input = updateUnitSchema.parse(request.body);
      // anti-duplicato sul codice (escludi se stessa)
      if (input.code !== undefined) {
        const dup = await db.query(
          `SELECT 1 FROM unit_of_measure WHERE lower(code) = lower($1) AND (tenant_id IS NULL OR tenant_id = $2) AND id <> $3 LIMIT 1`,
          [input.code, request.ctx.tenantId, request.params.id]);
        if (dup.rows.length) return reply.code(409).send({ error: 'conflict', message: `Esiste già un'unità di misura con codice «${input.code}».`, statusCode: 409 });
      }
      const sets: string[] = []; const vals: unknown[] = [request.params.id, request.ctx.tenantId];
      const add = (col: string, val: unknown) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
      if (input.code !== undefined) add('code', input.code);
      if (input.name !== undefined) add('name', input.name);
      if (input.active !== undefined) add('active', input.active);
      vals.push(request.ctx.userId); sets.push(`updated_by = $${vals.length}`);
      const r = await db.query(
        `UPDATE unit_of_measure SET ${sets.join(', ')} WHERE id = $1 AND tenant_id = $2
         RETURNING id, tenant_id, code, name, active`, vals);
      if (!r.rows.length) return reply.code(404).send({ error: 'not_found', message: 'Unità non trovata o di sistema', statusCode: 404 });
      return toDto(r.rows[0]);
    }));

  // elimina: SOLO righe del tenant + integrità referenziale (l'UM è riferita per CODICE
  // testuale da material/movimenti/righe doc: niente FK, quindi controllo d'uso esplicito).
  app.delete<{ Params: { id: string } }>('/units/:id',
    { preHandler: [app.authenticate, requirePermission('material:delete')] },
    async (request, reply) => {
      const res = await withRls(request.ctx, async (db) => {
        const u = await db.query(`SELECT id, code FROM unit_of_measure WHERE id = $1 AND tenant_id = $2`,
          [request.params.id, request.ctx.tenantId]);
        if (!u.rows.length) return { code: 'notfound' as const };
        const id = u.rows[0].id as string;
        const code = u.rows[0].code as string;
        const t = request.ctx.tenantId;
        const usage = await db.query(
          `SELECT
             (SELECT count(*) FROM material WHERE tenant_id=$1 AND (unit_id=$2 OR weight_unit_id=$2) AND archived_at IS NULL)::int AS articoli,
             (SELECT count(*) FROM stock_movement WHERE tenant_id=$1 AND unit_id=$2)::int AS movimenti,
             (SELECT count(*) FROM purchase_order_line WHERE tenant_id=$1 AND unit_id=$2)::int AS ordini,
             (SELECT count(*) FROM pick_list_line WHERE tenant_id=$1 AND unit_id=$2)::int AS pick,
             (SELECT count(*) FROM stock_document_line WHERE tenant_id=$1 AND unit_id=$2)::int AS documenti`,
          [t, id]);
        const u0 = usage.rows[0] as Record<string, number>;
        const used: string[] = [];
        if (u0.articoli) used.push(`${u0.articoli} articoli`);
        if (u0.movimenti) used.push(`${u0.movimenti} movimenti`);
        if (u0.ordini) used.push(`${u0.ordini} righe ordine`);
        if (u0.pick) used.push(`${u0.pick} righe pick`);
        if (u0.documenti) used.push(`${u0.documenti} righe documento`);
        if (used.length) return { code: 'used' as const, used, uom: code };
        await db.query(`UPDATE unit_of_measure SET archived_at = now(), archived_by = $3, updated_by = $3 WHERE id = $1 AND tenant_id = $2`,
          [request.params.id, t, request.ctx.userId]);
        await logAudit(db, request.ctx, { entity: 'unit_of_measure', entityId: request.params.id, action: 'archive', label: code });
        return { code: 'ok' as const };
      });
      if (res.code === 'notfound') return reply.code(404).send({ error: 'not_found', message: 'Unità non trovata o di sistema', statusCode: 404 });
      if (res.code === 'used') return reply.code(409).send({ error: 'conflict', message: `Impossibile eliminare l'unità «${res.uom}»: è utilizzata in ${res.used.join(', ')}. Rimuovi prima i collegamenti.`, statusCode: 409 });
      return reply.code(204).send();
    });

  // RIPRISTINA un'unità archiviata (solo righe del tenant)
  app.post<{ Params: { id: string } }>('/units/:id/restore',
    { preHandler: [app.authenticate, requirePermission('material:update')] },
    async (request, reply) => {
      const dto = await withRls(request.ctx, async (db) => {
        const upd = await db.query(
          `UPDATE unit_of_measure SET archived_at = NULL, archived_by = NULL, updated_by = $3
           WHERE id = $1 AND tenant_id = $2 AND archived_at IS NOT NULL RETURNING code`,
          [request.params.id, request.ctx.tenantId, request.ctx.userId]);
        if (!upd.rows.length) return null;
        await logAudit(db, request.ctx, { entity: 'unit_of_measure', entityId: request.params.id, action: 'restore', label: upd.rows[0].code as string });
        const r = await db.query(`${SELECT} WHERE u.id = $1`, [request.params.id]);
        return toDto(r.rows[0]);
      });
      if (!dto) return reply.code(404).send({ error: 'not_found', message: 'Unità non trovata, di sistema o non archiviata', statusCode: 404 });
      return dto;
    });

  // ELIMINA DEFINITIVAMENTE (solo se archiviata e del tenant). L'UM è riferita per id
  // da material/movimenti/righe doc con FK RESTRICT → 23503 → 409 globale.
  app.delete<{ Params: { id: string } }>('/units/:id/purge',
    { preHandler: [app.authenticate, requirePermission('material:delete')] },
    async (request, reply) => {
      const res = await withRls(request.ctx, async (db) => {
        const r = await db.query(`SELECT code, archived_at FROM unit_of_measure WHERE id = $1 AND tenant_id = $2`,
          [request.params.id, request.ctx.tenantId]);
        if (!r.rows.length) return { code: 'notfound' as const };
        if (!r.rows[0].archived_at) return { code: 'notarchived' as const };
        await logAudit(db, request.ctx, { entity: 'unit_of_measure', entityId: request.params.id, action: 'purge', label: r.rows[0].code as string });
        await db.query(`DELETE FROM unit_of_measure WHERE id = $1 AND tenant_id = $2 AND archived_at IS NOT NULL`,
          [request.params.id, request.ctx.tenantId]);
        return { code: 'ok' as const };
      });
      if (res.code === 'notfound') return reply.code(404).send({ error: 'not_found', message: 'Unità non trovata o di sistema', statusCode: 404 });
      if (res.code === 'notarchived') return reply.code(409).send({ error: 'conflict', message: 'Si elimina definitivamente solo un record archiviato', statusCode: 409 });
      return reply.code(204).send();
    });
}
