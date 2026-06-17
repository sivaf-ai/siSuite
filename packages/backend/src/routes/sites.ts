/** sites.ts — Anagrafica Siti/Località (brief Blocco C-bis). Gerarchia per
 *  soggetto (company): GET ?company_id ritorna l'albero piatto (parent_id);
 *  CRUD standard. RLS isola per tenant. */
import type { FastifyInstance } from 'fastify';
import { createSiteSchema, updateSiteSchema, type SiteDto } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';

function toDto(r: Record<string, unknown>): SiteDto {
  return {
    id: r.id as string, companyId: r.company_id as string, parentId: (r.parent_id as string) ?? null,
    name: r.name as string, kind: r.kind as string, address: (r.address as string) ?? null,
    attributes: (r.attributes as Record<string, unknown>) ?? {},
  };
}

export async function siteRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { company_id?: string } }>('/sites',
    { preHandler: [app.authenticate, requirePermission('site:read')] }, async (request) =>
      withRls(request.ctx, async (db) => {
        const params: unknown[] = [];
        let where = `WHERE archived_at IS NULL`;
        if (request.query.company_id) { params.push(request.query.company_id); where += ` AND company_id = $1`; }
        const rows = await db.query(
          `SELECT id, company_id, parent_id, name, kind, address, attributes FROM site ${where} ORDER BY name`, params);
        return { items: rows.rows.map(toDto) };
      }));

  app.post('/sites', { preHandler: [app.authenticate, requirePermission('site:create')] }, async (request, reply) => {
    const input = createSiteSchema.parse(request.body);
    const ctx = request.ctx;
    const dto = await withRls(ctx, async (db) => {
      const r = await db.query(
        `INSERT INTO site (tenant_id, company_id, parent_id, name, kind, address, attributes, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
         RETURNING id, company_id, parent_id, name, kind, address, attributes`,
        [ctx.tenantId, input.companyId, input.parentId ?? null, input.name, input.kind, input.address ?? null, input.attributes ?? {}, ctx.userId]);
      return toDto(r.rows[0]);
    });
    return reply.code(201).send(dto);
  });

  app.patch<{ Params: { id: string } }>('/sites/:id', { preHandler: [app.authenticate, requirePermission('site:update')] },
    async (request) => withRls(request.ctx, async (db) => {
      const input = updateSiteSchema.parse(request.body);
      const r = await db.query(
        `UPDATE site SET name=COALESCE($2,name), kind=COALESCE($3,kind), parent_id=COALESCE($4,parent_id),
           address=COALESCE($5,address), attributes=COALESCE($6,attributes), updated_by=$7
         WHERE id=$1 RETURNING id, company_id, parent_id, name, kind, address, attributes`,
        [request.params.id, input.name ?? null, input.kind ?? null, input.parentId ?? null, input.address ?? null, input.attributes ?? null, request.ctx.userId]);
      return toDto(r.rows[0]);
    }));

  app.delete<{ Params: { id: string } }>('/sites/:id', { preHandler: [app.authenticate, requirePermission('site:delete')] },
    async (request, reply) => {
      // i figli vengono cancellati a cascata (FK ON DELETE CASCADE)
      await withRls(request.ctx, (db) => db.query(`UPDATE site SET archived_at = now(), updated_by=$2 WHERE id=$1`, [request.params.id, request.ctx.userId]));
      return reply.code(204).send();
    });
}
