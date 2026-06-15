/**
 * Num / Money / Dur / Time — celle numeriche formattate (standard 3-4-5-6).
 * Da usare nelle tabelle: la colonna mette l'unità nell'HEADER, la cella è pulita.
 */
import { fmtNum, fmtInt, fmtMoneyValue, currencySymbol } from '../lib/format';
import { hhmm } from '../lib/time';

/** numero a destra, cifre tabellari, migliaia + N decimali (default 2). */
export function Num({ value, decimals = 2 }: { value: number | null | undefined; decimals?: number }) {
  return <span className="num mono">{fmtNum(value, decimals)}</span>;
}

/** intero (0 decimali) — es. giacenza pezzi. */
export function Int({ value }: { value: number | null | undefined }) {
  return <span className="num mono">{fmtInt(value)}</span>;
}

/** valuta in formato contabile: simbolo a sinistra, numero a destra (standard 5). */
export function Money({ value, currency = 'EUR', decimals = 2 }: { value: number | null | undefined; currency?: string; decimals?: number }) {
  const negative = (value ?? 0) < 0;
  if (value == null || Number.isNaN(value)) return <span className="money"><span className="val zero">—</span></span>;
  return (
    <span className={`money${negative ? ' negative' : ''}`}>
      <span className="sym">{negative ? '−' : ''}{currencySymbol(currency)}</span>
      <span className="val">{fmtMoneyValue(value, decimals)}</span>
    </span>
  );
}

/** durata h:mm da minuti (standard 6). */
export function Dur({ minutes }: { minutes: number | null | undefined }) {
  if (minutes == null) return <span className="dur">—</span>;
  return <span className="dur">{hhmm(minutes)}</span>;
}

/** ora del giorno 24h, o range "09:45 → 10:42" (standard 6). */
export function Time({ from, to }: { from?: string | null; to?: string | null }) {
  if (!from) return <span className="time">—</span>;
  return <span className="time">{from}{to ? ` → ${to}` : ''}</span>;
}
