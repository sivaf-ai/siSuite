import type { FastifyInstance } from 'fastify';

export async function meRoutes(app: FastifyInstance): Promise<void> {
  // ritorna il contesto utente: il frontend ci costruisce il menu (dai permessi).
  app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
    return request.ctx;
  });
}
