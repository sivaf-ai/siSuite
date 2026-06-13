/** narrative.ts — "l'AI che racconta": riepilogo in linguaggio naturale di una
 *  commessa. Sola lettura, sotto RLS (racconta solo ciò che l'utente può vedere). */
import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { narrateEngagement } from '../ai/narrator.js';

export async function narrativeRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>('/engagements/:id/narrative',
    { preHandler: [app.authenticate, requirePermission('engagement:read')] },
    async (request, reply) => {
      const out = await withRls(request.ctx, (db) => narrateEngagement(db, request.ctx, request.params.id));
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Commessa non trovata', statusCode: 404 });
      return out;
    });
}
