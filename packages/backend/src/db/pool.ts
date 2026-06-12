/**
 * pool.ts — pool Postgres del backend.
 * Il backend si connette come ruolo `sisuite_app` (NOSUPERUSER, NOBYPASSRLS):
 * ogni query è SOGGETTA a RLS. La sessione RLS si imposta per-richiesta con
 * SET LOCAL dentro una transazione (vedi context/rls.ts).
 */
import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  // un client idle è morto: log, il pool si auto-recupera
  console.error('[db] errore client idle nel pool:', err.message);
});

export type PoolClient = pg.PoolClient;
