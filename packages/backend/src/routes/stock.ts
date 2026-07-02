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

const LOC_COLS = `id, parent_id, name, kind, resource_id, code, note, manager_user_id, holds_stock, is_default, active, sequence,
  capacity_kind, capacity_max, capacity_enforce, public.stock_location_path(id) AS path_label`;
// WMS Fase 2: occupato del bin secondo il criterio (qty × metrica unitaria articolo). NULL se nessun limite.
const OCCUPIED_EXPR = `CASE
    WHEN sl.capacity_kind IS NULL OR sl.capacity_max IS NULL THEN NULL
    WHEN sl.capacity_kind = 'quantity' THEN (SELECT COALESCE(SUM(b.qty_on_hand), 0) FROM stock_balance b WHERE b.location_id = sl.id)
    WHEN sl.capacity_kind = 'volume'   THEN (SELECT COALESCE(SUM(b.qty_on_hand * COALESCE(m.volume, 0)), 0) FROM stock_balance b JOIN material m ON m.id = b.material_id WHERE b.location_id = sl.id)
    WHEN sl.capacity_kind = 'weight'   THEN (SELECT COALESCE(SUM(b.qty_on_hand * COALESCE(m.weight, 0)), 0) FROM stock_balance b JOIN material m ON m.id = b.material_id WHERE b.location_id = sl.id)
    WHEN sl.capacity_kind = 'udc'      THEN (SELECT COALESCE(SUM(b.qty_on_hand / NULLIF(m.units_per_udc, 0)), 0) FROM stock_balance b JOIN material m ON m.id = b.material_id WHERE b.location_id = sl.id)
    ELSE NULL END`;
// stessa lista con prefisso sl. + join app_user per il nome di chi ha archiviato (vista archiviati).
const LOC_SELECT = `sl.id, sl.parent_id, sl.name, sl.kind, sl.resource_id, sl.code, sl.note, sl.manager_user_id,
  sl.holds_stock, sl.is_default, sl.active, sl.sequence, sl.capacity_kind, sl.capacity_max, sl.capacity_enforce,
  ${OCCUPIED_EXPR} AS occupied, public.stock_location_path(sl.id) AS path_label, sl.archived_at, au.full_name AS archived_by_name
  FROM stock_location sl LEFT JOIN app_user au ON au.id = sl.archived_by`;
function locDto(r: Record<string, unknown>): StockLocationDto {
  return {
    id: r.id as string, parentId: (r.parent_id as string) ?? null, name: r.name as string, kind: r.kind as string,
    resourceId: (r.resource_id as string) ?? null, code: (r.code as string) ?? null, note: (r.note as string) ?? null,
    managerUserId: (r.manager_user_id as string) ?? null, holdsStock: r.holds_stock as boolean,
    isDefault: r.is_default as boolean, active: r.active as boolean,
    archivedAt: (r.archived_at as Date | null)?.toISOString() ?? null,
    archivedByName: (r.archived_by_name as string) ?? null,
    // WMS Fase 2: capacità + occupato calcolato (presente solo quando la query lo seleziona)
    capacityKind: (r.capacity_kind as StockLocationDto['capacityKind']) ?? null,
    capacityMax: r.capacity_max == null ? null : Number(r.capacity_max),
    capacityEnforce: (r.capacity_enforce as boolean) ?? false,
    pathLabel: (r.path_label as string) ?? (r.name as string),
    ...(r.occupied !== undefined ? { occupied: r.occupied == null ? null : Number(r.occupied) } : {}),
    // contratto EntityTree (passthrough)
    sequence: Number(r.sequence ?? 0), isSystem: false,
    ...(r.direct_count != null ? { directCount: Number(r.direct_count) } : {}),
  };
}

/** WMS Fase 2: capacità superata in un'ubicazione (errore di dominio → 409 leggibile). */
class CapacityError extends Error {}

