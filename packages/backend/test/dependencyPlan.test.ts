/**
 * dependencyPlan.test.ts — rete di sicurezza per l'integrazione DIPENDENZE (FS).
 * Lo scheduler resta intatto; qui verifichiamo che il layer propaghi gli earliest:
 * un successore parte DOPO la fine del predecessore (+lag).
 * Orari: finestra unica 08:00–18:00 su tutti i giorni; tutto in UTC (motore UTC-naive).
 */
import { describe, expect, it } from 'vitest';
import { scheduleWithDependencies, type DepEdge } from '../src/flow/dependencyPlan.js';
import type { WorkingHours, FlowResource, FlowAssignedActivity } from '../src/flow/scheduler.js';

const WH: WorkingHours = {
  mon: [['08:00', '18:00']], tue: [['08:00', '18:00']], wed: [['08:00', '18:00']],
  thu: [['08:00', '18:00']], fri: [['08:00', '18:00']], sat: [['08:00', '18:00']], sun: [['08:00', '18:00']],
};
const NOW = new Date('2026-06-15T06:00:00.000Z'); // lunedì, prima dell'apertura
const res = (id: string): FlowResource => ({ id, label: id, resourceKind: 'person', workingHours: null, unavailable: [] });
function aact(p: Partial<FlowAssignedActivity> & { id: string; resourceIds: string[] }): FlowAssignedActivity {
  return {
    id: p.id, title: p.title ?? p.id, estimatedMinutes: p.estimatedMinutes ?? 60,
    scheduledStart: p.scheduledStart ?? null, earliestStart: p.earliestStart ?? null, dueBy: p.dueBy ?? null,
    prioritySeq: p.prioritySeq ?? 3, createdAt: p.createdAt ?? '2026-06-01T00:00:00.000Z', resourceIds: p.resourceIds,
  };
}
const startOf = (w: ReturnType<typeof scheduleWithDependencies>, rid: string, actId: string) =>
  w.resources.find((r) => r.resourceId === rid)!.blocks.find((b) => b.activityId === actId)?.start;

describe('scheduleWithDependencies — vincoli Fine→Inizio', () => {
  it('il successore parte DOPO la fine del predecessore (stessa risorsa)', () => {
    const deps: DepEdge[] = [{ predecessorId: 'p', successorId: 's', lagMinutes: 0 }];
    const w = scheduleWithDependencies([res('r1')], [
      aact({ id: 'p', estimatedMinutes: 120, resourceIds: ['r1'] }),
      aact({ id: 's', estimatedMinutes: 60, resourceIds: ['r1'] }),
    ], deps, WH, NOW);
    expect(startOf(w, 'r1', 'p')).toBe('2026-06-15T08:00:00.000Z');
    expect(startOf(w, 'r1', 's')).toBe('2026-06-15T10:00:00.000Z'); // dopo p (08–10)
  });

  it('rispetta il lag (predecessore + lag)', () => {
    const deps: DepEdge[] = [{ predecessorId: 'p', successorId: 's', lagMinutes: 30 }];
    const w = scheduleWithDependencies([res('r1'), res('r2')], [
      aact({ id: 'p', estimatedMinutes: 60, resourceIds: ['r1'] }),
      aact({ id: 's', estimatedMinutes: 60, resourceIds: ['r2'] }), // risorsa diversa: senza dep partirebbe alle 08
    ], deps, WH, NOW);
    expect(startOf(w, 'r1', 'p')).toBe('2026-06-15T08:00:00.000Z'); // p 08–09
    expect(startOf(w, 'r2', 's')).toBe('2026-06-15T09:30:00.000Z'); // 09:00 + 30' lag
  });

  it('catena di 3 (a→b→c) in sequenza', () => {
    const deps: DepEdge[] = [
      { predecessorId: 'a', successorId: 'b', lagMinutes: 0 },
      { predecessorId: 'b', successorId: 'c', lagMinutes: 0 },
    ];
    const w = scheduleWithDependencies([res('r1')], [
      aact({ id: 'a', estimatedMinutes: 60, resourceIds: ['r1'] }),
      aact({ id: 'b', estimatedMinutes: 60, resourceIds: ['r1'] }),
      aact({ id: 'c', estimatedMinutes: 60, resourceIds: ['r1'] }),
    ], deps, WH, NOW);
    expect(startOf(w, 'r1', 'a')).toBe('2026-06-15T08:00:00.000Z');
    expect(startOf(w, 'r1', 'b')).toBe('2026-06-15T09:00:00.000Z');
    expect(startOf(w, 'r1', 'c')).toBe('2026-06-15T10:00:00.000Z');
  });

  it('attività indipendenti non sono toccate dalle dipendenze altrui', () => {
    const deps: DepEdge[] = [{ predecessorId: 'p', successorId: 's', lagMinutes: 0 }];
    const w = scheduleWithDependencies([res('r1'), res('r2')], [
      aact({ id: 'p', estimatedMinutes: 120, resourceIds: ['r1'] }),
      aact({ id: 's', estimatedMinutes: 60, resourceIds: ['r1'] }),
      aact({ id: 'indip', estimatedMinutes: 60, resourceIds: ['r2'] }),
    ], deps, WH, NOW);
    expect(startOf(w, 'r2', 'indip')).toBe('2026-06-15T08:00:00.000Z'); // parte subito
  });

  it('predecessore FISSO: il successore fluisce dopo la sua fine', () => {
    const deps: DepEdge[] = [{ predecessorId: 'fix', successorId: 's', lagMinutes: 0 }];
    const w = scheduleWithDependencies([res('r1')], [
      aact({ id: 'fix', scheduledStart: '2026-06-15T14:00:00.000Z', estimatedMinutes: 60, resourceIds: ['r1'] }),
      aact({ id: 's', estimatedMinutes: 60, resourceIds: ['r1'] }),
    ], deps, WH, NOW);
    expect(startOf(w, 'r1', 's')).toBe('2026-06-15T15:00:00.000Z'); // dopo la fissa 14–15
  });
});
