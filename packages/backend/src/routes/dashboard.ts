/** dashboard.ts — conteggi sintetici per la home del pannello (rispettano RLS). */
import type { FastifyInstance } from 'fastify';
import { withRls } from '../context/rls.js';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/dashboard', { preHandler: [app.authenticate] }, async (request) => {
    return withRls(request.ctx, async (db) => {
      // query SEQUENZIALI: un client in transazione non gestisce query concorrenti
      const q = async (sql: string) => Number((await db.query(sql)).rows[0]?.n ?? 0);
      const engagements = await q(`SELECT count(*) n FROM engagement WHERE archived_at IS NULL`);
      const activitiesOpen = await q(
        `SELECT count(*) n FROM activity a JOIN lookup_value s ON s.id = a.status_id
         WHERE s.canonical NOT IN ('done','cancelled')`);
      const companies = await q(`SELECT count(*) n FROM company WHERE archived_at IS NULL`);
      const resources = await q(`SELECT count(*) n FROM resource WHERE archived_at IS NULL`);
      return { engagements, activitiesOpen, companies, resources };
    });
  });
}
