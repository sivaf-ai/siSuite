/** lookupResolve.ts — risolve l'id di un lookup_value per (categoria, canonical),
 *  preferendo l'override del tenant alla riga di sistema. Gira dentro withRls. */
import type { PoolClient } from './db/pool.js';

export async function lookupIdByCanonical(db: PoolClient, category: string, canonical: string): Promise<string | null> {
  const r = await db.query(
    `SELECT id FROM lookup_value WHERE category = $1 AND canonical = $2
       AND (tenant_id = app_current_tenant() OR tenant_id IS NULL)
     ORDER BY tenant_id NULLS LAST, is_default DESC LIMIT 1`, [category, canonical]);
  return (r.rows[0]?.id as string) ?? null;
}
