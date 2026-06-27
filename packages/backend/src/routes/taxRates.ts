/** taxRates.ts — Catalogo imposte country-scoped (brief Blocco A.2). Le righe di
 *  sistema (tenant_id IS NULL) sono visibili a tutti ma immutabili dal tenant; un
 *  tenant può creare/modificare/eliminare SOLO le proprie righe. RLS a DB esclude
 *  già le righe di sistema da UPDATE/DELETE (tenant_id NULL ≠ current_tenant). */
import type { FastifyInstance } from 'fastify';
import { createTaxRateSchema, updateTaxRateSchema, type TaxRateDto } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';

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
  };
}

export async function taxRateRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { country?: string } }>('/tax-rates',
    { preHandler: [app.authenticate, requirePermission('material:read')] }, async (request) =>
      withRls(request.ctx, async (db) => {
        const params: unknown[] = [];
        let where = `WHERE active AND (tenant_id IS NULL OR tenant_id = $1)`;
        params.push(request.ctx.tenantId);
        if (request.query.country) { params.push(request.query.country); where += ` AND country = $${params.length}`; }
        const rows = await db.query(
          `SELECT id, tenant_id, country, code, label, percent, is_default, active
           FROM tax_rate ${where} ORDER BY country, percent`, params);
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

  app.delete<{ Params: { id: string } }>('/tax-rates/:id',
    { preHandler: [app.authenticate, requirePermission('settings:manage')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`DELETE FROM tax_rate WHERE id = $1`, [request.params.id]));
      return reply.code(204).send();
    });
}
