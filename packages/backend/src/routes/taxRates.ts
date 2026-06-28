/** taxRates.ts — Catalogo imposte country-scoped (brief Blocco A.2). Le righe di
 *  sistema (tenant_id IS NULL) sono visibili a tutti ma immutabili dal tenant; un
 *  tenant può creare/modificare/eliminare SOLO le proprie righe. RLS a DB esclude
 *  già le righe di sistema da UPDATE/DELETE (tenant_id NULL ≠ current_tenant). */
import type { FastifyInstance } from 'fastify';
import { createTaxRateSchema, updateTaxRateSchema, type TaxRateDto } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { logAudit } from '../context/audit.js';

function toDto(r: Record<string, unknown>): TaxRateDto {
  return {
    id: r.id as string,
    tenantId: (r.tenant_id as string) ?? null,
    country: r.country as string,
    code: r.code as string,
    label: r.label as string,
    percent: Number(r.percent),
    isDefault: (r.is_default as boolean) ?? false,
    active: (r.active as boolean) ?? false,
    isSystem: r.tenant_id == null,
    archivedAt: (r.archived_at as Date | null)?.toISOString() ?? null,
    archivedByName: (r.archived_by_name as string) ?? null,
  };
}

export async function taxRateRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { country?: string } }>('/tax-rates',
    { preHandler: [app.authenticate, requirePermission('material:read')] }, async (request) =>
      withRls(request.ctx, async (db) => {
        const archivedParam = String((request.query as Record<string, unknown>).archived ?? '');
        const onlyArchived = archivedParam === '1' || archivedParam === 'only' || archivedParam === 'true';
        const params: unknown[] = [request.ctx.tenantId];
        let where = onlyArchived
          ? `WHERE t.tenant_id = $1 AND t.archived_at IS NOT NULL`
          : `WHERE t.active AND t.archived_at IS NULL AND (t.tenant_id IS NULL OR t.tenant_id = $1)`;
        if (request.query.country) { params.push(request.query.country); where += ` AND t.country = $${params.length}`; }
        const rows = await db.query(
          `SELECT t.id, t.tenant_id, t.country, t.code, t.label, t.percent, t.is_default, t.active,
                  t.archived_at, au.full_name AS archived_by_name
           FROM tax_rate t LEFT JOIN app_user au ON au.id = t.archived_by ${where} ORDER BY t.country, t.percent`, params);
        return { items: rows.rows.map(toDto) };
      }));

  app.post('/tax-rates', { preHandler: [app.authenticate, requirePermission('settings:manage')] },
    async (request, reply) => {
      const input = createTaxRateSchema.parse(request.body);
      const ctx = request.ctx;
      const out = await withRls(ctx, async (db) => {
        // anti-duplicato: codice già esistente nel paese (incluse le righe di sistema)
        const dup = await db.query(
          `SELECT 1 FROM tax_rate WHERE country = $1 AND lower(code) = lower($2)
             AND (tenant_id IS NULL OR tenant_id = $3) LIMIT 1`,
          [input.country, input.code, ctx.tenantId]);
        if (dup.rows.length) return { dup: true as const };
        const r = await db.query(
          `INSERT INTO tax_rate (tenant_id, country, code, label, percent, is_default, active)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id, tenant_id, country, code, label, percent, is_default, active`,
          [ctx.tenantId, input.country, input.code, input.label, input.percent, input.isDefault ?? false, input.active ?? true]);
        return { dup: false as const, dto: toDto(r.rows[0]) };
      });
      if (out.dup) return reply.code(409).send({ error: 'conflict', message: `Esiste già un'aliquota IVA con codice «${input.code}» per ${input.country}.`, statusCode: 409 });
      return reply.code(201).send(out.dto);
    });

  app.patch<{ Params: { id: string } }>('/tax-rates/:id',
    { preHandler: [app.authenticate, requirePermission('settings:manage')] },
    async (request, reply) => withRls(request.ctx, async (db) => {
      const input = updateTaxRateSchema.parse(request.body);
      // anti-duplicato sistema-aware se cambiano country/code
      if (input.code !== undefined || input.country !== undefined) {
        const cur = await db.query(`SELECT country, code FROM tax_rate WHERE id = $1`, [request.params.id]);
        if (cur.rows.length) {
          const country = input.country ?? (cur.rows[0].country as string);
          const code = input.code ?? (cur.rows[0].code as string);
          const dup = await db.query(
            `SELECT 1 FROM tax_rate WHERE country = $1 AND lower(code) = lower($2)
               AND (tenant_id IS NULL OR tenant_id = $3) AND id <> $4 LIMIT 1`,
            [country, code, request.ctx.tenantId, request.params.id]);
          if (dup.rows.length) return reply.code(409).send({ error: 'conflict', message: `Esiste già un'aliquota IVA con codice «${code}» per ${country}.`, statusCode: 409 });
        }
      }
      const sets: string[] = []; const vals: unknown[] = [request.params.id];
      const add = (col: string, val: unknown) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
      if (input.country !== undefined) add('country', input.country);
      if (input.code !== undefined) add('code', input.code);
      if (input.label !== undefined) add('label', input.label);
      if (input.percent !== undefined) add('percent', input.percent);
      if (input.isDefault !== undefined) add('is_default', input.isDefault);
      if (input.active !== undefined) add('active', input.active);
      if (sets.length === 0) {
        const cur = await db.query(
          `SELECT id, tenant_id, country, code, label, percent, is_default, active FROM tax_rate WHERE id = $1`,
          [request.params.id]);
        return toDto(cur.rows[0]);
      }
      const r = await db.query(
        `UPDATE tax_rate SET ${sets.join(', ')} WHERE id = $1
         RETURNING id, tenant_id, country, code, label, percent, is_default, active`, vals);
      return toDto(r.rows[0]);
    }));

  // elimina: ARCHIVIA (solo righe del tenant) con controllo d'uso su material.tax_rate_id
  app.delete<{ Params: { id: string } }>('/tax-rates/:id',
    { preHandler: [app.authenticate, requirePermission('settings:manage')] },
    async (request, reply) => {
      const res = await withRls(request.ctx, async (db) => {
        const r = await db.query(`SELECT code FROM tax_rate WHERE id = $1 AND tenant_id = $2`,
          [request.params.id, request.ctx.tenantId]);
        if (!r.rows.length) return { code: 'notfound' as const };
        const usage = await db.query(
          `SELECT count(*)::int AS n FROM material WHERE tenant_id = $1 AND tax_rate_id = $2 AND archived_at IS NULL`,
          [request.ctx.tenantId, request.params.id]);
        const n = (usage.rows[0] as { n: number }).n;
        if (n > 0) return { code: 'used' as const, n };
        await db.query(`UPDATE tax_rate SET archived_at = now(), archived_by = $3 WHERE id = $1 AND tenant_id = $2`,
          [request.params.id, request.ctx.tenantId, request.ctx.userId]);
        await logAudit(db, request.ctx, { entity: 'tax_rate', entityId: request.params.id, action: 'archive', label: r.rows[0].code as string });
        return { code: 'ok' as const };
      });
      if (res.code === 'notfound') return reply.code(404).send({ error: 'not_found', message: 'Aliquota non trovata o di sistema', statusCode: 404 });
      if (res.code === 'used') return reply.code(409).send({ error: 'conflict', message: `Impossibile eliminare: usata in ${res.n} articoli`, statusCode: 409 });
      return reply.code(204).send();
    });

  // RIPRISTINA un'aliquota archiviata (solo righe del tenant)
  app.post<{ Params: { id: string } }>('/tax-rates/:id/restore',
    { preHandler: [app.authenticate, requirePermission('settings:manage')] },
    async (request, reply) => {
      const dto = await withRls(request.ctx, async (db) => {
        const upd = await db.query(
          `UPDATE tax_rate SET archived_at = NULL, archived_by = NULL
           WHERE id = $1 AND tenant_id = $2 AND archived_at IS NOT NULL RETURNING code`,
          [request.params.id, request.ctx.tenantId]);
        if (!upd.rows.length) return null;
        await logAudit(db, request.ctx, { entity: 'tax_rate', entityId: request.params.id, action: 'restore', label: upd.rows[0].code as string });
        const r = await db.query(
          `SELECT t.id, t.tenant_id, t.country, t.code, t.label, t.percent, t.is_default, t.active,
                  t.archived_at, au.full_name AS archived_by_name
           FROM tax_rate t LEFT JOIN app_user au ON au.id = t.archived_by WHERE t.id = $1`, [request.params.id]);
        return toDto(r.rows[0]);
      });
      if (!dto) return reply.code(404).send({ error: 'not_found', message: 'Aliquota non trovata, di sistema o non archiviata', statusCode: 404 });
      return dto;
    });

  // ELIMINA DEFINITIVAMENTE (solo se archiviata e del tenant). FK material.tax_rate_id → 23503 → 409 globale.
  app.delete<{ Params: { id: string } }>('/tax-rates/:id/purge',
    { preHandler: [app.authenticate, requirePermission('settings:manage')] },
    async (request, reply) => {
      const res = await withRls(request.ctx, async (db) => {
        const r = await db.query(`SELECT code, archived_at FROM tax_rate WHERE id = $1 AND tenant_id = $2`,
          [request.params.id, request.ctx.tenantId]);
        if (!r.rows.length) return { code: 'notfound' as const };
        if (!r.rows[0].archived_at) return { code: 'notarchived' as const };
        await logAudit(db, request.ctx, { entity: 'tax_rate', entityId: request.params.id, action: 'purge', label: r.rows[0].code as string });
        await db.query(`DELETE FROM tax_rate WHERE id = $1 AND tenant_id = $2 AND archived_at IS NOT NULL`,
          [request.params.id, request.ctx.tenantId]);
        return { code: 'ok' as const };
      });
      if (res.code === 'notfound') return reply.code(404).send({ error: 'not_found', message: 'Aliquota non trovata o di sistema', statusCode: 404 });
      if (res.code === 'notarchived') return reply.code(409).send({ error: 'conflict', message: 'Si elimina definitivamente solo un record archiviato', statusCode: 409 });
      return reply.code(204).send();
    });
}
