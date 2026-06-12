/**
 * process.ts — il "passo di elaborazione" della cattura, riusabile sia dal
 * percorso SINCRONO (testo) sia dal WORKER asincrono (voce, "elabora-dopo").
 * Assembla il contesto (RLS-scoped), estrae (se l'AI è attiva, FUORI da tx),
 * valida e persiste la proposta sul capture.
 */
import type { UserContext, ProposedOperation, PermissionKey, CaptureStatus } from '@sisuite/shared';
import { withRls } from '../context/rls.js';
import { aiEnabled } from '../config.js';
import { assembleContext } from './context.js';
import { extract } from './extractor.js';
import { validateOperations } from './validator.js';
import type { RawOperation } from './extractionSchema.js';

export async function runExtraction(
  ctx: UserContext,
  captureId: string,
  rawText: string | null,
  engagementId?: string,
): Promise<{ operations: ProposedOperation[]; status: CaptureStatus }> {
  // contesto entro la RLS dell'utente (vede solo ciò che può vedere)
  const context = await withRls(ctx, (db) => assembleContext(db, ctx, engagementId));

  let rawOps: RawOperation[] = [];
  if (aiEnabled() && rawText && rawText.trim()) {
    rawOps = await extract(rawText, context); // chiamata LLM lenta: fuori da qualunque tx
  }

  const perms = new Set<PermissionKey>(ctx.permissions as PermissionKey[]);
  const validated = validateOperations(rawOps, context, perms, context.today);
  const status: CaptureStatus = rawOps.length ? 'proposed' : 'pending';

  await withRls(ctx, (db) =>
    db.query(`UPDATE capture SET extraction = $2, status = $3 WHERE id = $1`,
      [captureId, JSON.stringify({ operations: rawOps }), status]));

  return { operations: validated, status };
}
