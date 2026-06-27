/** unitsOfMeasure.ts — Anagrafica Unità di misura. Le righe di sistema
 *  (tenant_id IS NULL) sono visibili a tutti ma immutabili dal tenant; un tenant
 *  crea/modifica/elimina SOLO le proprie righe. La RLS a DB esclude già le righe
 *  di sistema da UPDATE/DELETE (tenant_id NULL ≠ current_tenant). Riusa i permessi
 *  material:* (è un'anagrafica articolo), come materialCatalog. */
import type { FastifyInstance } from 'fastify';
import { createUnitSchema, updateUnitSchema, type UnitDto } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';

function toDto(r: Record<string, unknown>): UnitDto {
  return {
    id: r.id as string,
    tenantId: (r.tenant_id as string) ?? null,
    code: r.code as string,
    name: r.name as string,
    active: (r.active as boolean) ?? false,
    isSystem: r.tenant_id == null,
  };
}

const SELECT = `SELECT id, tenant_id, code, name, active FROM unit_of_measure`;

export async function unitOfMeasureRoutes(app: FastifyInstance): Promise<void> {
  // lista: sistema (tenant NULL) + righe del tenant corrente, ordinate per codice
  app.get('/units', { preHandler: [app.authenticate, requirePermission('material:read')] },
    async (request) => withRls(request.ctx, async (db) => {
      const rows = await db.query(
        `${SELECT} WHERE tenant_id IS NULL OR tenant_id = $1 ORDER BY code`,
        [request.ctx.tenantId]);
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
        await db.query(`DELETE FROM unit_of_measure WHERE id = $1 AND tenant_id = $2`, [request.params.id, t]);
        return { code: 'ok' as const };
      });
      if (res.code === 'notfound') return reply.code(404).send({ error: 'not_found', message: 'Unità non trovata o di sistema', statusCode: 404 });
      if (res.code === 'used') return reply.code(409).send({ error: 'conflict', message: `Impossibile eliminare l'unità «${res.uom}»: è utilizzata in ${res.used.join(', ')}. Rimuovi prima i collegamenti.`, statusCode: 409 });
      return reply.code(204).send();
    });
}