/** Se l'ubicazione ha un limite di capacità ATTIVO (capacity_enforce) e il carico di
 *  `addQty` (>0) lo supera, lancia CapacityError con un messaggio chiaro. Altrimenti no-op. */
async function assertCapacity(db: PoolClient, locationId: string, materialId: string, addQty: number): Promise<void> {
  if (addQty <= 0) return;
  const lr = await db.query(`SELECT name, capacity_kind, capacity_max, capacity_enforce FROM stock_location WHERE id = $1`, [locationId]);
  const l = lr.rows[0];
  if (!l || !l.capacity_enforce || !l.capacity_kind || l.capacity_max == null) return;
  const kind = l.capacity_kind as 'volume' | 'weight' | 'quantity' | 'udc';
  // occupato attuale + metrica unitaria dell'articolo, per criterio
  let occupied: number; let unitMetric: number;
  if (kind === 'quantity') {
    occupied = Number((await db.query(`SELECT COALESCE(SUM(qty_on_hand), 0) AS s FROM stock_balance WHERE location_id = $1`, [locationId])).rows[0].s);
    unitMetric = 1;
  } else if (kind === 'udc') {
    occupied = Number((await db.query(`SELECT COALESCE(SUM(b.qty_on_hand / NULLIF(m.units_per_udc, 0)), 0) AS s FROM stock_balance b JOIN material m ON m.id = b.material_id WHERE b.location_id = $1`, [locationId])).rows[0].s);
    const upu = Number((await db.query(`SELECT COALESCE(units_per_udc, 0) AS v FROM material WHERE id = $1`, [materialId])).rows[0]?.v ?? 0);
    unitMetric = upu > 0 ? 1 / upu : 0;   // senza pezzi-per-UDC non possiamo enforceare → non blocca
  } else {
    const metricCol = kind === 'volume' ? 'volume' : 'weight';
    occupied = Number((await db.query(`SELECT COALESCE(SUM(b.qty_on_hand * COALESCE(m.${metricCol}, 0)), 0) AS s FROM stock_balance b JOIN material m ON m.id = b.material_id WHERE b.location_id = $1`, [locationId])).rows[0].s);
    unitMetric = Number((await db.query(`SELECT COALESCE(${metricCol}, 0) AS v FROM material WHERE id = $1`, [materialId])).rows[0]?.v ?? 0);
  }
  const projected = occupied + addQty * unitMetric;
  const max = Number(l.capacity_max);
  if (projected > max + 1e-9) {
    const u = kind === 'volume' ? 'm³' : kind === 'weight' ? 'kg' : kind === 'udc' ? 'UDC' : 'pz';
    const f = (n: number) => Number(n.toFixed(3)).toLocaleString('it-IT');
    throw new CapacityError(`Capacità superata in «${l.name}»: il carico porterebbe a ${f(projected)} ${u} sul massimo di ${f(max)} ${u} (già occupato ${f(occupied)} ${u}).`);
  }
}

/** inserisce un movimento con il segno corretto; ritorna l'id.
 *  enforceCapacity: per i carichi reali (in/transfer-in) verifica il limite del bin di destinazione. */
