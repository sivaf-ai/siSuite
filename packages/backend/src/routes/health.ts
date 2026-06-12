import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { authMode } from '../auth/verifier.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // pubblica: nessun auth, nessuna tx RLS.
  app.get('/health', async () => {
    let db = false;
    try {
      await pool.query('SELECT 1');
      db = true;
    } catch {
      db = false;
    }
    return {
      status: db ? 'ok' : 'degraded',
      service: 'sisuite-backend',
      db,
      authMode: authMode(),
      ts: new Date().toISOString(),
    };
  });
}
