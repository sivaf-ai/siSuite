/**
 * scheduler.test.ts — RETE DI SICUREZZA per il motore di flusso (brief §5.5).
 *
 * Blocca il COMPORTAMENTO ATTUALE di flow/scheduler.ts PRIMA di modificarlo
 * (disponibilità risorse, per-risorsa, dipendenze verranno dopo, ognuno con i
 * propri test aggiuntivi). È una funzione PURA: nessun DB, asserzioni esatte.
 *
 * Orari: per robustezza uso una finestra unica 08:00–18:00 su TUTTI i 7 giorni,
 * così le asserzioni non dipendono dal giorno della settimana. Gli orari sono
 * interpretati come UTC "naive" (limite dichiarato dello scheduler), quindi
 * `now` e gli istanti sono in UTC.
 */
import { describe, expect, it } from 'vitest';
import {
  schedule, scheduleResources,
  type FlowActivity, type WorkingHours, type FlowResource, type FlowAssignedActivity,
} from '../src/flow/scheduler.js';

const WH: WorkingHours = {
  mon: [['08:00', '18:00']], tue: [['08:00', '18:00']], wed: [['08:00', '18:00']],
  thu: [['08:00', '18:00']], fri: [['08:00', '18:00']], sat: [['08:00', '18:00']], sun: [['08:00', '18:00']],
};
const NOW = new Date('2026-06-15T06:00:00.000Z'); // lunedì, prima dell'apertura

function act(p: Partial<FlowActivity> & { id: string }): FlowActivity {
  return {
    id: p.id,
    title: p.title ?? p.id,
    estimatedMinutes: p.estimatedMinutes ?? 60,
    scheduledStart: p.scheduledStart ?? null,
    earliestStart: p.earliestStart ?? null,
    dueBy: p.dueBy ?? null,
    prioritySeq: p.prioritySeq ?? 3,
    createdAt: p.createdAt ?? '2026-06-01T00:00:00.000Z',
  };
}
const byId = (rows: ReturnType<typeof schedule>) => Object.fromEntries(rows.map((r) => [r.id, r]));

