/** Test unitari buildFilter (Blocco 5, igiene): operatori + parametrizzazione +
 *  sicurezza anti-injection. Il filtro è esposto in demo: i valori NON devono mai
 *  finire concatenati nello SQL, solo nei parametri bind ($N). */
import { describe, it, expect } from 'vitest';
import { buildFilter } from '../src/filterSql.js';

const MAP = { name: 'c.display_name', city: "c.attributes->>'city'", price: 'c.price', active: 'c.active', created: 'c.created_at' };
const ANY = ['c.display_name', "c.attributes->>'city'"];

function run(spec: unknown, map = MAP, any = ANY) {
  const params: unknown[] = [];
  const sql = buildFilter(JSON.stringify(spec), map, any, params);
  return { sql, params };
}

describe('buildFilter — operatori', () => {
  it('contains → ILIKE con %valore% nei params', () => {
    const { sql, params } = run({ conditions: [{ field: 'name', op: 'contains', value: 'ros' }] });
    expect(sql).toBe('(c.display_name ILIKE $1)');
    expect(params).toEqual(['%ros%']);
  });

  it('equals → confronto case-insensitive parametrizzato', () => {
    const { sql, params } = run({ conditions: [{ field: 'city', op: 'equals', value: 'Bergamo' }] });
    expect(sql).toBe("(lower(c.attributes->>'city'::text) = lower($1))");
    expect(params).toEqual(['Bergamo']);
  });

  it('not_equals → include NULL come diverso', () => {
    const { sql } = run({ conditions: [{ field: 'name', op: 'not_equals', value: 'x' }] });
    expect(sql).toContain('IS NULL OR');
    expect(sql).toContain('<>');
  });

  it('empty / not_empty → no params', () => {
    const a = run({ conditions: [{ field: 'name', op: 'empty' }] });
    expect(a.params).toEqual([]);
    expect(a.sql).toContain('IS NULL');
    const b = run({ conditions: [{ field: 'name', op: 'not_empty' }] });
    expect(b.sql).toContain('IS NOT NULL');
  });

  it('gt/gte/lt/lte → cast numerico sicuro', () => {
    const { sql, params } = run({ conditions: [{ field: 'price', op: 'gte', value: '100' }] });
    expect(sql).toContain('>= $1');
    expect(sql).toContain('::numeric');
    expect(params).toEqual([100]);
  });

  it('is_true / is_false → set di valori positivi', () => {
    expect(run({ conditions: [{ field: 'active', op: 'is_true' }] }).sql).toContain('IN (');
    expect(run({ conditions: [{ field: 'active', op: 'is_false' }] }).sql).toContain('NOT IN (');
  });
});

describe('buildFilter — between', () => {
  it('numerico: [from,to] → BETWEEN $1 AND $2 con numeri nei params', () => {
    const { sql, params } = run({ conditions: [{ field: 'price', op: 'between', value: [10, 50] }] });
    expect(sql).toContain('BETWEEN $1 AND $2');
    expect(sql).toContain('::numeric');
    expect(params).toEqual([10, 50]);
  });

  it('date ISO: confronto testuale BETWEEN (ordina cronologicamente)', () => {
    const { sql, params } = run({ conditions: [{ field: 'created', op: 'between', value: ['2026-01-01', '2026-12-31'] }] });
    expect(sql).toContain('::text BETWEEN $1 AND $2');
    expect(params).toEqual(['2026-01-01', '2026-12-31']);
  });

  it('forma oggetto {from,to}', () => {
    const { params } = run({ conditions: [{ field: 'price', op: 'between', value: { from: 1, to: 9 } }] });
    expect(params).toEqual([1, 9]);
  });

  it('bound mancante → condizione ignorata (nessun frammento)', () => {
    const { sql, params } = run({ conditions: [{ field: 'price', op: 'between', value: [10, ''] }] });
    expect(sql).toBe('');
    expect(params).toEqual([]);
  });
});

describe('buildFilter — logica e __any', () => {
  it('mode and (default) unisce con AND', () => {
    const { sql } = run({ conditions: [{ field: 'name', op: 'contains', value: 'a' }, { field: 'city', op: 'contains', value: 'b' }] });
    expect(sql).toBe('(c.display_name ILIKE $1 AND c.attributes->>\'city\' ILIKE $2)');
  });

  it('mode or unisce con OR', () => {
    const { sql } = run({ mode: 'or', conditions: [{ field: 'name', op: 'contains', value: 'a' }, { field: 'city', op: 'contains', value: 'b' }] });
    expect(sql).toContain(' OR ');
  });

  it('__any cerca su tutti i campi testuali', () => {
    const { sql, params } = run({ conditions: [{ field: '__any', op: 'contains', value: 'foo' }] });
    expect(sql).toContain('c.display_name ILIKE $1 OR');
    expect(params).toEqual(['%foo%']);
  });
});

describe('buildFilter — robustezza e sicurezza', () => {
  it('campo non in FIELD_MAP → ignorato (no whitelist bypass)', () => {
    const { sql, params } = run({ conditions: [{ field: 'c.password', op: 'contains', value: 'x' }] });
    expect(sql).toBe('');
    expect(params).toEqual([]);
  });

  it('operatore sconosciuto → ignorato', () => {
    const { sql } = run({ conditions: [{ field: 'name', op: 'drop table', value: 'x' }] });
    expect(sql).toBe('');
  });

  it('JSON malformato → stringa vuota, niente eccezioni', () => {
    const params: unknown[] = [];
    expect(buildFilter('{not json', MAP, ANY, params)).toBe('');
    expect(params).toEqual([]);
  });

  it('payload di injection finisce SOLO nei params, mai nello SQL', () => {
    const evil = "x'; DROP TABLE company;--";
    const { sql, params } = run({ conditions: [{ field: 'name', op: 'contains', value: evil }] });
    expect(sql).toBe('(c.display_name ILIKE $1)');     // solo placeholder
    expect(sql).not.toContain('DROP TABLE');           // nessuna concatenazione
    expect(params).toEqual([`%${evil}%`]);             // il valore è un parametro bind
  });

  it('injection anche su equals e between resta parametrizzata', () => {
    const evil = "1 OR 1=1";
    const eq = run({ conditions: [{ field: 'city', op: 'equals', value: evil }] });
    expect(eq.sql).not.toContain('OR 1=1');
    expect(eq.params).toEqual([evil]);
    const bt = run({ conditions: [{ field: 'created', op: 'between', value: [evil, 'z'] }] });
    expect(bt.sql).not.toContain('OR 1=1');
    expect(bt.params).toEqual([evil, 'z']);
  });

  it('filtro vuoto / senza condizioni → stringa vuota', () => {
    expect(buildFilter(undefined, MAP, ANY, [])).toBe('');
    expect(run({ conditions: [] }).sql).toBe('');
  });
});
