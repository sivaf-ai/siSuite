/**
 * filterSql.ts — traduce un filtro strutturato in un frammento SQL WHERE sicuro e
 * parametrizzato. Supporta DUE forme, retro-compatibili:
 *  - semplice (AI/builder storico): {mode, conditions:[{field,op,value}]} unite da mode;
 *  - "Gruppo" (PIANO motore §2.1, mockup 54): ogni condizione porta `join` (E/O verso la
 *    precedente), `neg` (NON), `open`/`close` (parentesi — UN solo livello), `value2`/`values`.
 * Ogni endpoint passa la propria FIELD_MAP (key→espressione SQL, già whitelist: PII fuori)
 * e i campi testuali per la ricerca "qualsiasi campo" (__any). I valori finiscono SEMPRE
 * nei parametri bind ($n): mai concatenati (anti-injection).
 */
export interface FilterCond {
  field: string; op: string; value?: unknown; value2?: unknown; values?: unknown[];
  join?: 'and' | 'or'; neg?: boolean; open?: boolean; close?: boolean;
}
export interface FilterSpec { mode?: 'and' | 'or'; conditions?: FilterCond[] }

const POS_TRUE = "('true','t','1','sì','si','yes','y','attiva','attivo','disponibile')";

/** Frammento SQL per la SOLA espressione della condizione (senza NON/parentesi), o null per saltarla. */
function condExpr(c: FilterCond, map: Record<string, string>, anyText: string[], params: unknown[]): string | null {
  if (c.field === '__any') {
    if (!anyText.length) return null;
    params.push(`%${c.value ?? ''}%`); const pi = params.length;
    return '(' + anyText.map((e) => `${e} ILIKE $${pi}`).join(' OR ') + ')';
  }
  const expr = map[c.field];
  if (!expr) return null;
  const rangeBounds = (): [unknown, unknown] => {
    const v = c.value;
    if (c.value2 !== undefined) return [v, c.value2];
    if (Array.isArray(v)) return [v[0], v[1]];
    if (v && typeof v === 'object') return [(v as { from?: unknown }).from, (v as { to?: unknown }).to];
    return [undefined, undefined];
  };
  switch (c.op) {
    case 'contains': params.push(`%${c.value ?? ''}%`); return `${expr} ILIKE $${params.length}`;
    case 'starts_with': params.push(`${c.value ?? ''}%`); return `${expr} ILIKE $${params.length}`;
    case 'ends_with': params.push(`%${c.value ?? ''}`); return `${expr} ILIKE $${params.length}`;
    case 'equals': params.push(String(c.value ?? '')); return `lower(${expr}::text) = lower($${params.length})`;
    case 'not_equals': params.push(String(c.value ?? '')); return `(${expr} IS NULL OR lower(${expr}::text) <> lower($${params.length}))`;
    case 'empty': return `(${expr} IS NULL OR ${expr}::text = '')`;
    case 'not_empty': return `(${expr} IS NOT NULL AND ${expr}::text <> '')`;
    case 'in': case 'not_in': {
      const vals = (Array.isArray(c.values) ? c.values : (Array.isArray(c.value) ? c.value : [])).map((v) => String(v).toLowerCase());
      if (!vals.length) return null;
      params.push(vals);
      return c.op === 'in'
        ? `lower(${expr}::text) = ANY($${params.length}::text[])`
        : `(${expr} IS NULL OR lower(${expr}::text) <> ALL($${params.length}::text[]))`;
    }
    case 'gt': case 'gte': case 'lt': case 'lte': {
      const o = ({ gt: '>', gte: '>=', lt: '<', lte: '<=' } as Record<string, string>)[c.op]!;
      params.push(Number(c.value));
      return `NULLIF(regexp_replace(${expr}::text, '[^0-9.-]', '', 'g'), '')::numeric ${o} $${params.length}`;
    }
    case 'between': {
      const [a, b] = rangeBounds();
      if (a == null || a === '' || b == null || b === '') return null;
      const bothNum = !Number.isNaN(Number(a)) && !Number.isNaN(Number(b));
      if (bothNum) {
        params.push(Number(a)); const pa = params.length; params.push(Number(b)); const pb = params.length;
        return `NULLIF(regexp_replace(${expr}::text, '[^0-9.-]', '', 'g'), '')::numeric BETWEEN $${pa} AND $${pb}`;
      }
      params.push(String(a)); const pa = params.length; params.push(String(b)); const pb = params.length;
      return `${expr}::text BETWEEN $${pa} AND $${pb}`;
    }
    // ── date (mockup 54) ──
    case 'date_today': return `${expr}::date = current_date`;
    case 'date_month': return `date_trunc('month', ${expr}::timestamptz) = date_trunc('month', now())`;
    case 'date_year': return `date_trunc('year', ${expr}::timestamptz) = date_trunc('year', now())`;
    case 'date_in_year': { const y = Number(c.value); if (Number.isNaN(y)) return null; params.push(y); return `extract(year from ${expr}::timestamptz)::int = $${params.length}`; }
    case 'date_after': if (!c.value) return null; params.push(String(c.value)); return `${expr}::date > $${params.length}`;
    case 'date_before': if (!c.value) return null; params.push(String(c.value)); return `${expr}::date < $${params.length}`;
    case 'is_true': return `lower(${expr}::text) IN ${POS_TRUE}`;
    case 'is_false': return `(${expr} IS NULL OR lower(${expr}::text) NOT IN ${POS_TRUE})`;
    default: return null;
  }
}

/** Ritorna un frammento `( … )` (senza AND iniziale) o ''. Appende i valori a `params`. */
export function buildFilter(raw: string | undefined, map: Record<string, string>, anyText: string[], params: unknown[]): string {
  if (!raw) return '';
  let spec: FilterSpec;
  try { spec = JSON.parse(raw) as FilterSpec; } catch { return ''; }
  const conds = Array.isArray(spec.conditions) ? spec.conditions : [];

  const frags: { sql: string; c: FilterCond }[] = [];
  for (const c of conds) {
    if (!c || typeof c.op !== 'string') continue;
    const sql = condExpr(c, map, anyText, params);
    if (sql == null) continue;
    frags.push({ sql, c });
  }
  if (!frags.length) return '';
  const defGlue = spec.mode === 'or' ? ' OR ' : ' AND ';

  // Caso SEMPLICE (nessun join/neg/parentesi): output identico allo storico.
  const isGroup = frags.some((f) => f.c.join || f.c.neg || f.c.open || f.c.close);
  if (!isGroup) return `(${frags.map((f) => f.sql).join(defGlue)})`;

  // Caso GRUPPO: join per-condizione + NON + parentesi a UN livello (se sbilanciate → ignorate).
  const useParens = frags.filter((f) => f.c.open).length === frags.filter((f) => f.c.close).length;
  let out = '';
  frags.forEach((f, i) => {
    if (i > 0) out += f.c.join === 'or' ? ' OR ' : ' AND ';
    out += (useParens && f.c.open ? '(' : '') + (f.c.neg ? 'NOT ' : '') + `(${f.sql})` + (useParens && f.c.close ? ')' : '');
  });
  return `(${out})`;
}
