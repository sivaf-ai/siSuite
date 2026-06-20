/**
 * listFilter.ts — valutazione client-side delle condizioni del FILTRO AI sulle liste.
 * Le condizioni arrivano dal backend (NL→JSON) e si applicano ai valori delle colonne
 * (gli stessi `value` usati per l'export → label/valori localizzati).
 */
export interface FilterCondition {
  field: string; op: string; value: string | number | boolean | null | (string | number)[]; label?: string;
  /* ── estensioni "Filtro Gruppo" (mockup 54) ── */
  value2?: string | number | null;
  values?: string[];
  join?: 'and' | 'or';
  neg?: boolean;
  open?: boolean;
  close?: boolean;
}

const norm = (v: unknown) => (v == null ? '' : String(v)).trim();
const low = (v: unknown) => norm(v).toLowerCase();
const truthy = (v: unknown) => {
  const s = low(v);
  return !(s === '' || s === '0' || s === 'no' || s === 'false' || s === '—' || s === 'disattivata' || s === 'disattivato');
};

/** valuta una singola condizione su un valore grezzo. */
function evalOne(op: string, raw: unknown, value: FilterCondition['value']): boolean {
  const scalar = Array.isArray(value) ? '' : value;
  switch (op) {
    case 'contains': return low(raw).includes(low(scalar));
    case 'equals': return low(raw) === low(scalar);
    case 'not_equals': return low(raw) !== low(scalar);
    case 'empty': return norm(raw) === '';
    case 'not_empty': return norm(raw) !== '';
    case 'gt': return Number(raw) > Number(scalar);
    case 'gte': return Number(raw) >= Number(scalar);
    case 'lt': return Number(raw) < Number(scalar);
    case 'lte': return Number(raw) <= Number(scalar);
    case 'between': {
      const arr = Array.isArray(value) ? value : [];
      const a = arr[0], b = arr[1];
      if (a == null || a === '' || b == null || b === '') return true; // intervallo incompleto → non filtra
      const na = Number(a), nb = Number(b), nr = Number(raw);
      if (!Number.isNaN(na) && !Number.isNaN(nb) && !Number.isNaN(nr)) return nr >= na && nr <= nb;
      const s = norm(raw); return s >= String(a) && s <= String(b); // date ISO / testo
    }
    case 'is_true': return truthy(raw);
    case 'is_false': return !truthy(raw);
    default: return true;
  }
}

export type FilterMode = 'and' | 'or';

/**
 * Valuta le condizioni in AND (tutte) o OR (almeno una). `getValue(field)` ritorna
 * il valore grezzo del campo; per il campo speciale `__any` cerca su tutti i valori.
 */
export function matchConditions(
  conditions: FilterCondition[],
  getValue: (field: string) => unknown,
  allValues: () => unknown[],
  mode: FilterMode = 'and',
): boolean {
  if (!conditions.length) return true;
  const test = (c: FilterCondition) => {
    if (c.field === '__any') { const q = low(c.value); return allValues().some((v) => low(v).includes(q)); }
    return evalOne(c.op, getValue(c.field), c.value);
  };
  return mode === 'or' ? conditions.some(test) : conditions.every(test);
}

/** operatori disponibili nel builder manuale, con etichetta IT e se richiedono un valore. */
export const FILTER_OPS: { op: string; label: string; noValue?: boolean; range?: boolean }[] = [
  { op: 'contains', label: 'contiene' },
  { op: 'equals', label: 'uguale a' },
  { op: 'not_equals', label: 'diverso da' },
  { op: 'between', label: 'tra (da–a)', range: true },
  { op: 'gt', label: 'maggiore di' },
  { op: 'gte', label: 'maggiore o uguale' },
  { op: 'lt', label: 'minore di' },
  { op: 'lte', label: 'minore o uguale' },
  { op: 'empty', label: 'è vuoto', noValue: true },
  { op: 'not_empty', label: 'è valorizzato', noValue: true },
  { op: 'is_true', label: 'è sì/vero', noValue: true },
  { op: 'is_false', label: 'è no/falso', noValue: true },
];

const OP_LABEL: Record<string, string> = {
  contains: 'contiene', equals: '=', not_equals: '≠', empty: 'è vuoto', not_empty: 'valorizzato',
  between: 'tra', gt: '>', gte: '≥', lt: '<', lte: '≤', is_true: 'sì', is_false: 'no',
};
/** etichetta leggibile di una condizione (usa la label del campo se fornita). */
export function condLabel(c: FilterCondition, fieldLabel: (key: string) => string): string {
  if (c.field === '__any') return `qualsiasi contiene «${c.value as string}»`;
  const f = fieldLabel(c.field);
  const op = OP_LABEL[c.op] ?? c.op;
  if (c.op === 'between') { const a = Array.isArray(c.value) ? c.value : ['', '']; return `${f} tra «${a[0] ?? ''}» e «${a[1] ?? ''}»`; }
  const noVal = ['empty', 'not_empty', 'is_true', 'is_false'];
  return noVal.includes(c.op) ? `${f} ${op}` : `${f} ${op} «${c.value as string}»`;
}
