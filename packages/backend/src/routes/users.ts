/** users.ts — utenti del tenant (app_user + user_role + ciclo di vita).
 *  Due creazioni: MANUALE (provisiona subito l'identità GoTrue con password) e
 *  INVITO (status='invited', l'identità si lega al primo login by-email, I.2).
 *  Collegamento opzionale a una risorsa persona (resource.user_id, 1:1).
 *  Nessuna credenziale vive in app_user. L'eliminazione è una DISATTIVAZIONE. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createUserSchema, updateUserSchema, inviteUserSchema,
  type UserAdminDto, type EffectivePermissionsDto, type Locale,
} from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import type { PoolClient } from '../db/pool.js';
import { ensureAuthUser } from '../auth/gotrueAdmin.js';
import { config } from '../config.js';
import { nextNumber } from '../numberSeries.js';
import { buildFilter } from '../filterSql.js';

const listQuery = z.object({
  q: z.string().trim().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const SELECT = `
  SELECT u.id, u.code, u.full_name, u.email, u.phone, u.active, u.status, u.last_login_at,
         u.is_platform_admin, u.locale, u.created_at,
         res.id AS resource_id, res.label AS resource_label,
         COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', r.id, 'name', r.name))
                  FILTER (WHERE r.id IS NOT NULL), '[]') AS roles
  FROM app_user u
  LEFT JOIN user_role ur ON ur.user_id = u.id
  LEFT JOIN role r ON r.id = ur.role_id
  LEFT JOIN resource res ON res.user_id = u.id AND res.archived_at IS NULL
`;

function toDto(r: Record<string, unknown>): UserAdminDto {
  return {
    id: r.id as string,
    code: (r.code as string) ?? null,
    fullName: r.full_name as string,
    email: (r.email as string) ?? null,
    phone: (r.phone as string) ?? null,
    active: (r.active as boolean) ?? false,
    status: (r.status as string) ?? 'active',
    lastLoginAt: r.last_login_at ? new Date(r.last_login_at as string).toISOString() : null,
    isPlatformAdmin: (r.is_platform_admin as boolean) ?? false,
    locale: (r.locale as Locale) ?? null,
    roles: (r.roles as { id: string; name: string }[]) ?? [],
    resourceId: (r.resource_id as string) ?? null,
    resourceLabel: (r.resource_label as string) ?? null,
    createdAt: r.created_at as string,
  };
}

async function loadOne(db: PoolClient, id: string): Promise<UserAdminDto | null> {
  const r = await db.query(`${SELECT} WHERE u.id = $1 GROUP BY u.id, res.id, res.label`, [id]);
  return r.rows.length ? toDto(r.rows[0]) : null;
}

async function setRoles(db: PoolClient, userId: string, roleIds: string[]): Promise<void> {
  await db.query(`DELETE FROM user_role WHERE user_id = $1`, [userId]);
  for (const roleId of roleIds) {
    await db.query(`INSERT INTO user_role (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [userId, roleId]);
  }
}

/** Collega (1:1) una risorsa persona all'utente. null = scollega. */
async function linkResource(db: PoolClient, userId: string, resourceId: string | null | undefined): Promise<void> {
  if (resourceId === undefined) return;            // campo non inviato → non toccare
  await db.query(`UPDATE resource SET user_id = NULL WHERE user_id = $1`, [userId]);   // scollega la precedente
  if (resourceId) {
    await db.query(`UPDATE resource SET user_id = $1 WHERE id = $2`, [userId, resourceId]);
  }
}

