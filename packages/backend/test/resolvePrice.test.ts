/** Test unitari resolvePrice (brief Blocco D, Principio #7): casi limite della
 *  regola commessa › gestore › base, con validità temporale. */
import { describe, it, expect } from 'vitest';
import { resolvePrice, marginPct, type PriceBase, type PriceOverride } from '@sisuite/shared';

const base: PriceBase = { costPrice: 12, revenuePrice: 39 };
const SIRTI = 'company-sirti';
const ENG = 'eng-napoli';

const ovCompany: PriceOverride = { scopeType: 'company', companyId: SIRTI, engagementId: null, costPrice: 11, revenuePrice: 36 };
const ovEng: PriceOverride = { scopeType: 'engagement', companyId: null, engagementId: ENG, costPrice: null, revenuePrice: 41 };

describe('resolvePrice', () => {
  it('nessun override → prezzo base', () => {
    const r = resolvePrice(base, [], { companyId: SIRTI, engagementId: ENG, on: '2026-06-15' });
    expect(r).toEqual({ costPrice: 12, revenuePrice: 39, source: 'base' });
  });

  it('solo override gestore → vince sul base', () => {
    const r = resolvePrice(base, [ovCompany], { companyId: SIRTI, engagementId: ENG, on: '2026-06-15' });
    expect(r).toEqual({ costPrice: 11, revenuePrice: 36, source: 'company' });
  });

  it('override commessa vince su gestore; campo nullo ricade sul base', () => {
    const r = resolvePrice(base, [ovCompany, ovEng], { companyId: SIRTI, engagementId: ENG, on: '2026-06-15' });
    // ovEng: revenue 41 (vince), cost null → ricade su base.costPrice 12
    expect(r).toEqual({ costPrice: 12, revenuePrice: 41, source: 'engagement' });
  });

  it('override scaduto → ignorato (ricade su base)', () => {
    const scaduto: PriceOverride = { ...ovCompany, validTo: '2026-01-01' };
    const r = resolvePrice(base, [scaduto], { companyId: SIRTI, on: '2026-06-15' });
    expect(r.source).toBe('base');
    expect(r.costPrice).toBe(12);
  });

  it('override non ancora valido (validFrom futuro) → ignorato', () => {
    const futuro: PriceOverride = { ...ovCompany, validFrom: '2026-12-01' };
    const r = resolvePrice(base, [futuro], { companyId: SIRTI, on: '2026-06-15' });
    expect(r.source).toBe('base');
  });

  it('gestore non corrispondente → base', () => {
    const r = resolvePrice(base, [ovCompany], { companyId: 'altro', on: '2026-06-15' });
    expect(r.source).toBe('base');
  });

  it('marginPct corretto', () => {
    expect(marginPct(12, 39)).toBeCloseTo(69.23, 1);
    expect(marginPct(0, 0)).toBeNull();
    expect(marginPct(10, null)).toBeNull();
  });
});
