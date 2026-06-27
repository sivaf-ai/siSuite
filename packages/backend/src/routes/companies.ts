/** companies.ts — CRUD aziende (anagrafica unica con ruoli multipli) + contatti.
 *  SPEC v1.1 Blocco A: country pilota set fiscale; campi fiscali country-driven in
 *  fiscal_attributes; indirizzi strutturati jsonb (legal/operational); codice da
 *  number_series ('company'). Niente più colonna address. */
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from '../db/pool.js';
import {
  createCompanySchema, updateCompanySchema, createContactSchema, updateContactSchema,
  listQuerySchema, type CompanyDto, type ContactDto,
} from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { findUsage, usageMessage, COMPANY_REFS } from '../context/usageGuard.js';
import { validateAttributes, validateFiscalAttributes } from '../fields.js';
import { nextNumber } from '../numberSeries.js';
import { buildFilter } from '../filterSql.js';
import { buildOrderBy } from '../sortSql.js';

const SORTABLE: Record<string, string> = { displayName: 'c.display_name', code: 'c.code', type: 'c.type', country: 'c.country', createdAt: 'c.created_at' };
const FILTER_FIELDS: Record<string, string> = {
  displayName: 'c.display_name', code: 'c.code', type: 'c.type', country: 'c.country',
  taxId: 'c.tax_id', email: 'c.email', phone: 'c.phone',
  city: "COALESCE(c.legal_address->>'comune', c.legal_address->>'localidad')",
};
const FILTER_ANY = ['c.display_name', 'c.code', 'c.tax_id', 'c.email'];

const SELECT = `
  SELECT c.id, c.code, c.display_name, c.type, c.country, c.tax_id, c.tax_id_kind,
         c.email, c.phone, c.website, c.iban, c.payment_terms, c.default_price_list_id,
         c.legal_address, c.operational_address, c.fiscal_attributes, c.attributes, c.created_at,
         COALESCE(array_agg(cr.role) FILTER (WHERE cr.role IS NOT NULL), '{}') AS roles
  FROM company c
  LEFT JOIN company_role cr ON cr.company_id = c.id
`;
const GROUP = `GROUP BY c.id`;

const obj = (v: unknown): Record<string, unknown> => (v as Record<string, unknown>) ?? {};
function toDto(r: Record<string, unknown>): CompanyDto {
  return {
    id: r.id as string,
    code: (r.code as string) ?? null,
    displayName: r.display_name as string,
    type: r.type as CompanyDto['type'],
    country: (r.country as string) ?? 'IT',
    taxId: (r.tax_id as string) ?? null,
    taxIdKind: (r.tax_id_kind as string) ?? null,
    email: (r.email as string) ?? null,
    phone: (r.phone as string) ?? null,
    website: (r.website as string) ?? null,
    iban: (r.iban as string) ?? null,
    paymentTerms: (r.payment_terms as string) ?? null,
    defaultPriceListId: (r.default_price_list_id as string) ?? null,
    legalAddress: obj(r.legal_address),
    operationalAddress: obj(r.operational_address),
    fiscalAttributes: obj(r.fiscal_attributes),
    attributes: obj(r.attributes),
    roles: (r.roles as string[]) ?? [],
    createdAt: r.created_at as string,
  };
}
function contactDto(r: Record<string, unknown>): ContactDto {
  return {
    id: r.id as string, companyId: r.company_id as string, fullName: r.full_name as string,
    roleTitle: (r.role_title as string) ?? null, email: (r.email as string) ?? null,
    phone: (r.phone as string) ?? null, mobile: (r.mobile as string) ?? null,
    department: (r.department as string) ?? null, note: (r.note as string) ?? null,
    isPrimary: (r.is_primary as boolean) ?? false,
  };
}
const CONTACT_COLS = `id, company_id, full_name, role_title, email, phone, mobile, department, note, is_primary`;
const asJson = (v: unknown): string | null => (v == null ? null : JSON.stringify(v));

