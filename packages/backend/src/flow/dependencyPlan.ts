/**
 * dependencyPlan.ts — INTEGRAZIONE DIPENDENZE nello scheduler, NON invasiva.
 *
 * `flow/scheduler.ts` resta INTATTO (rete di test invariata). Qui rispettiamo i
 * vincoli Fine→Inizio (FS) come strato attorno al motore: lo scheduler già
 * onora `earliestStart`, quindi propaghiamo iterativamente
 *     earliest(successore) = max(earliest_start, fine(predecessore) + lag)
 * ri-chiamando `scheduleResources` finché gli earliest non si stabilizzano
 * (gli earliest crescono in modo monotòno → su un DAG converge; cap a N+1 iter).
 * Principio del brief: "proponi, non forzare" — un successore spinto oltre la
 * scadenza diventa `at_risk`/conflitto, che il layer AI poi racconta/propone.
 */
import {
  scheduleResources,
  type FlowResource, type FlowAssignedActivity, type WorkingHours, type WeekSchedule,
} from './scheduler.js';

export interface DepEdge { predecessorId: string; successorId: string; lagMinutes: number }

export function scheduleWithDependencies(
  resources: FlowResource[], activities: FlowAssignedActivity[], deps: DepEdge[],
  tenantWH: WorkingHours, now: Date, horizonDays = 21,
): WeekSchedule {
  const nowMs = now.getTime();
  const ids = new Set(activities.map((a) => a.id));
  // earliest "effettivo" per attività (ms): parte da earliest_start o adesso
  const earliest = new Map<string, number>();
  for (const a of activities) earliest.set(a.id, a.earliestStart ? new Date(a.earliestStart).getTime() : nowMs);

  // solo archi tra attività in scope
  const edges = deps.filter((d) => ids.has(d.predecessorId) && ids.has(d.successorId));
  const maxIter = activities.length + 1;
  let result: WeekSchedule = { resources: [], conflicts: [] };

  for (let iter = 0; iter <= maxIter; iter++) {
    // applica gli earliest correnti SOLO alle dinamiche (le fisse restano dove sono)
    const adjusted: FlowAssignedActivity[] = activities.map((a) =>
      a.scheduledStart ? a : { ...a, earliestStart: new Date(earliest.get(a.id)!).toISOString() });

    result = scheduleResources(resources, adjusted, tenantWH, now, horizonDays);

    // fine effettiva per attività (max end tra i suoi blocchi)
    const endOf = new Map<string, number>();
    for (const r of result.resources) {
      for (const b of r.blocks) {
        const e = new Date(b.end).getTime();
        if (e > (endOf.get(b.activityId) ?? 0)) endOf.set(b.activityId, e);
      }
    }

    // propaga ai successori
    let changed = false;
    for (const d of edges) {
      const predEnd = endOf.get(d.predecessorId);
      if (predEnd == null) continue; // predecessore non collocato: non vincoliamo
      const required = predEnd + d.lagMinutes * 60_000;
      if (required > earliest.get(d.successorId)!) { earliest.set(d.successorId, required); changed = true; }
    }
    if (!changed) break;
  }
  return result;
}
