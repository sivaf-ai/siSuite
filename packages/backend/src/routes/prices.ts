/** prices.ts — Listino voci di capitolato (brief Blocco D, mock 46).
 *  Listini, voci con margine e conteggio ritocchi, ritocchi (override), e
 *  l'endpoint di anteprima `resolvePrice` (regola commessa › gestore › base). */
import type { FastifyInstance } from 'fastify';
import {
  listQuerySchema, createPriceListItemSchema, updatePriceListItemSchema, createPriceOverrideSchema,
  resolvePrice, marginPct, type PriceListDto, type PriceListItemDto, type PriceOverrideDto, type PriceOverride,
} from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';

const SORTABLE: Record<string, string> = { code: 'i.code', description: 'i.description', category: 'i.category' };

function itemDto(r: Record<string, unknown>): PriceListItemDto {
  const cost = r.cost_price != null ? Number(r.cost_price) : null;
  const rev = r.revenue_price != null ? Number(r.revenue_price) : null;
  return {
    id: r.id as string, priceListId: r.price_list_id as string, code: r.code as string,
    description: r.description as string, unit: r.unit as string, category: (r.category as string) ?? null,
    costPrice: cost, revenuePrice: rev, marginPct: marginPct(cost, rev),
    overrideCount: Number(r.override_count ?? 0), active: r.active as boolean,
    attributes: (r.attributes as Record<string, unknown>) ?? {},
  };
}

