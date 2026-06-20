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

const SORTABLE: Record<string, string> = { name: 'm.name', sku: 'm.sku', qty: 'qty_on_hand', cost: 'avg_cost' };
const FILTER_FIELDS: Record<string, string> = {
  name: 'm.name', sku: 'm.sku', unit: 'm.unit', costingMethod: 'm.costing_method',
  category: "m.attributes->>'category'", item_type: "m.attributes->>'item_type'",
  supplier_code: "m.attributes->>'supplier_code'", min_stock: "m.attributes->>'min_stock'",
};
const FILTER_ANY = ['m.name', 'm.sku', "m.attributes->>'category'"];

const SELECT = `
  SELECT m.id, m.name, m.unit, m.sku, m.track_stock, m.tracked_by_serial, m.tracked_by_lot,
         m.costing_method, m.default_cost, m.attributes,
         COALESCE(bal.qty, 0) AS qty_on_hand,
         CASE WHEN COALESCE(bal.qty,0) > 0 THEN bal.val / bal.qty ELSE m.default_cost END AS avg_cost,
         (m.track_stock AND (m.attributes->>'min_stock') IS NOT NULL
            AND COALESCE(bal.qty,0) < (m.attributes->>'min_stock')::numeric) AS low_stock
  FROM material m
  LEFT JOIN LATERAL (
    SELECT sum(b.qty_on_hand) AS qty, sum(b.value_on_hand) AS val
    FROM stock_balance b WHERE b.material_id = m.id
  ) bal ON true`;

function toDto(r: Record<string, unknown>): MaterialDto {
  return {
    id: r.id as string, name: r.name as string, unit: r.unit as string, sku: (r.sku as string) ?? null,
    trackStock: r.track_stock as boolean, trackedBySerial: r.tracked_by_serial as boolean, trackedByLot: r.tracked_by_lot as boolean,
    costingMethod: (r.costing_method as string) ?? 'avg', defaultCost: r.default_cost != null ? Number(r.default_cost) : null,
    qtyOnHand: Number(r.qty_on_hand ?? 0), avgCost: r.avg_cost != null ? Number(r.avg_cost) : null,
    lowStock: (r.low_stock as boolean) ?? false,
    attributes: (r.attributes as Record<string, unknown>) ?? {},
  };
}

export async function materialRoutes(app: FastifyInstance): Promise<void> {
  app.get('/materials', { preHandler: [app.authenticate, requirePermission('material:read')] }, async (request) => {
    const q = listQuerySchema.parse(request.query);
    const view = String((request.query as Record<string, unknown>).view ?? 'all');
    const orderBy = buildOrderBy((request.query as Record<string, unknown>).sort as string | undefined, SORTABLE, SORTABLE[q.sortBy ?? ''] ?? 'm.name', q.sortDir);
    return withRls(request.ctx, async (db) => {
      const params: unknown[] = [];
      let where = `WHERE m.archived_at IS NULL`;
      if (q.q) { params.push(`%${q.q}%`); const i = params.length; where += ` AND (m.name ILIKE $${i} OR m.sku ILIKE $${i} OR m.attributes->>'category' ILIKE $${i})`; }
      if (view === 'stock') where += ` AND m.track_stock`;
      else if (view === 'serial') where += ` AND m.tracked_by_serial`;
      else if (view === 'service') where += ` AND m.attributes->>'item_type' = 'service'`;
      else if (view === 'low') where += ` AND m.track_stock AND (m.attributes->>'min_stock') IS NOT NULL AND COALESCE((SELECT sum(qty_on_hand) FROM stock_balance b WHERE b.material_id=m.id),0) < (m.attributes->>'min_stock')::numeric`;
      const fsql = buildFilter((request.query as Record<string, unknown>).filter as string | undefined, FILTER_FIELDS, FILTER_ANY, params);
      if (fsql) where += ` AND ${fsql}`;

      const total = await db.query(`SELECT count(*)::int AS n FROM material m ${where}`, params);
      // conteggi viste (rispettano ricerca E filtro attivo)
      const vParams: unknown[] = [];
      let vWhere = `WHERE m.archived_at IS NULL`;
      if (q.q) { vParams.push(`%${q.q}%`); const i = vParams.length; vWhere += ` AND (m.name ILIKE $${i} OR m.sku ILIKE $${i} OR m.attributes->>'category' ILIKE $${i})`; }
      const vfsql = buildFilter((request.query as Record<string, unknown>).filter as string | undefined, FILTER_FIELDS, FILTER_ANY, vParams);
      if (vfsql) vWhere += ` AND ${vfsql}`;
      const counts = await db.query(`
        SELECT count(*)::int AS all,
               count(*) FILTER (WHERE m.track_stock)::int AS stock,
               count(*) FILTER (WHERE m.tracked_by_serial)::int AS serial,
               count(*) FILTER (WHERE m.attributes->>'item_type'='service')::int AS service,
               count(*) FILTER (WHERE m.track_stock AND (m.attributes->>'min_stock') IS NOT NULL
                 AND COALESCE((SELECT sum(qty_on_hand) FROM stock_balance b WHERE b.material_id=m.id),0) < (m.attributes->>'min_stock')::numeric)::int AS low
        FROM material m ${vWhere}`, vParams);
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
      const ins = await db.query(
        `INSERT INTO material (tenant_id, name, unit, sku, track_stock, tracked_by_serial, tracked_by_lot, costing_method, default_cost, attributes, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING id`,
        [ctx.tenantId, input.name, input.unit, input.sku ?? null, input.trackStock ?? true, input.trackedBySerial ?? false,
         input.trackedByLot ?? false, input.costingMethod ?? 'avg', input.defaultCost ?? null, attrs, ctx.userId]);
      const r = await db.query(`${SELECT} WHERE m.id = $1`, [ins.rows[0].id]);
      return toDto(r.rows[0]);
    });
    return reply.code(201).send(dto);
  });

  app.patch<{ Params: { id: string } }>('/materials/:id', { preHandler: [app.authenticate, requirePermission('material:update')] },
    async (request) => withRls(request.ctx, async (db) => {
      const input = updateMaterialSchema.parse(request.body);
      const attrs = input.attributes ? await validateAttributes(db, request.ctx.tenantId, 'material', input.attributes) : null;
      await db.query(
        `UPDATE material SET name=COALESCE($2,name), unit=COALESCE($3,unit), sku=COALESCE($4,sku),
           track_stock=COALESCE($5,track_stock), tracked_by_serial=COALESCE($6,tracked_by_serial), tracked_by_lot=COALESCE($7,tracked_by_lot),
           costing_method=COALESCE($8,costing_method), default_cost=COALESCE($9,default_cost), attributes=COALESCE($10,attributes), updated_by=$11
         WHERE id=$1`,
        [request.params.id, input.name ?? null, input.unit ?? null, input.sku ?? null,
         input.trackStock ?? null, input.trackedBySerial ?? null, input.trackedByLot ?? null,
         input.costingMethod ?? null, input.defaultCost ?? null, attrs, request.ctx.userId]);
      const r = await db.query(`${SELECT} WHERE m.id = $1`, [request.params.id]);
      return toDto(r.rows[0]);
    }));

  app.delete<{ Params: { id: string } }>('/materials/:id', { preHandler: [app.authenticate, requirePermission('material:delete')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`UPDATE material SET archived_at = now(), updated_by = $2 WHERE id = $1`, [request.params.id, request.ctx.userId]));
      return reply.code(204).send();
    });
}
