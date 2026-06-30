/** stock.ts — MAGAZZINO MINIMO 6A (§8).
 *  Ubicazioni (albero), movimenti (registro immutabile → il trigger DB aggiorna
 *  il saldo a media mobile), giacenze, documenti (testata → movimenti alla
 *  conferma, numerati da number_series). Consumo su lavoro = movimento 'out'. */
import type { FastifyInstance } from 'fastify';
import {
  createStockLocationSchema, updateStockLocationSchema, generateLocationsSchema, createStockMovementSchema, createStockDocumentSchema, updateStockDocumentSchema, treeDeleteMode,
  type StockLocationDto, type StockMovementDto, type StockBalanceDto, type StockDocumentDto,
} from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { logAudit } from '../context/audit.js';
import type { PoolClient } from '../db/pool.js';
import { lookupIdByCanonical } from '../lookupResolve.js';
import { nextNumber } from '../numberSeries.js';
import { buildFilter } from '../filterSql.js';
import { buildOrderBy } from '../sortSql.js';

const LOC_FILTER: Record<string, string> = { name: 'sl.name', kind: 'sl.kind' };

// I campi DATE vanno restituiti come 'yyyy-MM-dd' (pg li dà come Date → ISO completo,
// che gli <input type=date> rifiutano).
const day = (v: unknown): string => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

const NUM: Record<'receipt' | 'transfer' | 'adjustment', { key: string; fmt: string }> = {
  receipt: { key: 'stock_receipt', fmt: 'CAR-{YYYY}-{SEQ:4}' },
  transfer: { key: 'ddt', fmt: 'DDT-{YYYY}-{SEQ:4}' },
  adjustment: { key: 'stock_adjustment', fmt: 'RET-{YYYY}-{SEQ:4}' },
};

const LOC_COLS = `id, parent_id, name, kind, resource_id, code, note, manager_user_id, holds_stock, is_default, active, sequence`;
// stessa lista con prefisso sl. + join app_user per il nome di chi ha archiviato (vista archiviati).
const LOC_SELECT = `sl.id, sl.parent_id, sl.name, sl.kind, sl.resource_id, sl.code, sl.note, sl.manager_user_id,
  sl.holds_stock, sl.is_default, sl.active, sl.sequence, sl.archived_at, au.full_name AS archived_by_name
  FROM stock_location sl LEFT JOIN app_user au ON au.id = sl.archived_by`;
function locDto(r: Record<string, unknown>): StockLocationDto {
  return {
    id: r.id as string, parentId: (r.parent_id as string) ?? null, name: r.name as string, kind: r.kind as string,
    resourceId: (r.resource_id as string) ?? null, code: (r.code as string) ?? null, note: (r.note as string) ?? null,
    managerUserId: (r.manager_user_id as string) ?? null, holdsStock: r.holds_stock as boolean,
    isDefault: r.is_default as boolean, active: r.active as boolean,
    archivedAt: (r.archived_at as Date | null)?.toISOString() ?? null,
    archivedByName: (r.archived_by_name as string) ?? null,
    // contratto EntityTree (passthrough)
    sequence: Number(r.sequence ?? 0), isSystem: false,
    ...(r.direct_count != null ? { directCount: Number(r.direct_count) } : {}),
  };
}

