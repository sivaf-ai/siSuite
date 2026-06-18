/**
 * filterSql.ts — traduce un filtro strutturato {mode, conditions[{field,op,value}]}
 * (prodotto dall'AI o dal builder manuale, lato client) in un frammento SQL WHERE
 * sicuro e parametrizzato. Ogni endpoint passa la propria FIELD_MAP (key→espressione SQL)
 * e i campi testuali per la ricerca "qualsiasi campo" (__any).
 */
export interface FilterCond { field: string; op: string; value?: unknown }
export interface FilterSpec { mode?: 'and' | 'or'; conditions?: FilterCond[] }

const POS_TRUE = "('true','t','1','sì','si','yes','y','attiva','attivo','disponibile')";

/**
 * Ritorna un frammento (senza AND iniziale) o ''. Appende i valori a `params`
 * usando indici posizionali coerenti con l'array passato.
 */
export function buildFilter(raw: string | undefined, map: Record<string, string>, anyText: string[], params: unknown[]): string {
  if (!raw) return '';
  let spec: FilterSpec;
  try { spec = JSON.parse(raw) as FilterSpec; } catch { return ''; }
  const conds = Array.isArray(spec.conditions) ? spec.conditions : [];
  const glue = spec.mode === 'or' ? ' OR ' : ' AND ';
  const parts: string[] = [];
  for (const c of conds) {
    if (!c || typeof c.op !== 'string') continue;
    if (c.field === '__any') {
      if (!anyText.length) continue;
      params.push(`%${c.value ?? ''}%`); const pi = params.length;
      parts.push('(' + anyText.map((e) => `${e} ILIKE $${pi}`).join(' OR ') + ')');
      continue;
    }
    const expr = map[c.field];
    if (!expr) continue;
    switch (c.op) {
      case 'contains': params.push(`%${c.value ?? ''}%`); parts.push(`${expr} ILIKE $${params.length}`); break;
      case 'equals': params.push(String(c.value ?? '')); parts.push(`lower(${expr}::text) = lower($${params.length})`); break;
      case 'not_equals': params.push(String(c.value ?? '')); parts.push(`(${expr} IS NULL OR lower(${expr}::text) <> lower($${params.length}))`); break;
      case 'empty': parts.push(`(${expr} IS NULL OR ${expr}::text = '')`); break;
      case 'not_empty': parts.push(`(${expr} IS NOT NULL AND ${expr}::text <> '')`); break;
      case 'gt': case 'gte': case 'lt': case 'lte': {
        const o = ({ gt: '>', gte: '>=', lt: '<', lte: '<=' } as Record<string, string>)[c.op];
        params.push(Number(c.value));
        // cast "sicuro": estrae i caratteri numerici, evita errori su testo non numerico
        parts.push(`NULLIF(regexp_replace(${expr}::text, '[^0-9.-]', '', 'g'), '')::numeric ${o} $${params.length}`);
        break;
      }
      case 'between': {
        // value = [from, to] oppure { from, to }. Numerico se entrambi i bound sono numeri,
        // altrimenti confronto testuale (vale per le date ISO: YYYY-MM-DD ordina cronologicamente).
        const v = c.value;
        const arr: unknown[] = Array.isArray(v)
          ? v
          : (v && typeof v === 'object' ? [(v as { from?: unknown }).from, (v as { to?: unknown }).to] : []);
        const a = arr[0], b = arr[1];
        if (a == null || a === '' || b == null || b === '') break;
        const bothNum = !Number.isNaN(Number(a)) && !Number.isNaN(Number(b));
        if (bothNum) {
          params.push(Number(a)); const pa = params.length;
          params.push(Number(b)); const pb = params.length;
          parts.push(`NULLIF(regexp_replace(${expr}::text, '[^0-9.-]', '', 'g'), '')::numeric BETWEEN $${pa} AND $${pb}`);
        } else {
          params.push(String(a)); const pa = params.length;
          params.push(String(b)); const pb = params.length;
          parts.push(`${expr}::text BETWEEN $${pa} AND $${pb}`);
        }
        break;
      }
      case 'is_true': parts.push(`lower(${expr}::text) IN ${POS_TRUE}`); break;
      case 'is_false': parts.push(`(${expr} IS NULL OR lower(${expr}::text) NOT IN ${POS_TRUE})`); break;
      default: break;
    }
  }
  return parts.length ? `(${parts.join(glue)})` : '';
}
