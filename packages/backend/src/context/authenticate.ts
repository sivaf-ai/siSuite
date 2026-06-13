/**
 * authenticate.ts — decoratori di autenticazione/autorizzazione per Fastify.
 *   - app.authenticate: verifica il JWT, risolve il contesto, popola request.ctx
 *   - requirePermission(key): guardia RBAC su una singola azione (usa can())
 * La VISIBILITÀ dei dati (data_scope) è imposta a parte dalla RLS in withRls.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { can, type PermissionKey, type UserContext } from '@sisuite/shared';
import { verifyToken } from '../auth/verifier.js';
import { resolveContext } from './resolve.js';

export function registerAuthenticate(app: FastifyInstance): void {
  app.decorateRequest('ctx', null as unknown as UserContext);

  app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Token di accesso mancante', statusCode: 401 });
    }
    let authUserId: string;
    try {
      const identity = await verifyToken(header.slice('Bearer '.length));
      authUserId = identity.authUserId;
    } catch {
      return reply.code(401).send({ error: 'unauthorized', message: 'Token non valido o scaduto', statusCode: 401 });
    }
    const ctx = await resolveContext(authUserId);
    if (!ctx) {
      return reply.code(403).send({ error: 'forbidden', message: 'Utente non provisionato', statusCode: 403 });
    }
    request.ctx = ctx;
  });
}

/** Guardia RBAC: richiede uno specifico permesso. Va dopo app.authenticate. */
export function requirePermission(required: PermissionKey) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const perms = new Set(request.ctx?.permissions ?? []);
    if (!can(perms, required)) {
      return reply.code(403).send({
        error: 'forbidden',
        message: `Permesso negato: serve '${required}'`,
        statusCode: 403,
      });
    }
  };
}

/** Guardia PIATTAFORMA: solo is_platform_admin (noi, il fornitore). Non è RBAC del tenant. */
export async function requirePlatformAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!request.ctx?.isPlatformAdmin) {
    return reply.code(403).send({ error: 'forbidden', message: 'Riservato all\'amministratore di piattaforma', statusCode: 403 });
  }
}
