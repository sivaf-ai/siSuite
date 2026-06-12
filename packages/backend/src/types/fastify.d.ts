import type { UserContext } from '@sisuite/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** contesto utente risolto dall'autenticazione (presente solo su route protette). */
    ctx: UserContext;
  }
  interface FastifyInstance {
    /** preHandler che verifica il JWT e popola request.ctx. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
