/** Test unitari buildOrderBy (Blocco 5.2 multi-sort): whitelist campi + direzione
 *  vincolata + fallback retro-compatibile + sicurezza (niente injection da `sort`). */
import { describe, it, expect } from 'vitest';
import { buildOrderBy } from '../src/sortSql.js';

const SORTABLE = { name: 'c.display_name', type: 'c.type', created: 'c.created_at' };

describe('buildOrderBy', () => {
  it('singolo campo asc', () => {
    expect(buildOrderBy(JSON.stringify([{ field: 'name', dir: 'asc' }]), SORTABLE, 'c.display_name'))
      .toBe('c.display_name asc NULLS LAST');
  });

  it('multi-campo con priorità', () => {
    const r = buildOrderBy(JSON.stringify([{ field: 'type', dir: 'desc' }, { field: 'name', dir: 'asc' }]), SORTABLE, 'c.display_name');
    expect(r).toBe('c.type desc NULLS LAST, c.display_name asc NULLS LAST');
  });

  it('direzione non valida → asc', () => {
    expect(buildOrderBy(JSON.stringify([{ field: 'name', dir: 'sideways' }]), SORTABLE, 'c.display_name'))
      .toBe('c.display_name asc NULLS LAST');
  });

  it('campo fuori whitelist → ignorato', () => {
    expect(buildOrderBy(JSON.stringify([{ field: 'password', dir: 'asc' }, { field: 'name', dir: 'desc' }]), SORTABLE, 'c.display_name'))
      .toBe('c.display_name desc NULLS LAST');
  });

  it('campo ripetuto → una sola volta', () => {
    expect(buildOrderBy(JSON.stringify([{ field: 'name', dir: 'asc' }, { field: 'name', dir: 'desc' }]), SORTABLE, 'c.display_name'))
      .toBe('c.display_name asc NULLS LAST');
  });

  it('sort assente → fallback singolo (retro-compat)', () => {
    expect(buildOrderBy(undefined, SORTABLE, 'c.display_name', 'desc')).toBe('c.display_name desc NULLS LAST');
  });

  it('sort vuoto / tutti fuori whitelist → fallback', () => {
    expect(buildOrderBy(JSON.stringify([]), SORTABLE, 'c.created_at', 'asc')).toBe('c.created_at asc NULLS LAST');
    expect(buildOrderBy(JSON.stringify([{ field: 'x' }]), SORTABLE, 'c.created_at')).toBe('c.created_at asc NULLS LAST');
  });

  it('JSON malformato → fallback, niente eccezioni', () => {
    expect(buildOrderBy('{bad', SORTABLE, 'c.display_name')).toBe('c.display_name asc NULLS LAST');
  });

  it('payload injection nei valori → impossibile (solo key whitelisted finiscono in SQL)', () => {
    const evil = JSON.stringify([{ field: 'name; DROP TABLE company;--', dir: 'asc' }]);
    const r = buildOrderBy(evil, SORTABLE, 'c.display_name');
    expect(r).not.toContain('DROP TABLE');
    expect(r).toBe('c.display_name asc NULLS LAST');
  });

  it('campo fuori whitelist + attrsCol → ordina per attributo (tutti i campi ordinabili)', () => {
    expect(buildOrderBy(JSON.stringify([{ field: 'city', dir: 'desc' }]), SORTABLE, 'c.display_name', 'asc', 'c.attributes'))
      .toBe("c.attributes->>'city' desc NULLS LAST");
  });

  it('attrsCol con key NON valida → ignorata (no injection), fallback', () => {
    const r = buildOrderBy(JSON.stringify([{ field: "x'; DROP TABLE company;--", dir: 'asc' }]), SORTABLE, 'c.display_name', 'asc', 'c.attributes');
    expect(r).not.toContain('DROP TABLE');
    expect(r).toBe('c.display_name asc NULLS LAST');
  });
});
