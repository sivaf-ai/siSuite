/** fieldDefinitions.ts — espone le field_definition per (entità, verticale tenant). */
import type { FastifyInstance } from 'fastify';
import { withRls } from '../context/rls.js';
import { loadFieldDefs, tenantVertical } from '../fields.js';

export async function fieldDefinitionRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { entity?: string } }>(
    '/field-definitions',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const entity = request.query.entity;
      if (!entity) return reply.code(400).send({ error: 'bad_request', message: 'parametro entity obbligatorio', statusCode: 400 });
      const items = await withRls(request.ctx, async (db) => {
        const vertical = await tenantVertical(db, request.ctx.tenantId);
        return loadFieldDefs(db, entity, vertical);
      });
      return { items };
    },
  );
}
