/** listFilter.ts — FILTRO AI delle liste (standard): traduce il linguaggio naturale
 *  (anche dettato a voce) in CONDIZIONI strutturate sui campi della lista, e gestisce
 *  i SET di filtri salvati per-utente (filter_preset). Nessun PII nei log.
 *  L'applicazione del filtro avviene client-side sulle colonne (label localizzate). */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withRls } from '../context/rls.js';
import { config, aiEnabled } from '../config.js';
import { anthropic } from '../ai/client.js';

const OPS = ['contains', 'equals', 'not_equals', 'empty', 'not_empty', 'gt', 'gte', 'lt', 'lte', 'is_true', 'is_false'] as const;

const translateSchema = z.object({
  entity: z.string().min(1).max(60),
  query: z.string().min(1).max(500),
  fields: z.array(z.object({ key: z.string(), label: z.string(), type: z.enum(['text', 'number', 'date', 'boolean']).optional() })).min(1).max(60),
});

interface Cond { field: string; op: string; value: string | number | boolean | null }

/** fallback deterministico senza AI: cerca il testo su tutti i campi. */
function fallback(query: string): { description: string; conditions: Cond[] } {
  return { description: `Contiene «${query}»`, conditions: [{ field: '__any', op: 'contains', value: query }] };
}

export async function listFilterRoutes(app: FastifyInstance): Promise<void> {
  // ── Traduzione NL → condizioni ──────────────────────────────────────
  app.post('/ai/list-filter', { preHandler: [app.authenticate] }, async (request) => {
    const input = translateSchema.parse(request.body);
    if (!aiEnabled()) return fallback(input.query);
    const sys =
      `Sei un traduttore di FILTRI per liste in un gestionale (lingua: italiano). ` +
      `Dato un testo dell'utente e i CAMPI disponibili, restituisci SOLO JSON valido: ` +
      `{"description":"breve riassunto del filtro","conditions":[{"field":"<key>","op":"<op>","value":<stringa|numero|booleano|null>}]}. ` +
      `Operatori ammessi: ${OPS.join(', ')}. Usa SOLO le key dei campi forniti. ` +
      `Per "senza X"/"vuoto" usa empty (value null); per "con X"/"valorizzato" usa not_empty. ` +
      `Per testo usa contains; per uguaglianza esatta equals. Numeri: gt/gte/lt/lte. ` +
      `Se un concetto non mappa su nessun campo, ignoralo. Non inventare campi.`;
    const fieldsDesc = input.fields.map((f) => `${f.key} (${f.label}${f.type ? ', ' + f.type : ''})`).join('; ');
    try {
      const msg = await anthropic().messages.create({
        model: config.ai.extractionModel, max_tokens: 600,
        system: sys,
        messages: [{ role: 'user', content: `CAMPI: ${fieldsDesc}\nTESTO: ${input.query}` }],
      });
      const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
      const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
      const parsed = JSON.parse(json) as { description?: string; conditions?: Cond[] };
      const keys = new Set(input.fields.map((f) => f.key));
      const conditions = (parsed.conditions ?? []).filter((c) => c && (c.field === '__any' || keys.has(c.field)) && (OPS as readonly string[]).includes(c.op));
      if (!conditions.length) return fallback(input.query);
      return { description: parsed.description ?? input.query, conditions };
    } catch {
      return fallback(input.query);
    }
  });

  // ── Set di filtri salvati per-utente ────────────────────────────────
  const toDto = (r: Record<string, unknown>) => ({
    id: r.id as string, entity: r.entity as string, name: r.name as string,
    payload: r.payload as { query?: string; conditions: Cond[] }, createdAt: r.created_at as string,
  });

  app.get<{ Querystring: { entity?: string } }>('/filter-presets', { preHandler: [app.authenticate] }, async (request) => {
    const entity = request.query.entity;
    return withRls(request.ctx, async (db) => {
      const r = await db.query(
        `SELECT id, entity, name, payload, created_at FROM filter_preset
         WHERE user_id = $1 ${entity ? 'AND entity = $2' : ''} ORDER BY name`,
        entity ? [request.ctx.userId, entity] : [request.ctx.userId]);
      return { items: (r.rows as Record<string, unknown>[]).map(toDto) };
    });
  });

  const upsert = z.object({ entity: z.string().min(1).max(60), name: z.string().min(1).max(80), payload: z.object({ query: z.string().optional(), conditions: z.array(z.any()) }) });
  app.post('/filter-presets', { preHandler: [app.authenticate] }, async (request, reply) => {
    const input = upsert.parse(request.body);
    const dto = await withRls(request.ctx, async (db) => {
      const r = await db.query(
        `INSERT INTO filter_preset (tenant_id, user_id, entity, name, payload)
         VALUES ($1,$2,$3,$4,$5::jsonb)
         ON CONFLICT (tenant_id, user_id, entity, name) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
         RETURNING id, entity, name, payload, created_at`,
        [request.ctx.tenantId, request.ctx.userId, input.entity, input.name, JSON.stringify(input.payload)]);
      return toDto(r.rows[0]);
    });
    return reply.code(201).send(dto);
  });

  app.delete<{ Params: { id: string } }>('/filter-presets/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    await withRls(request.ctx, (db) => db.query(`DELETE FROM filter_preset WHERE id = $1 AND user_id = $2`, [request.params.id, request.ctx.userId]));
    return reply.code(204).send();
  });
}
