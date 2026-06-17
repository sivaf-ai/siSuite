/**
 * pricing.ts — `resolvePrice`: il prezzo "più specifico" (brief Principio #7).
 * Regola UNICA, riusata ovunque (lavorazioni, preventivi, pivot):
 *   override di COMMESSA (engagement) › override di GESTORE (company) › prezzo BASE.
 * Rispetta la validità temporale degli override. Funzione PURA (testabile).
 */

export interface PriceBase {
  costPrice: number | null;
  revenuePrice: number | null;
}

export interface PriceOverride {
  scopeType: 'company' | 'engagement';
  companyId: string | null;
  engagementId: string | null;
  costPrice: number | null;
  revenuePrice: number | null;
  validFrom?: string | null; // 'YYYY-MM-DD'
  validTo?: string | null;
}

export type PriceSource = 'engagement' | 'company' | 'base';

export interface ResolvedPrice {
  costPrice: number | null;
  revenuePrice: number | null;
  /** da dove proviene il prezzo applicato (per l'etichetta "più specifico" in UI). */
  source: PriceSource;
}

function validOn(o: PriceOverride, on: string): boolean {
  if (o.validFrom && on < o.validFrom) return false;
  if (o.validTo && on > o.validTo) return false;
  return true;
}

/**
 * Risolve costo e ricavo della voce nel contesto dato.
 * @param base       prezzi base della voce di listino
 * @param overrides  ritocchi disponibili per la voce
 * @param ctx        engagementId / companyId(gestore) / data di riferimento (default: oggi)
 */
export function resolvePrice(
  base: PriceBase,
  overrides: PriceOverride[],
  ctx: { engagementId?: string | null; companyId?: string | null; on?: string },
): ResolvedPrice {
  const on = ctx.on ?? new Date().toISOString().slice(0, 10);
  const valid = overrides.filter((o) => validOn(o, on));

  // 1) override di commessa (il più specifico)
  const byEng = ctx.engagementId
    ? valid.find((o) => o.scopeType === 'engagement' && o.engagementId === ctx.engagementId)
    : undefined;
  // 2) override di gestore
  const byCompany = ctx.companyId
    ? valid.find((o) => o.scopeType === 'company' && o.companyId === ctx.companyId)
    : undefined;

  const chosen = byEng ?? byCompany;
  if (!chosen) return { costPrice: base.costPrice, revenuePrice: base.revenuePrice, source: 'base' };

  // l'override più specifico vince; i campi nulli ricadono sul base
  return {
    costPrice: chosen.costPrice ?? base.costPrice,
    revenuePrice: chosen.revenuePrice ?? base.revenuePrice,
    source: byEng ? 'engagement' : 'company',
  };
}

/** Margine % = (ricavo − costo) / ricavo · 100. Null se ricavo mancante/0. */
export function marginPct(costPrice: number | null, revenuePrice: number | null): number | null {
  if (revenuePrice == null || revenuePrice === 0) return null;
  const cost = costPrice ?? 0;
  return ((revenuePrice - cost) / revenuePrice) * 100;
}