async function loadOne(db: PoolClient, id: string): Promise<CompanyDto | null> {
  const r = await db.query(`${SELECT} WHERE c.id = $1 ${GROUP}`, [id]);
  return r.rows.length ? toDto(r.rows[0]) : null;
}

export async function companyRoutes(app: FastifyInstance): Promise<void> {
  // LISTA (ricerca server-side + ordinamento + paginazione + total)
  app.get('/companies', { preHandler: [app.authenticate, requirePermission('company:read')] }, async (request) => {
    const q = listQuerySchema.parse(request.query);
    const orderBy = buildOrderBy((request.query as Record<string, unknown>).sort as string | undefined, SORTABLE, SORTABLE[q.sortBy ?? ''] ?? 'c.display_name', q.sortDir, 'c.attributes');
    const role = (request.query as Record<string, unknown>).role as string | undefined;
    return withRls(request.ctx, async (db) => {
      const params: unknown[] = [];
      let where = `WHERE c.archived_at IS NULL`;
      if (q.q) {
        params.push(`%${q.q}%`);
        where += ` AND (c.display_name ILIKE $${params.length} OR c.code ILIKE $${params.length} OR c.tax_id ILIKE $${params.length})`;
      }
      if (role) {
        params.push(role);
        where += ` AND EXISTS (SELECT 1 FROM company_role crf WHERE crf.company_id = c.id AND crf.role = $${params.length})`;
      }
      const fsql = buildFilter((request.query as Record<string, unknown>).filter as string | undefined, FILTER_FIELDS, FILTER_ANY, params);
      if (fsql) where += ` AND ${fsql}`;
      const totalRes = await db.query(`SELECT count(*)::int AS n FROM company c ${where}`, params);
      params.push(q.limit, q.offset);
      const rows = await db.query(
        `${SELECT} ${where} ${GROUP} ORDER BY ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      // conteggi viste per ruolo (rispettano ricerca E filtro attivo)
      const vParams: unknown[] = [];
      let vWhere = `WHERE c.archived_at IS NULL`;
      if (q.q) {
        vParams.push(`%${q.q}%`);
        vWhere += ` AND (c.display_name ILIKE $1 OR c.code ILIKE $1 OR c.tax_id ILIKE $1)`;
      }
      const vfsql = buildFilter((request.query as Record<string, unknown>).filter as string | undefined, FILTER_FIELDS, FILTER_ANY, vParams);
      if (vfsql) vWhere += ` AND ${vfsql}`;
      const vRes = await db.query(
        `SELECT count(*)::int AS all,
                count(*) FILTER (WHERE EXISTS (SELECT 1 FROM company_role r WHERE r.company_id=c.id AND r.role='customer'))::int AS customer,
                count(*) FILTER (WHERE EXISTS (SELECT 1 FROM company_role r WHERE r.company_id=c.id AND r.role='supplier'))::int AS supplier,
                count(*) FILTER (WHERE EXISTS (SELECT 1 FROM company_role r WHERE r.company_id=c.id AND r.role='operator'))::int AS operator,
                count(*) FILTER (WHERE EXISTS (SELECT 1 FROM company_role r WHERE r.company_id=c.id AND r.role='partner'))::int AS partner
         FROM company c ${vWhere}`,
        vParams,
      );
      const v = vRes.rows[0];
      return {
        items: rows.rows.map(toDto), total: totalRes.rows[0].n as number, limit: q.limit, offset: q.offset,
        views: { all: v.all as number, customer: v.customer as number, supplier: v.supplier as number, operator: v.operator as number, partner: v.partner as number },
      };
    });
  });

  // DETTAGLIO (+ contatti)
  app.get<{ Params: { id: string } }>('/companies/:id',
    { preHandler: [app.authenticate, requirePermission('company:read')] },
    async (request, reply) => {
      const out = await withRls(request.ctx, async (db) => {
        const company = await loadOne(db, request.params.id);
        if (!company) return null;
        const contacts = await db.query(
          `SELECT ${CONTACT_COLS}
           FROM company_contact WHERE company_id = $1 ORDER BY is_primary DESC, full_name`,
          [request.params.id],
        );
        return { ...company, contacts: contacts.rows.map(contactDto) };
      });
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Azienda non trovata', statusCode: 404 });
      return out;
    });

  // CREA (+ ruoli)
  app.post('/companies', { preHandler: [app.authenticate, requirePermission('company:create')] },
    async (request, reply) => {
      const input = createCompanySchema.parse(request.body);
      const ctx = request.ctx;
      const dto = await withRls(ctx, async (db) => {
        const country = input.country ?? 'IT';
        const attrs = await validateAttributes(db, ctx.tenantId, 'company', input.attributes);
        const fiscal = await validateFiscalAttributes(db, ctx.tenantId, 'company', country, input.fiscalAttributes);
        const code = await nextNumber(db, 'company');
        const ins = await db.query(
          `INSERT INTO company (tenant_id, code, display_name, type, country, tax_id, tax_id_kind, email, phone, website,
             iban, payment_terms, default_price_list_id, legal_address, operational_address, fiscal_attributes, attributes, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18) RETURNING id`,
          [ctx.tenantId, code, input.displayName, input.type, country, input.taxId ?? null, input.taxIdKind ?? null,
           input.email ?? null, input.phone ?? null, input.website ?? null, input.iban ?? null, input.paymentTerms ?? null,
           input.defaultPriceListId ?? null, asJson(input.legalAddress) ?? '{}', asJson(input.operationalAddress) ?? '{}',
           fiscal, attrs, ctx.userId],
        );
        const id = ins.rows[0].id as string;
        for (const r of input.roles ?? []) {
          await db.query(
            `INSERT INTO company_role (tenant_id, company_id, role, customer_nature)
             VALUES ($1,$2,$3,$4) ON CONFLICT (company_id, role) DO NOTHING`,
            [ctx.tenantId, id, r.role, r.customerNature ?? null],
          );
        }
        return (await loadOne(db, id))!;
      });
      return reply.code(201).send(dto);
    });

  // MODIFICA
  app.patch<{ Params: { id: string } }>('/companies/:id',
    { preHandler: [app.authenticate, requirePermission('company:update')] },
    async (request, reply) => {
      const input = updateCompanySchema.parse(request.body);
      const out = await withRls(request.ctx, async (db) => {
        const cur = await db.query(`SELECT country FROM company WHERE id = $1`, [request.params.id]);
        if (!cur.rows.length) return null;
        const country = input.country ?? (cur.rows[0].country as string) ?? 'IT';
        const attrs = input.attributes ? await validateAttributes(db, request.ctx.tenantId, 'company', input.attributes) : null;
        const fiscal = input.fiscalAttributes ? await validateFiscalAttributes(db, request.ctx.tenantId, 'company', country, input.fiscalAttributes) : null;
        const sets: string[] = []; const vals: unknown[] = [request.params.id];
        const add = (col: string, val: unknown) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
        if (input.displayName !== undefined) add('display_name', input.displayName);
        if (input.type !== undefined) add('type', input.type);
        if (input.country !== undefined) add('country', input.country);
        if (input.taxId !== undefined) add('tax_id', input.taxId);
        if (input.taxIdKind !== undefined) add('tax_id_kind', input.taxIdKind);
        if (input.email !== undefined) add('email', input.email);
        if (input.phone !== undefined) add('phone', input.phone);
        if (input.website !== undefined) add('website', input.website);
        if (input.iban !== undefined) add('iban', input.iban);
        if (input.paymentTerms !== undefined) add('payment_terms', input.paymentTerms);
        if (input.defaultPriceListId !== undefined) add('default_price_list_id', input.defaultPriceListId);
        if (input.legalAddress !== undefined) add('legal_address', asJson(input.legalAddress) ?? '{}');
        if (input.operationalAddress !== undefined) add('operational_address', asJson(input.operationalAddress) ?? '{}');
        if (fiscal) add('fiscal_attributes', fiscal);
        if (attrs) add('attributes', attrs);
        add('updated_by', request.ctx.userId);
        if (sets.length > 1) await db.query(`UPDATE company SET ${sets.join(', ')} WHERE id = $1`, vals);
        if (input.roles) {
          await db.query(`DELETE FROM company_role WHERE company_id = $1`, [request.params.id]);
          for (const r of input.roles) {
            await db.query(
              `INSERT INTO company_role (tenant_id, company_id, role, customer_nature) VALUES ($1,$2,$3,$4)`,
              [request.ctx.tenantId, request.params.id, r.role, r.customerNature ?? null],
            );
          }
        }
        return loadOne(db, request.params.id);
      });
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Azienda non trovata', statusCode: 404 });
      return out;
    });

  // ARCHIVIA (soft-delete)
  app.delete<{ Params: { id: string } }>('/companies/:id',
    { preHandler: [app.authenticate, requirePermission('company:delete')] },
    async (request, reply) => {
      const res = await withRls(request.ctx, async (db) => {
        const r = await db.query(`SELECT display_name FROM company WHERE id = $1`, [request.params.id]);
        if (!r.rows.length) return { code: 'notfound' as const };
        const used = await findUsage(db, request.params.id, COMPANY_REFS);
        if (used.length) return { code: 'used' as const, name: r.rows[0].display_name as string, used };
        await db.query(`UPDATE company SET archived_at = now(), updated_by = $2 WHERE id = $1`,
          [request.params.id, request.ctx.userId]);
        return { code: 'ok' as const };
      });
      if (res.code === 'notfound') return reply.code(404).send({ error: 'not_found', message: 'Azienda non trovata', statusCode: 404 });
      if (res.code === 'used') return reply.code(409).send({ error: 'conflict', message: usageMessage(res.name, res.used), statusCode: 409 });
      return reply.code(204).send();
    });

  // ── Contatti ──────────────────────────────────────────────────────
  app.post('/contacts', { preHandler: [app.authenticate, requirePermission('contact:create')] },
    async (request, reply) => {
      const input = createContactSchema.parse(request.body);
      const dto = await withRls(request.ctx, async (db) => {
        const ins = await db.query(
          `INSERT INTO company_contact (tenant_id, company_id, full_name, role_title, email, phone, mobile, department, note, is_primary)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING ${CONTACT_COLS}`,
          [request.ctx.tenantId, input.companyId, input.fullName, input.roleTitle ?? null,
           input.email ?? null, input.phone ?? null, input.mobile ?? null, input.department ?? null,
           input.note ?? null, input.isPrimary ?? false],
        );
        return contactDto(ins.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  app.patch<{ Params: { id: string } }>('/contacts/:id',
    { preHandler: [app.authenticate, requirePermission('contact:update')] },
    async (request) => {
      const input = updateContactSchema.parse(request.body);
      return withRls(request.ctx, async (db) => {
        const r = await db.query(
          `UPDATE company_contact SET
             full_name = COALESCE($2, full_name), role_title = COALESCE($3, role_title),
             email = COALESCE($4, email), phone = COALESCE($5, phone),
             mobile = COALESCE($6, mobile), department = COALESCE($7, department), note = COALESCE($8, note),
             is_primary = COALESCE($9, is_primary)
           WHERE id = $1
           RETURNING ${CONTACT_COLS}`,
          [request.params.id, input.fullName ?? null, input.roleTitle ?? null, input.email ?? null,
           input.phone ?? null, input.mobile ?? null, input.department ?? null, input.note ?? null, input.isPrimary ?? null],
        );
        return contactDto(r.rows[0]);
      });
    });

  app.delete<{ Params: { id: string } }>('/contacts/:id',
    { preHandler: [app.authenticate, requirePermission('contact:delete')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`DELETE FROM company_contact WHERE id = $1`, [request.params.id]));
      return reply.code(204).send();
    });
}
