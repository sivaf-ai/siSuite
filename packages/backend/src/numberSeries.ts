/**
 * numberSeries.ts — generazione di un identificativo umano da number_series.
 * REGOLA del brief: ogni codice visibile passa da qui; gli UUID non si mostrano.
 *
 * Gapless: gira DENTRO la transazione del documento (stesso PoolClient). Se il
 * documento fa rollback, il numero NON viene consumato. La riga number_series è
 * lockata con FOR UPDATE per serializzare i concorrenti.
 *
 * Placeholder di `format`: {YYYY} {YY} {MM} {SEQ:n}
 *   '{YYYY}-{SEQ:4}'   -> 2026-0042
 *   'FAT{YYYY}{SEQ:4}' -> FAT20260012
 */
import type { PoolClient } from './db/pool.js';

function periodFor(resetPeriod: string, now: Date): string {
  const y = now.getUTCFullYear().toString();
  const m = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  switch (resetPeriod) {
    case 'yearly':
      return y;
    case 'monthly':
      return `${y}-${m}`;
    case 'never':
    default:
      return '';
  }
}

function applyFormat(format: string, seq: number, now: Date): string {
  const y = now.getUTCFullYear().toString();
  const m = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  return format
    .replace(/\{YYYY\}/g, y)
    .replace(/\{YY\}/g, y.slice(-2))
    .replace(/\{MM\}/g, m)
    .replace(/\{SEQ:(\d+)\}/g, (_match, n: string) => seq.toString().padStart(Number(n), '0'));
}

/**
 * Restituisce il prossimo codice per la `key` data, aggiornando il contatore.
 * RLS garantisce che la riga vista sia quella del tenant corrente.
 */
export async function nextNumber(db: PoolClient, key: string, now: Date = new Date()): Promise<string> {
  const { rows } = await db.query(
    `SELECT format, reset_period, current_period, last_number
     FROM number_series WHERE key = $1 FOR UPDATE`,
    [key],
  );
  if (rows.length === 0) {
    throw new Error(`number_series '${key}' non configurata per questo tenant`);
  }
  const row = rows[0] as { format: string; reset_period: string; current_period: string; last_number: string | number };
  const period = periodFor(row.reset_period, now);
  const last = period !== row.current_period ? 0 : Number(row.last_number);
  const next = last + 1;
  await db.query(
    `UPDATE number_series SET current_period = $1, last_number = $2 WHERE key = $3`,
    [period, next, key],
  );
  return applyFormat(row.format, next, now);
}
