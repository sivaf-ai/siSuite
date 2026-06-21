/** stock.ts — MAGAZZINO MINIMO 6A (§8).
 *  Ubicazioni (albero), movimenti (registro immutabile → il trigger DB aggiorna
 *  il saldo a media mobile), giacenze, documenti (testata → movimenti alla
 *  conferma, numerati da number_series). Consumo su lavoro = movimento 'out'. */
import type { FastifyInstance } from 'fastify';
import {
  createStockLocationSchema, updateStockLocationSchema, createStockMovementSchema, createStockDocumentSchema,
  type StockLocationDto, type StockMovementDto, type StockBalanceDto, type StockDocumentDto,
} from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import type { PoolClient } from '../db/pool.js';
import { lookupIdByCanonical } from '../lookupResolve.js';
import { nextNumber } from '../numberSeries.js';
import { buildFilter } from '../filterSql.js';
import { buildOrderBy } from '../sortSql.js';

const LOC_FILTER: Record<string, string> = { name: 'name', kind: 'kind' };

const NUM: Record<'receipt' | 'transfer' | 'adjustment', { key: string; fmt: string }> = {
  receipt: { key: 'stock_receipt', fmt: 'CAR-{YYYY}-{SEQ:4}' },
  transfer: { key: 'ddt', fmt: 'DDT-{YYYY}-{SEQ:4}' },
  adjustment: { key: 'stock_adjustment', fmt: 'RET-{YYYY}-{SEQ:4}' },
};

function locDto(r: Record<string, unknown>): StockLocationDto {
  return {
    id: r.id as string, parentId: (r.parent_id as string) ?? null, name: r.name as string, kind: r.kind as string,
    resourceId: (r.resource_id as string) ?? null, holdsStock: r.holds_stock as boolean,
    isDefault: r.is_default as boolean, active: r.active as boolean,
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
    `INSERT INTO stock_movement (tenant_id, material_id, location_id, type_id, quantity, unit, unit_cost, unit_price,
       currency, occurred_on, document_ref, stock_document_id, engagement_id, activity_id, transfer_group_id, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,CURRENT_DATE),$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
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
      const rows = await withRls(request.ctx, (db) => {
        const params: unknown[] = [];
        let where = `WHERE archived_at IS NULL`;
        if (q.top === '1') where += ` AND parent_id IS NULL`;
        if (q.parentId) { params.push(q.parentId); where += ` AND parent_id = $${params.length}`; }
        if (q.q) { params.push(`%${q.q}%`); where += ` AND name ILIKE $${params.length}`; }
        const fsql = buildFilter(q.filter as string | undefined, LOC_FILTER, ['name', 'kind'], params);
        if (fsql) where += ` AND ${fsql}`;
        const orderBy = buildOrderBy(q.sort as string | undefined, LOC_FILTER, 'name', 'asc');
        return db.query(
          `SELECT id, parent_id, name, kind, resource_id, holds_stock, is_default, active
           FROM stock_location ${where} ORDER BY is_default DESC, ${orderBy}`, params).then((r) => r.rows);
      });
      return { items: rows.map(locDto) };
    });

  app.get<{ Params: { id: string } }>('/stock/locations/:id',
    { preHandler: [app.authenticate, requirePermission('stock:read')] },
    async (request, reply) => {
      const r = await withRls(request.ctx, (db) => db.query(
        `SELECT id, parent_id, name, kind, resource_id, holds_stock, is_default, active
         FROM stock_location WHERE id = $1 AND archived_at IS NULL`, [request.params.id]).then((x) => x.rows));
      if (!r[0]) return reply.code(404).send({ error: 'not_found', message: 'Magazzino/ubicazione non trovato', statusCode: 404 });
      return locDto(r[0]);
    });

  app.post('/stock/locations', { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      const input = createStockLocationSchema.parse(request.body);
      const dto = await withRls(request.ctx, async (db) => {
        const r = await db.query(
          `INSERT INTO stock_location (tenant_id, parent_id, name, kind, resource_id, holds_stock, is_default, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,COALESCE($6,true),COALESCE($7,false),$8,$8)
           RETURNING id, parent_id, name, kind, resource_id, holds_stock, is_default, active`,
          [request.ctx.tenantId, input.parentId ?? null, input.name, input.kind, input.resourceId ?? null,
           input.holdsStock ?? null, input.isDefault ?? null, request.ctx.userId]);
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
        if (input.holdsStock !== undefined) put('holds_stock', input.holdsStock);
        if (input.isDefault !== undefined) put('is_default', input.isDefault);
        if (input.active !== undefined) put('active', input.active);
        if (!sets.length) return { ok: true };
        params.push(request.ctx.userId); sets.push(`updated_by = $${params.length}`);
        params.push(request.params.id);
        const r = await db.query(
          `UPDATE stock_location SET ${sets.join(', ')} WHERE id = $${params.length}
           RETURNING id, parent_id, name, kind, resource_id, holds_stock, is_default, active`, params);
        return r.rows[0] ? locDto(r.rows[0]) : { ok: false };
      });
    });

  // elimina-soft (archivia) un'ubicazione (PIANO §5.1). Non rompe lo storico movimenti.
  app.delete<{ Params: { id: string } }>('/stock/locations/:id',
    { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(
        `UPDATE stock_location SET archived_at = now(), updated_by = $2 WHERE id = $1 AND archived_at IS NULL`,
        [request.params.id, request.ctx.userId]));
      return reply.code(204).send();
    });

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
          `SELECT b.material_id, m.name AS material_name, m.unit, b.location_id, l.name AS location_name,
                  b.qty_on_hand, b.avg_cost, b.value_on_hand
           FROM stock_balance b JOIN material m ON m.id = b.material_id JOIN stock_location l ON l.id = b.location_id
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
                  sm.type_id, sm.quantity, sm.unit, sm.unit_cost, sm.unit_price, sm.currency, sm.occurred_on,
                  sm.engagement_id, sm.activity_id, sm.work_order_id, sm.document_ref, sm.note, sm.created_at
           FROM stock_movement sm JOIN material m ON m.id = sm.material_id JOIN stock_location l ON l.id = sm.location_id
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
          `SELECT material_id, location_id, quantity, unit, unit_cost, unit_price, currency, occurred_on, engagement_id, activity_id
           FROM stock_movement WHERE id = $1`, [request.params.id]);
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
  app.get('/stock/documents', { preHandler: [app.authenticate, requirePermission('stock:read')] },
    async (request) => {
      const rows = await withRls(request.ctx, (db) =>
        db.query(`SELECT id, type_id, number, doc_date, status, source_location_id, dest_location_id, company_id,
                         external_ref, note, created_at
                  FROM stock_document ORDER BY doc_date DESC, created_at DESC LIMIT 500`).then((r) => r.rows));
      const items: StockDocumentDto[] = rows.map((r) => ({
        id: r.id, typeId: r.type_id, number: r.number ?? null, docDate: r.doc_date, status: r.status,
        sourceLocationId: r.source_location_id ?? null, destLocationId: r.dest_location_id ?? null,
        companyId: r.company_id ?? null, externalRef: r.external_ref ?? null, note: r.note ?? null, createdAt: r.created_at,
      }));
      return { items };
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
            `INSERT INTO stock_document_line (tenant_id, document_id, material_id, quantity, unit, unit_cost, unit_price, currency, note)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
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
          `SELECT material_id, quantity, unit, unit_cost, unit_price, currency, note FROM stock_document_line WHERE document_id = $1`,
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