/** inserisce un movimento con il segno corretto; ritorna l'id. */
async function insertMovement(db: PoolClient, tenantId: string, userId: string, m: {
  materialId: string; locationId: string; typeCode: 'in' | 'out' | 'adjust'; signedQty: number; unit: string;
  unitCost?: number | null; unitPrice?: number | null; currency?: string | null; occurredOn?: string;
  documentRef?: string | null; stockDocumentId?: string | null; engagementId?: string | null;
  activityId?: string | null; transferGroupId?: string | null; note?: string | null;
}): Promise<string> {
  const typeId = await lookupIdByCanonical(db, 'stock_movement_type', m.typeCode);
  const r = await db.query(
    `INSERT INTO stock_movement (tenant_id, material_id, location_id, type_id, quantity, unit_id, unit_cost, unit_price,
       currency, occurred_on, document_ref, stock_document_id, engagement_id, activity_id, transfer_group_id, note, created_by)
     VALUES ($1,$2,$3,$4,$5,public.app_resolve_unit(public.app_current_tenant(),$6),$7,$8,$9,COALESCE($10,CURRENT_DATE),$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
    [tenantId, m.materialId, m.locationId, typeId, m.signedQty, m.unit, m.unitCost ?? null, m.unitPrice ?? null,
     m.currency ?? null, m.occurredOn ?? null, m.documentRef ?? null, m.stockDocumentId ?? null, m.engagementId ?? null,
     m.activityId ?? null, m.transferGroupId ?? null, m.note ?? null, userId],
  );
  return r.rows[0].id as string;
}

export async function stockRoutes(app: FastifyInstance): Promise<void> {
  // ── Ubicazioni (albero) ────────────────────────────────────────────
  app.get('/stock/locations', { preHandler: [app.authenticate, requirePermission('stock:read')] },
    async (request) => {
      const q = request.query as Record<string, unknown>;
      const archivedParam = String(q.archived ?? '');
      const onlyArchived = archivedParam === '1' || archivedParam === 'only' || archivedParam === 'true';
      // EntityTree: ?includeArchived=true (attivi+archiviati insieme), ?subtreeOf=W (discendenti di W)
      const includeArchived = q.includeArchived === 'true' || q.includeArchived === '1';
      const rows = await withRls(request.ctx, (db) => {
        const params: unknown[] = [];
        let where = `WHERE ${includeArchived ? 'TRUE' : `sl.archived_at IS ${onlyArchived ? 'NOT NULL' : 'NULL'}`}`;
        if (q.top === '1') where += ` AND sl.parent_id IS NULL`;
        if (q.parentId) { params.push(q.parentId); where += ` AND sl.parent_id = $${params.length}`; }
        if (q.subtreeOf) {
          params.push(q.subtreeOf);
          where += ` AND sl.id IN (WITH RECURSIVE d AS (
            SELECT id FROM stock_location WHERE parent_id = $${params.length}
            UNION ALL SELECT c.id FROM stock_location c JOIN d ON c.parent_id = d.id
          ) SELECT id FROM d)`;
        }
        if (q.q) { params.push(`%${q.q}%`); where += ` AND sl.name ILIKE $${params.length}`; }
        const fsql = buildFilter(q.filter as string | undefined, LOC_FILTER, ['sl.name', 'sl.kind'], params);
        if (fsql) where += ` AND ${fsql}`;
        const orderBy = buildOrderBy(q.sort as string | undefined, LOC_FILTER, 'sl.name', 'asc');
        return db.query(
          `SELECT ${LOC_SELECT.replace('FROM stock_location sl', `,
             (SELECT count(*) FROM stock_balance b WHERE b.location_id = sl.id AND b.qty_on_hand <> 0)::int AS direct_count
             FROM stock_location sl`)}
           ${where} ORDER BY sl.is_default DESC, sl.sequence, ${orderBy}`, params).then((r) => r.rows);
      });
      return { items: rows.map(locDto) };
    });

  app.get<{ Params: { id: string } }>('/stock/locations/:id',
    { preHandler: [app.authenticate, requirePermission('stock:read')] },
    async (request, reply) => {
      const r = await withRls(request.ctx, (db) => db.query(
        `SELECT ${LOC_SELECT} WHERE sl.id = $1 AND sl.archived_at IS NULL`, [request.params.id]).then((x) => x.rows));
      if (!r[0]) return reply.code(404).send({ error: 'not_found', message: 'Magazzino/ubicazione non trovato', statusCode: 404 });
      return locDto(r[0]);
    });

  app.post('/stock/locations', { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      const input = createStockLocationSchema.parse(request.body);
      const dto = await withRls(request.ctx, async (db) => {
        let seq = input.sequence;
        if (seq === undefined) {
          const m = await db.query(
            `SELECT COALESCE(max(sequence), -1) + 1 AS seq FROM stock_location
             WHERE tenant_id = $1 AND parent_id IS NOT DISTINCT FROM $2`,
            [request.ctx.tenantId, input.parentId ?? null]);
          seq = Number(m.rows[0].seq);
        }
        const r = await db.query(
          `INSERT INTO stock_location (tenant_id, parent_id, name, kind, resource_id, code, note, manager_user_id, holds_stock, is_default, sequence, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,true),COALESCE($10,false),$11,$12,$12)
           RETURNING ${LOC_COLS}`,
          [request.ctx.tenantId, input.parentId ?? null, input.name, input.kind, input.resourceId ?? null,
           input.code ?? null, input.note ?? null, input.managerUserId ?? null,
           input.holdsStock ?? null, input.isDefault ?? null, seq, request.ctx.userId]);
        return locDto(r.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  app.patch<{ Params: { id: string } }>('/stock/locations/:id',
    { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request) => {
      const input = updateStockLocationSchema.parse(request.body);
      return withRls(request.ctx, async (db) => {
        const sets: string[] = []; const params: unknown[] = [];
        const put = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`); };
        if (input.name !== undefined) put('name', input.name);
        if (input.parentId !== undefined) put('parent_id', input.parentId ?? null);
        if (input.kind !== undefined) put('kind', input.kind);
        if (input.resourceId !== undefined) put('resource_id', input.resourceId ?? null);
        if (input.code !== undefined) put('code', input.code ?? null);
        if (input.note !== undefined) put('note', input.note ?? null);
        if (input.managerUserId !== undefined) put('manager_user_id', input.managerUserId ?? null);
        if (input.holdsStock !== undefined) put('holds_stock', input.holdsStock);
        if (input.isDefault !== undefined) put('is_default', input.isDefault);
        if (input.active !== undefined) put('active', input.active);
        if (input.sequence !== undefined) put('sequence', input.sequence);
        if (!sets.length) return { ok: true };
        params.push(request.ctx.userId); sets.push(`updated_by = $${params.length}`);
        params.push(request.params.id);
        const r = await db.query(
          `UPDATE stock_location SET ${sets.join(', ')} WHERE id = $${params.length}
           RETURNING ${LOC_COLS}`, params);
        return r.rows[0] ? locDto(r.rows[0]) : { ok: false };
      });
    });

  // elimina-soft a TRE MODI (STANDARD entità ad albero §7). Non rompe lo storico movimenti.
  //  block   : se sotto-ubicazioni o giacenze (qty<>0) → 409; altrimenti archivia.
  //  reassign: sotto-ubicazioni al nonno, archivia solo il nodo.
  //  cascade : archivia nodo + discendenti.
  app.delete<{ Params: { id: string }; Querystring: { mode?: string } }>('/stock/locations/:id',
    { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      const mode = treeDeleteMode.catch('block').parse(request.query.mode);
      const id = request.params.id; const userId = request.ctx.userId;
      const res = await withRls(request.ctx, async (db) => {
        const cur = await db.query(`SELECT name, parent_id FROM stock_location WHERE id = $1 AND archived_at IS NULL`, [id]);
        if (!cur.rows.length) return { code: 'notfound' as const };
        const name = cur.rows[0].name as string; const parentId = (cur.rows[0].parent_id as string) ?? null;
        const sub = await db.query(
          `WITH RECURSIVE tree AS (
             SELECT id FROM stock_location WHERE id = $1
             UNION ALL SELECT s.id FROM stock_location s JOIN tree t ON s.parent_id = t.id WHERE s.archived_at IS NULL
           ) SELECT array_agg(id) AS ids FROM tree`, [id]);
        const ids: string[] = sub.rows[0].ids ?? [id];
        const children = (await db.query(`SELECT count(*)::int AS n FROM stock_location WHERE parent_id = $1 AND archived_at IS NULL`, [id])).rows[0].n as number;
        const stockHere = (await db.query(`SELECT count(*)::int AS n FROM stock_balance WHERE location_id = ANY($1) AND qty_on_hand <> 0`, [ids])).rows[0].n as number;

        if (mode === 'block') {
          const parts: string[] = [];
          if (children) parts.push(`${children} sotto-ubicazioni`);
          if (stockHere) parts.push(`${stockHere} articoli a giacenza`);
          if (parts.length) return { code: 'blocked' as const, name, parts };
          await db.query(`UPDATE stock_location SET archived_at = now(), archived_by=$2, updated_by=$2 WHERE id=$1`, [id, userId]);
          await logAudit(db, request.ctx, { entity: 'stock_location', entityId: id, action: 'archive', label: name });
          return { code: 'ok' as const, result: { ok: true, archivedNodes: 1 } };
        }
        if (mode === 'reassign') {
          await db.query(`UPDATE stock_location SET parent_id = $2, updated_by = $3 WHERE parent_id = $1 AND archived_at IS NULL`, [id, parentId, userId]);
          await db.query(`UPDATE stock_location SET archived_at = now(), archived_by=$2, updated_by=$2 WHERE id=$1`, [id, userId]);
          await logAudit(db, request.ctx, { entity: 'stock_location', entityId: id, action: 'archive', label: name });
          return { code: 'ok' as const, result: { ok: true, reassigned: children } };
        }
        await db.query(`UPDATE stock_location SET archived_at = now(), archived_by=$2, updated_by=$2 WHERE id = ANY($1) AND archived_at IS NULL`, [ids, userId]);
        await logAudit(db, request.ctx, { entity: 'stock_location', entityId: id, action: 'archive', label: name });
        return { code: 'ok' as const, result: { ok: true, archivedNodes: ids.length } };
      });
      if (res.code === 'notfound') return reply.code(404).send({ error: 'not_found', message: 'Magazzino/ubicazione non trovato', statusCode: 404 });
      if (res.code === 'blocked') return reply.code(409).send({ error: 'conflict', message: `Impossibile eliminare «${res.name}»: contiene ${res.parts.join(' e ')}. Scegli «Riassegna» o «Elimina tutto il ramo».`, statusCode: 409 });
      return reply.send(res.result);
    });

  // RIPRISTINA un'ubicazione archiviata
  app.post<{ Params: { id: string } }>('/stock/locations/:id/restore',
    { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      const dto = await withRls(request.ctx, async (db) => {
        const upd = await db.query(
          `UPDATE stock_location SET archived_at = NULL, archived_by = NULL, updated_by = $2
           WHERE id = $1 AND archived_at IS NOT NULL RETURNING name`,
          [request.params.id, request.ctx.userId]);
        if (!upd.rows.length) return null;
        await logAudit(db, request.ctx, { entity: 'stock_location', entityId: request.params.id, action: 'restore', label: upd.rows[0].name as string });
        const r = await db.query(`SELECT ${LOC_SELECT} WHERE sl.id = $1`, [request.params.id]);
        return locDto(r.rows[0]);
      });
      if (!dto) return reply.code(404).send({ error: 'not_found', message: 'Magazzino/ubicazione non trovato o non archiviato', statusCode: 404 });
      return dto;
    });

  // DUPLICA (regole C/D dello standard albero): copia stesso genitore, suffisso «(copia)» se serve.
  app.post<{ Params: { id: string } }>('/stock/locations/:id/duplicate',
    { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      const ctx = request.ctx;
      const dto = await withRls(ctx, async (db) => {
        const src = await db.query(`SELECT parent_id, name, kind, resource_id, note, holds_stock FROM stock_location WHERE id = $1`, [request.params.id]);
        if (!src.rows.length) return null;
        const s = src.rows[0] as Record<string, unknown>;
        const parentId = (s.parent_id as string) ?? null;
        const taken = new Set((await db.query(
          `SELECT name FROM stock_location WHERE tenant_id=$1 AND parent_id IS NOT DISTINCT FROM $2 AND archived_at IS NULL`,
          [ctx.tenantId, parentId])).rows.map((r) => r.name as string));
        let name = s.name as string;
        if (taken.has(name)) { let n = `${name} (copia)`; let i = 2; while (taken.has(n)) n = `${name} (copia ${i++})`; name = n; }
        const seq = Number((await db.query(
          `SELECT COALESCE(max(sequence), -1) + 1 AS seq FROM stock_location WHERE tenant_id=$1 AND parent_id IS NOT DISTINCT FROM $2`,
          [ctx.tenantId, parentId])).rows[0].seq);
        // la copia NON è mai predefinita e non duplica il codice univoco
        const r = await db.query(
          `INSERT INTO stock_location (tenant_id, parent_id, name, kind, resource_id, note, holds_stock, is_default, sequence, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,$9,$9) RETURNING ${LOC_COLS}`,
          [ctx.tenantId, parentId, name, s.kind, s.resource_id ?? null, s.note ?? null, s.holds_stock ?? true, seq, ctx.userId]);
        return locDto(r.rows[0]);
      });
      if (!dto) return reply.code(404).send({ error: 'not_found', message: 'Ubicazione non trovata', statusCode: 404 });
      return reply.code(201).send(dto);
    });

  // GENERATORE MASSIVO di ubicazioni (WMS Fase 1): crea i bin come figli di :id dal
  // prodotto cartesiano delle dimensioni (corsia×scaffale×ripiano×posizione). Il code
  // si compone dai valori; le coordinate vanno nelle colonne aisle/rack/level/position.
  // Salta i code già esistenti tra i fratelli. Tetto di sicurezza: 2000 bin per chiamata.
  app.post<{ Params: { id: string } }>('/stock/locations/:id/generate',
    { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      const input = generateLocationsSchema.parse(request.body);
      const sep = input.separator ?? '-';
      const kind = input.kind ?? 'sub_location';
      // prodotto cartesiano nell'ordine delle dims passate
      let combos: { code: string; coords: Record<string, string> }[] = [{ code: '', coords: {} }];
      for (const dim of input.dims) {
        const next: typeof combos = [];
        for (const c of combos) for (const v of dim.values) {
          next.push({ code: c.code ? `${c.code}${sep}${v}` : v, coords: { ...c.coords, [dim.key]: v } });
        }
        combos = next;
      }
      if (combos.length > 2000) return reply.code(400).send({ error: 'bad_request', message: `Troppe ubicazioni (${combos.length}). Massimo 2000 per generazione.`, statusCode: 400 });

      const out = await withRls(request.ctx, async (db) => {
        const parent = await db.query(`SELECT id FROM stock_location WHERE id = $1 AND archived_at IS NULL`, [request.params.id]);
        if (!parent.rows.length) return { notFound: true as const };
        const existing = new Set((await db.query(
          `SELECT code FROM stock_location WHERE parent_id = $1 AND code IS NOT NULL`, [request.params.id])).rows.map((r) => r.code as string));
        let seq = Number((await db.query(
          `SELECT COALESCE(max(sequence), -1) + 1 AS seq FROM stock_location WHERE tenant_id = $1 AND parent_id = $2`,
          [request.ctx.tenantId, request.params.id])).rows[0].seq);
        let created = 0, skipped = 0;
        for (const c of combos) {
          if (existing.has(c.code)) { skipped++; continue; }
          await db.query(
            `INSERT INTO stock_location (tenant_id, parent_id, name, kind, code, aisle, rack, level, position, sequence, created_by, updated_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
            [request.ctx.tenantId, request.params.id, c.code, kind, c.code,
             c.coords.aisle ?? null, c.coords.rack ?? null, c.coords.level ?? null, c.coords.position ?? null, seq++, request.ctx.userId]);
          existing.add(c.code); created++;
        }
        await logAudit(db, request.ctx, { entity: 'stock_location', entityId: request.params.id, action: 'update', label: `Generate ${created} ubicazioni` });
        return { created, skipped, total: combos.length };
      });
      if ('notFound' in out) return reply.code(404).send({ error: 'not_found', message: 'Magazzino/ubicazione non trovato', statusCode: 404 });
      return out;
    });

  // ELIMINA DEFINITIVAMENTE (solo se archiviato). FK RESTRICT → 23503 → 409 globale.
  app.delete<{ Params: { id: string } }>('/stock/locations/:id/purge',
    { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      const res = await withRls(request.ctx, async (db) => {
        const r = await db.query(`SELECT name, archived_at FROM stock_location WHERE id = $1`, [request.params.id]);
        if (!r.rows.length) return { code: 'notfound' as const };
        if (!r.rows[0].archived_at) return { code: 'notarchived' as const };
        await logAudit(db, request.ctx, { entity: 'stock_location', entityId: request.params.id, action: 'purge', label: r.rows[0].name as string });
        await db.query(`DELETE FROM stock_location WHERE id = $1 AND archived_at IS NOT NULL`, [request.params.id]);
        return { code: 'ok' as const };
      });
      if (res.code === 'notfound') return reply.code(404).send({ error: 'not_found', message: 'Magazzino/ubicazione non trovato', statusCode: 404 });
      if (res.code === 'notarchived') return reply.code(409).send({ error: 'conflict', message: 'Si elimina definitivamente solo un record archiviato', statusCode: 409 });
      return reply.code(204).send();
    });

  // ── Seriali presenti in un magazzino (Blocco K.1) ───────────────────
  app.get<{ Params: { id: string } }>('/stock/locations/:id/serials',
    { preHandler: [app.authenticate, requirePermission('serial:read')] },
    async (request) => withRls(request.ctx, async (db) => {
      const rows = await db.query(
        `SELECT su.id, su.material_id, m.name AS material_name, su.serial, su.status, su.installed_on, su.updated_at,
                (su.secrets <> '{}'::jsonb) AS has_secret, wo.code AS wo_code
         FROM stock_serial_unit su
         LEFT JOIN material m ON m.id = su.material_id
         LEFT JOIN work_order wo ON wo.id = su.work_order_id
         WHERE su.location_id = $1 AND su.archived_at IS NULL
         ORDER BY su.status, su.serial`, [request.params.id]);
      return { items: rows.rows.map((x: Record<string, unknown>) => ({
        id: x.id as string, materialId: x.material_id as string, materialName: (x.material_name as string) ?? null,
        serial: x.serial as string, status: x.status as string,
        workOrderCode: (x.wo_code as string) ?? null,
        installedOn: (x.installed_on as Date | null)?.toISOString().slice(0, 10) ?? null,
        updatedAt: (x.updated_at as Date).toISOString(), hasSecret: (x.has_secret as boolean) ?? false,
      })) };
    }));

  // ── Giacenze ────────────────────────────────────────────────────────
  app.get<{ Querystring: { locationId?: string; materialId?: string } }>('/stock/balance',
    { preHandler: [app.authenticate, requirePermission('stock:read')] },
    async (request) => {
      const rows = await withRls(request.ctx, (db) => {
        const params: unknown[] = []; const conds: string[] = [];
        if (request.query.locationId) { params.push(request.query.locationId); conds.push(`b.location_id = $${params.length}`); }
        if (request.query.materialId) { params.push(request.query.materialId); conds.push(`b.material_id = $${params.length}`); }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        return db.query(
          `SELECT b.material_id, m.name AS material_name, mu.code AS unit, b.location_id, l.name AS location_name,
                  b.qty_on_hand, b.avg_cost, b.value_on_hand
           FROM stock_balance b JOIN material m ON m.id = b.material_id JOIN stock_location l ON l.id = b.location_id
           LEFT JOIN unit_of_measure mu ON mu.id = m.unit_id
           ${where} ORDER BY m.name, l.name LIMIT 1000`, params).then((r) => r.rows);
      });
      const items: StockBalanceDto[] = rows.map((r) => ({
        materialId: r.material_id, materialName: r.material_name ?? null, locationId: r.location_id,
        locationName: r.location_name ?? null, qtyOnHand: Number(r.qty_on_hand),
        avgCost: r.avg_cost === null ? null : Number(r.avg_cost), valueOnHand: Number(r.value_on_hand), unit: r.unit ?? null,
      }));
      return { items };
    });

  // ── Movimenti (storico + registrazione singola) ─────────────────────
  app.get<{ Querystring: { materialId?: string; locationId?: string; engagementId?: string; activityId?: string; workOrderId?: string } }>(
    '/stock/movements', { preHandler: [app.authenticate, requirePermission('stock:read')] },
    async (request) => {
      const rows = await withRls(request.ctx, (db) => {
        const params: unknown[] = []; const conds: string[] = [];
        for (const [k, col] of [['materialId', 'sm.material_id'], ['locationId', 'sm.location_id'],
          ['engagementId', 'sm.engagement_id'], ['activityId', 'sm.activity_id'], ['workOrderId', 'sm.work_order_id']] as const) {
          const v = request.query[k]; if (v) { params.push(v); conds.push(`${col} = $${params.length}`); }
        }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        return db.query(
          `SELECT sm.id, sm.material_id, m.name AS material_name, sm.location_id, l.name AS location_name,
                  sm.type_id, sm.quantity, smu.code AS unit, sm.unit_cost, sm.unit_price, sm.currency, sm.occurred_on,
                  sm.engagement_id, sm.activity_id, sm.work_order_id, sm.document_ref, sm.note, sm.created_at
           FROM stock_movement sm JOIN material m ON m.id = sm.material_id JOIN stock_location l ON l.id = sm.location_id
           LEFT JOIN unit_of_measure smu ON smu.id = sm.unit_id
           ${where} ORDER BY sm.occurred_on DESC, sm.created_at DESC LIMIT 500`, params).then((r) => r.rows);
      });
      const items: StockMovementDto[] = rows.map((r) => ({
        id: r.id, materialId: r.material_id, materialName: r.material_name ?? null, locationId: r.location_id,
        locationName: r.location_name ?? null, typeId: r.type_id, quantity: Number(r.quantity), unit: r.unit,
        unitCost: r.unit_cost === null ? null : Number(r.unit_cost), unitPrice: r.unit_price === null ? null : Number(r.unit_price),
        currency: r.currency ?? null, occurredOn: r.occurred_on, engagementId: r.engagement_id ?? null,
        activityId: r.activity_id ?? null, workOrderId: r.work_order_id ?? null, documentRef: r.document_ref ?? null,
        note: r.note ?? null, createdAt: r.created_at,
      }));
      return { items };
    });

  // scarico da lavoro / carico rapido / rettifica = un movimento.
  app.post('/stock/movements', { preHandler: [app.authenticate, requirePermission('stock:move')] },
    async (request, reply) => {
      const input = createStockMovementSchema.parse(request.body);
      const signed = input.typeCode === 'in' ? Math.abs(input.quantity)
        : input.typeCode === 'out' ? -Math.abs(input.quantity) : input.quantity; // adjust = delta con segno
      const id = await withRls(request.ctx, (db) => insertMovement(db, request.ctx.tenantId, request.ctx.userId, {
        materialId: input.materialId, locationId: input.locationId, typeCode: input.typeCode, signedQty: signed,
        unit: input.unit, unitCost: input.unitCost, unitPrice: input.unitPrice, currency: input.currency,
        occurredOn: input.occurredOn, engagementId: input.engagementId, activityId: input.activityId, note: input.note,
      }));
      return reply.code(201).send({ id });
    });

  // RETTIFICA / STORNA (PIANO §5.3): crea un movimento COMPENSATIVO (quantità opposta),
  // NON modifica/cancella l'originale (il trigger DB vieta UPDATE/DELETE sui movimenti).
  app.post<{ Params: { id: string } }>('/stock/movements/:id/reverse',
    { preHandler: [app.authenticate, requirePermission('stock:move')] },
    async (request, reply) => {
      const newId = await withRls(request.ctx, async (db) => {
        const o = await db.query(
          `SELECT sm.material_id, sm.location_id, sm.quantity, u.code AS unit, sm.unit_cost, sm.unit_price, sm.currency, sm.occurred_on, sm.engagement_id, sm.activity_id
           FROM stock_movement sm LEFT JOIN unit_of_measure u ON u.id = sm.unit_id WHERE sm.id = $1`, [request.params.id]);
        const m = o.rows[0];
        if (!m) return null;
        return insertMovement(db, request.ctx.tenantId, request.ctx.userId, {
          materialId: m.material_id, locationId: m.location_id, typeCode: 'adjust', signedQty: -Number(m.quantity),
          unit: m.unit, unitCost: m.unit_cost === null ? null : Number(m.unit_cost),
          unitPrice: m.unit_price === null ? null : Number(m.unit_price), currency: m.currency ?? null,
          engagementId: m.engagement_id ?? null, activityId: m.activity_id ?? null,
          note: `Rettifica del movimento ${request.params.id}`,
        });
      });
      if (!newId) return reply.code(404).send({ message: 'Movimento non trovato' });
      return reply.code(201).send({ id: newId });
    });

  // ── Documenti (testata → movimenti alla conferma) ───────────────────
  const DOC_SELECT = `
    SELECT d.id, d.type_id, lv.canonical AS type_canonical, d.number, d.doc_date, d.status,
           d.source_location_id, sl.name AS source_name, d.dest_location_id, dl.name AS dest_name,
           d.company_id, c.display_name AS company_name, d.external_ref, d.note, d.created_at
    FROM stock_document d
    JOIN lookup_value lv ON lv.id = d.type_id
    LEFT JOIN stock_location sl ON sl.id = d.source_location_id
    LEFT JOIN stock_location dl ON dl.id = d.dest_location_id
    LEFT JOIN company c ON c.id = d.company_id`;
  const docDto = (r: Record<string, unknown>): StockDocumentDto => ({
    id: r.id as string, typeId: r.type_id as string, typeCanonical: (r.type_canonical as string) ?? null,
    number: (r.number as string) ?? null, docDate: day(r.doc_date), status: r.status as string,
    sourceLocationId: (r.source_location_id as string) ?? null, sourceLocationName: (r.source_name as string) ?? null,
    destLocationId: (r.dest_location_id as string) ?? null, destLocationName: (r.dest_name as string) ?? null,
    companyId: (r.company_id as string) ?? null, companyName: (r.company_name as string) ?? null,
    externalRef: (r.external_ref as string) ?? null, note: (r.note as string) ?? null, createdAt: r.created_at as string,
  });

  const DOC_SORTABLE: Record<string, string> = {
    number: 'd.number', date: 'd.doc_date', status: 'd.status', type: 'lv.canonical',
    source: 'sl.name', dest: 'dl.name', company: 'c.display_name',
  };
  const DOC_FILTER: Record<string, string> = { ...DOC_SORTABLE, externalRef: 'd.external_ref', note: 'd.note' };
  const DOC_FILTER_ANY = ['d.number', 'c.display_name', 'd.external_ref'];

  app.get('/stock/documents', { preHandler: [app.authenticate, requirePermission('stock:read')] },
    async (request) => {
      const query = request.query as Record<string, unknown>;
      const orderBy = buildOrderBy(query.sort as string | undefined, DOC_SORTABLE, 'd.doc_date', 'desc');
      const rows = await withRls(request.ctx, (db) => {
        const params: unknown[] = [];
        let where = '';
        const conds: string[] = [];
        const q = typeof query.q === 'string' ? query.q.trim() : '';
        if (q) {
          params.push(`%${q}%`); const i = params.length;
          conds.push(`(d.number ILIKE $${i} OR c.display_name ILIKE $${i})`);
        }
        const fsql = buildFilter(query.filter as string | undefined, DOC_FILTER, DOC_FILTER_ANY, params);
        if (fsql) conds.push(fsql);
        if (conds.length) where = `WHERE ${conds.join(' AND ')}`;
        return db.query(`${DOC_SELECT} ${where} ORDER BY ${orderBy}, d.created_at DESC LIMIT 500`, params).then((r) => r.rows);
      });
      return { items: rows.map(docDto) };
    });

  app.get<{ Params: { id: string } }>('/stock/documents/:id',
    { preHandler: [app.authenticate, requirePermission('stock:read')] },
    async (request, reply) => withRls(request.ctx, async (db) => {
      const r = await db.query(`${DOC_SELECT} WHERE d.id = $1`, [request.params.id]);
      if (!r.rows.length) return reply.code(404).send({ error: 'not_found', message: 'Documento non trovato', statusCode: 404 });
      const lines = await db.query(
        `SELECT dl.id, dl.material_id, m.name AS material_name, dl.quantity, dlu.code AS unit, dl.unit_cost, dl.unit_price, dl.currency, dl.note
         FROM stock_document_line dl LEFT JOIN material m ON m.id = dl.material_id
         LEFT JOIN unit_of_measure dlu ON dlu.id = dl.unit_id
         WHERE dl.document_id = $1 ORDER BY dl.created_at`, [request.params.id]);
      return {
        ...docDto(r.rows[0]),
        lines: lines.rows.map((l: Record<string, unknown>) => ({
          id: l.id as string, materialId: l.material_id as string, materialName: (l.material_name as string) ?? null,
          quantity: Number(l.quantity), unit: l.unit as string,
          unitCost: l.unit_cost === null ? null : Number(l.unit_cost), unitPrice: l.unit_price === null ? null : Number(l.unit_price),
          currency: (l.currency as string) ?? null, note: (l.note as string) ?? null,
        })),
      };
    }));

  // PATCH bozza: aggiorna testata e, se passate, sostituisce le righe. Solo draft.
  app.patch<{ Params: { id: string } }>('/stock/documents/:id',
    { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      const input = updateStockDocumentSchema.parse(request.body);
      const out = await withRls(request.ctx, async (db) => {
        const cur = await db.query(`SELECT status FROM stock_document WHERE id = $1`, [request.params.id]);
        if (!cur.rows.length) return 'notfound' as const;
        if (cur.rows[0].status !== 'draft') return 'locked' as const;
        const sets: string[] = []; const vals: unknown[] = [request.params.id];
        const put = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
        if (input.docDate !== undefined) put('doc_date', input.docDate);
        if (input.sourceLocationId !== undefined) put('source_location_id', input.sourceLocationId);
        if (input.destLocationId !== undefined) put('dest_location_id', input.destLocationId);
        if (input.companyId !== undefined) put('company_id', input.companyId);
        if (input.externalRef !== undefined) put('external_ref', input.externalRef);
        if (input.note !== undefined) put('note', input.note);
        vals.push(request.ctx.userId); sets.push(`updated_by = $${vals.length}`);
        await db.query(`UPDATE stock_document SET ${sets.join(', ')} WHERE id = $1`, vals);
        if (input.lines) {
          await db.query(`DELETE FROM stock_document_line WHERE document_id = $1`, [request.params.id]);
          for (const ln of input.lines) {
            await db.query(
              `INSERT INTO stock_document_line (tenant_id, document_id, material_id, quantity, unit_id, unit_cost, unit_price, currency, note)
               VALUES ($1,$2,$3,$4,public.app_resolve_unit(public.app_current_tenant(),$5),$6,$7,$8,$9)`,
              [request.ctx.tenantId, request.params.id, ln.materialId, ln.quantity, ln.unit, ln.unitCost ?? null,
               ln.unitPrice ?? null, ln.currency ?? null, ln.note ?? null]);
          }
        }
        return 'ok' as const;
      });
      if (out === 'notfound') return reply.code(404).send({ error: 'not_found', message: 'Documento non trovato', statusCode: 404 });
      if (out === 'locked') return reply.code(409).send({ error: 'conflict', message: 'Documento confermato: non modificabile', statusCode: 409 });
      return reply.code(204).send();
    });

  // DELETE bozza: solo documenti 'draft' (i confermati hanno già generato movimenti).
  app.delete<{ Params: { id: string } }>('/stock/documents/:id',
    { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      const res = await withRls(request.ctx, async (db) => {
        const cur = await db.query(`SELECT status FROM stock_document WHERE id = $1`, [request.params.id]);
        if (!cur.rows.length) return 'notfound' as const;
        if (cur.rows[0].status !== 'draft') return 'locked' as const;
        await db.query(`DELETE FROM stock_document_line WHERE document_id = $1`, [request.params.id]);
        await db.query(`DELETE FROM stock_document WHERE id = $1`, [request.params.id]);
        return 'ok' as const;
      });
      if (res === 'notfound') return reply.code(404).send({ error: 'not_found', message: 'Documento non trovato', statusCode: 404 });
      if (res === 'locked') return reply.code(409).send({ error: 'conflict', message: 'Documento confermato: non eliminabile (storna con una rettifica)', statusCode: 409 });
      return reply.code(204).send();
    });

  app.post('/stock/documents', { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      const input = createStockDocumentSchema.parse(request.body);
      const id = await withRls(request.ctx, async (db) => {
        const typeId = await lookupIdByCanonical(db, 'stock_document_type', input.typeCode);
        const doc = await db.query(
          `INSERT INTO stock_document (tenant_id, type_id, doc_date, source_location_id, dest_location_id, company_id,
             external_ref, note, status, created_by, updated_by)
           VALUES ($1,$2,COALESCE($3,CURRENT_DATE),$4,$5,$6,$7,$8,'draft',$9,$9) RETURNING id`,
          [request.ctx.tenantId, typeId, input.docDate ?? null, input.sourceLocationId ?? null, input.destLocationId ?? null,
           input.companyId ?? null, input.externalRef ?? null, input.note ?? null, request.ctx.userId]);
        const docId = doc.rows[0].id as string;
        for (const ln of input.lines) {
          await db.query(
            `INSERT INTO stock_document_line (tenant_id, document_id, material_id, quantity, unit_id, unit_cost, unit_price, currency, note)
             VALUES ($1,$2,$3,$4,public.app_resolve_unit(public.app_current_tenant(),$5),$6,$7,$8,$9)`,
            [request.ctx.tenantId, docId, ln.materialId, ln.quantity, ln.unit, ln.unitCost ?? null, ln.unitPrice ?? null,
             ln.currency ?? null, ln.note ?? null]);
        }
        return docId;
      });
      return reply.code(201).send({ id });
    });

  // conferma: genera i movimenti in transazione + numera. Non rieseguibile.
  app.post<{ Params: { id: string } }>('/stock/documents/:id/confirm',
    { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      return withRls(request.ctx, async (db) => {
        const dq = await db.query(
          `SELECT d.id, d.status, d.external_ref, d.source_location_id, d.dest_location_id, d.note, lv.canonical AS type_code
           FROM stock_document d JOIN lookup_value lv ON lv.id = d.type_id WHERE d.id = $1 FOR UPDATE`, [request.params.id]);
        const doc = dq.rows[0];
        if (!doc) return reply.code(404).send({ error: 'not_found', message: 'Documento inesistente', statusCode: 404 });
        if (doc.status !== 'draft') return reply.code(409).send({ error: 'conflict', message: 'Documento già confermato/annullato', statusCode: 409 });
        const type = doc.type_code as 'receipt' | 'transfer' | 'adjustment';
        const lines = (await db.query(
          `SELECT dl.material_id, dl.quantity, u.code AS unit, dl.unit_cost, dl.unit_price, dl.currency, dl.note
           FROM stock_document_line dl LEFT JOIN unit_of_measure u ON u.id = dl.unit_id WHERE dl.document_id = $1`,
          [doc.id])).rows;
        if (!lines.length) return reply.code(400).send({ error: 'bad_request', message: 'Documento senza righe', statusCode: 400 });

        if (type === 'receipt' && !doc.dest_location_id)
          return reply.code(400).send({ error: 'bad_request', message: 'Carico: manca il magazzino di destinazione', statusCode: 400 });
        if (type === 'transfer' && (!doc.source_location_id || !doc.dest_location_id || doc.source_location_id === doc.dest_location_id))
          return reply.code(400).send({ error: 'bad_request', message: 'Trasferimento: origine e destinazione distinte obbligatorie', statusCode: 400 });
        const adjustLoc = doc.dest_location_id ?? doc.source_location_id;
        if (type === 'adjustment' && !adjustLoc)
          return reply.code(400).send({ error: 'bad_request', message: 'Rettifica: manca l\'ubicazione', statusCode: 400 });

        const tid = request.ctx.tenantId, uid = request.ctx.userId;
        for (const ln of lines) {
          const qty = Number(ln.quantity);
          if (type === 'receipt') {
            await insertMovement(db, tid, uid, { materialId: ln.material_id, locationId: doc.dest_location_id, typeCode: 'in',
              signedQty: qty, unit: ln.unit, unitCost: ln.unit_cost, unitPrice: ln.unit_price, currency: ln.currency,
              documentRef: doc.external_ref, stockDocumentId: doc.id, note: ln.note });
          } else if (type === 'transfer') {
            const grp = (await db.query(`SELECT gen_random_uuid() AS g`)).rows[0].g as string;
            await insertMovement(db, tid, uid, { materialId: ln.material_id, locationId: doc.source_location_id, typeCode: 'out',
              signedQty: -qty, unit: ln.unit, stockDocumentId: doc.id, transferGroupId: grp, note: ln.note });
            await insertMovement(db, tid, uid, { materialId: ln.material_id, locationId: doc.dest_location_id, typeCode: 'in',
              signedQty: qty, unit: ln.unit, unitCost: ln.unit_cost, currency: ln.currency, stockDocumentId: doc.id,
              transferGroupId: grp, note: ln.note });
          } else { // adjustment: delta = contato − giacenza corrente
            const cur = await db.query(
              `SELECT qty_on_hand FROM stock_balance WHERE material_id = $1 AND location_id = $2`, [ln.material_id, adjustLoc]);
            const onHand = cur.rows[0] ? Number(cur.rows[0].qty_on_hand) : 0;
            const delta = qty - onHand;
            if (delta !== 0) {
              await insertMovement(db, tid, uid, { materialId: ln.material_id, locationId: adjustLoc, typeCode: 'adjust',
                signedQty: delta, unit: ln.unit, unitCost: ln.unit_cost, stockDocumentId: doc.id,
                note: ln.note ?? doc.note ?? 'rettifica inventario' });
            }
          }
        }
        // numerazione: assicura la serie poi genera
        const { key, fmt } = NUM[type];
        await db.query(
          `INSERT INTO number_series (tenant_id, key, format, reset_period) VALUES ($1,$2,$3,'yearly')
           ON CONFLICT (tenant_id, key) DO NOTHING`, [tid, key, fmt]);
        const number = await nextNumber(db, key);
        await db.query(`UPDATE stock_document SET status = 'confirmed', number = $2, updated_by = $3 WHERE id = $1`,
          [doc.id, number, uid]);
        return { id: doc.id, number, status: 'confirmed' };
      });
    });
}
