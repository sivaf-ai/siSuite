/** warehouse.ts — MAGAZZINO ESTESO (Blocco C): lotti/scadenze, conteggio
 *  inventariale (post → rettifiche), ordini d'acquisto (ricezione → carico),
 *  liste di prelievo (conferma → scarico). Tutte le operazioni che muovono
 *  giacenza inseriscono righe in stock_movement: un trigger AFTER INSERT
 *  aggiorna stock_balance da solo — qui NON si scrive MAI stock_balance. */
import type { FastifyInstance } from 'fastify';
import {
  createStockLotSchema, updateStockLotSchema,
  createStockCountSchema, updateStockCountSchema,
  createPurchaseOrderSchema, updatePurchaseOrderSchema, receivePurchaseOrderSchema,
  createPickListSchema, updatePickListSchema,
  type StockLotDto, type StockCountDto, type StockCountLineDto,
  type PurchaseOrderDto, type PurchaseOrderLineDto,
  type PickListDto, type PickListLineDto,
} from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import type { PoolClient } from '../db/pool.js';
import { lookupIdByCanonical } from '../lookupResolve.js';
import { nextNumber } from '../numberSeries.js';
import { buildFilter } from '../filterSql.js';
import { buildOrderBy } from '../sortSql.js';

const PO_SORTABLE: Record<string, string> = {
  number: 'po.number', date: 'po.order_date', expected: 'po.expected_date', status: 'po.status',
  supplier: 's.display_name', dest: 'l.name',
};
const PO_FILTER: Record<string, string> = { ...PO_SORTABLE, currency: 'po.currency', note: 'po.note' };
const PO_FILTER_ANY = ['po.number', 's.display_name'];

const PICK_SORTABLE: Record<string, string> = {
  number: 'pl.number', status: 'pl.status', source: 'l.name', resource: 'r.label', created: 'pl.created_at',
};
const PICK_FILTER: Record<string, string> = { ...PICK_SORTABLE, note: 'pl.note' };
const PICK_FILTER_ANY = ['pl.number', 'l.name', 'r.label'];

const day = (v: unknown): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

/** inserisce un movimento con il segno corretto; ritorna l'id.
 *  REPLICA insertMovement di stock.ts: solo stock_movement, il trigger fa il saldo. */
