/** resourceExtras.ts — catalogo competenze (skill), competenze per-risorsa
 *  (resource_skill) e certificazioni per-risorsa (resource_certification). Blocco D. */
import type { FastifyInstance } from 'fastify';
import {
  createSkillSchema, updateSkillSchema, createResourceSkillSchema,
  createCertificationSchema, updateCertificationSchema,
  type SkillDto, type ResourceSkillDto, type ResourceCertificationDto,
} from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { logAudit } from '../context/audit.js';

function toSkillDto(r: Record<string, unknown>): SkillDto {
  return {
    id: r.id as string, name: r.name as string,
    category: (r.category as string | null) ?? null, active: r.active as boolean,
    archivedAt: (r.archived_at as Date | null)?.toISOString() ?? null,
    archivedByName: (r.archived_by_name as string) ?? null,
  };
}

const SKILL_SELECT = `SELECT s.id, s.name, s.category, s.active, s.archived_at, au.full_name AS archived_by_name
                      FROM skill s LEFT JOIN app_user au ON au.id = s.archived_by`;

function toResourceSkillDto(r: Record<string, unknown>): ResourceSkillDto {
  return {
    id: r.id as string, resourceId: r.resource_id as string, skillId: r.skill_id as string,
    skillName: (r.skill_name as string | null) ?? null, category: (r.category as string | null) ?? null,
    level: r.level === null || r.level === undefined ? null : Number(r.level),
    note: (r.note as string | null) ?? null,
  };
}

function toCertDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return new Date(v as string).toISOString().slice(0, 10);
}

function toCertificationDto(r: Record<string, unknown>): ResourceCertificationDto {
  const validUntil = toCertDate(r.valid_until);
  let daysToExpiry: number | null = null;
  if (validUntil) {
    const today = new Date().toISOString().slice(0, 10);
    daysToExpiry = Math.ceil((new Date(validUntil).getTime() - new Date(today).getTime()) / 86400000);
  }
  return {
    id: r.id as string, resourceId: r.resource_id as string, name: r.name as string,
    issuer: (r.issuer as string | null) ?? null, certNumber: (r.cert_number as string | null) ?? null,
    validFrom: toCertDate(r.valid_from), validUntil,
    documentObjectKey: (r.document_object_key as string | null) ?? null,
    note: (r.note as string | null) ?? null, daysToExpiry,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string }).code === '23505';
}

