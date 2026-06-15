/** Formattazione durate. hhmm: minuti → "hh:mm" (es. 90 → "01:30").
 *  Usare nelle colonne/totali di ore al posto di "Xh Ym" (più compatto). */
export function hhmm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60), mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
