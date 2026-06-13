/**
 * scheduler.ts — MOTORE DI FLUSSO "leggero" (un passaggio in avanti, non un solver).
 *
 * Idea (dal brief/MVP): le attività DINAMICHE (senza scheduled_start) hanno solo
 * una durata; il motore le colloca FLUENDO da oggi dentro l'orario di lavoro,
 * scorrendo ATTORNO alle attività FISSE (ancore). Rispetta earliest_start e, se
 * una scadenza (due_by) non è raggiungibile, la SEGNALA invece di violarla.
 *
 * Limiti dichiarati (raffinamenti futuri): orari interpretati come tempo locale
 * "naive" (tenant.timezone non ancora applicato puntualmente); non sottrae le
 * indisponibilità risorsa (resource_availability) né risolve il grafo dipendenze
 * (qui ordine = priorità poi creazione). Il solver ottimizzante è post-MVP.
 */

export interface WorkingHours {
  [day: string]: [string, string][]; // 'mon'..'sun' -> [["08:00","13:00"], ...]
}
export interface FlowActivity {
  id: string;
  title: string;
  estimatedMinutes: number | null;
  scheduledStart: string | null; // ISO; se valorizzato = FISSA
  earliestStart: string | null;
  dueBy: string | null;
  prioritySeq: number; // 1..n (più basso = più urgente), per l'ordinamento
  createdAt: string;
}
export interface PlacedActivity {
  id: string;
  title: string;
  fixed: boolean;
  start: string | null;
  end: string | null;
  conflict: 'none' | 'due_by_missed' | 'unplaceable';
}

const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_MS = 86_400_000;

function hm(s: string): [number, number] {
  const [h, m] = s.split(':').map(Number);
  return [h ?? 0, m ?? 0];
}

/** Finestre lavorative di un giorno (date a 00:00 UTC), come intervalli assoluti. */
function dayWindows(day: Date, wh: WorkingHours): { start: number; end: number }[] {
  const key = DOW[day.getUTCDay()]!;
  const list = wh[key] ?? [];
  return list.map(([a, b]) => {
    const [ah, am] = hm(a);
    const [bh, bm] = hm(b);
    const s = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), ah, am);
    const e = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), bh, bm);
    return { start: s, end: e };
  });
}

/** Sottrae gli intervalli `busy` da una finestra, restituendo i sotto-intervalli liberi. */
function subtractBusy(win: { start: number; end: number }, busy: { start: number; end: number }[]): { start: number; end: number }[] {
  let frags = [win];
  for (const b of busy) {
    const next: typeof frags = [];
    for (const f of frags) {
      if (b.end <= f.start || b.start >= f.end) { next.push(f); continue; }
      if (b.start > f.start) next.push({ start: f.start, end: b.start });
      if (b.end < f.end) next.push({ start: b.end, end: f.end });
    }
    frags = next;
  }
  return frags;
}

/**
 * Colloca le attività. `now` è l'istante "da cui si fluisce".
 * Le FISSE restano dove sono e diventano `busy`; le DINAMICHE riempiono i buchi.
 */
