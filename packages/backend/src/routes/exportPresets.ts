/** exportPresets.ts — preset di export per-utente (campi+ordine) per ogni lista.
 *  RLS: ciascuno vede solo i propri (policy export_preset_own). */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withRls } from '../context/rls.js';

const upsertSchema = z.object({
  entity: z.string().min(1).max(60),
  name: z.string().min(1).max(80),
  fields: z.array(z.string().min(1).max(80)).min(1).max(100),
});

const toDto = (r: Record<string, unknown>) => ({
  id: r.id as string, entity: r.entity as string, name: r.name as string,
  fields: (r.fields as string[]) ?? [], createdAt: r.created_at as string,
});

export async function exportPresetRoutes(app: FastifyInstance): Promise<void> {
  // i preset dell'utente per un'entità
  app.get<{ Querystring: { entity?: string } }>('/export-presets',
    { preHandler: [app.authenticate] },
    async (request) => {
      const entity = request.query.entity;
      return withRls(request.ctx, async (db) => {
        const r = await db.query(
          `SELECT id, entity, name, fields, created_at FROM export_preset
           WHERE user_id = $1 ${entity ? 'AND entity = $2' : ''} ORDER BY name`,
          entity ? [request.ctx.userId, entity] : [request.ctx.userId]);
        return { items: (r.rows as Record<string, unknown>[]).map(toDto) };
      });
    });

  // crea/aggiorna (per nome) un preset
  app.post('/export-presets', { preHandler: [app.authenticate] },
    async (request, reply) => {
      const input = upsertSchema.parse(request.body);
      const dto = await withRls(request.ctx, async (db) => {
        const r = await db.query(
          `INSERT INTO export_preset (tenant_id, user_id, entity, name, fields)
           VALUES ($1,$2,$3,$4,$5::jsonb)
           ON CONFLICT (tenant_id, user_id, entity, name)
           DO UPDATE SET fields = EXCLUDED.fields, updated_at = now()
           RETURNING id, entity, name, fields, created_at`,
          [request.ctx.tenantId, request.ctx.userId, input.entity, input.name, JSON.stringify(input.fields)]);
        return toDto(r.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  app.delete<{ Params: { id: string } }>('/export-presets/:id', { preHandler: [app.authenticate] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`DELETE FROM export_preset WHERE id = $1 AND user_id = $2`, [request.params.id, request.ctx.userId]));
      return reply.code(204).send();
    });
}
