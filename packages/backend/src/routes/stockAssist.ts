/** stockAssist.ts — WMS Fase D: ASSISTENTE documenti di magazzino.
 *  L'utente scrive in linguaggio naturale (es. «trasferisci 10 ONT da Scaffale A
 *  al furgone di Ahmed») → l'AI estrae l'INTENTO strutturato → un resolver
 *  DETERMINISTICO (sotto RLS) lo aggancia ad articoli/ubicazioni reali del tenant
 *  e propone una BOZZA di documento (non salvata: l'utente rivede e conferma).
 *  «L'AI propone, il deterministico conferma» (G-4). Nessun PII nei log. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import type { PoolClient } from '../db/pool.js';
import { config, aiEnabled } from '../config.js';
import { anthropic } from '../ai/client.js';

const assistSchema = z.object({ text: z.string().min(1).max(1000) });

interface Intent {
  type?: string; supplierHint?: string | null;
  headerSourceHint?: string | null; headerDestHint?: string | null;
  lines?: { materialHint?: string; quantity?: number; unit?: string | null; sourceHint?: string | null; destHint?: string | null }[];
}

export async function stockAssistRoutes(app: FastifyInstance): Promise<void> {
  app.post('/ai/stock-document', { preHandler: [app.authenticate, requirePermission('stock:manage')] },
    async (request, reply) => {
      const { text } = assistSchema.parse(request.body);
      if (!aiEnabled()) return reply.code(503).send({ error: 'ai_disabled', message: 'Assistente AI non attivo (manca ANTHROPIC_API_KEY nel server).', statusCode: 503 });

      const sys =
        `Sei un assistente di MAGAZZINO in un gestionale (lingua: italiano). L'utente descrive ` +
        `un movimento di merce. Estrai l'INTENTO e restituisci SOLO JSON valido, senza commento: ` +
        `{"type":"receipt|transfer|adjustment","supplierHint":<stringa|null>,` +
        `"headerSourceHint":<stringa|null>,"headerDestHint":<stringa|null>,` +
        `"lines":[{"materialHint":"nome articolo","quantity":<numero>,"unit":<stringa|null>,"sourceHint":<stringa|null>,"destHint":<stringa|null>}]}. ` +
        `type: "receipt" = carico/ricevimento da fornitore; "transfer" = trasferimento/spostamento tra ubicazioni; ` +
        `"adjustment" = rettifica/inventario/conteggio. ` +
        `materialHint = il nome dell'articolo come lo dice l'utente (non inventare codici). ` +
        `sourceHint/destHint = ubicazione da cui prelevare / in cui versare (nome scaffale, bin, magazzino, furgone…), ` +
        `a livello di riga se l'utente lo specifica per articolo, altrimenti su headerSourceHint/headerDestHint. ` +
        `Non inventare quantità: se manca metti 1. Rispondi con JSON e nient'altro.`;

      let intent: Intent;
      try {
        const msg = await anthropic().messages.create({
          model: config.ai.extractionModel, max_tokens: 1200, system: sys,
          messages: [{ role: 'user', content: text }],
        });
        const t = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
        intent = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)) as Intent;
      } catch {
        return reply.code(422).send({ error: 'ai_parse', message: 'Non ho capito la richiesta. Prova con qualcosa come «trasferisci 10 ONT da Scaffale A al Furgone Ahmed».', statusCode: 422 });
      }

      return withRls(request.ctx, async (db: PoolClient) => {
        const warnings: string[] = [];
        const type = (['receipt', 'transfer', 'adjustment'] as const).includes(intent.type as never) ? intent.type as 'receipt' | 'transfer' | 'adjustment' : 'transfer';

        // resolver ubicazione: nome/codice/catena. Preferisce match esatto sul nome, poi il più corto.
        const resolveLoc = async (hint?: string | null) => {
          const h = hint?.trim();
          if (!h) return null;
          const r = await db.query(
            `SELECT id, public.stock_location_path(id) AS path FROM stock_location
             WHERE archived_at IS NULL
               AND (name ILIKE $1 OR code ILIKE $1 OR public.stock_location_path(id) ILIKE $1)
             ORDER BY (name ILIKE $2) DESC, length(name) ASC LIMIT 1`, [`%${h}%`, h]);
          return r.rows[0] ? { id: r.rows[0].id as string, path: r.rows[0].path as string } : null;
        };
        // resolver articolo: nome/SKU
        const resolveMat = async (hint?: string | null) => {
          const h = hint?.trim();
          if (!h) return null;
          const r = await db.query(
            `SELECT m.id, m.name, u.code AS unit FROM material m LEFT JOIN unit_of_measure u ON u.id = m.unit_id
             WHERE m.archived_at IS NULL AND (m.name ILIKE $1 OR m.sku ILIKE $1)
             ORDER BY (m.name ILIKE $2) DESC, length(m.name) ASC LIMIT 1`, [`%${h}%`, h]);
          return r.rows[0] ? { id: r.rows[0].id as string, name: r.rows[0].name as string, unit: (r.rows[0].unit as string) ?? null } : null;
        };
        const resolveSupplier = async (hint?: string | null) => {
          const h = hint?.trim();
          if (!h) return null;
          const r = await db.query(
            `SELECT id, display_name FROM company WHERE archived_at IS NULL AND display_name ILIKE $1
             ORDER BY (display_name ILIKE $2) DESC, length(display_name) ASC LIMIT 1`, [`%${h}%`, h]);
          return r.rows[0] ? { id: r.rows[0].id as string, name: r.rows[0].display_name as string } : null;
        };

        const supplier = type === 'receipt' ? await resolveSupplier(intent.supplierHint) : null;
        if (type === 'receipt' && intent.supplierHint && !supplier) warnings.push(`Fornitore non trovato: «${intent.supplierHint}»`);
        const hSource = await resolveLoc(intent.headerSourceHint);
        const hDest = await resolveLoc(intent.headerDestHint);

        const lines: Record<string, unknown>[] = [];
        for (const l of intent.lines ?? []) {
          const mat = await resolveMat(l.materialHint);
          if (!mat) { if (l.materialHint) warnings.push(`Articolo non trovato: «${l.materialHint}»`); continue; }
          const src = await resolveLoc(l.sourceHint);
          const dst = await resolveLoc(l.destHint);
          if (l.sourceHint && !src) warnings.push(`Ubicazione origine non trovata: «${l.sourceHint}» (per ${mat.name})`);
          if (l.destHint && !dst) warnings.push(`Ubicazione destinazione non trovata: «${l.destHint}» (per ${mat.name})`);
          lines.push({
            materialId: mat.id, materialName: mat.name, quantity: Number(l.quantity) > 0 ? Number(l.quantity) : 1, unit: l.unit || mat.unit || 'pz',
            sourceLocationId: src?.id ?? null, sourceLocationPath: src?.path ?? null,
            destLocationId: dst?.id ?? null, destLocationPath: dst?.path ?? null,
          });
        }
        if (!lines.length) warnings.push('Nessun articolo riconosciuto: controlla i nomi degli articoli.');

        return {
          typeCode: type,
          supplierId: supplier?.id ?? null, supplierName: supplier?.name ?? null,
          sourceLocationId: hSource?.id ?? null, sourceLocationName: hSource?.path ?? null,
          destLocationId: hDest?.id ?? null, destLocationName: hDest?.path ?? null,
          lines, warnings,
        };
      });
    });
}
