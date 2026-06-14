/**
 * weekView.ts — RITAGLIO SETTIMANALE del piano per-risorsa (mock 03).
 *
 * Lo scheduler (`scheduleResources`) fa UN forward-pass dall'istante `now` e
 * restituisce TUTTI i blocchi dell'orizzonte. La griglia "Pianificazione", però,
 * mostra UNA settimana (lun–ven). Qui ritagliamo il piano completo alla settimana
 * richiesta in modo che **mini, griglia e rail (narrazione) derivino TUTTI dallo
 * stesso insieme di blocchi** → impossibile divergere (era il bug: mini contava
 * l'intero orizzonte mentre la griglia, filtrata alla settimana, restava vuota).
 *
 * Chiave-giorno condivisa: `dayKey()` deriva il giorno (YYYY-MM-DD) in UTC, lo
 * stesso fuso con cui lo scheduler costruisce le finestre e con cui la griglia
 * indicizza le colonne (lo scheduler è UTC-naive: gli orari "08:00" sono 08:00 UTC).
 * Colonne e blocchi usano quindi la STESSA derivazione → match garantito.
 *
 * Modulo PURO (nessun DB): testato in test/weekView.test.ts. NON tocca scheduler.ts.
 */
import type { WeekSchedule, ResourceBlock } from './scheduler.js';

const DAY_MS = 86_400_000;

/** Lunedì (00:00 UTC) della settimana ISO che contiene `d`. */
export function mondayOfUTC(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const wd = (x.getUTCDay() + 6) % 7; // lun=0 … dom=6
  x.setUTCDate(x.getUTCDate() - wd);
  return x;
}

/** Chiave-giorno YYYY-MM-DD condivisa da colonne e blocchi (UTC). */
export function dayKey(iso: string): string { return iso.slice(0, 10); }

/** 00:00 UTC (ms) di una stringa YYYY-MM-DD. */
function utcMidnight(ymd: string): number {
  return Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
}

export interface WeekView {
  weekFrom: string;       // lunedì richiesto (YYYY-MM-DD)
  suggestedFrom: string;  // lunedì della prima settimana CON attività (o weekFrom se il piano è vuoto)
  resources: WeekSchedule['resources'];   // blocchi ritagliati alla settimana [weekFrom, +daysShown)
  conflicts: WeekSchedule['conflicts'];   // conflitti della settimana (+ gli unplaceable, globali)
  totals: { activities: number; minutes: number; conflicts: number }; // ciò che mostra il "mini": coincide con la griglia
}

/**
 * Ritaglia il piano completo alla settimana lavorativa (lun–ven) richiesta.
 * `daysShown` = quante colonne mostra la griglia (5 = lun–ven).
 */
export function scopeWeek(full: WeekSchedule, weekFromStr: string, daysShown = 5): WeekView {
  const weekStart = utcMidnight(weekFromStr);
  const weekEnd = weekStart + daysShown * DAY_MS;
  const inWeek = (b: ResourceBlock): boolean =>
    new Date(b.start).getTime() < weekEnd && new Date(b.end).getTime() > weekStart;

  const resources = full.resources.map((r) => ({ ...r, blocks: r.blocks.filter(inWeek) }));

  // mini = ciò che la griglia rende: attività distinte e minuti dei blocchi RITAGLIATI
  const actInWeek = new Set<string>();
  let minutes = 0;
  for (const r of resources) {
    for (const b of r.blocks) {
      actInWeek.add(b.activityId);
      minutes += (new Date(b.end).getTime() - new Date(b.start).getTime()) / 60_000;
    }
  }

  // conflitti: quelli con un blocco nella settimana + gli unplaceable (avviso globale, senza giorno)
  const conflicts = full.conflicts.filter((c) => actInWeek.has(c.activityId) || c.reason === 'unplaceable');

  // suggestedFrom: lunedì del PRIMO blocco dell'intero orizzonte (così il default cade su una settimana piena)
  let earliest = Infinity;
  for (const r of full.resources) for (const b of r.blocks) earliest = Math.min(earliest, new Date(b.start).getTime());
  const suggestedFrom = Number.isFinite(earliest)
    ? mondayOfUTC(new Date(earliest)).toISOString().slice(0, 10)
    : weekFromStr;

  return {
    weekFrom: weekFromStr,
    suggestedFrom,
    resources,
    conflicts,
    totals: { activities: actInWeek.size, minutes: Math.round(minutes), conflicts: conflicts.length },
  };
}