export async function resourceExtrasRoutes(app: FastifyInstance): Promise<void> {
  // ── Catalogo competenze del tenant ──────────────────────────────────
  // normali: attive E disattivate, escludendo le archiviate. con ?archived: solo archiviate.
  app.get('/skills', { preHandler: [app.authenticate, requirePermission('resource:read')] },
    async (request) =>
      withRls(request.ctx, (db) => {
        const archivedParam = String((request.query as Record<string, unknown>).archived ?? '');
        const onlyArchived = archivedParam === '1' || archivedParam === 'only' || archivedParam === 'true';
        const where = onlyArchived ? `WHERE s.archived_at IS NOT NULL` : `WHERE s.archived_at IS NULL`;
        return db.query(`${SKILL_SELECT} ${where} ORDER BY s.name`)
          .then((r) => ({ items: r.rows.map(toSkillDto) }));
      }));

  app.post('/skills', { preHandler: [app.authenticate, requirePermission('resource:update')] },
    async (request, reply) => {
      const input = createSkillSchema.parse(request.body);
      try {
        const dto = await withRls(request.ctx, async (db) => {
          const ins = await db.query(
            `INSERT INTO skill (tenant_id, name, category, active)
             VALUES ($1,$2,$3,$4) RETURNING id, name, category, active`,
            [request.ctx.tenantId, input.name, input.category ?? null, input.active ?? true]);
          return toSkillDto(ins.rows[0]);
        });
        return reply.code(201).send(dto);
      } catch (err) {
        if (isUniqueViolation(err)) return reply.code(409).send({ error: 'conflict', message: 'Competenza già esistente', statusCode: 409 });
        throw err;
      }
    });

  app.patch<{ Params: { id: string } }>('/skills/:id',
    { preHandler: [app.authenticate, requirePermission('resource:update')] },
    async (request, reply) => {
      const input = updateSkillSchema.parse(request.body);
      try {
        return await withRls(request.ctx, async (db) => {
          const sets: string[] = []; const vals: unknown[] = [request.params.id];
          const add = (col: string, val: unknown) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
          if (input.name !== undefined) add('name', input.name);
          if (input.category !== undefined) add('category', input.category);
          if (input.active !== undefined) add('active', input.active);
          add('updated_at', new Date().toISOString());
          const r = await db.query(
            `UPDATE skill SET ${sets.join(', ')} WHERE id = $1 RETURNING id, name, category, active`, vals);
          return toSkillDto(r.rows[0]);
        });
      } catch (err) {
        if (isUniqueViolation(err)) return reply.code(409).send({ error: 'conflict', message: 'Competenza già esistente', statusCode: 409 });
        throw err;
      }
    });

  // elimina: ARCHIVIA con controllo d'uso su resource_skill
  app.delete<{ Params: { id: string } }>('/skills/:id',
    { preHandler: [app.authenticate, requirePermission('resource:update')] },
    async (request, reply) => {
      const res = await withRls(request.ctx, async (db) => {
        const r = await db.query(`SELECT name FROM skill WHERE id = $1`, [request.params.id]);
        if (!r.rows.length) return { code: 'notfound' as const };
        const usage = await db.query(`SELECT count(*)::int AS n FROM resource_skill WHERE skill_id = $1`, [request.params.id]);
        const n = (usage.rows[0] as { n: number }).n;
        if (n > 0) return { code: 'used' as const, n };
        await db.query(`UPDATE skill SET archived_at = now(), archived_by = $2, updated_at = now() WHERE id = $1`,
          [request.params.id, request.ctx.userId]);
        await logAudit(db, request.ctx, { entity: 'skill', entityId: request.params.id, action: 'archive', label: r.rows[0].name as string });
        return { code: 'ok' as const };
      });
      if (res.code === 'notfound') return reply.code(404).send({ error: 'not_found', message: 'Competenza non trovata', statusCode: 404 });
      if (res.code === 'used') return reply.code(409).send({ error: 'conflict', message: `Impossibile eliminare: competenza assegnata a ${res.n} risorse`, statusCode: 409 });
      return reply.code(204).send();
    });

  // RIPRISTINA una competenza archiviata
  app.post<{ Params: { id: string } }>('/skills/:id/restore',
    { preHandler: [app.authenticate, requirePermission('resource:update')] },
    async (request, reply) => {
      const dto = await withRls(request.ctx, async (db) => {
        const upd = await db.query(
          `UPDATE skill SET archived_at = NULL, archived_by = NULL, updated_at = now()
           WHERE id = $1 AND archived_at IS NOT NULL RETURNING name`, [request.params.id]);
        if (!upd.rows.length) return null;
        await logAudit(db, request.ctx, { entity: 'skill', entityId: request.params.id, action: 'restore', label: upd.rows[0].name as string });
        const r = await db.query(`${SKILL_SELECT} WHERE s.id = $1`, [request.params.id]);
        return toSkillDto(r.rows[0]);
      });
      if (!dto) return reply.code(404).send({ error: 'not_found', message: 'Competenza non trovata o non archiviata', statusCode: 404 });
      return dto;
    });

  // ELIMINA DEFINITIVAMENTE (solo se archiviata). resource_skill ha FK su skill → 23503 → 409 globale.
  app.delete<{ Params: { id: string } }>('/skills/:id/purge',
    { preHandler: [app.authenticate, requirePermission('resource:update')] },
    async (request, reply) => {
      const res = await withRls(request.ctx, async (db) => {
        const r = await db.query(`SELECT name, archived_at FROM skill WHERE id = $1`, [request.params.id]);
        if (!r.rows.length) return { code: 'notfound' as const };
        if (!r.rows[0].archived_at) return { code: 'notarchived' as const };
        await logAudit(db, request.ctx, { entity: 'skill', entityId: request.params.id, action: 'purge', label: r.rows[0].name as string });
        await db.query(`DELETE FROM skill WHERE id = $1 AND archived_at IS NOT NULL`, [request.params.id]);
        return { code: 'ok' as const };
      });
      if (res.code === 'notfound') return reply.code(404).send({ error: 'not_found', message: 'Competenza non trovata', statusCode: 404 });
      if (res.code === 'notarchived') return reply.code(409).send({ error: 'conflict', message: 'Si elimina definitivamente solo un record archiviato', statusCode: 409 });
      return reply.code(204).send();
    });

  // ── Competenze per-risorsa (resource_skill) ─────────────────────────
  app.get<{ Params: { id: string } }>('/resources/:id/skills',
    { preHandler: [app.authenticate, requirePermission('resource:read')] },
    async (request) =>
      withRls(request.ctx, (db) => db.query(
        `SELECT rs.id, rs.resource_id, rs.skill_id, rs.level, rs.note,
                s.name AS skill_name, s.category
         FROM resource_skill rs JOIN skill s ON s.id = rs.skill_id
         WHERE rs.resource_id = $1 ORDER BY s.name`, [request.params.id])
        .then((r) => ({ items: r.rows.map(toResourceSkillDto) }))));

  app.post<{ Params: { id: string } }>('/resources/:id/skills',
    { preHandler: [app.authenticate, requirePermission('resource:update')] },
    async (request, reply) => {
      const input = createResourceSkillSchema.parse(request.body);
      try {
        const dto = await withRls(request.ctx, async (db) => {
          const ins = await db.query(
            `INSERT INTO resource_skill (tenant_id, resource_id, skill_id, level, note)
             VALUES ($1,$2,$3,$4,$5) RETURNING id, resource_id, skill_id, level, note`,
            [request.ctx.tenantId, request.params.id, input.skillId, input.level ?? null, input.note ?? null]);
          const row = ins.rows[0] as Record<string, unknown>;
          const s = await db.query(`SELECT name AS skill_name, category FROM skill WHERE id = $1`, [input.skillId]);
          return toResourceSkillDto({ ...row, ...(s.rows[0] as Record<string, unknown>) });
        });
        return reply.code(201).send(dto);
      } catch (err) {
        if (isUniqueViolation(err)) return reply.code(409).send({ error: 'conflict', message: 'Competenza già assegnata', statusCode: 409 });
        throw err;
      }
    });

  app.delete<{ Params: { id: string; rsId: string } }>('/resources/:id/skills/:rsId',
    { preHandler: [app.authenticate, requirePermission('resource:update')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(
        `DELETE FROM resource_skill WHERE id = $1 AND resource_id = $2`, [request.params.rsId, request.params.id]));
      return reply.code(204).send();
    });

  // ── Certificazioni per-risorsa (resource_certification) ─────────────
  app.get<{ Params: { id: string } }>('/resources/:id/certifications',
    { preHandler: [app.authenticate, requirePermission('resource:read')] },
    async (request) =>
      withRls(request.ctx, (db) => db.query(
        `SELECT id, resource_id, name, issuer, cert_number, valid_from, valid_until, document_object_key, note
         FROM resource_certification WHERE resource_id = $1 ORDER BY valid_until ASC NULLS LAST`, [request.params.id])
        .then((r) => ({ items: r.rows.map(toCertificationDto) }))));

  app.post<{ Params: { id: string } }>('/resources/:id/certifications',
    { preHandler: [app.authenticate, requirePermission('resource:update')] },
    async (request, reply) => {
      const input = createCertificationSchema.parse(request.body);
      const ctx = request.ctx;
      const dto = await withRls(ctx, async (db) => {
        const ins = await db.query(
          `INSERT INTO resource_certification
             (tenant_id, resource_id, name, issuer, cert_number, valid_from, valid_until, document_object_key, note, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
           RETURNING id, resource_id, name, issuer, cert_number, valid_from, valid_until, document_object_key, note`,
          [ctx.tenantId, request.params.id, input.name, input.issuer ?? null, input.certNumber ?? null,
           input.validFrom ?? null, input.validUntil ?? null, input.documentObjectKey ?? null, input.note ?? null, ctx.userId]);
        return toCertificationDto(ins.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  app.patch<{ Params: { cid: string } }>('/resource-certifications/:cid',
    { preHandler: [app.authenticate, requirePermission('resource:update')] },
    async (request) =>
      withRls(request.ctx, async (db) => {
        const input = updateCertificationSchema.parse(request.body);
        const sets: string[] = []; const vals: unknown[] = [request.params.cid];
        const add = (col: string, val: unknown) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
        if (input.name !== undefined) add('name', input.name);
        if (input.issuer !== undefined) add('issuer', input.issuer);
        if (input.certNumber !== undefined) add('cert_number', input.certNumber);
        if (input.validFrom !== undefined) add('valid_from', input.validFrom);
        if (input.validUntil !== undefined) add('valid_until', input.validUntil);
        if (input.documentObjectKey !== undefined) add('document_object_key', input.documentObjectKey);
        if (input.note !== undefined) add('note', input.note);
        add('updated_by', request.ctx.userId);
        add('updated_at', new Date().toISOString());
        const r = await db.query(
          `UPDATE resource_certification SET ${sets.join(', ')} WHERE id = $1
           RETURNING id, resource_id, name, issuer, cert_number, valid_from, valid_until, document_object_key, note`, vals);
        return toCertificationDto(r.rows[0]);
      }));

  app.delete<{ Params: { cid: string } }>('/resource-certifications/:cid',
    { preHandler: [app.authenticate, requirePermission('resource:update')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(
        `DELETE FROM resource_certification WHERE id = $1`, [request.params.cid]));
      return reply.code(204).send();
    });
}
