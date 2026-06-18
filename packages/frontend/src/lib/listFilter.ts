/**
 * listFilter.ts — valutazione client-side delle condizioni del FILTRO AI sulle liste.
 * Le condizioni arrivano dal backend (NL→JSON) e si applicano ai valori delle colonne
 * (gli stessi `value` usati per l'export → label/valori localizzati).
 */
export interface FilterCondition { field: string; op: string; value: string | number | boolean | null; label?: string }

const norm = (v: unknown) => (v == null ? '' : String(v)).trim();
const low = (v: unknown) => norm(v).toLowerCase();
const truthy = (v: unknown) => {
  const s = low(v);
  return !(s === '' || s === '0' || s === 'no' || s === 'false' || s === '—' || s === 'disattivata' || s === 'disattivato');
};

/** valuta una singola condizione su un valore grezzo. */
function evalOne(op: string, raw: unknown, value: FilterCondition['value']): boolean {
  switch (op) {
    case 'contains': return low(raw).includes(low(value));
    case 'equals': return low(raw) === low(value);
    case 'not_equals': return low(raw) !== low(value);
    case 'empty': return norm(raw) === '';
    case 'not_empty': return norm(raw) !== '';
    case 'gt': return Number(raw) > Number(value);
    case 'gte': return Number(raw) >= Number(value);
    case 'lt': return Number(raw) < Number(value);
    case 'lte': return Number(raw) <= Number(value);
    case 'is_true': return truthy(raw);
    case 'is_false': return !truthy(raw);
    default: return true;
  }
}

/**
 * Tutte le condizioni in AND. `getValue(field)` ritorna il valore grezzo della
 * colonna; per il campo speciale `__any` cerca su TUTTI i valori forniti.
 */
export function matchConditions(
  conditions: FilterCondition[],
  getValue: (field: string) => unknown,
  allValues: () => unknown[],
): boolean {
  return conditions.every((c) => {
    if (c.field === '__any') {
      const q = low(c.value);
      return allValues().some((v) => low(v).includes(q));
    }
    return evalOne(c.op, getValue(c.field), c.value);
  });
}

const OP_LABEL: Record<string, string> = {
  contains: 'contiene', equals: '=', not_equals: '≠', empty: 'è vuoto', not_empty: 'valorizzato',
  gt: '>', gte: '≥', lt: '<', lte: '≤', is_true: 'sì', is_false: 'no',
};
/** etichetta leggibile di una condizione (usa la label del campo se fornita). */
export function condLabel(c: FilterCondition, fieldLabel: (key: string) => string): string {
  if (c.field === '__any') return `qualsiasi contiene «${c.value}»`;
  const f = fieldLabel(c.field);
  const op = OP_LABEL[c.op] ?? c.op;
  const noVal = ['empty', 'not_empty', 'is_true', 'is_false'];
  return noVal.includes(c.op) ? `${f} ${op}` : `${f} ${op} «${c.value}»`;
}
