/** platform.ts — SUPER ADMIN (solo is_platform_admin): gestione Demo Data Pack
 *  dall'app. Riservato a NOI (la piattaforma); invisibile ai tenant. Usa la
 *  connessione admin del runner (non withRls): per questo è guardato dal flag. */
import type { FastifyInstance } from 'fastify';
import { requirePlatformAdmin } from '../context/authenticate.js';
import { listPacks, listTenants, loadPack, wipePack } from '../demo/runner.js';

export async function platformRoutes(app: FastifyInstance): Promise<void> {
  app.get('/platform/demo', { preHandler: [app.authenticate, requirePlatformAdmin] },
    async () => ({ packs: listPacks(), tenants: await listTenants() }));

  app.post<{ Params: { pack: string } }>('/platform/demo/:pack/load',
    { preHandler: [app.authenticate, requirePlatformAdmin] },
    async (request, reply) => {
      try { return await loadPack(request.params.pack); }
      catch (e) { return reply.code(400).send({ error: 'load_failed', message: (e as Error).message, statusCode: 400 }); }
    });

  app.post<{ Params: { pack: string } }>('/platform/demo/:pack/wipe',
    { preHandler: [app.authenticate, requirePlatformAdmin] },
    async (request, reply) => {
      try { return await wipePack(request.params.pack); }
      catch (e) { return reply.code(400).send({ error: 'wipe_failed', message: (e as Error).message, statusCode: 400 }); }
    });
}