describe('scheduler — comportamento attuale (rete di sicurezza)', () => {
  it('una dinamica si colloca dall\'inizio dell\'orario di lavoro', () => {
    const out = byId(schedule([act({ id: 'd1', estimatedMinutes: 120 })], WH, NOW));
    expect(out.d1.fixed).toBe(false);
    expect(out.d1.start).toBe('2026-06-15T08:00:00.000Z');
    expect(out.d1.end).toBe('2026-06-15T10:00:00.000Z');
    expect(out.d1.conflict).toBe('none');
  });

  it('le FISSE diventano occupazioni e le dinamiche fluiscono attorno', () => {
    const out = byId(schedule([
      act({ id: 'fix', scheduledStart: '2026-06-15T08:00:00.000Z', estimatedMinutes: 120 }),
      act({ id: 'dyn', estimatedMinutes: 60 }),
    ], WH, NOW));
    // la fissa è riportata invariata
    expect(out.fix.fixed).toBe(true);
    expect(out.fix.start).toBe('2026-06-15T08:00:00.000Z');
    expect(out.fix.end).toBe('2026-06-15T10:00:00.000Z');
    // la dinamica parte DOPO l'occupazione (10:00), nessuna sovrapposizione
    expect(out.dyn.start).toBe('2026-06-15T10:00:00.000Z');
    expect(out.dyn.end).toBe('2026-06-15T11:00:00.000Z');
  });

  it('rispetta earliest_start (non parte prima)', () => {
    const out = byId(schedule([
      act({ id: 'e1', estimatedMinutes: 60, earliestStart: '2026-06-15T14:00:00.000Z' }),
    ], WH, NOW));
    expect(out.e1.start).toBe('2026-06-15T14:00:00.000Z');
    expect(out.e1.end).toBe('2026-06-15T15:00:00.000Z');
  });

  it('due_by non raggiungibile → SEGNALATO (non violato in silenzio)', () => {
    const out = byId(schedule([
      act({ id: 'late', estimatedMinutes: 120, dueBy: '2026-06-15T09:00:00.000Z' }),
    ], WH, NOW));
    expect(out.late.start).toBe('2026-06-15T08:00:00.000Z'); // collocata comunque
    expect(out.late.end).toBe('2026-06-15T10:00:00.000Z');   // oltre la scadenza
    expect(out.late.conflict).toBe('due_by_missed');
  });

  it('attività non collocabile (earliest oltre l\'orizzonte) → unplaceable', () => {
    const out = byId(schedule([
      act({ id: 'never', estimatedMinutes: 60, earliestStart: '2027-06-15T08:00:00.000Z' }),
    ], WH, NOW, 30));
    expect(out.never.start).toBeNull();
    expect(out.never.end).toBeNull();
    expect(out.never.conflict).toBe('unplaceable');
  });

  it('ordina le dinamiche per PRIORITÀ (asc) poi data di creazione', () => {
    const out = byId(schedule([
      act({ id: 'bassa', prioritySeq: 4, estimatedMinutes: 60, createdAt: '2026-06-01T00:00:00.000Z' }),
      act({ id: 'urgente', prioritySeq: 1, estimatedMinutes: 60, createdAt: '2026-06-02T00:00:00.000Z' }),
    ], WH, NOW));
    // l'urgente (seq 1) va prima della bassa (seq 4) malgrado created_at più recente
    expect(new Date(out.urgente.start!).getTime()).toBeLessThan(new Date(out.bassa.start!).getTime());
    expect(out.urgente.start).toBe('2026-06-15T08:00:00.000Z');
    expect(out.bassa.start).toBe('2026-06-15T09:00:00.000Z');
  });

  it('a parità di priorità ordina per data di creazione (più vecchia prima)', () => {
    const out = byId(schedule([
      act({ id: 'nuova', prioritySeq: 2, estimatedMinutes: 60, createdAt: '2026-06-02T00:00:00.000Z' }),
      act({ id: 'vecchia', prioritySeq: 2, estimatedMinutes: 60, createdAt: '2026-06-01T00:00:00.000Z' }),
    ], WH, NOW));
    expect(new Date(out.vecchia.start!).getTime()).toBeLessThan(new Date(out.nuova.start!).getTime());
  });
});

/* ── Motore PER-RISORSA (FASE 2) ─────────────────────────────────────── */
function res(p: Partial<FlowResource> & { id: string }): FlowResource {
  return { id: p.id, label: p.label ?? p.id, resourceKind: p.resourceKind ?? 'person', workingHours: p.workingHours ?? null, unavailable: p.unavailable ?? [] };
}
function aact(p: Partial<FlowAssignedActivity> & { id: string; resourceIds: string[] }): FlowAssignedActivity {
  return {
    id: p.id, title: p.title ?? p.id, estimatedMinutes: p.estimatedMinutes ?? 60,
    scheduledStart: p.scheduledStart ?? null, earliestStart: p.earliestStart ?? null, dueBy: p.dueBy ?? null,
    prioritySeq: p.prioritySeq ?? 3, createdAt: p.createdAt ?? '2026-06-01T00:00:00.000Z', resourceIds: p.resourceIds,
  };
}
const planOf = (w: ReturnType<typeof scheduleResources>, rid: string) => w.resources.find((r) => r.resourceId === rid)!;

