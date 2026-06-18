/** roles.ts — ruoli RBAC (role + role_permission). Lista = ruoli di SISTEMA
 *  (tenant_id NULL, in sola lettura) + ruoli CUSTOM del tenant. CRUD su quelli
 *  custom (role:manage). I permessi sono il catalogo nel codice; qui si
 *  compongono per ruolo in role_permission. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createRoleSchema, updateRoleSchema, type RoleDto } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { buildFilter } from '../filterSql.js';
import type { PoolClient } from '../db/pool.js';

const listQuery = z.object({
  q: z.string().trim().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const SELECT = `
  SELECT r.id, r.name, r.description, r.data_scope, (r.tenant_id IS NULL) AS is_system,
         COALESCE(array_agg(rp.permission_key) FILTER (WHERE rp.permission_key IS NOT NULL), '{}') AS permissions
  FROM role r
  LEFT JOIN role_permission rp ON rp.role_id = r.id
`;

function toDto(r: Record<string, unknown>): RoleDto {
  return {
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) ?? null,
    dataScope: r.data_scope as string,
    isSystem: r.is_system as boolean,
    permissions: (r.permissions as string[]) ?? [],
  };
}

async function loadOne(db: PoolClient, id: string): Promise<RoleDto | null> {
  const r = await db.query(`${SELECT} WHERE r.id = $1 GROUP BY r.id`, [id]);
  return r.rows.length ? toDto(r.rows[0]) : null;
}

async function setPermissions(db: PoolClient, roleId: string, keys: string[]): Promise<void> {
  await db.query(`DELETE FROM role_permission WHERE role_id = $1`, [roleId]);
  for (const key of keys) {
    await db.query(`INSERT INTO role_permission (role_id, permission_key) VALUES ($1,$2)
                    ON CONFLICT DO NOTHING`, [roleId, key]);
  }
}

export async function roleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/roles', { preHandler: [app.authenticate, requirePermission('role:read')] }, async (request) => {
    const qp = listQuery.parse(request.query);
    const sortCol = qp.sortBy === 'dataScope' ? 'r.data_scope' : 'r.name';
    return withRls(request.ctx, async (db) => {
      const params: unknown[] = [];
      let where = '';
      if (qp.q) { params.push(`%${qp.q}%`); where = `WHERE r.name ILIKE $${params.length}`; }
      const fsql = buildFilter((request.query as Record<string, unknown>).filter as string | undefined,
        { name: 'r.name', description: 'r.description', dataScope: 'r.data_scope', isSystem: 'r.is_system' },
        ['r.name', 'r.description'], params);
      if (fsql) where = where ? `${where} AND ${fsql}` : `WHERE ${fsql}`;
      const total = await db.query(`SELECT count(*)::int AS n FROM role r ${where}`, params);
      params.push(qp.limit, qp.offset);
      const rows = await db.query(
        `${SELECT} ${where} GROUP BY r.id ORDER BY is_system DESC, ${sortCol} ${qp.sortDir}
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      return { items: rows.rows.map(toDto), total: total.rows[0].n as number, limit: qp.limit, offset: qp.offset };
    });
  });

  app.get<{ Params: { id: string } }>('/roles/:id',
    { preHandler: [app.authenticate, requirePermission('role:read')] },
    async (request, reply) => {
      const dto = await withRls(request.ctx, (db) => loadOne(db, request.params.id));
      if (!dto) return reply.code(404).send({ error: 'not_found', message: 'Ruolo non trovato', statusCode: 404 });
      return dto;
    });

  app.post('/roles', { preHandler: [app.authenticate, requirePermission('role:manage')] },
    async (request, reply) => {
      const input = createRoleSchema.parse(request.body);
      const dto = await withRls(request.ctx, async (db) => {
        const ins = await db.query(
          `INSERT INTO role (tenant_id, name, description, is_system, data_scope)
           VALUES ($1,$2,$3,false,$4) RETURNING id`,
          [request.ctx.tenantId, input.name, input.description ?? null, input.dataScope],
        );
        const id = ins.rows[0].id as string;
        await setPermissions(db, id, input.permissions);
        return (await loadOne(db, id))!;
      });
      return reply.code(201).send(dto);
    });

  app.patch<{ Params: { id: string } }>('/roles/:id',
    { preHandler: [app.authenticate, requirePermission('role:manage')] },
    async (request, reply) => {
      const input = updateRoleSchema.parse(request.body);
      const out = await withRls(request.ctx, async (db) => {
        // la RLS (role_modify) impedisce di toccare i ruoli di sistema: UPDATE non matcha
        const upd = await db.query(
          `UPDATE role SET
             name = COALESCE($2, name),
             description = COALESCE($3, description),
             data_scope = COALESCE($4, data_scope)
           WHERE id = $1 AND tenant_id = $5 RETURNING id`,
          [request.params.id, input.name ?? null, input.description ?? null, input.dataScope ?? null, request.ctx.tenantId],
        );
        if (!upd.rows.length) return null;
        if (input.permissions) await setPermissions(db, request.params.id, input.permissions);
        return loadOne(db, request.params.id);
      });
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Ruolo non trovato o di sistema (non modificabile)', statusCode: 404 });
      return out;
    });

  app.delete<{ Params: { id: string } }>('/roles/:id',
    { preHandler: [app.authenticate, requirePermission('role:manage')] },
    async (request, reply) => {
      const ok = await withRls(request.ctx, async (db) => {
        const r = await db.query(`DELETE FROM role WHERE id = $1 AND tenant_id = $2 RETURNING id`,
          [request.params.id, request.ctx.tenantId]);
        return r.rows.length > 0;
      });
      if (!ok) return reply.code(404).send({ error: 'not_found', message: 'Ruolo non trovato o di sistema', statusCode: 404 });
      return reply.code(204).send();
    });
}
