/** status.ts — risoluzione dell'id lookup_value di default per (categoria, canonico). */
import type { PoolClient } from './db/pool.js';

export async function lookupDefaultId(db: PoolClient, category: string, canonical: string): Promise<string> {
  const { rows } = await db.query(
    `SELECT id FROM lookup_value
     WHERE category = $1 AND canonical = $2 AND active
     ORDER BY (tenant_id IS NOT NULL) DESC, sequence ASC
     LIMIT 1`,
    [category, canonical],
  );
  if (rows.length === 0) throw new Error(`lookup di default '${category}/${canonical}' non trovato`);
  return rows[0].id as string;
}
