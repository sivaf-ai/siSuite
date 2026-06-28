/** resources.ts — CRUD risorse (persone, mezzi, attrezzature) + orario per-risorsa
 *  e indisponibilità (alimentano il motore di pianificazione, mock 20). */
import type { FastifyInstance } from 'fastify';
import {
  createResourceSchema, updateResourceSchema, listQuerySchema, createAvailabilitySchema,
  workingHoursSchema, type ResourceDto, type ResourceAvailabilityDto,
} from '@sisuite/shared';
import { z } from 'zod';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { findUsage, usageMessage, RESOURCE_REFS } from '../context/usageGuard.js';
import { logAudit } from '../context/audit.js';
import { validateAttributes } from '../fields.js';
import { buildFilter } from '../filterSql.js';
import { buildOrderBy } from '../sortSql.js';

const FILTER_FIELDS: Record<string, string> = { label: 'r.label', kind: 'r.kind', active: 'r.active', hourly_cost: "r.attributes->>'hourly_cost'" };
const FILTER_ANY = ['r.label', 'r.kind'];

const SELECT = `SELECT r.id, r.kind, r.label, r.user_id, r.active, r.attributes, r.working_hours, r.code, r.color, r.avatar_url, r.email, r.phone,
       r.archived_at, au.full_name AS archived_by_name
  FROM resource r LEFT JOIN app_user au ON au.id = r.archived_by`;
const SORTABLE: Record<string, string> = { label: 'r.label', kind: 'r.kind', code: 'r.code' };
function toDto(r: Record<string, unknown>): ResourceDto {
  return {
    id: r.id as string, kind: r.kind as ResourceDto['kind'], label: r.label as string,
    userId: (r.user_id as string) ?? null, active: r.active as boolean,
    attributes: (r.attributes as Record<string, unknown>) ?? {},
    code: (r.code as string) ?? null, color: (r.color as string) ?? null,
    avatarUrl: (r.avatar_url as string) ?? null, email: (r.email as string) ?? null, phone: (r.phone as string) ?? null,
    workingHours: (r.working_hours as Record<string, [string, string][]> | null) ?? null,
    userName: (r.user_name as string | null) ?? null,
    archivedAt: (r.archived_at as Date | null)?.toISOString() ?? null,
    archivedByName: (r.archived_by_name as string) ?? null,
  };
}
function toAvailDto(r: Record<string, unknown>): ResourceAvailabilityDto {
  return {
    id: r.id as string, resourceId: r.resource_id as string, kind: r.kind as string,
    startsAt: new Date(r.starts_at as string).toISOString(), endsAt: new Date(r.ends_at as string).toISOString(),
    reason: (r.reason as string | null) ?? null,
  };
}

