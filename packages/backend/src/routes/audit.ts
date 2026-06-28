/**
 * audit.ts — consultazione del registro azioni (audit_log) di un record.
 *  GET /audit?entity=<>&entityId=<> → storico (archive/restore/purge/…) di
 *  quel record, ordinato dal più recente, col nome dell'utente che ha agito.
 *  Solo autenticazione: sono dati del tenant, la RLS su audit_log isola tutto.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuditEntryDto } from '@sisuite/shared';
import { withRls } from '../context/rls.js';

const querySchema = z.object({
  entity: z.string().min(1).max(60),
  entityId: z.string().uuid(),
});

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get('/audit', { preHandler: [app.authenticate] }, async (request) => {
    const q = querySchema.parse(request.query);
    return withRls(request.ctx, async (db) => {
      const rows = await db.query(
        `SELECT al.id, al.entity, al.entity_id, al.action, al.label, al.at, al.detail,
                au.full_name AS user_name
         FROM audit_log al
         LEFT JOIN app_user au ON au.id = al.user_id
         WHERE al.entity = $1 AND al.entity_id = $2
         ORDER BY al.at DESC`,
        [q.entity, q.entityId],
      );
      const items = rows.rows.map((r): AuditEntryDto => ({
        id: r.id as string,
        entity: r.entity as string,
        entityId: r.entity_id as string,
        action: r.action as AuditEntryDto['action'],
        label: (r.label as string) ?? null,
        userName: (r.user_name as string) ?? null,
        at: (r.at as Date).toISOString(),
        detail: r.detail ?? null,
      }));
      return { items };
    });
  });
}
