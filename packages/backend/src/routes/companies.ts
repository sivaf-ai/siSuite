/** companies.ts — CRUD aziende (anagrafica unica con ruoli multipli) + contatti. */
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from '../db/pool.js';
import {
  createCompanySchema, updateCompanySchema, createContactSchema, updateContactSchema,
  listQuerySchema, type CompanyDto, type ContactDto,
} from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { validateAttributes } from '../fields.js';

const SORTABLE: Record<string, string> = { displayName: 'c.display_name', type: 'c.type', createdAt: 'c.created_at' };

const SELECT = `
  SELECT c.id, c.display_name, c.type, c.address, c.attributes, c.created_at,
         COALESCE(array_agg(cr.role) FILTER (WHERE cr.role IS NOT NULL), '{}') AS roles
  FROM company c
  LEFT JOIN company_role cr ON cr.company_id = c.id
`;
const GROUP = `GROUP BY c.id`;

function toDto(r: Record<string, unknown>): CompanyDto {
  return {
    id: r.id as string,
    displayName: r.display_name as string,
    type: r.type as CompanyDto['type'],
    address: (r.address as string) ?? null,
    attributes: (r.attributes as Record<string, unknown>) ?? {},
    roles: (r.roles as string[]) ?? [],
    createdAt: r.created_at as string,
  };
}
function contactDto(r: Record<string, unknown>): ContactDto {
  return {
    id: r.id as string, companyId: r.company_id as string, fullName: r.full_name as string,
    roleTitle: (r.role_title as string) ?? null, email: (r.email as string) ?? null,
    phone: (r.phone as string) ?? null, isPrimary: (r.is_primary as boolean) ?? false,
  };
}

async function loadOne(db: PoolClient, id: string): Promise<CompanyDto | null> {
  const r = await db.query(`${SELECT} WHERE c.id = $1 ${GROUP}`, [id]);
  return r.rows.length ? toDto(r.rows[0]) : null;
}

export async function companyRoutes(app: FastifyInstance): Promise<void> {
  // LISTA (ricerca server-side + ordinamento + paginazione + total)
  app.get('/companies', { preHandler: [app.authenticate, requirePermission('company:read')] }, async (request) => {
    const q = listQuerySchema.parse(request.query);
    const sortCol = SORTABLE[q.sortBy ?? ''] ?? 'c.display_name';
    const role = (request.query as Record<string, unknown>).role as string | undefined;
    return withRls(request.ctx, async (db) => {
      const params: unknown[] = [];
      let where = `WHERE c.archived_at IS NULL`;
      if (q.q) {
        params.push(`%${q.q}%`);
        where += ` AND (c.display_name ILIKE $${params.length} OR c.attributes->>'vat_number' ILIKE $${params.length} OR c.attributes->>'city' ILIKE $${params.length})`;
      }
      if (role) {
        // vista filtrata per ruolo (Clienti/Fornitori/Gestori) — modello Party
        params.push(role);
        where += ` AND EXISTS (SELECT 1 FROM company_role crf WHERE crf.company_id = c.id AND crf.role = $${params.length})`;
      }
      const totalRes = await db.query(`SELECT count(*)::int AS n FROM company c ${where}`, params);
      params.push(q.limit, q.offset);
      const rows = await db.query(
        `${SELECT} ${where} ${GROUP} ORDER BY ${sortCol} ${q.sortDir} NULLS LAST LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      // conteggi viste per ruolo (indipendenti dalla vista corrente, rispettano la ricerca)
      const vParams: unknown[] = [];
      let vWhere = `WHERE c.archived_at IS NULL`;
      if (q.q) {
        vParams.push(`%${q.q}%`);
        vWhere += ` AND (c.display_name ILIKE $1 OR c.attributes->>'vat_number' ILIKE $1 OR c.attributes->>'city' ILIKE $1)`;
      }
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
          `SELECT id, company_id, full_name, role_title, email, phone, is_primary
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
        const attrs = await validateAttributes(db, ctx.tenantId, 'company', input.attributes);
        const ins = await db.query(
          `INSERT INTO company (tenant_id, display_name, type, address, attributes, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id`,
          [ctx.tenantId, input.displayName, input.type, input.address ?? null, attrs, ctx.userId],
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
        const exists = await db.query(`SELECT 1 FROM company WHERE id = $1`, [request.params.id]);
        if (!exists.rows.length) return null;
        const attrs = input.attributes ? await validateAttributes(db, request.ctx.tenantId, 'company', input.attributes) : null;
        await db.query(
          `UPDATE company SET
             display_name = COALESCE($2, display_name),
             type = COALESCE($3, type),
             address = COALESCE($4, address),
             attributes = COALESCE($5, attributes),
             updated_by = $6
           WHERE id = $1`,
          [request.params.id, input.displayName ?? null, input.type ?? null, input.address ?? null,
           attrs, request.ctx.userId],
        );
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
      await withRls(request.ctx, (db) =>
        db.query(`UPDATE company SET archived_at = now(), updated_by = $2 WHERE id = $1`,
          [request.params.id, request.ctx.userId]));
      return reply.code(204).send();
    });

  // ── Contatti ──────────────────────────────────────────────────────
  app.post('/contacts', { preHandler: [app.authenticate, requirePermission('contact:create')] },
    async (request, reply) => {
      const input = createContactSchema.parse(request.body);
      const dto = await withRls(request.ctx, async (db) => {
        const ins = await db.query(
          `INSERT INTO company_contact (tenant_id, company_id, full_name, role_title, email, phone, is_primary)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id, company_id, full_name, role_title, email, phone, is_primary`,
          [request.ctx.tenantId, input.companyId, input.fullName, input.roleTitle ?? null,
           input.email ?? null, input.phone ?? null, input.isPrimary ?? false],
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
             is_primary = COALESCE($6, is_primary)
           WHERE id = $1
           RETURNING id, company_id, full_name, role_title, email, phone, is_primary`,
          [request.params.id, input.fullName ?? null, input.roleTitle ?? null, input.email ?? null,
           input.phone ?? null, input.isPrimary ?? null],
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
