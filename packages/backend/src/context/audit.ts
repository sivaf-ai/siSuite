/**
 * audit.ts — registro azioni (audit_log): "chi ha fatto cosa e quando".
 * Usato soprattutto per archiviazione/ripristino/eliminazione definitiva
 * (soft-delete tracciato), estendibile a create/update.
 * Gira sotto RLS (withRls) → tenant-scoped.
 */
import type { PoolClient } from 'pg';

export type AuditAction = 'create' | 'update' | 'archive' | 'restore' | 'purge' | 'delete';

export async function logAudit(
  db: PoolClient,
  ctx: { tenantId: string; userId: string },
  e: { entity: string; entityId: string; action: AuditAction; label?: string | null; detail?: unknown },
): Promise<void> {
  await db.query(
    `INSERT INTO audit_log (tenant_id, entity, entity_id, action, label, user_id, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [ctx.tenantId, e.entity, e.entityId, e.action, e.label ?? null, ctx.userId,
     e.detail != null ? JSON.stringify(e.detail) : null],
  );
}
