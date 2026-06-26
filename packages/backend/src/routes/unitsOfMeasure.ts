/** unitsOfMeasure.ts — Anagrafica Unità di misura. Le righe di sistema
 *  (tenant_id IS NULL) sono visibili a tutti ma immutabili dal tenant; un tenant
 *  crea/modifica/elimina SOLO le proprie righe. La RLS a DB esclude già le righe
 *  di sistema da UPDATE/DELETE (tenant_id NULL ≠ current_tenant). Riusa i permessi
 *  material:* (è un'anagrafica articolo), come materialCatalog. */
import type { FastifyInstance } from 'fastify';
import { createUnitSchema, updateUnitSchema, type UnitDto } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';

function toDto(r: Record<string, unknown>): UnitDto {
  return {
    id: r.id as string,
    tenantId: (r.tenant_id as string) ?? null,
    code: r.code as string,
    name: r.name as string,
    active: (r.active as boolean) ?? false,
    isSystem: r.tenant_id == null,
  };
}

const SELECT = `SELECT id, tenant_id, code, name, active FROM unit_of_measure`;

export async function unitOfMeasureRoutes(app: FastifyInstance): Promise<void> {
  // lista: sistema (tenant NULL) + righe del tenant corrente, ordinate per codice
  app.get('/units', { preHandler: [app.authenticate, requirePermission('material:read')] },
    async (request) => withRls(request.ctx, async (db) => {
      const rows = await db.query(
        `${SELECT} WHERE tenant_id IS NULL OR tenant_id = $1 ORDER BY code`,
        [request.ctx.tenantId]);
      return { items: rows.rows.map(toDto) };
    }));

  app.post('/units', { preHandler: [app.authenticate, requirePermission('material:create')] },
    async (request, reply) => {
      const input = createUnitSchema.parse(request.body);
      const ctx = request.ctx;
      const dto = await withRls(ctx, async (db) => {
        const r = await db.query(
          `INSERT INTO unit_of_measure (tenant_id, code, name, active, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$5)
           RETURNING id, tenant_id, code, name, active`,
          [ctx.tenantId, input.code, input.name, input.active ?? true, ctx.userId]);
        return toDto(r.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  // modifica: SOLO righe del tenant (le righe di sistema sono fuori dalla WHERE)
  app.patch<{ Params: { id: string } }>('/units/:id',
    { preHandler: [app.authenticate, requirePermission('material:update')] },
    async (request, reply) => withRls(request.ctx, async (db) => {
      const input = updateUnitSchema.parse(request.body);
      const sets: string[] = []; const vals: unknown[] = [request.params.id, request.ctx.tenantId];
      const add = (col: string, val: unknown) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
      if (input.code !== undefined) add('code', input.code);
      if (input.name !== undefined) add('name', input.name);
      if (input.active !== undefined) add('active', input.active);
      vals.push(request.ctx.userId); sets.push(`updated_by = $${vals.length}`);
      const r = await db.query(
        `UPDATE unit_of_measure SET ${sets.join(', ')} WHERE id = $1 AND tenant_id = $2
         RETURNING id, tenant_id, code, name, active`, vals);
      if (!r.rows.length) return reply.code(404).send({ error: 'not_found', message: 'Unità non trovata o di sistema', statusCode: 404 });
      return toDto(r.rows[0]);
    }));

  // elimina: SOLO righe del tenant
  app.delete<{ Params: { id: string } }>('/units/:id',
    { preHandler: [app.authenticate, requirePermission('material:delete')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) =>
        db.query(`DELETE FROM unit_of_measure WHERE id = $1 AND tenant_id = $2`,
          [request.params.id, request.ctx.tenantId]));
      return reply.code(204).send();
    });
}
