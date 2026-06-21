/** materials.ts — Articoli & seriali (mock 45, brief Blocco C).
 *  Catalogo con viste (Tutti/A magazzino/A seriale/Servizi/Scorta bassa),
 *  giacenza e costo medio dalla vista stock_balance, scheda con tracciamento,
 *  e le unità seriali per articolo (parco installato letto da status=installed). */
import type { FastifyInstance } from 'fastify';
import {
  createMaterialSchema, updateMaterialSchema, listQuerySchema,
  type MaterialDto, type SerialUnitDto,
} from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { buildFilter } from '../filterSql.js';
import { buildOrderBy } from '../sortSql.js';
import { validateAttributes } from '../fields.js';
import { nextNumber } from '../numberSeries.js';

const SORTABLE: Record<string, string> = { name: 'm.name', code: 'm.code', sku: 'm.sku', barcode: 'm.barcode', qty: 'qty_on_hand', cost: 'avg_cost' };
const FILTER_FIELDS: Record<string, string> = {
  name: 'm.name', code: 'm.code', sku: 'm.sku', barcode: 'm.barcode', unit: 'm.unit',
  costingMethod: 'm.costing_method', itemType: 'm.item_type', brand: 'm.brand',
  category: 'cat.name', categoryId: 'm.category_id',
};
const FILTER_ANY = ['m.name', 'm.code', 'm.sku', 'm.barcode'];

const num = (v: unknown): number | null => (v != null ? Number(v) : null);

const SELECT = `
  SELECT m.id, m.code, m.name, m.unit, m.item_type, m.sku, m.barcode, m.category_id, cat.name AS category_name,
         m.description, m.brand, m.manufacturer, m.mpn,
         m.track_stock, m.tracked_by_serial, m.tracked_by_lot,
         m.costing_method, m.default_cost, m.default_sale_price, m.tax_rate_id,
         m.reorder_point, m.safety_stock, m.min_qty, m.max_qty, m.lead_time_days, m.preferred_vendor_id,
         m.weight, m.weight_unit, m.dimensions, m.is_returnable, m.shelf_life_days, m.primary_image_url, m.note,
         m.attributes,
         COALESCE(bal.qty, 0) AS qty_on_hand,
         CASE WHEN COALESCE(bal.qty,0) > 0 THEN bal.val / bal.qty ELSE m.default_cost END AS avg_cost,
         (m.track_stock AND m.reorder_point IS NOT NULL
            AND COALESCE(bal.qty,0) < m.reorder_point) AS low_stock
  FROM material m
  LEFT JOIN material_category cat ON cat.id = m.category_id
  LEFT JOIN LATERAL (
    SELECT sum(b.qty_on_hand) AS qty, sum(b.value_on_hand) AS val
    FROM stock_balance b WHERE b.material_id = m.id
  ) bal ON true`;

function toDto(r: Record<string, unknown>): MaterialDto {
  return {
    id: r.id as string, code: (r.code as string) ?? null, name: r.name as string, unit: r.unit as string,
    itemType: (r.item_type as string) ?? 'article',
    sku: (r.sku as string) ?? null, barcode: (r.barcode as string) ?? null,
    categoryId: (r.category_id as string) ?? null, categoryName: (r.category_name as string) ?? null,
    description: (r.description as string) ?? null, brand: (r.brand as string) ?? null,
    manufacturer: (r.manufacturer as string) ?? null, mpn: (r.mpn as string) ?? null,
    trackStock: r.track_stock as boolean, trackedBySerial: r.tracked_by_serial as boolean, trackedByLot: r.tracked_by_lot as boolean,
    costingMethod: (r.costing_method as string) ?? 'avg',
    defaultCost: num(r.default_cost), defaultSalePrice: num(r.default_sale_price), taxRateId: (r.tax_rate_id as string) ?? null,
    reorderPoint: num(r.reorder_point), safetyStock: num(r.safety_stock), minQty: num(r.min_qty), maxQty: num(r.max_qty),
    leadTimeDays: num(r.lead_time_days), preferredVendorId: (r.preferred_vendor_id as string) ?? null,
    weight: num(r.weight), weightUnit: (r.weight_unit as string) ?? null,
    dimensions: (r.dimensions as Record<string, unknown>) ?? null,
    isReturnable: (r.is_returnable as boolean) ?? true, shelfLifeDays: num(r.shelf_life_days),
    primaryImageUrl: (r.primary_image_url as string) ?? null, note: (r.note as string) ?? null,
    qtyOnHand: Number(r.qty_on_hand ?? 0), avgCost: num(r.avg_cost),
    lowStock: (r.low_stock as boolean) ?? false,
    attributes: (r.attributes as Record<string, unknown>) ?? {},
  };
}

