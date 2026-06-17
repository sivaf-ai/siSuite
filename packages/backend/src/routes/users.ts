/** users.ts — utenti del tenant (app_user + user_role). CRUD admin (user:manage).
 *  La CREAZIONE provisiona prima l'identità su GoTrue (authN) e lega l'app_user
 *  via auth_user_id; nessuna credenziale vive in app_user. L'eliminazione è
 *  una DISATTIVAZIONE (active=false): lo storico fatturabile non si perde. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createUserSchema, updateUserSchema, type UserAdminDto, type Locale } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import type { PoolClient } from '../db/pool.js';
import { ensureAuthUser } from '../auth/gotrueAdmin.js';
import { config } from '../config.js';

const listQuery = z.object({
  q: z.string().trim().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const SELECT = `
  SELECT u.id, u.full_name, u.email, u.phone, u.active, u.is_platform_admin, u.locale, u.created_at,
         COALESCE(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name))
                  FILTER (WHERE r.id IS NOT NULL), '[]') AS roles
  FROM app_user u
  LEFT JOIN user_role ur ON ur.user_id = u.id
  LEFT JOIN role r ON r.id = ur.role_id
`;

function toDto(r: Record<string, unknown>): UserAdminDto {
  return {
    id: r.id as string,
    fullName: r.full_name as string,
    email: (r.email as string) ?? null,
    phone: (r.phone as string) ?? null,
    active: (r.active as boolean) ?? false,
    isPlatformAdmin: (r.is_platform_admin as boolean) ?? false,
    locale: (r.locale as Locale) ?? null,
    roles: (r.roles as { id: string; name: string }[]) ?? [],
    createdAt: r.created_at as string,
  };
}

async function loadOne(db: PoolClient, id: string): Promise<UserAdminDto | null> {
  const r = await db.query(`${SELECT} WHERE u.id = $1 GROUP BY u.id`, [id]);
  return r.rows.length ? toDto(r.rows[0]) : null;
}

async function setRoles(db: PoolClient, userId: string, roleIds: string[]): Promise<void> {
  await db.query(`DELETE FROM user_role WHERE user_id = $1`, [userId]);
  for (const roleId of roleIds) {
    await db.query(`INSERT INTO user_role (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [userId, roleId]);
  }
}

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get('/users', { preHandler: [app.authenticate, requirePermission('user:read')] }, async (request) => {
    const qp = listQuery.parse(request.query);
    const sortCol = qp.sortBy === 'email' ? 'u.email' : qp.sortBy === 'createdAt' ? 'u.created_at' : 'u.full_name';
    return withRls(request.ctx, async (db) => {
      const params: unknown[] = [];
      let where = '';
      if (qp.q) { params.push(`%${qp.q}%`); where = `WHERE (u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`; }
      const total = await db.query(`SELECT count(*)::int AS n FROM app_user u ${where}`, params);
      params.push(qp.limit, qp.offset);
      const rows = await db.query(
        `${SELECT} ${where} GROUP BY u.id ORDER BY ${sortCol} ${qp.sortDir} NULLS LAST
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      return { items: rows.rows.map(toDto), total: total.rows[0].n as number, limit: qp.limit, offset: qp.offset };
    });
  });

  app.get<{ Params: { id: string } }>('/users/:id',
    { preHandler: [app.authenticate, requirePermission('user:read')] },
    async (request, reply) => {
      const dto = await withRls(request.ctx, (db) => loadOne(db, request.params.id));
      if (!dto) return reply.code(404).send({ error: 'not_found', message: 'Utente non trovato', statusCode: 404 });
      return dto;
    });

  app.post('/users', { preHandler: [app.authenticate, requirePermission('user:manage')] },
    async (request, reply) => {
      const input = createUserSchema.parse(request.body);
      // 1) identità su GoTrue (fuori dalla transazione: è una chiamata di rete)
      let authUserId: string;
      try {
        authUserId = await ensureAuthUser({ baseUrl: config.authInternalUrl, email: input.email, password: input.password });
      } catch (e) {
        return reply.code(502).send({ error: 'auth_provisioning_failed', message: `Provisioning identità fallito: ${(e as Error).message}`, statusCode: 502 });
      }
      // 2) app_user + ruoli nel tenant corrente
      const ctx = request.ctx;
      const out = await withRls(ctx, async (db) => {
        const exists = await db.query(`SELECT id FROM app_user WHERE auth_user_id = $1`, [authUserId]);
        if (exists.rows.length) return { conflict: true as const };
        const ins = await db.query(
          `INSERT INTO app_user (tenant_id, full_name, email, phone, locale, auth_user_id, active)
           VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id`,
          [ctx.tenantId, input.fullName, input.email, input.phone ?? null, input.locale ?? null, authUserId],
        );
        const id = ins.rows[0].id as string;
        await setRoles(db, id, input.roleIds);
        return { conflict: false as const, dto: (await loadOne(db, id))! };
      });
      if (out.conflict) return reply.code(409).send({ error: 'conflict', message: 'Esiste già un utente con questa email', statusCode: 409 });
      return reply.code(201).send(out.dto);
    });

  app.patch<{ Params: { id: string } }>('/users/:id',
    { preHandler: [app.authenticate, requirePermission('user:manage')] },
    async (request, reply) => {
      const input = updateUserSchema.parse(request.body);
      const out = await withRls(request.ctx, async (db) => {
        const upd = await db.query(
          `UPDATE app_user SET
             full_name = COALESCE($2, full_name),
             phone = COALESCE($3, phone),
             active = COALESCE($4, active),
             locale = COALESCE($5, locale)
           WHERE id = $1 RETURNING id`,
          [request.params.id, input.fullName ?? null, input.phone ?? null,
           input.active ?? null, input.locale ?? null],
        );
        if (!upd.rows.length) return null;
        if (input.roleIds) await setRoles(db, request.params.id, input.roleIds);
        return loadOne(db, request.params.id);
      });
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Utente non trovato', statusCode: 404 });
      return out;
    });

  // ELIMINA = disattiva (soft). Non si distrugge un utente legato allo storico.
  app.delete<{ Params: { id: string } }>('/users/:id',
    { preHandler: [app.authenticate, requirePermission('user:manage')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) =>
        db.query(`UPDATE app_user SET active = false WHERE id = $1`, [request.params.id]));
      return reply.code(204).send();
    });
}