export async function resourceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/resources', { preHandler: [app.authenticate, requirePermission('resource:read')] }, async (request) => {
    const q = listQuerySchema.parse(request.query);
    const orderBy = buildOrderBy((request.query as Record<string, unknown>).sort as string | undefined, SORTABLE, SORTABLE[q.sortBy ?? ''] ?? 'r.label', q.sortDir, 'r.attributes');
    const kind = (request.query as { kind?: string }).kind;
    const archivedParam = String((request.query as Record<string, unknown>).archived ?? '');
    const onlyArchived = archivedParam === '1' || archivedParam === 'only' || archivedParam === 'true';
    const archivedCond = onlyArchived ? 'r.archived_at IS NOT NULL' : 'r.archived_at IS NULL';
    return withRls(request.ctx, async (db) => {
      const params: unknown[] = [];
      let where = `WHERE ${archivedCond}`;
      if (kind) { params.push(kind); where += ` AND r.kind = $${params.length}`; }
      if (q.q) { params.push(`%${q.q}%`); where += ` AND r.label ILIKE $${params.length}`; }
      const fsql = buildFilter((request.query as Record<string, unknown>).filter as string | undefined, FILTER_FIELDS, FILTER_ANY, params);
      if (fsql) where += ` AND ${fsql}`;
      const total = await db.query(`SELECT count(*)::int AS n FROM resource r ${where}`, params);
      params.push(q.limit, q.offset);
      const rows = await db.query(`${SELECT} ${where} ORDER BY ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
      // viste per tipo (rispettano q E filtro attivo, non kind) — sempre sugli attivi
      const vp: unknown[] = [];
      let vw = `WHERE r.archived_at IS NULL`;
      if (q.q) { vp.push(`%${q.q}%`); vw += ` AND r.label ILIKE $1`; }
      const vfsql = buildFilter((request.query as Record<string, unknown>).filter as string | undefined, FILTER_FIELDS, FILTER_ANY, vp);
      if (vfsql) vw += ` AND ${vfsql}`;
      const v = (await db.query(
        `SELECT count(*)::int AS all,
                count(*) FILTER (WHERE r.kind='person')::int AS person,
                count(*) FILTER (WHERE r.kind='vehicle')::int AS vehicle,
                count(*) FILTER (WHERE r.kind='equipment')::int AS equipment
         FROM resource r ${vw}`, vp)).rows[0];
      return {
        items: rows.rows.map(toDto), total: total.rows[0].n as number, limit: q.limit, offset: q.offset,
        views: { all: v.all as number, person: v.person as number, vehicle: v.vehicle as number, equipment: v.equipment as number },
      };
    });
  });

  app.get<{ Params: { id: string } }>('/resources/:id',
    { preHandler: [app.authenticate, requirePermission('resource:read')] },
    async (request, reply) => {
      const rows = await withRls(request.ctx, (db) => db.query(
        `SELECT r.id, r.kind, r.label, r.user_id, r.active, r.attributes, r.working_hours,
                r.code, r.color, r.avatar_url, r.email, r.phone, u.full_name AS user_name,
                r.archived_at, ab.full_name AS archived_by_name
         FROM resource r LEFT JOIN app_user u ON u.id = r.user_id
              LEFT JOIN app_user ab ON ab.id = r.archived_by WHERE r.id = $1`, [request.params.id]).then((r) => r.rows));
      if (!rows.length) return reply.code(404).send({ error: 'not_found', message: 'Risorsa non trovata', statusCode: 404 });
      return toDto(rows[0]);
    });

  // ── Orario PER-RISORSA (override dell'azienda; null = usa l'orario del tenant) ──
  app.patch<{ Params: { id: string } }>('/resources/:id/working-hours',
    { preHandler: [app.authenticate, requirePermission('resource:update')] },
    async (request) => {
      const input = z.object({ workingHours: workingHoursSchema.nullable() }).parse(request.body);
      return withRls(request.ctx, async (db) => {
        await db.query(`UPDATE resource SET working_hours = $2, updated_by = $3 WHERE id = $1`,
          [request.params.id, input.workingHours ? JSON.stringify(input.workingHours) : null, request.ctx.userId]);
        return { ok: true };
      });
    });

  // ── Indisponibilità (ferie/permessi): il motore le sottrae al calendario ──
  app.get<{ Params: { id: string } }>('/resources/:id/availability',
    { preHandler: [app.authenticate, requirePermission('resource:read')] },
    async (request) =>
      withRls(request.ctx, (db) => db.query(
        `SELECT id, resource_id, kind, starts_at, ends_at, reason FROM resource_availability
         WHERE resource_id = $1 ORDER BY starts_at`, [request.params.id])
        .then((r) => r.rows.map(toAvailDto))));

  app.post<{ Params: { id: string } }>('/resources/:id/availability',
    { preHandler: [app.authenticate, requirePermission('resource:update')] },
    async (request, reply) => {
      const input = createAvailabilitySchema.parse(request.body);
      const dto = await withRls(request.ctx, async (db) => {
        const ins = await db.query(
          `INSERT INTO resource_availability (tenant_id, resource_id, kind, starts_at, ends_at, reason)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, resource_id, kind, starts_at, ends_at, reason`,
          [request.ctx.tenantId, request.params.id, input.kind, input.startsAt, input.endsAt, input.reason ?? null]);
        return toAvailDto(ins.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  app.delete<{ Params: { id: string; availId: string } }>('/resources/:id/availability/:availId',
    { preHandler: [app.authenticate, requirePermission('resource:update')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(
        `DELETE FROM resource_availability WHERE id = $1 AND resource_id = $2`, [request.params.availId, request.params.id]));
      return reply.code(204).send();
    });

  app.post('/resources', { preHandler: [app.authenticate, requirePermission('resource:create')] },
    async (request, reply) => {
      const input = createResourceSchema.parse(request.body);
      const ctx = request.ctx;
      const dto = await withRls(ctx, async (db) => {
        const attrs = await validateAttributes(db, ctx.tenantId, 'resource', input.attributes);
        const ins = await db.query(
          `INSERT INTO resource (tenant_id, kind, label, user_id, attributes, active, code, color, avatar_url, email, phone, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
           RETURNING id, kind, label, user_id, active, attributes, working_hours, code, color, avatar_url, email, phone`,
          [ctx.tenantId, input.kind, input.label, input.userId ?? null, attrs, input.active ?? true,
           input.code ?? null, input.color ?? null, input.avatarUrl ?? null, input.email ?? null, input.phone ?? null, ctx.userId],
        );
        return toDto(ins.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  app.patch<{ Params: { id: string } }>('/resources/:id',
    { preHandler: [app.authenticate, requirePermission('resource:update')] },
    async (request) =>
      withRls(request.ctx, async (db) => {
        const input = updateResourceSchema.parse(request.body);
        const attrs = input.attributes ? await validateAttributes(db, request.ctx.tenantId, 'resource', input.attributes) : null;
        const sets: string[] = []; const vals: unknown[] = [request.params.id];
        const add = (col: string, val: unknown) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
        if (input.kind !== undefined) add('kind', input.kind);
        if (input.label !== undefined) add('label', input.label);
        if (input.userId !== undefined) add('user_id', input.userId);
        if (input.active !== undefined) add('active', input.active);
        if (input.code !== undefined) add('code', input.code);
        if (input.color !== undefined) add('color', input.color);
        if (input.avatarUrl !== undefined) add('avatar_url', input.avatarUrl);
        if (input.email !== undefined) add('email', input.email);
        if (input.phone !== undefined) add('phone', input.phone);
        if (attrs) add('attributes', attrs);
        add('updated_by', request.ctx.userId);
        const r = await db.query(
          `UPDATE resource SET ${sets.join(', ')} WHERE id = $1
           RETURNING id, kind, label, user_id, active, attributes, working_hours, code, color, avatar_url, email, phone`, vals);
        return toDto(r.rows[0]);
      }));

  app.delete<{ Params: { id: string } }>('/resources/:id',
    { preHandler: [app.authenticate, requirePermission('resource:delete')] },
    async (request, reply) => {
      const res = await withRls(request.ctx, async (db) => {
        const r = await db.query(`SELECT label FROM resource WHERE id = $1`, [request.params.id]);
        if (!r.rows.length) return { code: 'notfound' as const };
        const used = await findUsage(db, request.params.id, RESOURCE_REFS);
        if (used.length) return { code: 'used' as const, name: r.rows[0].label as string, used };
        await db.query(`UPDATE resource SET archived_at = now(), archived_by = $2, updated_by = $2 WHERE id = $1`, [request.params.id, request.ctx.userId]);
        await logAudit(db, request.ctx, { entity: 'resource', entityId: request.params.id, action: 'archive', label: r.rows[0].label as string });
        return { code: 'ok' as const };
      });
      if (res.code === 'notfound') return reply.code(404).send({ error: 'not_found', message: 'Risorsa non trovata', statusCode: 404 });
      if (res.code === 'used') return reply.code(409).send({ error: 'conflict', message: usageMessage(res.name, res.used), statusCode: 409 });
      return reply.code(204).send();
    });

  // RIPRISTINA una risorsa archiviata
  app.post<{ Params: { id: string } }>('/resources/:id/restore',
    { preHandler: [app.authenticate, requirePermission('resource:update')] },
    async (request, reply) => {
      const dto = await withRls(request.ctx, async (db) => {
        const upd = await db.query(
          `UPDATE resource SET archived_at = NULL, archived_by = NULL, updated_by = $2 WHERE id = $1 AND archived_at IS NOT NULL RETURNING label`,
          [request.params.id, request.ctx.userId]);
        if (!upd.rows.length) return null;
        await logAudit(db, request.ctx, { entity: 'resource', entityId: request.params.id, action: 'restore', label: upd.rows[0].label as string });
        const r = await db.query(`${SELECT} WHERE r.id = $1`, [request.params.id]);
        return toDto(r.rows[0]);
      });
      if (!dto) return reply.code(404).send({ error: 'not_found', message: 'Risorsa non trovata o non archiviata', statusCode: 404 });
      return dto;
    });

  // ELIMINA DEFINITIVAMENTE (solo se archiviata). FK RESTRICT → 23503 → 409 globale.
  app.delete<{ Params: { id: string } }>('/resources/:id/purge',
    { preHandler: [app.authenticate, requirePermission('resource:delete')] },
    async (request, reply) => {
      const res = await withRls(request.ctx, async (db) => {
        const r = await db.query(`SELECT label, archived_at FROM resource WHERE id = $1`, [request.params.id]);
        if (!r.rows.length) return { code: 'notfound' as const };
        if (!r.rows[0].archived_at) return { code: 'notarchived' as const };
        await logAudit(db, request.ctx, { entity: 'resource', entityId: request.params.id, action: 'purge', label: r.rows[0].label as string });
        await db.query(`DELETE FROM resource WHERE id = $1 AND archived_at IS NOT NULL`, [request.params.id]);
        return { code: 'ok' as const };
      });
      if (res.code === 'notfound') return reply.code(404).send({ error: 'not_found', message: 'Risorsa non trovata', statusCode: 404 });
      if (res.code === 'notarchived') return reply.code(409).send({ error: 'conflict', message: 'Si elimina definitivamente solo un record archiviato', statusCode: 409 });
      return reply.code(204).send();
    });
}
