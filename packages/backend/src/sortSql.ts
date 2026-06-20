/**
 * sortSql.ts — costruisce una clausola ORDER BY multi-campo SICURA da un parametro
 * `sort` (JSON: [{field,dir}]) prodotto dalla mascherina "Ordina" del client.
 * I campi sono whitelisted dalla SORTABLE map dell'endpoint (key→espressione SQL);
 * la direzione è vincolata a asc/desc. Retro-compatibile: se `sort` è assente o vuoto,
 * ricade sul singolo (fallbackExpr/fallbackDir, cioè il vecchio sortBy/sortDir).
 */
export interface SortItem { field: string; dir?: string }

export function buildOrderBy(
  rawSort: string | undefined,
  sortable: Record<string, string>,
  fallbackExpr: string,
  fallbackDir: string = 'asc',
  attrsCol?: string,   // es. 'c.attributes': i campi non in `sortable` con key valida ordinano per attributo
): string {
  let items: SortItem[] = [];
  if (rawSort) {
    try { const p = JSON.parse(rawSort); if (Array.isArray(p)) items = p as SortItem[]; } catch { /* ignora: fallback */ }
  }
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (!it || typeof it.field !== 'string') continue;
    if (seen.has(it.field)) continue;
    // espressione: whitelist `sortable`, altrimenti attributo (key validata: niente injection)
    let expr = sortable[it.field];
    if (!expr && attrsCol && /^[a-z][a-z0-9_]*$/.test(it.field)) expr = `${attrsCol}->>'${it.field}'`;
    if (!expr) continue;
    seen.add(it.field);
    const dir = it.dir === 'desc' ? 'desc' : 'asc';  // solo asc/desc
    parts.push(`${expr} ${dir} NULLS LAST`);
  }
  if (!parts.length) {
    const dir = fallbackDir === 'desc' ? 'desc' : 'asc';
    parts.push(`${fallbackExpr} ${dir} NULLS LAST`);
  }
  return parts.join(', ');
}
