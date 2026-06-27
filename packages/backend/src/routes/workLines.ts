/** workLines.ts — Lavorazioni + libretto misure (brief Blocco E, mock 49).
 *  La quantità è la somma del libretto misure (se presente). I prezzi costo/ricavo
 *  sono FOTOGRAFATI alla creazione con resolvePrice (commessa › gestore › base).
 *  Il tipo di costo è dedotto (production) — nessun campo da compilare. */
import type { FastifyInstance } from 'fastify';
import {
  listQuerySchema, createWorkLineSchema, updateWorkLineSchema, resolvePrice,
  type WorkLineDto, type WorkLineMeasureDto, type PriceOverride,
} from '@sisuite/shared';
import { buildFilter } from '../filterSql.js';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { validateAttributes } from '../fields.js';
import type { PoolClient } from '../db/pool.js';

const SORTABLE: Record<string, string> = { occurred: 'wl.occurred_on', quantity: 'wl.quantity' };

function lineDto(r: Record<string, unknown>): WorkLineDto {
  const qty = Number(r.quantity ?? 0);
  const rev = r.revenue_price != null ? Number(r.revenue_price) : null;
  return {
    id: r.id as string, engagementId: r.engagement_id as string,
    phaseId: (r.phase_id as string) ?? null, phaseName: (r.phase_name as string) ?? null, wbsCode: (r.wbs_code as string) ?? null,
    priceListItemId: (r.price_list_item_id as string) ?? null, itemCode: (r.item_code as string) ?? null, itemDescription: (r.item_description as string) ?? null,
    description: (r.description as string) ?? null, quantity: qty, unit: r.unit as string,
    costPrice: r.cost_price != null ? Number(r.cost_price) : null, revenuePrice: rev, revenue: rev != null ? qty * rev : 0,
    occurredOn: (r.occurred_on as Date | null)?.toISOString().slice(0, 10) ?? null,
    origin: r.price_list_item_id ? 'voce' : 'manuale', fromCapture: r.source_capture_id != null,
    measureCount: Number(r.measure_count ?? 0), hasLibretto: Number(r.measure_count ?? 0) > 0,
    attributes: (r.attributes as Record<string, unknown>) ?? {},
  };
}

/** Prezzo "fotografato" via resolvePrice nel contesto della commessa (gestore = engagement.company_id). */
async function snapshotPrice(db: PoolClient, itemId: string, engagementId: string): Promise<{ cost: number | null; rev: number | null; unit: string | null }> {
  const b = await db.query(`SELECT i.cost_price, i.revenue_price, u.code AS unit FROM price_list_item i LEFT JOIN unit_of_measure u ON u.id = i.unit_id WHERE i.id = $1`, [itemId]);
  if (b.rows.length === 0) return { cost: null, rev: null, unit: null };
  const eng = await db.query(`SELECT company_id FROM engagement WHERE id = $1`, [engagementId]);
  const companyId = (eng.rows[0]?.company_id as string) ?? null;
  const ov = await db.query(`SELECT scope_type, company_id, engagement_id, cost_price, revenue_price, valid_from, valid_to FROM price_list_override WHERE base_item_id = $1`, [itemId]);
  const overrides: PriceOverride[] = ov.rows.map((o) => ({
    scopeType: o.scope_type as 'company' | 'engagement', companyId: (o.company_id as string) ?? null, engagementId: (o.engagement_id as string) ?? null,
    costPrice: o.cost_price != null ? Number(o.cost_price) : null, revenuePrice: o.revenue_price != null ? Number(o.revenue_price) : null,
    validFrom: (o.valid_from as Date | null)?.toISOString().slice(0, 10) ?? null, validTo: (o.valid_to as Date | null)?.toISOString().slice(0, 10) ?? null,
  }));
  const base = { costPrice: b.rows[0].cost_price != null ? Number(b.rows[0].cost_price) : null, revenuePrice: b.rows[0].revenue_price != null ? Number(b.rows[0].revenue_price) : null };
  const r = resolvePrice(base, overrides, { engagementId, companyId });
  return { cost: r.costPrice, rev: r.revenuePrice, unit: b.rows[0].unit as string };
}

const SELECT = `
  SELECT wl.id, wl.engagement_id, wl.phase_id, p.name AS phase_name, p.wbs_code,
         wl.price_list_item_id, pli.code AS item_code, pli.description AS item_description,
         wl.description, wl.quantity, wlu.code AS unit, wl.cost_price, wl.revenue_price, wl.occurred_on,
         wl.source_capture_id, wl.attributes,
         (SELECT count(*)::int FROM work_line_measure m WHERE m.work_line_id = wl.id) AS measure_count
  FROM work_line wl
  LEFT JOIN phase p ON p.id = wl.phase_id
  LEFT JOIN unit_of_measure wlu ON wlu.id = wl.unit_id
  LEFT JOIN price_list_item pli ON pli.id = wl.price_list_item_id`;

