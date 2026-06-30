/**
 * resolve.ts — mappa l'identità verificata (JWT sub) al contesto utente,
 * chiamando la funzione SECURITY DEFINER app_resolve_context (003_app_functions.sql).
 * Questa lettura NON è ancora soggetta a RLS (per definizione: serve a stabilire
 * CHI è l'utente prima di poter impostare la sessione RLS).
 */
import { pool } from '../db/pool.js';
import type { UserContext, DataScope, Locale } from '@sisuite/shared';

/**
 * Risolve il contesto dato l'auth_user_id. Se non c'è ancora un app_user legato
 * a quell'identità e abbiamo l'email verificata, prova il PROVISIONING-BY-EMAIL
 * (flusso invito): lega l'identità a un app_user creato dall'admin e lo attiva.
 * Nessuna auto-registrazione aperta: se non esiste un app_user con quella email
 * (invited, non legato), non si crea nulla.
 */
export async function resolveContext(authUserId: string, email?: string | null): Promise<UserContext | null> {
  let rows = (await pool.query(
    `SELECT user_id, tenant_id, full_name, email, locale,
            is_platform_admin, company_id, data_scope, permissions, entitlements
     FROM app_resolve_context($1)`,
    [authUserId],
  )).rows;
  if (rows.length === 0 && email) {
    const linked = await pool.query(`SELECT public.app_link_identity_by_email($1, $2) AS id`, [authUserId, email]);
    if (linked.rows[0]?.id) {
      rows = (await pool.query(
        `SELECT user_id, tenant_id, full_name, email, locale,
                is_platform_admin, company_id, data_scope, permissions, entitlements
         FROM app_resolve_context($1)`,
        [authUserId],
      )).rows;
    }
  }
  if (rows.length === 0) return null;
  const r = rows[0];
  const tc = await pool.query(`SELECT country FROM tenant WHERE id = $1`, [r.tenant_id]);
  return {
    userId: r.user_id,
    tenantId: r.tenant_id,
    country: ((tc.rows[0]?.country as string) ?? 'IT').trim(),
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