export function schedule(activities: FlowActivity[], wh: WorkingHours, now: Date, horizonDays = 180): PlacedActivity[] {
  const out: PlacedActivity[] = [];
  const fromMs = now.getTime();

  // 1) le fisse: posizione nota, diventano occupazioni
  const busy: { start: number; end: number }[] = [];
  const fixed = activities.filter((a) => a.scheduledStart);
  for (const a of fixed) {
    const s = new Date(a.scheduledStart!).getTime();
    const dur = (a.estimatedMinutes ?? 60) * 60_000;
    busy.push({ start: s, end: s + dur });
    out.push({ id: a.id, title: a.title, fixed: true, start: new Date(s).toISOString(), end: new Date(s + dur).toISOString(), conflict: 'none' });
  }
  busy.sort((x, y) => x.start - y.start);

  // 2) genera i frammenti liberi nell'orizzonte
  const free: { start: number; end: number }[] = [];
  const day0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let d = 0; d < horizonDays; d++) {
    const day = new Date(day0.getTime() + d * DAY_MS);
    for (const win of dayWindows(day, wh)) {
      const clipped = { start: Math.max(win.start, fromMs), end: win.end };
      if (clipped.start >= clipped.end) continue;
      free.push(...subtractBusy(clipped, busy));
    }
  }
  free.sort((x, y) => x.start - y.start);

  // 3) dinamiche, in ordine (priorità asc, poi creazione): le si "versa" nei frammenti
  const dynamics = activities
    .filter((a) => !a.scheduledStart)
    .sort((a, b) => a.prioritySeq - b.prioritySeq || a.createdAt.localeCompare(b.createdAt));

  // cursore: indice frammento + offset consumato dentro il frammento
  let fi = 0;
  let used = 0; // ms consumati nel frammento corrente
  for (const a of dynamics) {
    let need = (a.estimatedMinutes ?? 60) * 60_000;
    const earliest = a.earliestStart ? new Date(a.earliestStart).getTime() : fromMs;
    let start: number | null = null;
    let end: number | null = null;

    while (need > 0 && fi < free.length) {
      const frag = free[fi]!;
      let cursor = frag.start + used;
      // rispetta earliest_start: salta finché il cursore non lo raggiunge
      if (cursor < earliest) {
        if (frag.end <= earliest) { fi++; used = 0; continue; }
        used = earliest - frag.start;
        cursor = earliest;
      }
      const avail = frag.end - cursor;
      if (avail <= 0) { fi++; used = 0; continue; }
      if (start === null) start = cursor;
      const take = Math.min(avail, need);
      end = cursor + take;
      need -= take;
      used += take;
      if (used >= frag.end - frag.start) { fi++; used = 0; }
    }

    if (start === null || need > 0) {
      out.push({ id: a.id, title: a.title, fixed: false, start: null, end: null, conflict: 'unplaceable' });
      continue;
    }
    const missed = a.dueBy ? end! > new Date(a.dueBy).getTime() : false;
    out.push({
      id: a.id, title: a.title, fixed: false,
      start: new Date(start).toISOString(), end: new Date(end!).toISOString(),
      conflict: missed ? 'due_by_missed' : 'none',
    });
  }

  // ordina l'output per inizio (le unplaceable in fondo)
  return out.sort((x, y) => {
    if (!x.start) return 1;
    if (!y.start) return -1;
    return x.start.localeCompare(y.start);
  });
}

// =====================================================================
//  MOTORE PER-RISORSA (FASE 2) — sostituisce la timeline unica con un piano
//  PER OGNI risorsa. Calendario effettivo di una risorsa:
//    (resource.working_hours ?? tenant.working_hours)  −  resource_availability
//  Le FISSE assegnate diventano occupazioni; le DINAMICHE si versano nei buchi
//  COMUNI a TUTTE le risorse assegnate (intersezione: persona + mezzo insieme),
//  in ordine priorità poi created_at, rispettando earliest_start/due_by.
//  La schedule() classica resta intatta (test di regressione verdi).
//  NB: è un forward-pass greedy "best-in-class"; il solver ottimizzante
//  (Timefold/OR-Tools) è il tier successivo (BACKLOG).
// =====================================================================
export interface FlowResource { id: string; label: string; resourceKind: string; workingHours: WorkingHours | null; unavailable: { start: string; end: string }[] }
export interface FlowAssignedActivity {
  id: string; title: string; estimatedMinutes: number | null; scheduledStart: string | null;
  earliestStart: string | null; dueBy: string | null; prioritySeq: number; createdAt: string; resourceIds: string[];
}
export interface ResourceBlock { activityId: string; title: string; kind: 'fixed' | 'flowing'; start: string; end: string; atRisk: boolean }
export interface ResourcePlan { resourceId: string; label: string; resourceKind: string; blocks: ResourceBlock[] }
export interface WeekConflict { activityId: string; title: string; reason: 'due_by_missed' | 'unplaceable' }
export interface WeekSchedule { resources: ResourcePlan[]; conflicts: WeekConflict[] }

