/** lookups.ts — stati/etichette/priorità configurabili (lookup_value).
 *  GET pubblici (per i select del frontend) + CRUD admin (settings:manage).
 *  Le righe di SISTEMA (tenant_id NULL) sono in sola lettura: la RLS
 *  (lv_modify) impedisce update/delete su di esse — qui restituiamo 404. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createLookupSchema, updateLookupSchema, type LookupDto,
} from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';

const COLS = `id, category, canonical, code, label, abbreviation, color_token, sequence, is_default, tenant_id`;

// SELECT con OVERLAY dell'override del tenant: le righe di SISTEMA mostrano
// nome/sigla/colore/ordine personalizzati dal tenant, senza toccare la riga
// condivisa. `is_customized` = esiste un override attivo.
const EFFECTIVE = `
  SELECT lv.id, lv.category, lv.canonical, lv.code,
         COALESCE(lo.label, lv.label) AS label,
         COALESCE(lo.abbreviation, lv.abbreviation) AS abbreviation,
         COALESCE(lo.color_token, lv.color_token) AS color_token,
         COALESCE(lo.sequence, lv.sequence) AS sequence,
         lv.is_default, lv.tenant_id, (lo.id IS NOT NULL) AS is_customized
  FROM lookup_value lv
  LEFT JOIN lookup_override lo ON lo.lookup_id = lv.id AND lo.tenant_id = app_current_tenant()`;

function mapLookup(r: Record<string, unknown>): LookupDto {
  return {
    id: r.id as string,
    category: r.category as string,
    canonical: r.canonical as string,
    code: r.code as string,
    label: (r.label as Record<string, string>) ?? {},
    abbreviation: (r.abbreviation as string) ?? null,
    colorToken: (r.color_token as string) ?? null,
    sequence: (r.sequence as number) ?? 0,
    isDefault: (r.is_default as boolean) ?? false,
    isSystem: r.tenant_id == null,
    isCustomized: (r.is_customized as boolean) ?? false,
  };
}

/** Lista admin: ricerca/ordina/pagina (default limit alto: serve anche ai select). */
const lookupListQuery = z.object({
  q: z.string().trim().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});
const SORTABLE: Record<string, string> = { category: 'category', code: 'code', sequence: 'sequence' };