async function insertMovement(db: PoolClient, tenantId: string, userId: string, m: {
  materialId: string; locationId: string; typeCode: 'in' | 'out' | 'count_adjust'; signedQty: number; unit: string;
  unitCost?: number | null; unitPrice?: number | null; currency?: string | null; occurredOn?: string;
  documentRef?: string | null; stockDocumentId?: string | null; engagementId?: string | null;
  activityId?: string | null; workOrderId?: string | null; transferGroupId?: string | null; note?: string | null;
}): Promise<string> {
  const typeId = await lookupIdByCanonical(db, 'stock_movement_type', m.typeCode);
  const r = await db.query(
    `INSERT INTO stock_movement (tenant_id, material_id, location_id, type_id, quantity, unit_id, unit_cost, unit_price,
       currency, occurred_on, document_ref, stock_document_id, engagement_id, activity_id, work_order_id, transfer_group_id, note, created_by)
     VALUES ($1,$2,$3,$4,$5,public.app_resolve_unit(public.app_current_tenant(),$6),$7,$8,$9,COALESCE($10,CURRENT_DATE),$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
    [tenantId, m.materialId, m.locationId, typeId, m.signedQty, m.unit, m.unitCost ?? null, m.unitPrice ?? null,
     m.currency ?? null, m.occurredOn ?? null, m.documentRef ?? null, m.stockDocumentId ?? null, m.engagementId ?? null,
     m.activityId ?? null, m.workOrderId ?? null, m.transferGroupId ?? null, m.note ?? null, userId],
  );
  return r.rows[0].id as string;
}

// ── DTO mappers ───────────────────────────────────────────────────────
function lotDto(r: Record<string, unknown>): StockLotDto {
  return {
    id: r.id as string, materialId: r.material_id as string, materialName: (r.material_name as string) ?? null,
    lotNumber: r.lot_number as string, mfgDate: day(r.mfg_date), expiryDate: day(r.expiry_date),
    supplierId: (r.supplier_id as string) ?? null, note: (r.note as string) ?? null,
  };
}

function countLineDto(r: Record<string, unknown>): StockCountLineDto {
  return {
    id: r.id as string, materialId: r.material_id as string, materialName: (r.material_name as string) ?? null,
    lotId: (r.lot_id as string) ?? null,
    expectedQty: r.expected_qty === null || r.expected_qty === undefined ? null : Number(r.expected_qty),
    countedQty: r.counted_qty === null || r.counted_qty === undefined ? null : Number(r.counted_qty),
    unit: r.unit as string, note: (r.note as string) ?? null,
  };
}
function countDto(r: Record<string, unknown>, lines?: StockCountLineDto[]): StockCountDto {
  return {
    id: r.id as string, number: (r.number as string) ?? null, locationId: r.location_id as string,
    locationName: (r.location_name as string) ?? null, status: r.status as string, countDate: day(r.count_date) as string,
    note: (r.note as string) ?? null, createdAt: r.created_at as string,
    ...(lines !== undefined ? { lines } : {}),
  };
}

function poLineDto(r: Record<string, unknown>): PurchaseOrderLineDto {
  return {
    id: r.id as string, materialId: r.material_id as string, materialName: (r.material_name as string) ?? null,
    qtyOrdered: Number(r.qty_ordered), qtyReceived: Number(r.qty_received), unit: r.unit as string,
    unitPrice: r.unit_price === null || r.unit_price === undefined ? null : Number(r.unit_price), note: (r.note as string) ?? null,
  };
}
function poDto(r: Record<string, unknown>, lines?: PurchaseOrderLineDto[]): PurchaseOrderDto {
  return {
    id: r.id as string, number: (r.number as string) ?? null, supplierId: r.supplier_id as string,
    supplierName: (r.supplier_name as string) ?? null, destLocationId: (r.dest_location_id as string) ?? null,
    destLocationName: (r.dest_location_name as string) ?? null, status: r.status as string,
    orderDate: day(r.order_date) as string, expectedDate: day(r.expected_date), currency: (r.currency as string) ?? null,
    note: (r.note as string) ?? null, createdAt: r.created_at as string,
    ...(lines !== undefined ? { lines } : {}),
  };
}

function pickLineDto(r: Record<string, unknown>): PickListLineDto {
  return {
    id: r.id as string, materialId: r.material_id as string, materialName: (r.material_name as string) ?? null,
    qtyRequested: Number(r.qty_requested), qtyPicked: Number(r.qty_picked), unit: r.unit as string,
    lotId: (r.lot_id as string) ?? null,
  };
}
function pickDto(r: Record<string, unknown>, lines?: PickListLineDto[]): PickListDto {
  return {
    id: r.id as string, number: (r.number as string) ?? null, sourceLocationId: r.source_location_id as string,
    sourceLocationName: (r.source_location_name as string) ?? null,
    assignedResourceId: (r.assigned_resource_id as string) ?? null,
    assignedResourceLabel: (r.assigned_resource_label as string) ?? null,
    workOrderId: (r.work_order_id as string) ?? null, engagementId: (r.engagement_id as string) ?? null,
    status: r.status as string, note: (r.note as string) ?? null, createdAt: r.created_at as string,
    ...(lines !== undefined ? { lines } : {}),
  };
}

// ── loaders di dettaglio (testata + righe) ────────────────────────────
async function loadCount(db: PoolClient, id: string): Promise<StockCountDto | null> {
  const h = await db.query(
    `SELECT sc.id, sc.number, sc.location_id, l.name AS location_name, sc.status, sc.count_date, sc.note, sc.created_at
     FROM stock_count sc LEFT JOIN stock_location l ON l.id = sc.location_id WHERE sc.id = $1`, [id]);
  if (!h.rows[0]) return null;
  const ln = await db.query(
    `SELECT scl.id, scl.material_id, m.name AS material_name, scl.lot_id, scl.expected_qty, scl.counted_qty, sclu.code AS unit, scl.note
     FROM stock_count_line scl LEFT JOIN material m ON m.id = scl.material_id
     LEFT JOIN unit_of_measure sclu ON sclu.id = scl.unit_id
     WHERE scl.count_id = $1 ORDER BY m.name`, [id]);
  return countDto(h.rows[0], ln.rows.map(countLineDto));
}
async function loadPo(db: PoolClient, id: string): Promise<PurchaseOrderDto | null> {
  const h = await db.query(
    `SELECT po.id, po.number, po.supplier_id, s.display_name AS supplier_name, po.dest_location_id,
            l.name AS dest_location_name, po.status, po.order_date, po.expected_date, po.currency, po.note, po.created_at
     FROM purchase_order po LEFT JOIN company s ON s.id = po.supplier_id
       LEFT JOIN stock_location l ON l.id = po.dest_location_id WHERE po.id = $1`, [id]);
  if (!h.rows[0]) return null;
  const ln = await db.query(
    `SELECT pol.id, pol.material_id, m.name AS material_name, pol.qty_ordered, pol.qty_received, polu.code AS unit, pol.unit_price, pol.note
     FROM purchase_order_line pol LEFT JOIN material m ON m.id = pol.material_id
     LEFT JOIN unit_of_measure polu ON polu.id = pol.unit_id
     WHERE pol.order_id = $1 ORDER BY m.name`, [id]);
  return poDto(h.rows[0], ln.rows.map(poLineDto));
}
async function loadPick(db: PoolClient, id: string): Promise<PickListDto | null> {
  const h = await db.query(
    `SELECT pl.id, pl.number, pl.source_location_id, l.name AS source_location_name, pl.assigned_resource_id,
            r.label AS assigned_resource_label, pl.work_order_id, pl.engagement_id, pl.status, pl.note, pl.created_at
     FROM pick_list pl LEFT JOIN stock_location l ON l.id = pl.source_location_id
       LEFT JOIN resource r ON r.id = pl.assigned_resource_id WHERE pl.id = $1`, [id]);
  if (!h.rows[0]) return null;
  const ln = await db.query(
    `SELECT pll.id, pll.material_id, m.name AS material_name, pll.qty_requested, pll.qty_picked, pllu.code AS unit, pll.lot_id
     FROM pick_list_line pll LEFT JOIN material m ON m.id = pll.material_id
     LEFT JOIN unit_of_measure pllu ON pllu.id = pll.unit_id
     WHERE pll.pick_list_id = $1 ORDER BY m.name`, [id]);
  return pickDto(h.rows[0], ln.rows.map(pickLineDto));
}

export async function warehouseRoutes(app: FastifyInstance): Promise<void> {
  // ════════════════════════════════════ STOCK_LOT (lotti/scadenze) ════
  app.get<{ Querystring: { materialId?: string } }>('/stock-lots',
    { preHandler: [app.authenticate, requirePermission('stock:read')] },
    async (request) => {
      const rows = await withRls(request.ctx, (db) => {
        const params: unknown[] = []; const conds: string[] = [];
        if (request.query.materialId) { params.push(request.query.materialId); conds.push(`sl.material_id = $${params.length}`); }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        return db.query(
          `SELECT sl.id, sl.material_id, m.name AS material_name, sl.lot_number, sl.mfg_date, sl.expiry_date, sl.supplier_id, sl.note
           FROM stock_lot sl LEFT JOIN material m ON m.id = sl.material_id
           ${where} ORDER BY m.name, sl.lot_number LIMIT 1000`, params).then((r) => r.rows);
      });
      return { items: rows.map(lotDto) };
    });

  app.post('/stock-lots', { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      const input = createStockLotSchema.parse(request.body);
      const dto = await withRls(request.ctx, async (db) => {
        const r = await db.query(
          `INSERT INTO stock_lot (tenant_id, material_id, lot_number, mfg_date, expiry_date, supplier_id, note, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
           RETURNING id, material_id, lot_number, mfg_date, expiry_date, supplier_id, note`,
          [request.ctx.tenantId, input.materialId, input.lotNumber, input.mfgDate ?? null, input.expiryDate ?? null,
           input.supplierId ?? null, input.note ?? null, request.ctx.userId]);
        const created = lotDto(r.rows[0]);
        const mn = await db.query(`SELECT name FROM material WHERE id = $1`, [created.materialId]);
        return { ...created, materialName: (mn.rows[0]?.name as string) ?? null };
      });
      return reply.code(201).send(dto);
    });

  app.patch<{ Params: { id: string } }>('/stock-lots/:id',
    { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      const input = updateStockLotSchema.parse(request.body);
      const out = await withRls(request.ctx, async (db) => {
        const sets: string[] = []; const vals: unknown[] = [request.params.id];
        const put = (col: string, val: unknown) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
        if (input.lotNumber !== undefined) put('lot_number', input.lotNumber);
        if (input.mfgDate !== undefined) put('mfg_date', input.mfgDate ?? null);
        if (input.expiryDate !== undefined) put('expiry_date', input.expiryDate ?? null);
        if (input.supplierId !== undefined) put('supplier_id', input.supplierId ?? null);
        if (input.note !== undefined) put('note', input.note ?? null);
        vals.push(request.ctx.userId); sets.push(`updated_by = $${vals.length}`);
        const r = await db.query(
          `UPDATE stock_lot SET ${sets.join(', ')} WHERE id = $1
           RETURNING id, material_id, lot_number, mfg_date, expiry_date, supplier_id, note`, vals);
        if (!r.rows[0]) return null;
        const created = lotDto(r.rows[0]);
        const mn = await db.query(`SELECT name FROM material WHERE id = $1`, [created.materialId]);
        return { ...created, materialName: (mn.rows[0]?.name as string) ?? null };
      });
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Lotto non trovato', statusCode: 404 });
      return out;
    });

  app.delete<{ Params: { id: string } }>('/stock-lots/:id',
    { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`DELETE FROM stock_lot WHERE id = $1`, [request.params.id]));
      return reply.code(204).send();
    });

  // ════════════════════════════════ STOCK_COUNT (conteggio inventariale) ══
  app.get('/stock-counts', { preHandler: [app.authenticate, requirePermission('stock:read')] },
    async (request) => {
      const rows = await withRls(request.ctx, (db) => db.query(
        `SELECT sc.id, sc.number, sc.location_id, l.name AS location_name, sc.status, sc.count_date, sc.note, sc.created_at
         FROM stock_count sc LEFT JOIN stock_location l ON l.id = sc.location_id
         ORDER BY sc.count_date DESC, sc.created_at DESC LIMIT 500`).then((r) => r.rows));
      return { items: rows.map((r) => countDto(r)) };
    });

  app.get<{ Params: { id: string } }>('/stock-counts/:id',
    { preHandler: [app.authenticate, requirePermission('stock:read')] },
    async (request, reply) => {
      const out = await withRls(request.ctx, (db) => loadCount(db, request.params.id));
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Conteggio non trovato', statusCode: 404 });
      return out;
    });

  app.post('/stock-counts', { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      const input = createStockCountSchema.parse(request.body);
      const dto = await withRls(request.ctx, async (db) => {
        const number = await nextNumber(db, 'stock_count');
        const h = await db.query(
          `INSERT INTO stock_count (tenant_id, number, location_id, status, count_date, note, created_by, updated_by)
           VALUES ($1,$2,$3,'draft',COALESCE($4,CURRENT_DATE),$5,$6,$6) RETURNING id`,
          [request.ctx.tenantId, number, input.locationId, input.countDate ?? null, input.note ?? null, request.ctx.userId]);
        const countId = h.rows[0].id as string;
        for (const ln of input.lines ?? []) {
          let expected = ln.expectedQty ?? null;
          if (expected === null || expected === undefined) {
            const cur = await db.query(
              `SELECT COALESCE(sum(qty_on_hand),0) AS q FROM stock_balance WHERE material_id = $1 AND location_id = $2`,
              [ln.materialId, input.locationId]);
            expected = Number(cur.rows[0].q);
          }
          await db.query(
            `INSERT INTO stock_count_line (tenant_id, count_id, material_id, lot_id, expected_qty, counted_qty, unit_id, note)
             VALUES ($1,$2,$3,$4,$5,$6,public.app_resolve_unit(public.app_current_tenant(),$7),$8)`,
            [request.ctx.tenantId, countId, ln.materialId, ln.lotId ?? null, expected,
             ln.countedQty ?? null, ln.unit, ln.note ?? null]);
        }
        return loadCount(db, countId);
      });
      return reply.code(201).send(dto);
    });

  app.patch<{ Params: { id: string } }>('/stock-counts/:id',
    { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      const input = updateStockCountSchema.parse(request.body);
      const out = await withRls(request.ctx, async (db) => {
        const cur = await db.query(`SELECT status FROM stock_count WHERE id = $1`, [request.params.id]);
        if (!cur.rows[0]) return { code: 404 as const };
        if (cur.rows[0].status === 'posted') return { code: 409 as const };
        const sets: string[] = []; const vals: unknown[] = [request.params.id];
        const put = (col: string, val: unknown) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
        if (input.status !== undefined) put('status', input.status);
        if (input.note !== undefined) put('note', input.note ?? null);
        vals.push(request.ctx.userId); sets.push(`updated_by = $${vals.length}`);
        await db.query(`UPDATE stock_count SET ${sets.join(', ')} WHERE id = $1`, vals);
        if (input.lines !== undefined) {
          await db.query(`DELETE FROM stock_count_line WHERE count_id = $1`, [request.params.id]);
          for (const ln of input.lines) {
            await db.query(
              `INSERT INTO stock_count_line (tenant_id, count_id, material_id, lot_id, expected_qty, counted_qty, unit_id, note)
               VALUES ($1,$2,$3,$4,$5,$6,public.app_resolve_unit(public.app_current_tenant(),$7),$8)`,
              [request.ctx.tenantId, request.params.id, ln.materialId, ln.lotId ?? null, ln.expectedQty ?? null,
               ln.countedQty ?? null, ln.unit, ln.note ?? null]);
          }
        }
        return { code: 200 as const, dto: await loadCount(db, request.params.id) };
      });
      if (out.code === 404) return reply.code(404).send({ error: 'not_found', message: 'Conteggio non trovato', statusCode: 404 });
      if (out.code === 409) return reply.code(409).send({ error: 'conflict', message: 'Conteggio già registrato, non modificabile', statusCode: 409 });
      return out.dto;
    });

  // post: genera le rettifiche inventariali (movimenti) in transazione. Non rieseguibile.
  app.post<{ Params: { id: string } }>('/stock-counts/:id/post',
    { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      return withRls(request.ctx, async (db) => {
        const hq = await db.query(
          `SELECT id, number, location_id, status FROM stock_count WHERE id = $1 FOR UPDATE`, [request.params.id]);
        const h = hq.rows[0];
        if (!h) return reply.code(404).send({ error: 'not_found', message: 'Conteggio non trovato', statusCode: 404 });
        if (!['draft', 'counting', 'review'].includes(h.status as string))
          return reply.code(409).send({ error: 'conflict', message: 'Conteggio non registrabile nello stato attuale', statusCode: 409 });
        const lines = (await db.query(
          `SELECT scl.material_id, scl.lot_id, scl.expected_qty, scl.counted_qty, u.code AS unit
           FROM stock_count_line scl LEFT JOIN unit_of_measure u ON u.id = scl.unit_id WHERE scl.count_id = $1`, [h.id])).rows;
        const tid = request.ctx.tenantId, uid = request.ctx.userId;
        let movements = 0;
        for (const ln of lines) {
          if (ln.counted_qty === null || ln.counted_qty === undefined) continue;
          const delta = Number(ln.counted_qty) - Number(ln.expected_qty ?? 0);
          if (delta === 0) continue;
          await insertMovement(db, tid, uid, {
            materialId: ln.material_id, locationId: h.location_id, typeCode: 'count_adjust', signedQty: delta,
            unit: ln.unit, note: `Rettifica inventariale ${h.number}`,
          });
          movements += 1;
        }
        await db.query(`UPDATE stock_count SET status = 'posted', updated_by = $2 WHERE id = $1`, [h.id, uid]);
        return { id: h.id as string, status: 'posted', movements };
      });
    });

  // ═══════════════════════════════════ PURCHASE_ORDER (ordini d'acquisto) ══
  app.get('/purchase-orders', { preHandler: [app.authenticate, requirePermission('stock:read')] },
    async (request) => {
      const query = request.query as Record<string, unknown>;
      const orderBy = buildOrderBy(query.sort as string | undefined, PO_SORTABLE, 'po.order_date', 'desc');
      const rows = await withRls(request.ctx, (db) => {
        const params: unknown[] = [];
        let where = `WHERE po.archived_at IS NULL`;
        const q = typeof query.q === 'string' ? query.q.trim() : '';
        if (q) {
          params.push(`%${q}%`); const i = params.length;
          where += ` AND (po.number ILIKE $${i} OR s.display_name ILIKE $${i})`;
        }
        const fsql = buildFilter(query.filter as string | undefined, PO_FILTER, PO_FILTER_ANY, params);
        if (fsql) where += ` AND ${fsql}`;
        return db.query(
          `SELECT po.id, po.number, po.supplier_id, s.display_name AS supplier_name, po.dest_location_id,
                  l.name AS dest_location_name, po.status, po.order_date, po.expected_date, po.currency, po.note, po.created_at
           FROM purchase_order po LEFT JOIN company s ON s.id = po.supplier_id
             LEFT JOIN stock_location l ON l.id = po.dest_location_id
           ${where} ORDER BY ${orderBy}, po.created_at DESC LIMIT 500`, params).then((r) => r.rows);
      });
      return { items: rows.map((r) => poDto(r)) };
    });

  app.get<{ Params: { id: string } }>('/purchase-orders/:id',
    { preHandler: [app.authenticate, requirePermission('stock:read')] },
    async (request, reply) => {
      const out = await withRls(request.ctx, (db) => loadPo(db, request.params.id));
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Ordine non trovato', statusCode: 404 });
      return out;
    });

  app.post('/purchase-orders', { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      const input = createPurchaseOrderSchema.parse(request.body);
      const dto = await withRls(request.ctx, async (db) => {
        const number = await nextNumber(db, 'purchase_order');
        const h = await db.query(
          `INSERT INTO purchase_order (tenant_id, number, supplier_id, dest_location_id, status, order_date, expected_date, currency, note, created_by, updated_by)
           VALUES ($1,$2,$3,$4,'draft',COALESCE($5,CURRENT_DATE),$6,$7,$8,$9,$9) RETURNING id`,
          [request.ctx.tenantId, number, input.supplierId, input.destLocationId ?? null, input.orderDate ?? null,
           input.expectedDate ?? null, input.currency ?? null, input.note ?? null, request.ctx.userId]);
        const orderId = h.rows[0].id as string;
        for (const ln of input.lines ?? []) {
          await db.query(
            `INSERT INTO purchase_order_line (tenant_id, order_id, material_id, qty_ordered, qty_received, unit_id, unit_price, note)
             VALUES ($1,$2,$3,$4,0,public.app_resolve_unit(public.app_current_tenant(),$5),$6,$7)`,
            [request.ctx.tenantId, orderId, ln.materialId, ln.qtyOrdered, ln.unit, ln.unitPrice ?? null, ln.note ?? null]);
        }
        return loadPo(db, orderId);
      });
      return reply.code(201).send(dto);
    });

  app.patch<{ Params: { id: string } }>('/purchase-orders/:id',
    { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      const input = updatePurchaseOrderSchema.parse(request.body);
      const out = await withRls(request.ctx, async (db) => {
        const cur = await db.query(`SELECT status FROM purchase_order WHERE id = $1`, [request.params.id]);
        if (!cur.rows[0]) return { code: 404 as const };
        const sets: string[] = []; const vals: unknown[] = [request.params.id];
        const put = (col: string, val: unknown) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
        if (input.status !== undefined) put('status', input.status);
        if (input.destLocationId !== undefined) put('dest_location_id', input.destLocationId ?? null);
        if (input.expectedDate !== undefined) put('expected_date', input.expectedDate ?? null);
        if (input.note !== undefined) put('note', input.note ?? null);
        vals.push(request.ctx.userId); sets.push(`updated_by = $${vals.length}`);
        await db.query(`UPDATE purchase_order SET ${sets.join(', ')} WHERE id = $1`, vals);
        if (input.lines !== undefined) {
          if (cur.rows[0].status !== 'draft') return { code: 409 as const };
          await db.query(`DELETE FROM purchase_order_line WHERE order_id = $1`, [request.params.id]);
          for (const ln of input.lines) {
            await db.query(
              `INSERT INTO purchase_order_line (tenant_id, order_id, material_id, qty_ordered, qty_received, unit_id, unit_price, note)
               VALUES ($1,$2,$3,$4,0,public.app_resolve_unit(public.app_current_tenant(),$5),$6,$7)`,
              [request.ctx.tenantId, request.params.id, ln.materialId, ln.qtyOrdered, ln.unit, ln.unitPrice ?? null, ln.note ?? null]);
          }
        }
        return { code: 200 as const, dto: await loadPo(db, request.params.id) };
      });
      if (out.code === 404) return reply.code(404).send({ error: 'not_found', message: 'Ordine non trovato', statusCode: 404 });
      if (out.code === 409) return reply.code(409).send({ error: 'conflict', message: 'Righe modificabili solo in bozza', statusCode: 409 });
      return out.dto;
    });

  // DELETE bozza ordine d'acquisto (solo 'draft').
  app.delete<{ Params: { id: string } }>('/purchase-orders/:id',
    { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      const res = await withRls(request.ctx, async (db) => {
        const cur = await db.query(`SELECT status FROM purchase_order WHERE id = $1`, [request.params.id]);
        if (!cur.rows.length) return 'notfound' as const;
        if (cur.rows[0].status !== 'draft') return 'locked' as const;
        await db.query(`DELETE FROM purchase_order_line WHERE order_id = $1`, [request.params.id]);
        await db.query(`DELETE FROM purchase_order WHERE id = $1`, [request.params.id]);
        return 'ok' as const;
      });
      if (res === 'notfound') return reply.code(404).send({ error: 'not_found', message: 'Ordine non trovato', statusCode: 404 });
      if (res === 'locked') return reply.code(409).send({ error: 'conflict', message: 'Ordine non in bozza: non eliminabile', statusCode: 409 });
      return reply.code(204).send();
    });

  // receive: carico merce (movimenti 'in') in transazione + ricalcolo stato.
  app.post<{ Params: { id: string } }>('/purchase-orders/:id/receive',
    { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      const input = receivePurchaseOrderSchema.parse(request.body);
      return withRls(request.ctx, async (db) => {
        const hq = await db.query(
          `SELECT id, number, dest_location_id, status FROM purchase_order WHERE id = $1 FOR UPDATE`, [request.params.id]);
        const h = hq.rows[0];
        if (!h) return reply.code(404).send({ error: 'not_found', message: 'Ordine non trovato', statusCode: 404 });
        const tid = request.ctx.tenantId, uid = request.ctx.userId;
        for (const rc of input.receipts) {
          const lq = await db.query(
            `SELECT pol.id, pol.material_id, pol.qty_ordered, pol.qty_received, u.code AS unit, pol.unit_price
             FROM purchase_order_line pol LEFT JOIN unit_of_measure u ON u.id = pol.unit_id
             WHERE pol.id = $1 AND pol.order_id = $2 FOR UPDATE OF pol`, [rc.lineId, h.id]);
          const ln = lq.rows[0];
          if (!ln) return reply.code(409).send({ error: 'conflict', message: 'Riga non appartenente all\'ordine', statusCode: 409 });
          const already = Number(ln.qty_received), ordered = Number(ln.qty_ordered);
          const next = already + rc.qty;
          if (next > ordered) return reply.code(409).send({ error: 'conflict', message: 'Quantità ricevuta eccede l\'ordinato', statusCode: 409 });
          const loc = input.destLocationId ?? (h.dest_location_id as string | null);
          if (!loc) return reply.code(400).send({ error: 'bad_request', message: 'Ricezione: manca il magazzino di destinazione', statusCode: 400 });
          await db.query(`UPDATE purchase_order_line SET qty_received = $2 WHERE id = $1`, [ln.id, next]);
          await insertMovement(db, tid, uid, {
            materialId: ln.material_id, locationId: loc, typeCode: 'in', signedQty: rc.qty, unit: ln.unit,
            unitCost: ln.unit_price === null ? null : Number(ln.unit_price), note: `Ricezione PO ${h.number}`,
          });
        }
        const lines = (await db.query(
          `SELECT qty_ordered, qty_received FROM purchase_order_line WHERE order_id = $1`, [h.id])).rows;
        const allDone = lines.length > 0 && lines.every((l) => Number(l.qty_received) >= Number(l.qty_ordered));
        const anyDone = lines.some((l) => Number(l.qty_received) > 0);
        const status = allDone ? 'received' : anyDone ? 'partial' : (h.status as string);
        await db.query(`UPDATE purchase_order SET status = $2, updated_by = $3 WHERE id = $1`, [h.id, status, uid]);
        return (await loadPo(db, h.id as string))!;
      });
    });

  // ════════════════════════════════════════ PICK_LIST (prelievo) ══════
  app.get('/pick-lists', { preHandler: [app.authenticate, requirePermission('stock:read')] },
    async (request) => {
      const query = request.query as Record<string, unknown>;
      const orderBy = buildOrderBy(query.sort as string | undefined, PICK_SORTABLE, 'pl.created_at', 'desc');
      const rows = await withRls(request.ctx, (db) => {
        const params: unknown[] = [];
        const conds: string[] = [];
        const q = typeof query.q === 'string' ? query.q.trim() : '';
        if (q) {
          params.push(`%${q}%`); const i = params.length;
          conds.push(`(pl.number ILIKE $${i} OR l.name ILIKE $${i} OR r.label ILIKE $${i})`);
        }
        const fsql = buildFilter(query.filter as string | undefined, PICK_FILTER, PICK_FILTER_ANY, params);
        if (fsql) conds.push(fsql);
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        return db.query(
          `SELECT pl.id, pl.number, pl.source_location_id, l.name AS source_location_name, pl.assigned_resource_id,
                  r.label AS assigned_resource_label, pl.work_order_id, pl.engagement_id, pl.status, pl.note, pl.created_at
           FROM pick_list pl LEFT JOIN stock_location l ON l.id = pl.source_location_id
             LEFT JOIN resource r ON r.id = pl.assigned_resource_id
           ${where} ORDER BY ${orderBy}, pl.created_at DESC LIMIT 500`, params).then((rr) => rr.rows);
      });
      return { items: rows.map((r) => pickDto(r)) };
    });

  app.get<{ Params: { id: string } }>('/pick-lists/:id',
    { preHandler: [app.authenticate, requirePermission('stock:read')] },
    async (request, reply) => {
      const out = await withRls(request.ctx, (db) => loadPick(db, request.params.id));
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Lista di prelievo non trovata', statusCode: 404 });
      return out;
    });

  app.post('/pick-lists', { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      const input = createPickListSchema.parse(request.body);
      const dto = await withRls(request.ctx, async (db) => {
        const number = await nextNumber(db, 'pick_list');
        const h = await db.query(
          `INSERT INTO pick_list (tenant_id, number, source_location_id, assigned_resource_id, work_order_id, engagement_id, status, note, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8,$8) RETURNING id`,
          [request.ctx.tenantId, number, input.sourceLocationId, input.assignedResourceId ?? null,
           input.workOrderId ?? null, input.engagementId ?? null, input.note ?? null, request.ctx.userId]);
        const pickId = h.rows[0].id as string;
        for (const ln of input.lines ?? []) {
          await db.query(
            `INSERT INTO pick_list_line (tenant_id, pick_list_id, material_id, qty_requested, qty_picked, unit_id, lot_id)
             VALUES ($1,$2,$3,$4,0,public.app_resolve_unit(public.app_current_tenant(),$5),$6)`,
            [request.ctx.tenantId, pickId, ln.materialId, ln.qtyRequested, ln.unit, ln.lotId ?? null]);
        }
        return loadPick(db, pickId);
      });
      return reply.code(201).send(dto);
    });

  app.patch<{ Params: { id: string } }>('/pick-lists/:id',
    { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      const input = updatePickListSchema.parse(request.body);
      const out = await withRls(request.ctx, async (db) => {
        const cur = await db.query(`SELECT status FROM pick_list WHERE id = $1`, [request.params.id]);
        if (!cur.rows[0]) return { code: 404 as const };
        const sets: string[] = []; const vals: unknown[] = [request.params.id];
        const put = (col: string, val: unknown) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
        if (input.status !== undefined) put('status', input.status);
        if (input.assignedResourceId !== undefined) put('assigned_resource_id', input.assignedResourceId ?? null);
        if (input.note !== undefined) put('note', input.note ?? null);
        vals.push(request.ctx.userId); sets.push(`updated_by = $${vals.length}`);
        await db.query(`UPDATE pick_list SET ${sets.join(', ')} WHERE id = $1`, vals);
        if (input.lines !== undefined) {
          if (!['draft', 'assigned'].includes(cur.rows[0].status as string)) return { code: 409 as const };
          await db.query(`DELETE FROM pick_list_line WHERE pick_list_id = $1`, [request.params.id]);
          for (const ln of input.lines) {
            await db.query(
              `INSERT INTO pick_list_line (tenant_id, pick_list_id, material_id, qty_requested, qty_picked, unit_id, lot_id)
               VALUES ($1,$2,$3,$4,0,public.app_resolve_unit(public.app_current_tenant(),$5),$6)`,
              [request.ctx.tenantId, request.params.id, ln.materialId, ln.qtyRequested, ln.unit, ln.lotId ?? null]);
          }
        }
        return { code: 200 as const, dto: await loadPick(db, request.params.id) };
      });
      if (out.code === 404) return reply.code(404).send({ error: 'not_found', message: 'Lista di prelievo non trovata', statusCode: 404 });
      if (out.code === 409) return reply.code(409).send({ error: 'conflict', message: 'Righe modificabili solo in bozza/assegnata', statusCode: 409 });
      return out.dto;
    });

  // DELETE bozza pick list (solo 'draft').
  app.delete<{ Params: { id: string } }>('/pick-lists/:id',
    { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      const res = await withRls(request.ctx, async (db) => {
        const cur = await db.query(`SELECT status FROM pick_list WHERE id = $1`, [request.params.id]);
        if (!cur.rows.length) return 'notfound' as const;
        if (cur.rows[0].status !== 'draft') return 'locked' as const;
        await db.query(`DELETE FROM pick_list_line WHERE pick_list_id = $1`, [request.params.id]);
        await db.query(`DELETE FROM pick_list WHERE id = $1`, [request.params.id]);
        return 'ok' as const;
      });
      if (res === 'notfound') return reply.code(404).send({ error: 'not_found', message: 'Pick list non trovata', statusCode: 404 });
      if (res === 'locked') return reply.code(409).send({ error: 'conflict', message: 'Pick list non in bozza: non eliminabile', statusCode: 409 });
      return reply.code(204).send();
    });

  // confirm: scarico merce (movimenti 'out') in transazione.
  app.post<{ Params: { id: string } }>('/pick-lists/:id/confirm',
    { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      return withRls(request.ctx, async (db) => {
        const hq = await db.query(
          `SELECT id, number, source_location_id, work_order_id, engagement_id, status FROM pick_list WHERE id = $1 FOR UPDATE`,
          [request.params.id]);
        const h = hq.rows[0];
        if (!h) return reply.code(404).send({ error: 'not_found', message: 'Lista di prelievo non trovata', statusCode: 404 });
        if (!['assigned', 'picking', 'draft'].includes(h.status as string))
          return reply.code(409).send({ error: 'conflict', message: 'Lista non confermabile nello stato attuale', statusCode: 409 });
        const lines = (await db.query(
          `SELECT pll.material_id, pll.qty_requested, pll.qty_picked, u.code AS unit, pll.lot_id
           FROM pick_list_line pll LEFT JOIN unit_of_measure u ON u.id = pll.unit_id WHERE pll.pick_list_id = $1`, [h.id])).rows;
        const tid = request.ctx.tenantId, uid = request.ctx.userId;
        let movements = 0;
        for (const ln of lines) {
          const picked = Number(ln.qty_picked);
          const qty = picked > 0 ? picked : Number(ln.qty_requested);
          if (qty <= 0) continue;
          await insertMovement(db, tid, uid, {
            materialId: ln.material_id, locationId: h.source_location_id, typeCode: 'out', signedQty: -qty, unit: ln.unit,
            workOrderId: (h.work_order_id as string) ?? null, engagementId: (h.engagement_id as string) ?? null,
            note: `Pick ${h.number}`,
          });
          movements += 1;
        }
        await db.query(`UPDATE pick_list SET status = 'done', updated_by = $2 WHERE id = $1`, [h.id, uid]);
        return { id: h.id as string, status: 'done', movements };
      });
    });
}
