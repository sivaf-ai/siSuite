/** timeTracking.ts — MODULO ORE §4.5: cronometro.
 *  start/stop di una sessione; alla conferma genera una time_entry con
 *  start_at/end_at misurati e minutes = differenza (tariffe fotografate). */
import type { FastifyInstance } from 'fastify';
import { startTimerSchema, commitTimerSchema, type TimerSessionDto } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import type { PoolClient } from '../db/pool.js';
import { resolveRates } from '../rates.js';
import { lookupIdByCanonical } from '../lookupResolve.js';

function toDto(r: Record<string, unknown>): TimerSessionDto {
  return {
    id: r.id as string, resourceId: r.resource_id as string, activityId: (r.activity_id as string) ?? null,
    engagementId: (r.engagement_id as string) ?? null, startedAt: r.started_at as string,
    stoppedAt: (r.stopped_at as string) ?? null, committedTimeEntryId: (r.committed_time_entry_id as string) ?? null,
  };
}

/** la risorsa-persona legata all'utente corrente (o quella passata). */
async function resolveResource(db: PoolClient, explicit: string | undefined, userId: string): Promise<string | null> {
  if (explicit) return explicit;
  const r = await db.query(`SELECT id FROM resource WHERE user_id = $1 AND active ORDER BY id LIMIT 1`, [userId]);
  return (r.rows[0]?.id as string) ?? null;
}

export async function timeTrackingRoutes(app: FastifyInstance): Promise<void> {
  // timer in corso dell'utente
  app.get('/time-tracking/active', { preHandler: [app.authenticate, requirePermission('time_entry:read')] },
    async (request) => {
      const row = await withRls(request.ctx, (db) =>
        db.query(`SELECT id, resource_id, activity_id, engagement_id, started_at, stopped_at, committed_time_entry_id
                  FROM time_tracking_session WHERE stopped_at IS NULL AND created_by = $1
                  ORDER BY started_at DESC LIMIT 1`, [request.ctx.userId]).then((r) => r.rows[0]));
      return { session: row ? toDto(row) : null };
    });

  app.post('/time-tracking/start', { preHandler: [app.authenticate, requirePermission('time_entry:create')] },
    async (request, reply) => {
      const input = startTimerSchema.parse(request.body);
      const dto = await withRls(request.ctx, async (db) => {
        const resourceId = await resolveResource(db, input.resourceId, request.ctx.userId);
        if (!resourceId) throw Object.assign(new Error('Nessuna risorsa collegata all\'utente: passa resourceId'), { statusCode: 400 });
        const r = await db.query(
          `INSERT INTO time_tracking_session (tenant_id, resource_id, activity_id, engagement_id, started_at, created_by)
           VALUES ($1,$2,$3,$4,now(),$5)
           RETURNING id, resource_id, activity_id, engagement_id, started_at, stopped_at, committed_time_entry_id`,
          [request.ctx.tenantId, resourceId, input.activityId ?? null, input.engagementId ?? null, request.ctx.userId]);
        return toDto(r.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  app.post<{ Params: { id: string } }>('/time-tracking/:id/stop',
    { preHandler: [app.authenticate, requirePermission('time_entry:create')] },
    async (request) => {
      return withRls(request.ctx, async (db) => {
        const r = await db.query(
          `UPDATE time_tracking_session SET stopped_at = now() WHERE id = $1 AND stopped_at IS NULL
           RETURNING id, resource_id, activity_id, engagement_id, started_at, stopped_at, committed_time_entry_id`,
          [request.params.id]);
        return r.rows[0] ? { session: toDto(r.rows[0]) } : { session: null };
      });
    });

  // conferma: crea la time_entry dal misurato (sola lettura del tempo)
  app.post<{ Params: { id: string } }>('/time-tracking/:id/commit',
    { preHandler: [app.authenticate, requirePermission('time_entry:create')] },
    async (request, reply) => {
      const input = commitTimerSchema.parse(request.body);
      return withRls(request.ctx, async (db) => {
        const s = (await db.query(
          `SELECT id, resource_id, activity_id, engagement_id, started_at, stopped_at, committed_time_entry_id
           FROM time_tracking_session WHERE id = $1`, [request.params.id])).rows[0];
        if (!s) return reply.code(404).send({ error: 'not_found', message: 'Sessione inesistente', statusCode: 404 });
        if (s.committed_time_entry_id) return reply.code(409).send({ error: 'conflict', message: 'Sessione già confermata', statusCode: 409 });
        if (!s.engagement_id && !s.activity_id)
          return reply.code(400).send({ error: 'bad_request', message: 'Timer senza commessa/attività: impossibile creare la riga ore', statusCode: 400 });
        const startedAt = new Date(s.started_at);
        const stoppedAt = s.stopped_at ? new Date(s.stopped_at) : new Date();
        const minutes = Math.max(1, Math.round((stoppedAt.getTime() - startedAt.getTime()) / 60000));
        const occurredOn = startedAt.toISOString().slice(0, 10);
        const rates = await resolveRates(db, request.ctx.tenantId, {
          resourceId: s.resource_id, engagementId: s.engagement_id, typologyId: input.typologyId, occurredOn,
        });
        const draftId = await lookupIdByCanonical(db, 'time_entry_status', 'draft');
        const te = (await db.query(
          `INSERT INTO time_entry (tenant_id, engagement_id, activity_id, resource_id, typology, typology_id, minutes,
             occurred_on, notes, start_at, end_at, cost_rate, bill_rate, currency, approval_status_id, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16) RETURNING id`,
          [request.ctx.tenantId, s.engagement_id, s.activity_id, s.resource_id, input.typology, input.typologyId ?? null,
           minutes, occurredOn, input.notes ?? null, s.started_at, stoppedAt.toISOString(),
           rates.costRate, rates.billRate, rates.currency, draftId, request.ctx.userId])).rows[0];
        await db.query(`UPDATE time_tracking_session SET committed_time_entry_id = $1, stopped_at = COALESCE(stopped_at, now()) WHERE id = $2`,
          [te.id, s.id]);
        return reply.code(201).send({ timeEntryId: te.id, minutes });
      });
    });
}
