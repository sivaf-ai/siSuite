/**
 * weekView.test.ts — anti-regressione del BUG "griglia vuota / mini divergente".
 *
 * Bug originario: il mini ("Attività · Ore") contava TUTTO l'orizzonte mentre la
 * griglia, filtrata alla settimana mostrata, restava vuota → numeri divergenti
 * (mini "6 · 13h", griglia 0 blocchi). scopeWeek ritaglia il piano alla settimana
 * richiesta in modo che mini e griglia derivino dallo STESSO insieme di blocchi.
 */
import { describe, expect, it } from 'vitest';
import { scopeWeek, mondayOfUTC } from '../src/flow/weekView.js';
import type { WeekSchedule } from '../src/flow/scheduler.js';

// Piano finto su DUE settimane: A (lun 15/06) e B (lun 22/06).
const FULL: WeekSchedule = {
  resources: [
    {
      resourceId: 'r1', label: 'Marco', resourceKind: 'person',
      blocks: [
        { activityId: 'a1', title: 'Giunzione', kind: 'flowing', start: '2026-06-15T08:00:00.000Z', end: '2026-06-15T09:30:00.000Z', atRisk: false },
        { activityId: 'a2', title: 'Collaudo',  kind: 'flowing', start: '2026-06-16T08:00:00.000Z', end: '2026-06-16T08:45:00.000Z', atRisk: true },
        { activityId: 'b1', title: 'Manutenzione', kind: 'flowing', start: '2026-06-22T08:00:00.000Z', end: '2026-06-22T09:00:00.000Z', atRisk: false },
      ],
    },
    {
      resourceId: 'r2', label: 'Davide', resourceKind: 'person',
      blocks: [
        { activityId: 'a1', title: 'Giunzione', kind: 'flowing', start: '2026-06-15T08:00:00.000Z', end: '2026-06-15T09:30:00.000Z', atRisk: false },
      ],
    },
  ],
  conflicts: [
    { activityId: 'a2', title: 'Collaudo', reason: 'due_by_missed' },
    { activityId: 'z9', title: 'Senza posto', reason: 'unplaceable' },
  ],
};

describe('scopeWeek — ritaglio settimanale (anti-regressione bug griglia)', () => {
  it('settimana A: solo i blocchi di A; mini coincide con i blocchi resi', () => {
    const v = scopeWeek(FULL, '2026-06-15');
    const rendered = v.resources.flatMap((r) => r.blocks);
    // nessun blocco della settimana B finisce nella A
    expect(rendered.every((b) => b.start.startsWith('2026-06-15') || b.start.startsWith('2026-06-16'))).toBe(true);
    // mini = ciò che la griglia rende
    expect(v.totals.activities).toBe(new Set(rendered.map((b) => b.activityId)).size); // a1, a2 → 2
    expect(v.totals.activities).toBe(2);
    // minuti: r1 (90+45) + r2 (90) = 225
    expect(v.totals.minutes).toBe(225);
  });

  it('settimana vuota (passata): mini = 0 e NON conta i blocchi di altre settimane (il bug)', () => {
    const v = scopeWeek(FULL, '2026-06-08'); // settimana precedente, senza blocchi
    expect(v.resources.every((r) => r.blocks.length === 0)).toBe(true);
    expect(v.totals.activities).toBe(0);
    expect(v.totals.minutes).toBe(0);
    // suggestedFrom punta alla PRIMA settimana piena (lun 15/06), non resta sulla vuota
    expect(v.suggestedFrom).toBe('2026-06-15');
  });

  it('conflitti: quelli con blocco nella settimana + gli unplaceable (globali)', () => {
    const a = scopeWeek(FULL, '2026-06-15');
    expect(a.conflicts.map((c) => c.activityId).sort()).toEqual(['a2', 'z9']); // due_by in settimana + unplaceable
    const b = scopeWeek(FULL, '2026-06-22');
    expect(b.conflicts.map((c) => c.activityId)).toEqual(['z9']); // a2 non è in questa settimana; resta l'unplaceable
    expect(b.totals.conflicts).toBe(1);
  });

  it('suggestedFrom = weekFrom quando il piano è del tutto vuoto', () => {
    const v = scopeWeek({ resources: [], conflicts: [] }, '2026-06-15');
    expect(v.suggestedFrom).toBe('2026-06-15');
  });

  it('mondayOfUTC: lunedì della settimana ISO (domenica appartiene alla settimana precedente)', () => {
    expect(mondayOfUTC(new Date('2026-06-14T12:00:00.000Z')).toISOString().slice(0, 10)).toBe('2026-06-08'); // dom 14 → lun 08
    expect(mondayOfUTC(new Date('2026-06-15T00:00:00.000Z')).toISOString().slice(0, 10)).toBe('2026-06-15'); // lun 15 → lun 15
  });
});
