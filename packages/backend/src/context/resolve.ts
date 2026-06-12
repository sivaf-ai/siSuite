/**
 * resolve.ts — mappa l'identità verificata (JWT sub) al contesto utente,
 * chiamando la funzione SECURITY DEFINER app_resolve_context (003_app_functions.sql).
 * Questa lettura NON è ancora soggetta a RLS (per definizione: serve a stabilire
 * CHI è l'utente prima di poter impostare la sessione RLS).
 */
import { pool } from '../db/pool.js';
import type { UserContext, DataScope, Locale } from '@sisuite/shared';

export async function resolveContext(authUserId: string): Promise<UserContext | null> {
  const { rows } = await pool.query(
    `SELECT user_id, tenant_id, full_name, email, locale,
            is_platform_admin, company_id, data_scope, permissions, entitlements
     FROM app_resolve_context($1)`,
    [authUserId],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    userId: r.user_id,
    tenantId: r.tenant_id,
    fullName: r.full_name,
    email: r.email,
    locale: (r.locale ?? 'it-IT') as Locale,
    isPlatformAdmin: r.is_platform_admin,
    dataScope: r.data_scope as DataScope,
    companyId: r.company_id,
    permissions: r.permissions ?? [],
    entitlements: r.entitlements ?? {},
  };
}
