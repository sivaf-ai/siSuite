/**
 * applier.ts — il COMMIT deterministico. Applica le operazioni VALIDATE dentro
 * la transazione RLS dell'utente; ogni riga creata è legata al capture
 * (source_capture_id) per tracciabilità e reversibilità. L'AI non ha mai
 * toccato il DB: scrive solo questo livello, sui dati già validati.
 */
import type { PoolClient } from '../db/pool.js';
import type { UserContext, ProposedOperation } from '@sisuite/shared';
import { lookupDefaultId } from '../status.js';

async function applyOne(db: PoolClient, ctx: UserContext, captureId: string, op: ProposedOperation): Promise<boolean> {
  switch (op.type) {
    case 'log_time': {
      const eng = await db.query(`SELECT engagement_id FROM activity WHERE id = $1`, [op.activityId]);
      const engagementId = eng.rows[0]?.engagement_id ?? null;
      await db.query(
        `INSERT INTO time_entry (tenant_id, engagement_id, activity_id, typology, minutes, occurred_on, source_capture_id, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
        [ctx.tenantId, engagementId, op.activityId, op.typology, op.minutes, op.occurredOn, captureId, ctx.userId],
      );
      return true;
    }
    case 'log_material': {
      await db.query(
        `INSERT INTO material_consumption (tenant_id, activity_id, material_id, quantity, unit, occurred_on, source_capture_id, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
        [ctx.tenantId, op.activityId, op.materialId, op.quantity, op.unit ?? 'pz', op.occurredOn, captureId, ctx.userId],
      );
      return true;
    }
    case 'set_activity_status': {
      const statusId = await lookupDefaultId(db, 'activity_status', op.statusCanonical!);
      await db.query(`UPDATE activity SET status_id = $2, updated_by = $3 WHERE id = $1`, [op.activityId, statusId, ctx.userId]);
      return true;
    }
    case 'check_checklist_item': {
      const r = await db.query(`SELECT checklist FROM activity WHERE id = $1`, [op.activityId]);
      const checklist = (r.rows[0]?.checklist ?? []) as { text: string; done: boolean }[];
      const needle = (op.checklistText ?? '').toLowerCase();
      const next = checklist.map((c) =>
        c.text.toLowerCase().includes(needle) ? { ...c, done: op.done ?? true } : c,
      );
      await db.query(`UPDATE activity SET checklist = $2, updated_by = $3 WHERE id = $1`,
        [op.activityId, JSON.stringify(next), ctx.userId]);
      return true;
    }
    default:
      return false; // 'clarify' non si applica
  }
}

/**
 * Applica le operazioni scelte. `indexes` selezionano per posizione; se assente,
 * si applicano tutte e sole le auto-applicabili. Le non-valide vengono saltate.
 * Aggiorna lo stato del capture (applied/proposed) e applied_by.
 */
export async function applyOperations(
  db: PoolClient,
  ctx: UserContext,
  captureId: string,
  operations: ProposedOperation[],
  indexes?: number[],
): Promise<ProposedOperation[]> {
  const chosen = new Set(
    indexes && indexes.length > 0
      ? indexes
      : operations.map((_, i) => i).filter((i) => operations[i]!.autoApplicable),
  );

  const result: ProposedOperation[] = [];
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i]!;
    if (chosen.has(i) && op.valid) {
      const ok = await applyOne(db, ctx, captureId, op);
      result.push({ ...op, applied: ok });
    } else {
      result.push({ ...op, applied: false });
    }
  }

  const anyApplied = result.some((o) => o.applied);
  const anyPending = result.some((o) => !o.applied && o.type !== 'clarify' && o.valid);
  const status = anyApplied && !anyPending ? 'applied' : anyApplied ? 'proposed' : 'proposed';
  await db.query(
    `UPDATE capture SET status = $2, applied_by = $3, processed_at = now() WHERE id = $1`,
    [captureId, status, ctx.userId],
  );
  return result;
}