export async function lookupRoutes(app: FastifyInstance): Promise<void> {
  // LISTA (usata sia dai select del frontend sia dalla pagina admin)
  app.get('/lookups', { preHandler: [app.authenticate] }, async (request) => {
    const qp = lookupListQuery.parse(request.query);
    const sortCol = SORTABLE[qp.sortBy ?? ''] ?? 'category';
    return withRls(request.ctx, async (db) => {
      const params: unknown[] = [];
      let where = `WHERE lv.active`;
      if (qp.q) {
        params.push(`%${qp.q}%`);
        where += ` AND (lv.category ILIKE $${params.length} OR lv.code ILIKE $${params.length} OR lv.label::text ILIKE $${params.length})`;
      }
      const total = await db.query(`SELECT count(*)::int AS n FROM lookup_value lv ${where}`, params);
      params.push(qp.limit, qp.offset);
      const rows = await db.query(
        `${EFFECTIVE} ${where}
         ORDER BY ${sortCol === 'sequence' ? 'sequence' : `lv.${sortCol}`} ${qp.sortDir}, sequence LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      return { items: rows.rows.map(mapLookup), total: total.rows[0].n as number, limit: qp.limit, offset: qp.offset };
    });
  });

  app.get<{ Params: { category: string } }>(
    '/lookups/:category',
    { preHandler: [app.authenticate] },
    async (request) => {
      const rows = await withRls(request.ctx, (db) =>
        db.query(
          `${EFFECTIVE} WHERE lv.active AND lv.category = $1 ORDER BY sequence`,
          [request.params.category],
        ).then((r) => r.rows),
      );
      return { items: rows.map(mapLookup) };
    },
  );

  // CREA (etichetta custom del tenant su uno stato canonico esistente)
  app.post('/lookups', { preHandler: [app.authenticate, requirePermission('settings:manage')] },
    async (request, reply) => {
      const input = createLookupSchema.parse(request.body);
      const ctx = request.ctx;
      const dto = await withRls(ctx, async (db) => {
        const ins = await db.query(
          `INSERT INTO lookup_value
             (tenant_id, category, canonical, code, label, abbreviation, color_token, sequence, is_default)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING ${COLS}`,
          [ctx.tenantId, input.category, input.canonical, input.code, JSON.stringify(input.label),
           input.abbreviation ?? null, input.colorToken ?? null, input.sequence ?? 0, input.isDefault ?? false],
        );
        return mapLookup(ins.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  // MODIFICA (solo righe del tenant: la RLS esclude quelle di sistema)
  app.patch<{ Params: { id: string } }>('/lookups/:id',
    { preHandler: [app.authenticate, requirePermission('settings:manage')] },
    async (request, reply) => {
      const input = updateLookupSchema.parse(request.body);
      const out = await withRls(request.ctx, async (db) => {
        const r = await db.query(
          `UPDATE lookup_value SET
             label = COALESCE($2, label),
             abbreviation = COALESCE($3, abbreviation),
             color_token = COALESCE($4, color_token),
             sequence = COALESCE($5, sequence),
             is_default = COALESCE($6, is_default)
           WHERE id = $1 AND tenant_id = $7
           RETURNING ${COLS}`,
          [request.params.id, input.label ? JSON.stringify(input.label) : null,
           input.abbreviation ?? null, input.colorToken ?? null,
           input.sequence ?? null, input.isDefault ?? null, request.ctx.tenantId],
        );
        return r.rows.length ? mapLookup(r.rows[0]) : null;
      });
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Etichetta non trovata o di sistema (non modificabile)', statusCode: 404 });
      return out;
    });

  // ELIMINA (soft: active=false; solo righe del tenant)
  app.delete<{ Params: { id: string } }>('/lookups/:id',
    { preHandler: [app.authenticate, requirePermission('settings:manage')] },
    async (request, reply) => {
      const ok = await withRls(request.ctx, async (db) => {
        const r = await db.query(
          `UPDATE lookup_value SET active = false WHERE id = $1 AND tenant_id = $2 RETURNING id`,
          [request.params.id, request.ctx.tenantId],
        );
        return r.rows.length > 0;
      });
      if (!ok) return reply.code(404).send({ error: 'not_found', message: 'Etichetta non trovata o di sistema', statusCode: 404 });
      return reply.code(204).send();
    });

  // PERSONALIZZA una voce di SISTEMA (override per-tenant di nome/sigla/colore/ordine).
  // La riga di sistema condivisa NON viene toccata; il record continua a referenziarla.
  app.put<{ Params: { id: string } }>('/lookups/:id/override',
    { preHandler: [app.authenticate, requirePermission('settings:manage')] },
    async (request, reply) => {
      const input = updateLookupSchema.parse(request.body);
      const out = await withRls(request.ctx, async (db) => {
        // la voce deve esistere ed essere visibile (sistema o del tenant)
        const lv = await db.query(`SELECT id FROM lookup_value WHERE id = $1 AND active`, [request.params.id]);
        if (!lv.rows.length) return null;
        await db.query(
          `INSERT INTO lookup_override (tenant_id, lookup_id, label, abbreviation, color_token, sequence)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (tenant_id, lookup_id) DO UPDATE SET
             label = EXCLUDED.label, abbreviation = EXCLUDED.abbreviation,
             color_token = EXCLUDED.color_token, sequence = EXCLUDED.sequence, updated_at = now()`,
          [request.ctx.tenantId, request.params.id, input.label ? JSON.stringify(input.label) : null,
           input.abbreviation ?? null, input.colorToken ?? null, input.sequence ?? null],
        );
        const r = await db.query(`${EFFECTIVE} WHERE lv.id = $1`, [request.params.id]);
        return r.rows.length ? mapLookup(r.rows[0]) : null;
      });
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Voce non trovata', statusCode: 404 });
      return out;
    });

  // RIPRISTINA il default di sistema (elimina l'override del tenant).
  app.delete<{ Params: { id: string } }>('/lookups/:id/override',
    { preHandler: [app.authenticate, requirePermission('settings:manage')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) =>
        db.query(`DELETE FROM lookup_override WHERE lookup_id = $1 AND tenant_id = $2`,
          [request.params.id, request.ctx.tenantId]));
      return reply.code(204).send();
    });
}