async function replaceMeasures(db: PoolClient, tenantId: string, lineId: string, measures: { label?: string | null; formula?: string | null; value: number }[]): Promise<number> {
  await db.query(`DELETE FROM work_line_measure WHERE work_line_id = $1`, [lineId]);
  let seq = 0; let sum = 0;
  for (const m of measures) {
    await db.query(`INSERT INTO work_line_measure (tenant_id, work_line_id, label, formula, value, seq) VALUES ($1,$2,$3,$4,$5,$6)`,
      [tenantId, lineId, m.label ?? null, m.formula ?? null, m.value, seq++]);
    sum += Number(m.value);
  }
  return sum;
}

export async function workLineRoutes(app: FastifyInstance): Promise<void> {
  app.get('/work-lines', { preHandler: [app.authenticate, requirePermission('report:read')] }, async (request) => {
    const q = listQuerySchema.parse(request.query);
    const qq = request.query as Record<string, unknown>;
    const view = String(qq.view ?? 'all');
    const sortCol = SORTABLE[q.sortBy ?? ''] ?? 'wl.occurred_on';
    return withRls(request.ctx, async (db) => {
      const params: unknown[] = [];
      let where = `WHERE 1=1`;
      if (qq.engagement_id) { params.push(qq.engagement_id); where += ` AND wl.engagement_id = $${params.length}`; }
      if (q.q) { params.push(`%${q.q}%`); const x = params.length; where += ` AND (pli.code ILIKE $${x} OR pli.description ILIKE $${x} OR wl.description ILIKE $${x})`; }
      if (view === 'with_libretto') where += ` AND EXISTS (SELECT 1 FROM work_line_measure m WHERE m.work_line_id = wl.id)`;
      else if (view === 'from_capture') where += ` AND wl.source_capture_id IS NOT NULL`;
      else if (view === 'manual') where += ` AND wl.price_list_item_id IS NULL`;
      const fsql = buildFilter(qq.filter as string | undefined,
        { voce: 'COALESCE(pli.description, wl.description)', code: 'pli.code', occurredOn: 'wl.occurred_on', quantity: 'wl.quantity', unit: '(SELECT code FROM unit_of_measure u WHERE u.id = wl.unit_id)', revenue: 'wl.revenue_price' },
        ['pli.code', 'pli.description', 'wl.description'], params);
      if (fsql) where += ` AND ${fsql}`;
      const total = await db.query(`SELECT count(*)::int AS n FROM work_line wl LEFT JOIN price_list_item pli ON pli.id=wl.price_list_item_id ${where}`, params);
      const counts = await db.query(
        `SELECT count(*)::int AS all,
                count(*) FILTER (WHERE EXISTS (SELECT 1 FROM work_line_measure m WHERE m.work_line_id=wl.id))::int AS with_libretto,
                count(*) FILTER (WHERE wl.source_capture_id IS NOT NULL)::int AS from_capture,
                count(*) FILTER (WHERE wl.price_list_item_id IS NULL)::int AS manual
         FROM work_line wl ${qq.engagement_id ? `WHERE wl.engagement_id = $1` : ''}`, qq.engagement_id ? [qq.engagement_id] : []);
      params.push(q.limit, q.offset);
      const rows = await db.query(`${SELECT} ${where} ORDER BY ${sortCol} ${q.sortDir} NULLS LAST LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
      return { items: rows.rows.map(lineDto), total: total.rows[0].n as number, limit: q.limit, offset: q.offset, views: counts.rows[0] };
    });
  });

  app.get<{ Params: { id: string } }>('/work-lines/:id', { preHandler: [app.authenticate, requirePermission('report:read')] },
    async (request, reply) => withRls(request.ctx, async (db) => {
      const r = await db.query(`${SELECT} WHERE wl.id = $1`, [request.params.id]);
      if (r.rows.length === 0) return reply.code(404).send({ error: 'not_found', message: 'Lavorazione non trovata', statusCode: 404 });
      const dto = lineDto(r.rows[0]) as WorkLineDto;
      const ms = await db.query(`SELECT id, label, formula, value, seq FROM work_line_measure WHERE work_line_id = $1 ORDER BY seq`, [request.params.id]);
      dto.measures = ms.rows.map((m): WorkLineMeasureDto => ({ id: m.id as string, label: (m.label as string) ?? null, formula: (m.formula as string) ?? null, value: Number(m.value), seq: m.seq as number }));
      return dto;
    }));

  app.post('/work-lines', { preHandler: [app.authenticate, requirePermission('engagement:update')] }, async (request, reply) => {
    const input = createWorkLineSchema.parse(request.body);
    const ctx = request.ctx;
    const dto = await withRls(ctx, async (db) => {
      const attrsVal = await validateAttributes(db, ctx.tenantId, 'work_line', input.attributes);
      // prezzi fotografati con resolvePrice; unità dalla voce se non passata
      let cost: number | null = null; let rev: number | null = null; let unit = input.unit;
      if (input.priceListItemId) {
        const s = await snapshotPrice(db, input.priceListItemId, input.engagementId);
        cost = s.cost; rev = s.rev; if (!unit && s.unit) unit = s.unit;
      }
      // quantità = somma libretto se presente, altrimenti input
      const measures = input.measures ?? [];
      const qty = measures.length ? measures.reduce((a, m) => a + Number(m.value), 0) : (input.quantity ?? 0);
      if (qty <= 0) throw Object.assign(new Error('Quantità mancante: indica una quantità o un libretto misure'), { statusCode: 400 });
      const ins = await db.query(
        `INSERT INTO work_line (tenant_id, engagement_id, phase_id, work_order_id, price_list_item_id, description, quantity, unit_id, cost_price, revenue_price, occurred_on, resource_id, attributes, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,public.app_resolve_unit(public.app_current_tenant(),$8),$9,$10,COALESCE($11,CURRENT_DATE),$12,$13,$14,$14) RETURNING id`,
        [ctx.tenantId, input.engagementId, input.phaseId ?? null, input.workOrderId ?? null, input.priceListItemId ?? null,
         input.description ?? null, qty, unit, cost, rev, input.occurredOn ?? null, input.resourceId ?? null, attrsVal, ctx.userId]);
      const id = ins.rows[0].id as string;
      if (measures.length) await replaceMeasures(db, ctx.tenantId, id, measures);
      const r = await db.query(`${SELECT} WHERE wl.id = $1`, [id]);
      return lineDto(r.rows[0]);
    });
    return reply.code(201).send(dto);
  });

  app.patch<{ Params: { id: string } }>('/work-lines/:id', { preHandler: [app.authenticate, requirePermission('engagement:update')] },
    async (request) => withRls(request.ctx, async (db) => {
      const input = updateWorkLineSchema.parse(request.body);
      const attrsVal = input.attributes ? await validateAttributes(db, request.ctx.tenantId, 'work_line', input.attributes) : null;
      await db.query(
        `UPDATE work_line SET phase_id=COALESCE($2,phase_id), description=COALESCE($3,description),
           quantity=COALESCE($4,quantity), unit_id=COALESCE(public.app_resolve_unit(public.app_current_tenant(),$5), unit_id), occurred_on=COALESCE($6,occurred_on),
           attributes=COALESCE($7,attributes), updated_by=$8 WHERE id=$1`,
        [request.params.id, input.phaseId ?? null, input.description ?? null, input.quantity ?? null, input.unit ?? null, input.occurredOn ?? null, attrsVal, request.ctx.userId]);
      const r = await db.query(`${SELECT} WHERE wl.id = $1`, [request.params.id]);
      return lineDto(r.rows[0]);
    }));

  /** Sostituisce il libretto misure → la quantità diventa la somma delle misure. */
  app.put<{ Params: { id: string } }>('/work-lines/:id/measures', { preHandler: [app.authenticate, requirePermission('engagement:update')] },
    async (request) => {
      const body = request.body as { measures?: { label?: string | null; formula?: string | null; value: number }[] };
      const measures = body.measures ?? [];
      return withRls(request.ctx, async (db) => {
        const sum = await replaceMeasures(db, request.ctx.tenantId, request.params.id, measures);
        if (measures.length) await db.query(`UPDATE work_line SET quantity = $2, updated_by = $3 WHERE id = $1`, [request.params.id, sum, request.ctx.userId]);
        const r = await db.query(`${SELECT} WHERE wl.id = $1`, [request.params.id]);
        return lineDto(r.rows[0]);
      });
    });

  app.delete<{ Params: { id: string } }>('/work-lines/:id', { preHandler: [app.authenticate, requirePermission('engagement:update')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`DELETE FROM work_line WHERE id = $1`, [request.params.id]));
      return reply.code(204).send();
    });
}
