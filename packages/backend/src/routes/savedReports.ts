/** savedReports.ts — REPORT salvati del report designer (PIANO motore §2.5/§7).
 *  RLS: vedo i miei + condivisi (is_shared); scrivo solo i miei. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withRls } from '../context/rls.js';

const upsertSchema = z.object({
  entity: z.string().min(1).max(60),
  name: z.string().min(1).max(80),
  payload: z.unknown(),
  isShared: z.boolean().optional(),
});

const toDto = (r: Record<string, unknown>) => ({
  id: r.id as string, entity: r.entity as string, name: r.name as string,
  payload: r.payload, isShared: !!r.is_shared, isOwn: r.is_own as boolean, createdAt: r.created_at as string,
});

export async function savedReportRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { entity?: string } }>('/saved-reports',
    { preHandler: [app.authenticate] },
    async (request) => {
      const entity = request.query.entity;
      return withRls(request.ctx, async (db) => {
        const r = await db.query(
          `SELECT id, entity, name, payload, is_shared, (user_id = app_current_user()) AS is_own, created_at
           FROM saved_report WHERE archived_at IS NULL ${entity ? 'AND entity = $1' : ''} ORDER BY name`,
          entity ? [entity] : []);
        return { items: (r.rows as Record<string, unknown>[]).map(toDto) };
      });
    });

  app.post('/saved-reports', { preHandler: [app.authenticate] },
    async (request, reply) => {
      const input = upsertSchema.parse(request.body);
      const dto = await withRls(request.ctx, async (db) => {
        const r = await db.query(
          `INSERT INTO saved_report (tenant_id, user_id, entity, name, payload, is_shared)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6)
           ON CONFLICT (tenant_id, user_id, entity, name)
           DO UPDATE SET payload = EXCLUDED.payload, is_shared = EXCLUDED.is_shared, updated_at = now()
           RETURNING id, entity, name, payload, is_shared, true AS is_own, created_at`,
          [request.ctx.tenantId, request.ctx.userId, input.entity, input.name, JSON.stringify(input.payload), input.isShared ?? false]);
        return toDto(r.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  app.delete<{ Params: { id: string } }>('/saved-reports/:id', { preHandler: [app.authenticate] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`DELETE FROM saved_report WHERE id = $1 AND user_id = app_current_user()`, [request.params.id]));
      return reply.code(204).send();
    });
}
