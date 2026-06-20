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
import { validateAttributes } from '../fields.js';
import { buildFilter } from '../filterSql.js';
import { buildOrderBy } from '../sortSql.js';

const FILTER_FIELDS: Record<string, string> = { label: 'label', kind: 'kind', active: 'active', hourly_cost: "attributes->>'hourly_cost'" };
const FILTER_ANY = ['label', 'kind'];

const SELECT = `SELECT id, kind, label, user_id, active, attributes, working_hours FROM resource`;
const SORTABLE: Record<string, string> = { label: 'label', kind: 'kind' };
function toDto(r: Record<string, unknown>): ResourceDto {
  return {
    id: r.id as string, kind: r.kind as ResourceDto['kind'], label: r.label as string,
    userId: (r.user_id as string) ?? null, active: r.active as boolean,
    attributes: (r.attributes as Record<string, unknown>) ?? {},
    workingHours: (r.working_hours as Record<string, [string, string][]> | null) ?? null,
    userName: (r.user_name as string | null) ?? null,
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
    const orderBy = buildOrderBy((request.query as Record<string, unknown>).sort as string | undefined, SORTABLE, SORTABLE[q.sortBy ?? ''] ?? 'label', q.sortDir);
    const kind = (request.query as { kind?: string }).kind;
    return withRls(request.ctx, async (db) => {
      const params: unknown[] = [];
      let where = `WHERE archived_at IS NULL`;
      if (kind) { params.push(kind); where += ` AND kind = $${params.length}`; }
      if (q.q) { params.push(`%${q.q}%`); where += ` AND label ILIKE $${params.length}`; }
      const fsql = buildFilter((request.query as Record<string, unknown>).filter as string | undefined, FILTER_FIELDS, FILTER_ANY, params);
      if (fsql) where += ` AND ${fsql}`;
      const total = await db.query(`SELECT count(*)::int AS n FROM resource ${where}`, params);
      params.push(q.limit, q.offset);
      const rows = await db.query(`${SELECT} ${where} ORDER BY ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
      // viste per tipo (rispettano q E filtro attivo, non kind)
      const vp: unknown[] = [];
      let vw = `WHERE archived_at IS NULL`;
      if (q.q) { vp.push(`%${q.q}%`); vw += ` AND label ILIKE $1`; }
      const vfsql = buildFilter((request.query as Record<string, unknown>).filter as string | undefined, FILTER_FIELDS, FILTER_ANY, vp);
      if (vfsql) vw += ` AND ${vfsql}`;
      const v = (await db.query(
        `SELECT count(*)::int AS all,
                count(*) FILTER (WHERE kind='person')::int AS person,
                count(*) FILTER (WHERE kind='vehicle')::int AS vehicle,
                count(*) FILTER (WHERE kind='equipment')::int AS equipment
         FROM resource ${vw}`, vp)).rows[0];
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
        `SELECT r.id, r.kind, r.label, r.user_id, r.active, r.attributes, r.working_hours, u.full_name AS user_name
         FROM resource r LEFT JOIN app_user u ON u.id = r.user_id WHERE r.id = $1`, [request.params.id]).then((r) => r.rows));
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
          `INSERT INTO resource (tenant_id, kind, label, user_id, attributes, active, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id, kind, label, user_id, active, attributes`,
          [ctx.tenantId, input.kind, input.label, input.userId ?? null, attrs, input.active ?? true, ctx.userId],
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
        const r = await db.query(
          `UPDATE resource SET kind = COALESCE($2, kind), label = COALESCE($3, label),
             user_id = COALESCE($4, user_id), attributes = COALESCE($5, attributes),
             active = COALESCE($6, active), updated_by = $7
           WHERE id = $1 RETURNING id, kind, label, user_id, active, attributes`,
          [request.params.id, input.kind ?? null, input.label ?? null, input.userId ?? null,
           attrs, input.active ?? null, request.ctx.userId],
        );
        return toDto(r.rows[0]);
      }));

  app.delete<{ Params: { id: string } }>('/resources/:id',
    { preHandler: [app.authenticate, requirePermission('resource:delete')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`UPDATE resource SET archived_at = now(), updated_by = $2 WHERE id = $1`, [request.params.id, request.ctx.userId]));
      return reply.code(204).send();
    });
}