type Iv = { start: number; end: number };
function ivSubtract(frags: Iv[], s: number, e: number): Iv[] {
  const out: Iv[] = [];
  for (const f of frags) {
    if (e <= f.start || s >= f.end) { out.push(f); continue; }
    if (s > f.start) out.push({ start: f.start, end: s });
    if (e < f.end) out.push({ start: e, end: f.end });
  }
  return out;
}
function ivIntersect(a: Iv[], b: Iv[]): Iv[] {
  const out: Iv[] = []; let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const s = Math.max(a[i]!.start, b[j]!.start), e = Math.min(a[i]!.end, b[j]!.end);
    if (s < e) out.push({ start: s, end: e });
    if (a[i]!.end < b[j]!.end) i++; else j++;
  }
  return out;
}
/** colloca `need` ms a partire da `earliest`, scorrendo i frammenti (può spaziare su più finestre/giorni). */
function fillAcross(frags: Iv[], need: number, earliest: number): Iv | null {
  let start: number | null = null, end = 0, remaining = need;
  for (const f of frags) {
    const cursor = Math.max(f.start, earliest);
    if (cursor >= f.end) continue;
    if (start === null) start = cursor;
    const take = Math.min(f.end - cursor, remaining);
    end = cursor + take; remaining -= take;
    if (remaining <= 0) return { start, end };
  }
  return null;
}

export function scheduleResources(resources: FlowResource[], activities: FlowAssignedActivity[], tenantWH: WorkingHours, now: Date, horizonDays = 21): WeekSchedule {
  const fromMs = now.getTime();
  const day0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const free = new Map<string, Iv[]>();
  const blocks = new Map<string, ResourceBlock[]>();

  for (const r of resources) {
    const wh = r.workingHours ?? tenantWH;
    let frags: Iv[] = [];
    for (let d = 0; d < horizonDays; d++) {
      const day = new Date(day0.getTime() + d * DAY_MS);
      for (const win of dayWindows(day, wh)) {
        const clipped = { start: Math.max(win.start, fromMs), end: win.end };
        if (clipped.start < clipped.end) frags.push(clipped);
      }
    }
    for (const u of r.unavailable) frags = ivSubtract(frags, new Date(u.start).getTime(), new Date(u.end).getTime());
    free.set(r.id, frags.sort((a, b) => a.start - b.start));
    blocks.set(r.id, []);
  }

  // 1) fisse assegnate → occupazioni
  for (const a of activities.filter((x) => x.scheduledStart)) {
    const s = new Date(a.scheduledStart!).getTime();
    const dur = (a.estimatedMinutes ?? 60) * 60_000;
    for (const rid of a.resourceIds) {
      if (!free.has(rid)) continue;
      free.set(rid, ivSubtract(free.get(rid)!, s, s + dur));
      blocks.get(rid)!.push({ activityId: a.id, title: a.title, kind: 'fixed', start: new Date(s).toISOString(), end: new Date(s + dur).toISOString(), atRisk: false });
    }
  }

  // 2) dinamiche assegnate → buchi COMUNI alle risorse assegnate
  const conflicts: WeekConflict[] = [];
  const dynamics = activities.filter((a) => !a.scheduledStart && a.resourceIds.some((r) => free.has(r)))
    .sort((a, b) => a.prioritySeq - b.prioritySeq || a.createdAt.localeCompare(b.createdAt));
  for (const a of dynamics) {
    const rids = a.resourceIds.filter((r) => free.has(r));
    const need = (a.estimatedMinutes ?? 60) * 60_000;
    const earliest = a.earliestStart ? new Date(a.earliestStart).getTime() : fromMs;
    let common = free.get(rids[0]!)!;
    for (let i = 1; i < rids.length; i++) common = ivIntersect(common, free.get(rids[i]!)!);
    const slot = fillAcross(common, need, earliest);
    if (!slot) { conflicts.push({ activityId: a.id, title: a.title, reason: 'unplaceable' }); continue; }
    const atRisk = a.dueBy ? slot.end > new Date(a.dueBy).getTime() : false;
    if (atRisk) conflicts.push({ activityId: a.id, title: a.title, reason: 'due_by_missed' });
    for (const rid of rids) {
      free.set(rid, ivSubtract(free.get(rid)!, slot.start, slot.end));
      blocks.get(rid)!.push({ activityId: a.id, title: a.title, kind: 'flowing', start: new Date(slot.start).toISOString(), end: new Date(slot.end).toISOString(), atRisk });
    }
  }

  const plans: ResourcePlan[] = resources.map((r) => ({
    resourceId: r.id, label: r.label, resourceKind: r.resourceKind,
    blocks: blocks.get(r.id)!.sort((x, y) => x.start.localeCompare(y.start)),
  }));
  return { resources: plans, conflicts };
}