async function genCode(db: PoolClient): Promise<string | null> {
  try { return await nextNumber(db, 'app_user'); } catch { return null; }   // serie opzionale
}

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get('/users', { preHandler: [app.authenticate, requirePermission('user:read')] }, async (request) => {
    const qp = listQuery.parse(request.query);
    const sortCol = qp.sortBy === 'email' ? 'u.email' : qp.sortBy === 'createdAt' ? 'u.created_at' : 'u.full_name';
    return withRls(request.ctx, async (db) => {
      const params: unknown[] = [];
      let where = '';
      if (qp.q) { params.push(`%${qp.q}%`); where = `WHERE (u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.code ILIKE $${params.length})`; }
      const fsql = buildFilter((request.query as Record<string, unknown>).filter as string | undefined,
        { fullName: 'u.full_name', email: 'u.email', phone: 'u.phone', active: 'u.active', status: 'u.status', code: 'u.code', locale: 'u.locale', createdAt: 'u.created_at' },
        ['u.full_name', 'u.email', 'u.code'], params);
      if (fsql) where = where ? `${where} AND ${fsql}` : `WHERE ${fsql}`;
      const total = await db.query(`SELECT count(*)::int AS n FROM app_user u ${where}`, params);
      params.push(qp.limit, qp.offset);
      const rows = await db.query(
        `${SELECT} ${where} GROUP BY u.id, res.id, res.label ORDER BY ${sortCol} ${qp.sortDir} NULLS LAST
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

  // Permessi EFFETTIVI (derivati dai ruoli) + data_scope più ampio — sola lettura.
  app.get<{ Params: { id: string } }>('/users/:id/effective',
    { preHandler: [app.authenticate, requirePermission('user:read')] },
    async (request) => withRls(request.ctx, async (db): Promise<EffectivePermissionsDto> => {
      const perms = await db.query(
        `SELECT DISTINCT rp.permission_key
         FROM user_role ur JOIN role_permission rp ON rp.role_id = ur.role_id
         WHERE ur.user_id = $1`, [request.params.id]);
      const scopes = await db.query(
        `SELECT r.data_scope FROM user_role ur JOIN role r ON r.id = ur.role_id WHERE ur.user_id = $1`,
        [request.params.id]);
      const ds = scopes.rows.map((s) => s.data_scope as string);
      const dataScope = ds.includes('tenant') ? 'tenant' : ds.includes('team') ? 'team' : ds.includes('customer') ? 'customer' : 'own';
      return { permissions: perms.rows.map((p) => p.permission_key as string), dataScope };
    }));

  // CREAZIONE MANUALE: identità GoTrue subito (con password), app_user 'active'.
  app.post('/users', { preHandler: [app.authenticate, requirePermission('user:manage')] },
    async (request, reply) => {
      const input = createUserSchema.parse(request.body);
      let authUserId: string;
      try {
        authUserId = await ensureAuthUser({ baseUrl: config.authInternalUrl, email: input.email, password: input.password });
      } catch (e) {
        return reply.code(502).send({ error: 'auth_provisioning_failed', message: `Provisioning identità fallito: ${(e as Error).message}`, statusCode: 502 });
      }
      const ctx = request.ctx;
      const out = await withRls(ctx, async (db) => {
        const exists = await db.query(`SELECT id FROM app_user WHERE auth_user_id = $1`, [authUserId]);
        if (exists.rows.length) return { conflict: true as const };
        const code = await genCode(db);
        const ins = await db.query(
          `INSERT INTO app_user (tenant_id, code, full_name, email, phone, locale, auth_user_id, active, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,true,'active') RETURNING id`,
          [ctx.tenantId, code, input.fullName, input.email, input.phone ?? null, input.locale ?? null, authUserId],
        );
        const id = ins.rows[0].id as string;
        await setRoles(db, id, input.roleIds);
        await linkResource(db, id, input.resourceId);
        return { conflict: false as const, dto: (await loadOne(db, id))! };
      });
      if (out.conflict) return reply.code(409).send({ error: 'conflict', message: 'Esiste già un utente con questa email', statusCode: 409 });
      return reply.code(201).send(out.dto);
    });

  // INVITO: app_user 'invited', identità legata al primo login (by-email, I.2).
  // In dev senza SMTP, l'invitato si registra in GoTrue con la stessa email e il
  // provisioning-by-email lo attiva. Con SMTP, qui si genererebbe l'email di invito.
  app.post('/users/invite', { preHandler: [app.authenticate, requirePermission('user:manage')] },
    async (request, reply) => {
      const input = inviteUserSchema.parse(request.body);
      const ctx = request.ctx;
      const out = await withRls(ctx, async (db) => {
        const exists = await db.query(`SELECT id FROM app_user WHERE lower(email) = lower($1)`, [input.email]);
        if (exists.rows.length) return { conflict: true as const };
        const code = await genCode(db);
        const ins = await db.query(
          `INSERT INTO app_user (tenant_id, code, full_name, email, phone, locale, active, status, invited_at)
           VALUES ($1,$2,$3,$4,$5,$6,true,'invited',now()) RETURNING id`,
          [ctx.tenantId, code, input.fullName, input.email, input.phone ?? null, input.locale ?? null],
        );
        const id = ins.rows[0].id as string;
        await setRoles(db, id, input.roleIds);
        await linkResource(db, id, input.resourceId);
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
        // status segue active: riattivare un disabled lo riporta 'active'
        const upd = await db.query(
          `UPDATE app_user SET
             full_name = COALESCE($2, full_name),
             phone = COALESCE($3, phone),
             active = COALESCE($4, active),
             locale = COALESCE($5, locale),
             status = CASE WHEN $4 IS NULL THEN status
                          WHEN $4 = true THEN (CASE WHEN status = 'invited' THEN 'invited' ELSE 'active' END)
                          ELSE 'disabled' END
           WHERE id = $1 RETURNING id`,
          [request.params.id, input.fullName ?? null, input.phone ?? null,
           input.active ?? null, input.locale ?? null],
        );
        if (!upd.rows.length) return null;
        if (input.roleIds) await setRoles(db, request.params.id, input.roleIds);
        await linkResource(db, request.params.id, input.resourceId);
        return loadOne(db, request.params.id);
      });
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Utente non trovato', statusCode: 404 });
      return out;
    });

  // ELIMINA = disattiva (soft) + status 'disabled'. Lo storico non si distrugge.
  app.delete<{ Params: { id: string } }>('/users/:id',
    { preHandler: [app.authenticate, requirePermission('user:manage')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) =>
        db.query(`UPDATE app_user SET active = false, status = 'disabled' WHERE id = $1`, [request.params.id]));
      return reply.code(204).send();
    });
}
