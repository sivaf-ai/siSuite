/**
 * rls.ts — esegue una funzione DENTRO una transazione con la sessione RLS
 * impostata. È il punto in cui "la RLS si accende": senza questo, sisuite_app
 * non vedrebbe nulla (o, peggio, le variabili di sessione resterebbero sporche
 * tra richieste nel pool).
 *
 * Usa set_config(.., is_local=true) = SET LOCAL: scoped alla TRANSAZIONE,
 * pool-safe e PARAMETRIZZATO (niente string-interpolation di UUID).
 */
import { pool, type PoolClient } from '../db/pool.js';
import type { UserContext } from '@sisuite/shared';

export async function withRls<T>(ctx: UserContext, fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('app.current_tenant',    $1, true),
              set_config('app.current_user',      $2, true),
              set_config('app.data_scope',        $3, true),
              set_config('app.current_company',   $4, true),
              set_config('app.is_platform_admin', $5, true)`,
      [
        ctx.tenantId,
        ctx.userId,
        ctx.dataScope,
        ctx.companyId ?? '',
        ctx.isPlatformAdmin ? 'true' : 'false',
      ],
    );
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* la connessione potrebbe essere già morta: ignora */
    }
    throw err;
  } finally {
    client.release();
  }
}
