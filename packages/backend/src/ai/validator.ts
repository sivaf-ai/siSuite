/**
 * validator.ts — il livello DETERMINISTICO che "dispone".
 * Prende le operazioni proposte dall'LLM e le valida senza l'AI:
 *   - referenziale: gli id esistono nel contesto (visibile all'utente via RLS)
 *   - RBAC: l'utente ha il permesso per QUELL'operazione (l'AI agisce dentro i
 *     permessi di chi la invoca, non è una scorciatoia)
 *   - business: minuti/quantità positivi, stato canonico noto, ecc.
 * Arricchisce ogni operazione con etichette risolte e auto-applicabilità.
 */
import { can, type PermissionKey, type ProposedOperation, type OperationType } from '@sisuite/shared';
import { config } from '../config.js';
import type { RawOperation } from './extractionSchema.js';
import type { ExtractionContext } from './context.js';

const PERMISSION_OF: Record<OperationType, PermissionKey | null> = {
  log_time: 'time_entry:create',
  log_material: 'material_consumption:create',
  set_activity_status: 'activity:update',
  check_checklist_item: 'activity:update',
  clarify: null,
};

export function validateOperations(
  raw: RawOperation[],
  context: ExtractionContext,
  permissions: ReadonlySet<PermissionKey>,
  today: string,
): ProposedOperation[] {
  return raw.map((op) => {
    const activity = op.activityId ? context.activities.find((a) => a.id === op.activityId) : undefined;
    const material = op.materialId ? context.materials.find((m) => m.id === op.materialId) : undefined;

    let valid = true;
    let reason: string | null = null;
    const fail = (r: string) => { valid = false; reason = reason ?? r; };

    // RBAC
    const needed = PERMISSION_OF[op.type];
    if (needed && !can(permissions, needed)) fail(`Permesso mancante: ${needed}`);

    // referenziale + business per tipo
    if (op.type === 'clarify') {
      valid = false; // 'clarify' non è applicabile: è una domanda
      reason = 'Richiede chiarimento';
    } else if (op.type === 'log_time') {
      if (!activity) fail('Attività non riconosciuta');
      if (!op.minutes || op.minutes <= 0 || !Number.isFinite(op.minutes)) fail('Minuti non validi');
      if (!op.typology) fail('Tipologia mancante');
    } else if (op.type === 'log_material') {
      if (!activity) fail('Attività non riconosciuta');
      if (!material) fail('Materiale non riconosciuto');
      if (!op.quantity || op.quantity <= 0) fail('Quantità non valida');
    } else if (op.type === 'set_activity_status') {
      if (!activity) fail('Attività non riconosciuta');
      if (!op.statusCanonical || !context.activityStatuses.includes(op.statusCanonical)) fail('Stato non valido');
    } else if (op.type === 'check_checklist_item') {
      if (!activity) fail('Attività non riconosciuta');
      if (!op.checklistText) fail('Passo checklist mancante');
      else if (activity && !activity.checklist.some((t) => t.toLowerCase().includes(op.checklistText!.toLowerCase()))) {
        fail('Passo checklist non trovato');
      }
    }

    const occurredOn = op.occurredOn && /^\d{4}-\d{2}-\d{2}$/.test(op.occurredOn) ? op.occurredOn : today;
    const autoApplicable = valid && op.type !== 'clarify' && op.confidence >= config.ai.autoApplyThreshold;

    return {
      type: op.type,
      activityId: op.activityId,
      activityTitle: activity?.title ?? null,
      materialId: op.materialId,
      materialName: material?.name ?? null,
      minutes: op.minutes,
      typology: op.typology,
      quantity: op.quantity,
      unit: material?.unit ?? null,
      statusCanonical: op.statusCanonical,
      checklistText: op.checklistText,
      done: op.done,
      occurredOn,
      confidence: op.confidence,
      rationale: op.rationale,
      valid,
      reason,
      autoApplicable,
    } satisfies ProposedOperation;
  });
}
