/** listPresets.ts — preset GENERICI del motore liste (filter/sort/columns/export),
 *  per-utente, discriminati da `kind`. SavedHeader identico per tutte le funzioni
 *  (PIANO motore §1.2/§7). RLS: ciascuno vede solo i propri. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withRls } from '../context/rls.js';

const KINDS = ['filter', 'sort', 'columns', 'export'] as const;
const upsertSchema = z.object({
  entity: z.string().min(1).max(60),
  kind: z.enum(KINDS),
  name: z.string().min(1).max(80),
  payload: z.unknown(),
});

const toDto = (r: Record<string, unknown>) => ({
  id: r.id as string, entity: r.entity as string, kind: r.kind as string,
  name: r.name as string, payload: r.payload, createdAt: r.created_at as string,
});

export async function listPresetRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { entity?: string; kind?: string } }>('/list-presets',
    { preHandler: [app.authenticate] },
    async (request) => {
      const { entity, kind } = request.query;
      return withRls(request.ctx, async (db) => {
        const cond: string[] = ['user_id = app_current_user()']; const params: unknown[] = [];
        if (entity) { params.push(entity); cond.push(`entity = $${params.length}`); }
        if (kind) { params.push(kind); cond.push(`kind = $${params.length}`); }
        const r = await db.query(
          `SELECT id, entity, kind, name, payload, created_at FROM list_preset WHERE ${cond.join(' AND ')} ORDER BY name`, params);
        return { items: (r.rows as Record<string, unknown>[]).map(toDto) };
      });
    });

  app.post('/list-presets', { preHandler: [app.authenticate] },
    async (request, reply) => {
      const input = upsertSchema.parse(request.body);
      const dto = await withRls(request.ctx, async (db) => {
        const r = await db.query(
          `INSERT INTO list_preset (tenant_id, user_id, entity, kind, name, payload)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb)
           ON CONFLICT (tenant_id, user_id, entity, kind, name)
           DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
           RETURNING id, entity, kind, name, payload, created_at`,
          [request.ctx.tenantId, request.ctx.userId, input.entity, input.kind, input.name, JSON.stringify(input.payload)]);
        return toDto(r.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  app.delete<{ Params: { id: string } }>('/list-presets/:id', { preHandler: [app.authenticate] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`DELETE FROM list_preset WHERE id = $1 AND user_id = app_current_user()`, [request.params.id]));
      return reply.code(204).send();
    });
}