async function insertMovement(db: PoolClient, tenantId: string, userId: string, m: {
  materialId: string; locationId: string; typeCode: 'in' | 'out' | 'adjust'; signedQty: number; unit: string;
  unitCost?: number | null; unitPrice?: number | null; currency?: string | null; occurredOn?: string;
  documentRef?: string | null; stockDocumentId?: string | null; engagementId?: string | null;
  activityId?: string | null; transferGroupId?: string | null; note?: string | null; enforceCapacity?: boolean;
}): Promise<string> {
  if (m.enforceCapacity && m.signedQty > 0) await assertCapacity(db, m.locationId, m.materialId, m.signedQty);
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
        // AUTO-CODICE: se l'utente non lo mette, lo generiamo (mai vuoto). I magazzini
        // (radice) → serie MAG-; le ubicazioni interne → serie UB-. Univoco per padre.
        let code = input.code?.trim() || null;
        if (!code) {
          const isRoot = !input.parentId;
          const key = isRoot ? 'stock_location' : 'stock_location_bin';
          const fmt = isRoot ? 'MAG-{SEQ:3}' : 'UB-{SEQ:4}';
          await db.query(
            `INSERT INTO number_series (tenant_id, key, format, reset_period) VALUES ($1,$2,$3,'never')
             ON CONFLICT (tenant_id, key) DO NOTHING`, [request.ctx.tenantId, key, fmt]);
          code = await nextNumber(db, key);
        }
        const r = await db.query(
          `INSERT INTO stock_location (tenant_id, parent_id, name, kind, resource_id, code, note, manager_user_id, holds_stock, is_default, sequence, capacity_kind, capacity_max, capacity_enforce, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,true),COALESCE($10,false),$11,$12,$13,COALESCE($14,false),$15,$15)
           RETURNING ${LOC_COLS}`,
          [request.ctx.tenantId, input.parentId ?? null, input.name, input.kind, input.resourceId ?? null,
           code, input.note ?? null, input.managerUserId ?? null,
           input.holdsStock ?? null, input.isDefault ?? null, seq,
           input.capacityKind ?? null, input.capacityMax ?? null, input.capacityEnforce ?? null, request.ctx.userId]);
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
        if (input.capacityKind !== undefined) put('capacity_kind', input.capacityKind ?? null);
        if (input.capacityMax !== undefined) put('capacity_max', input.capacityMax ?? null);
        if (input.capacityEnforce !== undefined) put('capacity_enforce', input.capacityEnforce);
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

      const labelByKey: Record<string, string | undefined> = {};
      input.dims.forEach((d) => { labelByKey[d.key] = d.label; });
      const ctx = request.ctx; const tenantId = ctx.tenantId; const userId = ctx.userId; const pid0 = request.params.id;
      const out = await withRls(ctx, async (db) => {
        const parent = await db.query(`SELECT id FROM stock_location WHERE id = $1 AND archived_at IS NULL`, [pid0]);
        if (!parent.rows.length) return { notFound: true as const };
        let created = 0, skipped = 0;
        const seqByParent = new Map<string, number>();
        const nextSeq = async (p: string) => {
          if (!seqByParent.has(p)) seqByParent.set(p, Number((await db.query(`SELECT COALESCE(max(sequence), -1) + 1 AS s FROM stock_location WHERE tenant_id=$1 AND parent_id=$2`, [tenantId, p])).rows[0].s));
          const v = seqByParent.get(p)!; seqByParent.set(p, v + 1); return v;
        };
        const ins = async (p: string, name: string, code: string | null, coords: Record<string, string>) => {
          await db.query(
            `INSERT INTO stock_location (tenant_id, parent_id, name, kind, code, aisle, rack, level, position, sequence, created_by, updated_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING id`,
            [tenantId, p, name, kind, code, coords.aisle ?? null, coords.rack ?? null, coords.level ?? null, coords.position ?? null, await nextSeq(p), userId]);
          created++;
        };

        if (input.hierarchical) {
          // nodi ANNIDATI: una "cartella" per ogni livello (Scaffale 01 › Ripiano 01 › Posizione A)
          const cache = new Map<string, string>();              // "parent|name" -> id
          const ensure = async (p: string, name: string, code: string | null, coords: Record<string, string>): Promise<string> => {
            const k = `${p}|${name}`;
            if (cache.has(k)) return cache.get(k)!;
            const ex = await db.query(`SELECT id FROM stock_location WHERE parent_id=$1 AND name=$2 AND archived_at IS NULL LIMIT 1`, [p, name]);
            let id: string;
            if (ex.rows.length) { id = ex.rows[0].id as string; }
            else {
              const r = await db.query(
                `INSERT INTO stock_location (tenant_id, parent_id, name, kind, code, aisle, rack, level, position, sequence, created_by, updated_by)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING id`,
                [tenantId, p, name, kind, code, coords.aisle ?? null, coords.rack ?? null, coords.level ?? null, coords.position ?? null, await nextSeq(p), userId]);
              id = r.rows[0].id as string; created++;
            }
            cache.set(k, id); return id;
          };
          for (const c of combos) {
            let parentId = pid0; const acc: Record<string, string> = {};
            for (let i = 0; i < input.dims.length; i++) {
              const dim = input.dims[i]!; const val = c.coords[dim.key]!; acc[dim.key] = val;
              const isLeaf = i === input.dims.length - 1;
              const name = `${labelByKey[dim.key] ?? dim.key} ${val}`;
              parentId = await ensure(parentId, name, isLeaf ? c.code : null, { ...acc });
            }
          }
        } else {
          // bin PIATTI col code composto, salta i duplicati per code
          const existing = new Set((await db.query(`SELECT code FROM stock_location WHERE parent_id=$1 AND code IS NOT NULL`, [pid0])).rows.map((r) => r.code as string));
          for (const c of combos) {
            if (existing.has(c.code)) { skipped++; continue; }
            await ins(pid0, c.code, c.code, c.coords); existing.add(c.code);
          }
        }
        await logAudit(db, ctx, { entity: 'stock_location', entityId: pid0, action: 'update', label: `Generate ${created} ubicazioni` });
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
  app.get<{ Querystring: { locationId?: string; materialId?: string; subtreeOf?: string; includeZero?: string } }>('/stock/balance',
    { preHandler: [app.authenticate, requirePermission('stock:read')] },
    async (request) => {
      const rows = await withRls(request.ctx, (db) => {
        const params: unknown[] = []; const conds: string[] = [];
        if (request.query.locationId) { params.push(request.query.locationId); conds.push(`b.location_id = $${params.length}`); }
        // subtreeOf: giacenze in TUTTO il sotto-albero (magazzino + sue ubicazioni/bin) → consultazione per bin
        if (request.query.subtreeOf) {
          params.push(request.query.subtreeOf);
          conds.push(`b.location_id IN (WITH RECURSIVE d AS (
            SELECT id FROM stock_location WHERE id = $${params.length}
            UNION ALL SELECT c.id FROM stock_location c JOIN d ON c.parent_id = d.id
          ) SELECT id FROM d)`);
        }
        if (request.query.materialId) { params.push(request.query.materialId); conds.push(`b.material_id = $${params.length}`); }
        if (request.query.includeZero !== '1') conds.push(`b.qty_on_hand <> 0`);
        // integrità: la giacenza deve appartenere allo STESSO tenant della sua ubicazione e
        // del suo articolo. Evita che un platform-admin (che vede tutti i tenant) mischi righe
        // cross-tenant → niente giacenze doppie/incoerenti.
        conds.push(`b.tenant_id = l.tenant_id`, `b.tenant_id = m.tenant_id`);
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        return db.query(
          `SELECT b.material_id, m.name AS material_name, m.sku, m.reorder_point, mu.code AS unit,
                  b.location_id, l.name AS location_name, public.stock_location_path(l.id) AS location_path,
                  b.qty_on_hand, b.avg_cost, b.value_on_hand,
                  (SELECT COALESCE(SUM(b2.qty_on_hand),0) FROM stock_balance b2 WHERE b2.material_id = b.material_id) AS material_total,
                  (SELECT MIN(sm.occurred_on) FROM stock_movement sm WHERE sm.material_id = b.material_id AND sm.location_id = b.location_id AND sm.quantity > 0) AS first_in
           FROM stock_balance b JOIN material m ON m.id = b.material_id JOIN stock_location l ON l.id = b.location_id
           LEFT JOIN unit_of_measure mu ON mu.id = m.unit_id
           ${where} ORDER BY m.name, location_path LIMIT 2000`, params).then((r) => r.rows);
      });
      const items: StockBalanceDto[] = rows.map((r) => ({
        materialId: r.material_id, materialName: r.material_name ?? null, sku: r.sku ?? null, locationId: r.location_id,
        locationName: r.location_name ?? null, locationPath: (r.location_path as string) ?? (r.location_name ?? null),
        qtyOnHand: Number(r.qty_on_hand), materialTotal: Number(r.material_total ?? 0),
        reorderPoint: r.reorder_point === null ? null : Number(r.reorder_point),
        lowStock: r.reorder_point != null && Number(r.material_total ?? 0) < Number(r.reorder_point),
        firstInAt: r.first_in ? (r.first_in instanceof Date ? r.first_in.toISOString().slice(0, 10) : String(r.first_in).slice(0, 10)) : null,
        avgCost: r.avg_cost === null ? null : Number(r.avg_cost), valueOnHand: Number(r.value_on_hand), unit: r.unit ?? null,
      }));
      return { items };
    });

  // ── Report RIORDINO (server-side): sotto scorta, deficit, qtà suggerita ─────
  //  Filtro e calcoli in SQL (mai fetch-all + filtro client). Ordinato per gravità,
  //  con TOTALE reale + paginazione → niente troncamento silenzioso.
  app.get<{ Querystring: { limit?: string; offset?: string } }>('/stock/reorder',
    { preHandler: [app.authenticate, requirePermission('stock:read')] },
    async (request) => {
      const limit = Math.min(Math.max(Number(request.query.limit) || 100, 1), 500);
      const offset = Math.max(Number(request.query.offset) || 0, 0);
      return withRls(request.ctx, async (db) => {
        // giacenza per articolo (tenant-safe: la giacenza deve essere dello stesso tenant dell'articolo)
        const base = `FROM material m
          LEFT JOIN unit_of_measure u ON u.id = m.unit_id
          LEFT JOIN company pv ON pv.id = m.preferred_vendor_id
          LEFT JOIN LATERAL (SELECT COALESCE(SUM(b.qty_on_hand), 0) AS qty FROM stock_balance b
             WHERE b.material_id = m.id AND b.tenant_id = m.tenant_id) bal ON true
          WHERE m.archived_at IS NULL AND m.track_stock AND m.reorder_point IS NOT NULL AND bal.qty < m.reorder_point`;
        const total = Number((await db.query(`SELECT count(*)::int AS n ${base}`)).rows[0].n);
        const rows = (await db.query(
          `SELECT m.id, m.code, m.name, m.sku, u.code AS unit, bal.qty AS on_hand,
                  m.reorder_point, m.safety_stock, m.max_qty, pv.display_name AS vendor,
                  (m.reorder_point - bal.qty) AS deficit,
                  GREATEST(COALESCE(NULLIF(m.max_qty, 0), NULLIF(m.safety_stock, 0), m.reorder_point) - bal.qty, m.reorder_point - bal.qty) AS suggested
           ${base}
           ORDER BY (m.reorder_point - bal.qty) DESC, m.name
           LIMIT $1 OFFSET $2`, [limit, offset])).rows;
        return {
          total,
          items: rows.map((r: Record<string, unknown>) => ({
            materialId: r.id as string, code: (r.code as string) ?? null, name: r.name as string, sku: (r.sku as string) ?? null,
            unit: (r.unit as string) ?? null, onHand: Number(r.on_hand), reorderPoint: Number(r.reorder_point),
            safetyStock: r.safety_stock === null ? null : Number(r.safety_stock), maxQty: r.max_qty === null ? null : Number(r.max_qty),
            deficit: Number(r.deficit), suggestedQty: Number(r.suggested), preferredVendorName: (r.vendor as string) ?? null,
          })),
        };
      });
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
      try {
        const id = await withRls(request.ctx, (db) => insertMovement(db, request.ctx.tenantId, request.ctx.userId, {
          materialId: input.materialId, locationId: input.locationId, typeCode: input.typeCode, signedQty: signed,
          unit: input.unit, unitCost: input.unitCost, unitPrice: input.unitPrice, currency: input.currency,
          occurredOn: input.occurredOn, engagementId: input.engagementId, activityId: input.activityId, note: input.note,
          enforceCapacity: true,
        }));
        return reply.code(201).send({ id });
      } catch (e) {
        if (e instanceof CapacityError) return reply.code(409).send({ error: 'conflict', message: e.message, statusCode: 409 });
        throw e;
      }
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
        `SELECT dl.id, dl.material_id, m.name AS material_name, dl.quantity, dlu.code AS unit, dl.unit_cost, dl.unit_price, dl.currency, dl.note,
                dl.source_location_id, public.stock_location_path(dl.source_location_id) AS source_path,
                dl.dest_location_id,   public.stock_location_path(dl.dest_location_id)   AS dest_path
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
          sourceLocationId: (l.source_location_id as string) ?? null, sourceLocationPath: (l.source_path as string) ?? null,
          destLocationId: (l.dest_location_id as string) ?? null, destLocationPath: (l.dest_path as string) ?? null,
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
              `INSERT INTO stock_document_line (tenant_id, document_id, material_id, quantity, unit_id, unit_cost, unit_price, currency, note, source_location_id, dest_location_id)
               VALUES ($1,$2,$3,$4,public.app_resolve_unit(public.app_current_tenant(),$5),$6,$7,$8,$9,$10,$11)`,
              [request.ctx.tenantId, request.params.id, ln.materialId, ln.quantity, ln.unit, ln.unitCost ?? null,
               ln.unitPrice ?? null, ln.currency ?? null, ln.note ?? null, ln.sourceLocationId ?? null, ln.destLocationId ?? null]);
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
            `INSERT INTO stock_document_line (tenant_id, document_id, material_id, quantity, unit_id, unit_cost, unit_price, currency, note, source_location_id, dest_location_id)
             VALUES ($1,$2,$3,$4,public.app_resolve_unit(public.app_current_tenant(),$5),$6,$7,$8,$9,$10,$11)`,
            [request.ctx.tenantId, docId, ln.materialId, ln.quantity, ln.unit, ln.unitCost ?? null, ln.unitPrice ?? null,
             ln.currency ?? null, ln.note ?? null, ln.sourceLocationId ?? null, ln.destLocationId ?? null]);
        }
        return docId;
      });
      return reply.code(201).send({ id });
    });

  // conferma: genera i movimenti in transazione + numera. Non rieseguibile.
  app.post<{ Params: { id: string } }>('/stock/documents/:id/confirm',
    { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      try {
      return await withRls(request.ctx, async (db) => {
        const dq = await db.query(
          `SELECT d.id, d.status, d.external_ref, d.source_location_id, d.dest_location_id, d.note, lv.canonical AS type_code
           FROM stock_document d JOIN lookup_value lv ON lv.id = d.type_id WHERE d.id = $1 FOR UPDATE`, [request.params.id]);
        const doc = dq.rows[0];
        if (!doc) return reply.code(404).send({ error: 'not_found', message: 'Documento inesistente', statusCode: 404 });
        if (doc.status !== 'draft') return reply.code(409).send({ error: 'conflict', message: 'Documento già confermato/annullato', statusCode: 409 });
        const type = doc.type_code as 'receipt' | 'transfer' | 'adjustment';
        const lines = (await db.query(
          `SELECT dl.material_id, dl.quantity, u.code AS unit, dl.unit_cost, dl.unit_price, dl.currency, dl.note,
                  dl.source_location_id, dl.dest_location_id
           FROM stock_document_line dl LEFT JOIN unit_of_measure u ON u.id = dl.unit_id WHERE dl.document_id = $1`,
          [doc.id])).rows;
        if (!lines.length) return reply.code(400).send({ error: 'bad_request', message: 'Documento senza righe', statusCode: 400 });

        // WMS Fase A: ubicazione PER RIGA con fallback alla testata. Pre-pass di validazione
        // di TUTTE le righe PRIMA di inserire movimenti → atomico (nessun commit parziale).
        interface Resolved { ln: Record<string, unknown>; src?: string; dest?: string; loc?: string }
        const resolved: Resolved[] = [];
        for (const ln of lines) {
          const lsrc = (ln.source_location_id as string) ?? null;
          const ldest = (ln.dest_location_id as string) ?? null;
          if (type === 'receipt') {
            const dest = ldest ?? doc.dest_location_id;
            if (!dest) return reply.code(400).send({ error: 'bad_request', message: 'Carico: manca la destinazione (né sulla riga né sulla testata)', statusCode: 400 });
            resolved.push({ ln, dest });
          } else if (type === 'transfer') {
            const src = lsrc ?? doc.source_location_id;
            const dest = ldest ?? doc.dest_location_id;
            if (!src || !dest || src === dest) return reply.code(400).send({ error: 'bad_request', message: 'Trasferimento: ogni riga deve avere origine e destinazione distinte (riga o testata)', statusCode: 400 });
            resolved.push({ ln, src, dest });
          } else {
            const loc = ldest ?? lsrc ?? doc.dest_location_id ?? doc.source_location_id;
            if (!loc) return reply.code(400).send({ error: 'bad_request', message: 'Rettifica: manca l\'ubicazione (né sulla riga né sulla testata)', statusCode: 400 });
            resolved.push({ ln, loc });
          }
        }

        const tid = request.ctx.tenantId, uid = request.ctx.userId;
        for (const { ln, src, dest, loc } of resolved) {
          const qty = Number(ln.quantity);
          if (type === 'receipt') {
            await insertMovement(db, tid, uid, { materialId: ln.material_id as string, locationId: dest!, typeCode: 'in',
              signedQty: qty, unit: ln.unit as string, unitCost: ln.unit_cost as number, unitPrice: ln.unit_price as number, currency: ln.currency as string,
              documentRef: doc.external_ref, stockDocumentId: doc.id, note: ln.note as string, enforceCapacity: true });
          } else if (type === 'transfer') {
            const grp = (await db.query(`SELECT gen_random_uuid() AS g`)).rows[0].g as string;
            await insertMovement(db, tid, uid, { materialId: ln.material_id as string, locationId: src!, typeCode: 'out',
              signedQty: -qty, unit: ln.unit as string, stockDocumentId: doc.id, transferGroupId: grp, note: ln.note as string });
            await insertMovement(db, tid, uid, { materialId: ln.material_id as string, locationId: dest!, typeCode: 'in',
              signedQty: qty, unit: ln.unit as string, unitCost: ln.unit_cost as number, currency: ln.currency as string, stockDocumentId: doc.id,
              transferGroupId: grp, note: ln.note as string, enforceCapacity: true });
          } else { // adjustment: delta = contato − giacenza corrente
            const cur = await db.query(
              `SELECT qty_on_hand FROM stock_balance WHERE material_id = $1 AND location_id = $2`, [ln.material_id, loc!]);
            const onHand = cur.rows[0] ? Number(cur.rows[0].qty_on_hand) : 0;
            const delta = qty - onHand;
            if (delta !== 0) {
              await insertMovement(db, tid, uid, { materialId: ln.material_id as string, locationId: loc!, typeCode: 'adjust',
                signedQty: delta, unit: ln.unit as string, unitCost: ln.unit_cost as number, stockDocumentId: doc.id,
                note: (ln.note as string) ?? doc.note ?? 'rettifica inventario' });
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
      } catch (e) {
        if (e instanceof CapacityError) return reply.code(409).send({ error: 'conflict', message: e.message, statusCode: 409 });
        throw e;
      }
    });
}
