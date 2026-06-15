/**
 * format.ts — formattatori numerici secondo gli standard UI 3-4-5-6 (base.css v5).
 * I componenti React stanno in ui/Num.tsx; qui solo funzioni pure (riusabili anche
 * fuori da React: tooltip, export, ecc.).
 */

const LOCALE = 'it-IT';

/** numero con separatore migliaia + N decimali (default 2). */
export function fmtNum(value: number | null | undefined, decimals = 2): string {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toLocaleString(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** intero con separatore migliaia (0 decimali). */
export function fmtInt(value: number | null | undefined): string {
  return fmtNum(value, 0);
}

/** parte valuta: solo il NUMERO (il simbolo è reso a parte, formato contabile). */
export function fmtMoneyValue(value: number | null | undefined, decimals = 2): string {
  if (value == null || Number.isNaN(value)) return '—';
  return Math.abs(value).toLocaleString(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** simbolo valuta da codice ISO (default EUR). */
export function currencySymbol(currency = 'EUR'): string {
  const map: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', CHF: 'CHF', ARS: '$' };
  return map[currency] ?? currency;
}