describe('scheduleResources — motore per-risorsa', () => {
  it('fallback all\'orario AZIENDA quando la risorsa non ha working_hours', () => {
    const w = scheduleResources([res({ id: 'r1' })], [aact({ id: 'd1', estimatedMinutes: 120, resourceIds: ['r1'] })], WH, NOW);
    const b = planOf(w, 'r1').blocks;
    expect(b).toHaveLength(1);
    expect(b[0]!.start).toBe('2026-06-15T08:00:00.000Z');
    expect(b[0]!.end).toBe('2026-06-15T10:00:00.000Z');
    expect(b[0]!.kind).toBe('flowing');
  });

  it('usa l\'orario della RISORSA quando valorizzato (override)', () => {
    const afternoon: WorkingHours = { mon: [['14:00', '18:00']], tue: [['14:00', '18:00']], wed: [['14:00', '18:00']], thu: [['14:00', '18:00']], fri: [['14:00', '18:00']], sat: [['14:00', '18:00']], sun: [['14:00', '18:00']] };
    const w = scheduleResources([res({ id: 'r1', workingHours: afternoon })], [aact({ id: 'd1', estimatedMinutes: 60, resourceIds: ['r1'] })], WH, NOW);
    expect(planOf(w, 'r1').blocks[0]!.start).toBe('2026-06-15T14:00:00.000Z');
  });

  it('sottrae resource_availability (ferie/indisponibilità)', () => {
    const w = scheduleResources(
      [res({ id: 'r1', unavailable: [{ start: '2026-06-15T08:00:00.000Z', end: '2026-06-15T12:00:00.000Z' }] })],
      [aact({ id: 'd1', estimatedMinutes: 60, resourceIds: ['r1'] })], WH, NOW);
    expect(planOf(w, 'r1').blocks[0]!.start).toBe('2026-06-15T12:00:00.000Z');
  });

  it('attività multi-risorsa: collocata nel buco COMUNE (intersezione) e presente in ENTRAMBE le righe', () => {
    const mornR1: WorkingHours = { mon: [['08:00', '12:00']], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
    const lateR2: WorkingHours = { mon: [['10:00', '18:00']], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
    const w = scheduleResources(
      [res({ id: 'r1', workingHours: mornR1 }), res({ id: 'r2', workingHours: lateR2 })],
      [aact({ id: 'd1', estimatedMinutes: 60, resourceIds: ['r1', 'r2'] })], WH, NOW);
    expect(planOf(w, 'r1').blocks[0]!.start).toBe('2026-06-15T10:00:00.000Z'); // intersezione 10–12
    expect(planOf(w, 'r2').blocks[0]!.start).toBe('2026-06-15T10:00:00.000Z');
  });

  it('due risorse in parallelo: ognuna pianifica la propria dinamica indipendentemente', () => {
    const w = scheduleResources(
      [res({ id: 'r1' }), res({ id: 'r2' })],
      [aact({ id: 'a', estimatedMinutes: 60, resourceIds: ['r1'] }), aact({ id: 'b', estimatedMinutes: 60, resourceIds: ['r2'] })], WH, NOW);
    expect(planOf(w, 'r1').blocks[0]!.start).toBe('2026-06-15T08:00:00.000Z');
    expect(planOf(w, 'r2').blocks[0]!.start).toBe('2026-06-15T08:00:00.000Z');
  });

  it('due_by non raggiungibile → blocco at_risk + conflitto', () => {
    const w = scheduleResources([res({ id: 'r1' })], [aact({ id: 'late', estimatedMinutes: 120, dueBy: '2026-06-15T09:00:00.000Z', resourceIds: ['r1'] })], WH, NOW);
    expect(planOf(w, 'r1').blocks[0]!.atRisk).toBe(true);
    expect(w.conflicts.some((c) => c.activityId === 'late' && c.reason === 'due_by_missed')).toBe(true);
  });

  it('niente doppia prenotazione: la 2ª dinamica della stessa risorsa parte DOPO la 1ª', () => {
    const w = scheduleResources([res({ id: 'r1' })], [
      aact({ id: 'a', estimatedMinutes: 60, prioritySeq: 1, resourceIds: ['r1'] }),
      aact({ id: 'b', estimatedMinutes: 60, prioritySeq: 2, resourceIds: ['r1'] }),
    ], WH, NOW);
    const b = planOf(w, 'r1').blocks;
    expect(b.find((x) => x.activityId === 'a')!.start).toBe('2026-06-15T08:00:00.000Z');
    expect(b.find((x) => x.activityId === 'b')!.start).toBe('2026-06-15T09:00:00.000Z');
  });
});