export async function priceRoutes(app: FastifyInstance): Promise<void> {
  /** Listini disponibili (selettore; default = is_default). */
  app.get('/price-lists', { preHandler: [app.authenticate, requirePermission('report:read')] }, async (request) =>
    withRls(request.ctx, async (db) => {
      const r = await db.query(`SELECT id, code, name, currency, is_default FROM price_list WHERE active ORDER BY is_default DESC, name`);
      return { items: r.rows.map((x): PriceListDto => ({ id: x.id as string, code: x.code as string, name: x.name as string, currency: x.currency as string, isDefault: x.is_default as boolean })) };
    }));

  /** Voci del listino, con viste, margine e conteggio ritocchi. */
  app.get('/price-list-items', { preHandler: [app.authenticate, requirePermission('report:read')] }, async (request) => {
    const q = listQuerySchema.parse(request.query);
    const qq = request.query as Record<string, unknown>;
    const view = String(qq.view ?? 'all');
    const sortCol = SORTABLE[q.sortBy ?? ''] ?? 'i.code';
    return withRls(request.ctx, async (db) => {
      const params: unknown[] = [];
      let where = `WHERE 1=1`;
      if (qq.price_list_id) { params.push(qq.price_list_id); where += ` AND i.price_list_id = $${params.length}`; }
      else { where += ` AND i.price_list_id = (SELECT id FROM price_list WHERE is_default LIMIT 1)`; }
      if (q.q) { params.push(`%${q.q}%`); const x = params.length; where += ` AND (i.code ILIKE $${x} OR i.description ILIKE $${x} OR i.category ILIKE $${x})`; }
      if (view === 'inactive') where += ` AND NOT i.active`; else where += ` AND i.active`;
      if (view === 'overrides') where += ` AND EXISTS (SELECT 1 FROM price_list_override o WHERE o.base_item_id = i.id)`;
      const sel = `
        SELECT i.id, i.price_list_id, i.code, i.description, i.unit, i.category, i.cost_price, i.revenue_price, i.active, i.attributes,
               (SELECT count(*)::int FROM price_list_override o WHERE o.base_item_id = i.id) AS override_count
        FROM price_list_item i ${where}`;
      const total = await db.query(`SELECT count(*)::int AS n FROM price_list_item i ${where}`, params);
      params.push(q.limit, q.offset);
      const rows = await db.query(`${sel} ORDER BY ${sortCol} ${q.sortDir} NULLS LAST LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
      // conteggi viste
      const counts = await db.query(
        `SELECT count(*) FILTER (WHERE active)::int AS all,
                count(*) FILTER (WHERE active AND EXISTS (SELECT 1 FROM price_list_override o WHERE o.base_item_id=price_list_item.id))::int AS overrides,
                count(*) FILTER (WHERE NOT active)::int AS inactive
         FROM price_list_item WHERE price_list_id = COALESCE($1, (SELECT id FROM price_list WHERE is_default LIMIT 1))`,
        [qq.price_list_id ?? null]);
      return { items: rows.rows.map(itemDto), total: total.rows[0].n as number, limit: q.limit, offset: q.offset, views: counts.rows[0] };
    });
  });

  /** Dettaglio voce + i suoi ritocchi (con nomi soggetto/commessa). */
  app.get<{ Params: { id: string } }>('/price-list-items/:id', { preHandler: [app.authenticate, requirePermission('report:read')] },
    async (request, reply) => withRls(request.ctx, async (db) => {
      const r = await db.query(
        `SELECT i.*, (SELECT count(*)::int FROM price_list_override o WHERE o.base_item_id=i.id) AS override_count
         FROM price_list_item i WHERE i.id = $1`, [request.params.id]);
      if (r.rows.length === 0) return reply.code(404).send({ error: 'not_found', message: 'Voce non trovata', statusCode: 404 });
      const ov = await db.query(
        `SELECT o.id, o.base_item_id, o.scope_type, o.company_id, c.display_name AS company_name,
                o.engagement_id, e.title AS engagement_title, o.cost_price, o.revenue_price, o.valid_from, o.valid_to
         FROM price_list_override o
         LEFT JOIN company c ON c.id = o.company_id
         LEFT JOIN engagement e ON e.id = o.engagement_id
         WHERE o.base_item_id = $1 ORDER BY o.scope_type, o.valid_from NULLS FIRST`, [request.params.id]);
      const dto = itemDto(r.rows[0]) as PriceListItemDto & { overrides: PriceOverrideDto[] };
      dto.overrides = ov.rows.map((o): PriceOverrideDto => ({
        id: o.id as string, baseItemId: o.base_item_id as string, scopeType: o.scope_type as 'company' | 'engagement',
        companyId: (o.company_id as string) ?? null, companyName: (o.company_name as string) ?? null,
        engagementId: (o.engagement_id as string) ?? null, engagementTitle: (o.engagement_title as string) ?? null,
        costPrice: o.cost_price != null ? Number(o.cost_price) : null, revenuePrice: o.revenue_price != null ? Number(o.revenue_price) : null,
        validFrom: (o.valid_from as Date | null)?.toISOString().slice(0, 10) ?? null, validTo: (o.valid_to as Date | null)?.toISOString().slice(0, 10) ?? null,
      }));
      return dto;
    }));

  app.post('/price-list-items', { preHandler: [app.authenticate, requirePermission('settings:manage')] }, async (request, reply) => {
    const input = createPriceListItemSchema.parse(request.body);
    const dto = await withRls(request.ctx, async (db) => {
      const r = await db.query(
        `INSERT INTO price_list_item (tenant_id, price_list_id, code, description, unit, category, cost_price, revenue_price, active, attributes, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
         RETURNING *, 0 AS override_count`,
        [request.ctx.tenantId, input.priceListId, input.code, input.description, input.unit, input.category ?? null,
         input.costPrice ?? null, input.revenuePrice ?? null, input.active ?? true, input.attributes ?? {}, request.ctx.userId]);
      return itemDto(r.rows[0]);
    });
    return reply.code(201).send(dto);
  });

  app.patch<{ Params: { id: string } }>('/price-list-items/:id', { preHandler: [app.authenticate, requirePermission('settings:manage')] },
    async (request) => withRls(request.ctx, async (db) => {
      const input = updatePriceListItemSchema.parse(request.body);
      const r = await db.query(
        `UPDATE price_list_item SET code=COALESCE($2,code), description=COALESCE($3,description), unit=COALESCE($4,unit),
           category=COALESCE($5,category), cost_price=COALESCE($6,cost_price), revenue_price=COALESCE($7,revenue_price),
           active=COALESCE($8,active), attributes=COALESCE($9,attributes), updated_by=$10
         WHERE id=$1 RETURNING *, (SELECT count(*)::int FROM price_list_override o WHERE o.base_item_id=price_list_item.id) AS override_count`,
        [request.params.id, input.code ?? null, input.description ?? null, input.unit ?? null, input.category ?? null,
         input.costPrice ?? null, input.revenuePrice ?? null, input.active ?? null, input.attributes ?? null, request.ctx.userId]);
      return itemDto(r.rows[0]);
    }));

  /** Ritocchi (override). */
  app.post('/price-list-overrides', { preHandler: [app.authenticate, requirePermission('settings:manage')] }, async (request, reply) => {
    const input = createPriceOverrideSchema.parse(request.body);
    const id = await withRls(request.ctx, async (db) => {
      const r = await db.query(
        `INSERT INTO price_list_override (tenant_id, base_item_id, scope_type, company_id, engagement_id, cost_price, revenue_price, valid_from, valid_to, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id`,
        [request.ctx.tenantId, input.baseItemId, input.scopeType, input.companyId ?? null, input.engagementId ?? null,
         input.costPrice ?? null, input.revenuePrice ?? null, input.validFrom ?? null, input.validTo ?? null, request.ctx.userId]);
      return r.rows[0].id as string;
    });
    return reply.code(201).send({ id });
  });

  app.delete<{ Params: { id: string } }>('/price-list-overrides/:id', { preHandler: [app.authenticate, requirePermission('settings:manage')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`DELETE FROM price_list_override WHERE id=$1`, [request.params.id]));
      return reply.code(204).send();
    });

  /** Anteprima prezzo risolto (commessa › gestore › base) per una voce in contesto. */
  app.get<{ Querystring: { itemId: string; engagementId?: string; companyId?: string; on?: string } }>('/prices/resolve',
    { preHandler: [app.authenticate, requirePermission('report:read')] }, async (request, reply) => {
      const { itemId, engagementId, companyId, on } = request.query;
      return withRls(request.ctx, async (db) => {
        const b = await db.query(`SELECT cost_price, revenue_price FROM price_list_item WHERE id=$1`, [itemId]);
        if (b.rows.length === 0) return reply.code(404).send({ error: 'not_found', message: 'Voce non trovata', statusCode: 404 });
        const ov = await db.query(
          `SELECT scope_type, company_id, engagement_id, cost_price, revenue_price, valid_from, valid_to
           FROM price_list_override WHERE base_item_id=$1`, [itemId]);
        const overrides: PriceOverride[] = ov.rows.map((o) => ({
          scopeType: o.scope_type as 'company' | 'engagement', companyId: (o.company_id as string) ?? null, engagementId: (o.engagement_id as string) ?? null,
          costPrice: o.cost_price != null ? Number(o.cost_price) : null, revenuePrice: o.revenue_price != null ? Number(o.revenue_price) : null,
          validFrom: (o.valid_from as Date | null)?.toISOString().slice(0, 10) ?? null, validTo: (o.valid_to as Date | null)?.toISOString().slice(0, 10) ?? null,
        }));
        const baseP = { costPrice: b.rows[0].cost_price != null ? Number(b.rows[0].cost_price) : null, revenuePrice: b.rows[0].revenue_price != null ? Number(b.rows[0].revenue_price) : null };
        return resolvePrice(baseP, overrides, { engagementId, companyId, on });
      });
    });
}
