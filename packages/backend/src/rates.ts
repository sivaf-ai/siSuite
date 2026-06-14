/**
 * rates.ts — risoluzione tariffe/costo per una riga ore (§4.2).
 * Scelta utente (2026-06-15): LISTINO dedicato `rate_card` CON fallback al
 * Minimo. La tariffa risolta si FOTOGRAFA in time_entry alla registrazione.
 *
 * Ordine:
 *   1) rate_card: riga più specifica (commessa > risorsa > tipologia) e valida
 *      alla data. Per ciascun campo (cost/bill/currency) si usa il valore del
 *      listino se presente, altrimenti la catena Minimo.
 *   2) Minimo:
 *        cost_rate = resource.attributes.hourly_cost  -> tenant.default_cost_rate
 *        bill_rate = engagement.attributes.bill_rate_override
 *                    -> resource.attributes.bill_rate -> tenant.default_bill_rate
 *        currency  = rate_card -> tenant.default_currency -> 'EUR'
 *
 * Gira DENTRO una withRls (RLS isola il tenant). Tutti i parametri opzionali.
 */
import type { PoolClient } from './db/pool.js';

export interface ResolvedRates {
  costRate: number | null;
  billRate: number | null;
  currency: string | null;
  source: 'rate_card' | 'minimo' | 'mixed' | 'none';
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function resolveRates(
  db: PoolClient,
  tenantId: string,
  opts: { resourceId?: string | null; engagementId?: string | null; typologyId?: string | null; occurredOn?: string },
): Promise<ResolvedRates> {
  const resourceId = opts.resourceId ?? null;
  const engagementId = opts.engagementId ?? null;
  const typologyId = opts.typologyId ?? null;
  const onDate = opts.occurredOn ?? new Date().toISOString().slice(0, 10);

  // 1) listino: la riga più specifica e valida alla data
  const rc = await db.query(
    `SELECT cost_rate, bill_rate, currency
       FROM rate_card
      WHERE active
        AND (resource_id   = $1 OR resource_id   IS NULL)
        AND (engagement_id = $2 OR engagement_id IS NULL)
        AND (typology_id   = $3 OR typology_id   IS NULL)
        AND (valid_from IS NULL OR valid_from <= $4)
        AND (valid_to   IS NULL OR valid_to   >= $4)
      ORDER BY (engagement_id IS NOT NULL)::int DESC,
               (resource_id   IS NOT NULL)::int DESC,
               (typology_id   IS NOT NULL)::int DESC,
               valid_from DESC NULLS LAST
      LIMIT 1`,
    [resourceId, engagementId, typologyId, onDate],
  );
  const card = rc.rows[0] as { cost_rate: unknown; bill_rate: unknown; currency: unknown } | undefined;
  const cardCost = num(card?.cost_rate);
  const cardBill = num(card?.bill_rate);
  const cardCurr = (card?.currency as string) || null;

  // 2) minimo (letti dagli attributes + default tenant)
  let resCost: number | null = null, resBill: number | null = null;
  if (resourceId) {
    const r = await db.query(
      `SELECT (attributes->>'hourly_cost')::numeric AS hc, (attributes->>'bill_rate')::numeric AS br
         FROM resource WHERE id = $1`, [resourceId]);
    resCost = num(r.rows[0]?.hc); resBill = num(r.rows[0]?.br);
  }
  let engBill: number | null = null;
  if (engagementId) {
    const e = await db.query(
      `SELECT (attributes->>'bill_rate_override')::numeric AS bo FROM engagement WHERE id = $1`, [engagementId]);
    engBill = num(e.rows[0]?.bo);
  }
  const t = await db.query(
    `SELECT default_cost_rate, default_bill_rate, default_currency FROM tenant WHERE id = $1`, [tenantId]);
  const defCost = num(t.rows[0]?.default_cost_rate);
  const defBill = num(t.rows[0]?.default_bill_rate);
  const defCurr = (t.rows[0]?.default_currency as string) || 'EUR';

  const costRate = cardCost ?? resCost ?? defCost;
  const billRate = cardBill ?? engBill ?? resBill ?? defBill;
  const currency = cardCurr ?? defCurr;

  const fromCard = cardCost !== null || cardBill !== null;
  const fromMinimo = (cardCost === null && costRate !== null) || (cardBill === null && billRate !== null);
  const source: ResolvedRates['source'] =
    fromCard && fromMinimo ? 'mixed' : fromCard ? 'rate_card' : fromMinimo ? 'minimo' : 'none';

  return { costRate, billRate, currency, source };
}