// colonne aggiornabili (camel→snake) per UPDATE dinamico
const MAT_COLS: Record<string, string> = {
  itemType: 'item_type', barcode: 'barcode', categoryId: 'category_id', description: 'description',
  brand: 'brand', manufacturer: 'manufacturer', mpn: 'mpn', defaultSalePrice: 'default_sale_price',
  taxRateId: 'tax_rate_id', reorderPoint: 'reorder_point', safetyStock: 'safety_stock', minQty: 'min_qty',
  maxQty: 'max_qty', leadTimeDays: 'lead_time_days', preferredVendorId: 'preferred_vendor_id',
  weight: 'weight', weightUnit: 'weight_unit', dimensions: 'dimensions', isReturnable: 'is_returnable',
  shelfLifeDays: 'shelf_life_days', primaryImageUrl: 'primary_image_url', note: 'note',
};

export async function materialRoutes(app: FastifyInstance): Promise<void> {
  app.get('/materials', { preHandler: [app.authenticate, requirePermission('material:read')] }, async (request) => {
    const q = listQuerySchema.parse(request.query);
    const view = String((request.query as Record<string, unknown>).view ?? 'all');
    const orderBy = buildOrderBy((request.query as Record<string, unknown>).sort as string | undefined, SORTABLE, SORTABLE[q.sortBy ?? ''] ?? 'm.name', q.sortDir, 'm.attributes');
    return withRls(request.ctx, async (db) => {
      const params: unknown[] = [];
      let where = `WHERE m.archived_at IS NULL`;
      if (q.q) { params.push(`%${q.q}%`); const i = params.length; where += ` AND (m.name ILIKE $${i} OR m.code ILIKE $${i} OR m.sku ILIKE $${i} OR m.barcode ILIKE $${i})`; }
      if (view === 'stock') where += ` AND m.track_stock`;
      else if (view === 'serial') where += ` AND m.tracked_by_serial`;
      else if (view === 'service') where += ` AND m.item_type = 'service'`;
      else if (view === 'low') where += ` AND m.track_stock AND m.reorder_point IS NOT NULL AND COALESCE((SELECT sum(qty_on_hand) FROM stock_balance b WHERE b.material_id=m.id),0) < m.reorder_point`;
      const fsql = buildFilter((request.query as Record<string, unknown>).filter as string | undefined, FILTER_FIELDS, FILTER_ANY, params);
      if (fsql) where += ` AND ${fsql}`;

      const fromMain = `FROM material m LEFT JOIN material_category cat ON cat.id = m.category_id`;
      const total = await db.query(`SELECT count(*)::int AS n ${fromMain} ${where}`, params);
      // conteggi viste (rispettano ricerca E filtro attivo)
      const vParams: unknown[] = [];
      let vWhere = `WHERE m.archived_at IS NULL`;
      if (q.q) { vParams.push(`%${q.q}%`); const i = vParams.length; vWhere += ` AND (m.name ILIKE $${i} OR m.code ILIKE $${i} OR m.sku ILIKE $${i} OR m.barcode ILIKE $${i})`; }
      const vfsql = buildFilter((request.query as Record<string, unknown>).filter as string | undefined, FILTER_FIELDS, FILTER_ANY, vParams);
      if (vfsql) vWhere += ` AND ${vfsql}`;
      const counts = await db.query(`
        SELECT count(*)::int AS all,
               count(*) FILTER (WHERE m.track_stock)::int AS stock,
               count(*) FILTER (WHERE m.tracked_by_serial)::int AS serial,
               count(*) FILTER (WHERE m.item_type='service')::int AS service,
               count(*) FILTER (WHERE m.track_stock AND m.reorder_point IS NOT NULL
                 AND COALESCE((SELECT sum(qty_on_hand) FROM stock_balance b WHERE b.material_id=m.id),0) < m.reorder_point)::int AS low
        ${fromMain} ${vWhere}`, vParams);
      params.push(q.limit, q.offset);
      const rows = await db.query(`${SELECT} ${where} ORDER BY ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
      return { items: rows.rows.map(toDto), total: total.rows[0].n as number, limit: q.limit, offset: q.offset, views: counts.rows[0] };
    });
  });

  app.get<{ Params: { id: string } }>('/materials/:id', { preHandler: [app.authenticate, requirePermission('material:read')] },
    async (request, reply) => withRls(request.ctx, async (db) => {
      const r = await db.query(`${SELECT} WHERE m.id = $1`, [request.params.id]);
      if (r.rows.length === 0) return reply.code(404).send({ error: 'not_found', message: 'Articolo non trovato', statusCode: 404 });
      return toDto(r.rows[0]);
    }));

  /** Unità seriali dell'articolo (password MAI nel payload, solo hasSecret).
   *  data_scope 'own' (Tecnico): solo le unità del suo furgone o installate da lui. */
  app.get<{ Params: { id: string } }>('/materials/:id/serials', { preHandler: [app.authenticate, requirePermission('serial:read')] },
    async (request) => withRls(request.ctx, async (db) => {
      const ownOnly = request.ctx.dataScope === 'own';
      const params: unknown[] = [request.params.id];
      let scope = '';
      if (ownOnly) {
        params.push(request.ctx.userId);
        scope = ` AND (su.holder_resource_id IN (SELECT id FROM resource WHERE user_id = $2)
                       OR wo.assigned_resource_id IN (SELECT id FROM resource WHERE user_id = $2))`;
      }
      const rows = await db.query(`
        SELECT su.id, su.material_id, m.name AS material_name, su.serial, su.status, su.installed_on, su.updated_at,
               (su.secrets <> '{}'::jsonb) AS has_secret,
               wo.code AS wo_code,
               loc.name AS loc_name, res.label AS holder_label, ic.display_name AS installed_company
        FROM stock_serial_unit su
        LEFT JOIN material m ON m.id = su.material_id
        LEFT JOIN work_order wo ON wo.id = su.work_order_id
        LEFT JOIN stock_location loc ON loc.id = su.location_id
        LEFT JOIN resource res ON res.id = su.holder_resource_id
        LEFT JOIN company ic ON ic.id = su.installed_company_id
        WHERE su.material_id = $1 ${scope}
        ORDER BY su.status, su.serial`, params);
      const whereLabel = (x: Record<string, unknown>): string | null => {
        if (x.status === 'installed') return x.installed_company ? `${x.installed_company}` : 'Parco installato cliente';
        if (x.holder_label) return `${x.holder_label}`;
        if (x.loc_name) return `${x.loc_name}`;
        return null;
      };
      return { items: rows.rows.map((x): SerialUnitDto => ({
        id: x.id as string, materialId: x.material_id as string, materialName: (x.material_name as string) ?? null,
        serial: x.serial as string, status: x.status as SerialUnitDto['status'],
        whereLabel: whereLabel(x), workOrderCode: (x.wo_code as string) ?? null,
        installedOn: (x.installed_on as Date | null)?.toISOString().slice(0, 10) ?? null,
        updatedAt: (x.updated_at as Date).toISOString(), hasSecret: (x.has_secret as boolean) ?? false,
      })) };
    }));

  app.post('/materials', { preHandler: [app.authenticate, requirePermission('material:create')] }, async (request, reply) => {
    const input = createMaterialSchema.parse(request.body);
    const ctx = request.ctx;
    const dto = await withRls(ctx, async (db) => {
      const attrs = await validateAttributes(db, ctx.tenantId, 'material', input.attributes);
      const code = await nextNumber(db, 'material');
      const ins = await db.query(
        `INSERT INTO material (tenant_id, code, name, unit, item_type, sku, barcode, category_id, description,
           brand, manufacturer, mpn, track_stock, tracked_by_serial, tracked_by_lot, costing_method,
           default_cost, default_sale_price, tax_rate_id, reorder_point, safety_stock, min_qty, max_qty,
           lead_time_days, preferred_vendor_id, weight, weight_unit, dimensions, is_returnable, shelf_life_days,
           primary_image_url, note, attributes, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$34) RETURNING id`,
        [ctx.tenantId, code, input.name, input.unit, input.itemType ?? 'article', input.sku ?? null, input.barcode ?? null,
         input.categoryId ?? null, input.description ?? null, input.brand ?? null, input.manufacturer ?? null, input.mpn ?? null,
         input.trackStock ?? true, input.trackedBySerial ?? false, input.trackedByLot ?? false, input.costingMethod ?? 'avg',
         input.defaultCost ?? null, input.defaultSalePrice ?? null, input.taxRateId ?? null, input.reorderPoint ?? null,
         input.safetyStock ?? null, input.minQty ?? null, input.maxQty ?? null, input.leadTimeDays ?? null,
         input.preferredVendorId ?? null, input.weight ?? null, input.weightUnit ?? null,
         input.dimensions ? JSON.stringify(input.dimensions) : null, input.isReturnable ?? true, input.shelfLifeDays ?? null,
         input.primaryImageUrl ?? null, input.note ?? null, attrs, ctx.userId]);
      const r = await db.query(`${SELECT} WHERE m.id = $1`, [ins.rows[0].id]);
      return toDto(r.rows[0]);
    });
    return reply.code(201).send(dto);
  });

  app.patch<{ Params: { id: string } }>('/materials/:id', { preHandler: [app.authenticate, requirePermission('material:update')] },
    async (request) => withRls(request.ctx, async (db) => {
      const input = updateMaterialSchema.parse(request.body);
      const attrs = input.attributes ? await validateAttributes(db, request.ctx.tenantId, 'material', input.attributes) : null;
      const sets: string[] = []; const vals: unknown[] = [request.params.id];
      const add = (col: string, val: unknown) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
      if (input.name !== undefined) add('name', input.name);
      if (input.unit !== undefined) add('unit', input.unit);
      if (input.sku !== undefined) add('sku', input.sku);
      if (input.trackStock !== undefined) add('track_stock', input.trackStock);
      if (input.trackedBySerial !== undefined) add('tracked_by_serial', input.trackedBySerial);
      if (input.trackedByLot !== undefined) add('tracked_by_lot', input.trackedByLot);
      if (input.costingMethod !== undefined) add('costing_method', input.costingMethod);
      if (input.defaultCost !== undefined) add('default_cost', input.defaultCost);
      for (const [k, col] of Object.entries(MAT_COLS)) {
        const v = (input as Record<string, unknown>)[k];
        if (v !== undefined) add(col, col === 'dimensions' && v ? JSON.stringify(v) : v);
      }
      if (attrs) add('attributes', attrs);
      add('updated_by', request.ctx.userId);
      if (sets.length) await db.query(`UPDATE material SET ${sets.join(', ')} WHERE id = $1`, vals);
      const r = await db.query(`${SELECT} WHERE m.id = $1`, [request.params.id]);
      return toDto(r.rows[0]);
    }));

  app.delete<{ Params: { id: string } }>('/materials/:id', { preHandler: [app.authenticate, requirePermission('material:delete')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`UPDATE material SET archived_at = now(), updated_by = $2 WHERE id = $1`, [request.params.id, request.ctx.userId]));
      return reply.code(204).send();
    });
}
