/** timeEntries.ts — rendicontazione ORE via form (percorso deterministico).
 *  §4.1 typology_id (natura) · §4.2 tariffe fotografate (resolveRates) ·
 *  §4.3 workflow approvazione + blocco (azioni in blocco). */
import type { FastifyInstance } from 'fastify';
import {
  createTimeEntrySchema, timeEntryIdsSchema, rejectTimeEntriesSchema, lockTimeEntriesSchema,
  type TimeEntryDto,
} from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import type { PoolClient } from '../db/pool.js';
import { resolveRates } from '../rates.js';

const SELECT = `SELECT id, engagement_id, activity_id, resource_id, typology, typology_id, minutes,
  occurred_on, notes, cost_rate, bill_rate, currency, billable, approval_status_id, is_locked, lock_reason, created_at
  FROM time_entry`;

function toDto(r: Record<string, unknown>): TimeEntryDto {
  return {
    id: r.id as string, engagementId: (r.engagement_id as string) ?? null, activityId: (r.activity_id as string) ?? null,
    resourceId: (r.resource_id as string) ?? null, typology: r.typology as string, typologyId: (r.typology_id as string) ?? null,
    minutes: r.minutes as number, occurredOn: r.occurred_on as string, notes: (r.notes as string) ?? null,
    costRate: r.cost_rate === null ? null : Number(r.cost_rate), billRate: r.bill_rate === null ? null : Number(r.bill_rate),
    currency: (r.currency as string) ?? null, billable: r.billable as boolean,
    approvalStatusId: (r.approval_status_id as string) ?? null, isLocked: r.is_locked as boolean,
    lockReason: (r.lock_reason as string) ?? null, createdAt: r.created_at as string,
  };
}

/** id del lookup_value per (categoria, canonical), preferendo l'override del tenant. */
async function lookupIdByCanonical(db: PoolClient, category: string, canonical: string): Promise<string | null> {
  const r = await db.query(
    `SELECT id FROM lookup_value WHERE category = $1 AND canonical = $2
       AND (tenant_id = app_current_tenant() OR tenant_id IS NULL)
     ORDER BY tenant_id NULLS LAST, is_default DESC LIMIT 1`, [category, canonical]);
  return (r.rows[0]?.id as string) ?? null;
}

export async function timeEntryRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { engagementId?: string; activityId?: string } }>('/time-entries',
    { preHandler: [app.authenticate, requirePermission('time_entry:read')] },
    async (request) => {
      const rows = await withRls(request.ctx, (db) => {
        const params: unknown[] = [];
        const conds: string[] = [];
        if (request.query.engagementId) { params.push(request.query.engagementId); conds.push(`engagement_id = $${params.length}`); }
        if (request.query.activityId) { params.push(request.query.activityId); conds.push(`activity_id = $${params.length}`); }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        return db.query(`${SELECT} ${where} ORDER BY occurred_on DESC, created_at DESC LIMIT 500`, params).then((r) => r.rows);
      });
      return { items: rows.map(toDto) };
    });

  app.get<{ Params: { id: string } }>('/time-entries/:id',
    { preHandler: [app.authenticate, requirePermission('time_entry:read')] },
    async (request, reply) => {
      const row = await withRls(request.ctx, (db) =>
        db.query(`${SELECT} WHERE id = $1`, [request.params.id]).then((r) => r.rows[0]));
      if (!row) return reply.code(404).send({ message: 'Registrazione ore non trovata' });
      return toDto(row);
    });

  app.post('/time-entries', { preHandler: [app.authenticate, requirePermission('time_entry:create')] },
    async (request, reply) => {
      const input = createTimeEntrySchema.parse(request.body);
      const ctx = request.ctx;
      const dto = await withRls(ctx, async (db) => {
        // §4.2 tariffe fotografate (listino -> minimo)
        const rates = await resolveRates(db, ctx.tenantId, {
          resourceId: input.resourceId, engagementId: input.engagementId,
          typologyId: input.typologyId, occurredOn: input.occurredOn,
        });
        // §4.3 nuova riga = bozza
        const draftId = await lookupIdByCanonical(db, 'time_entry_status', 'draft');
        const ins = await db.query(
          `INSERT INTO time_entry (tenant_id, engagement_id, activity_id, resource_id, typology, typology_id,
             minutes, occurred_on, notes, cost_rate, bill_rate, currency, billable, approval_status_id, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)
           RETURNING *`,
          [ctx.tenantId, input.engagementId ?? null, input.activityId ?? null, input.resourceId ?? null,
           input.typology, input.typologyId ?? null, input.minutes, input.occurredOn, input.notes ?? null,
           rates.costRate, rates.billRate, rates.currency, input.billable ?? true, draftId, ctx.userId],
        );
        return toDto({ ...ins.rows[0] });
      });
      return reply.code(201).send(dto);
    });

  app.delete<{ Params: { id: string } }>('/time-entries/:id',
    { preHandler: [app.authenticate, requirePermission('time_entry:delete')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`DELETE FROM time_entry WHERE id = $1 AND is_locked = false`, [request.params.id]));
      return reply.code(204).send();
    });

  // ── §4.3 workflow approvazione/blocco (azioni in blocco, in transazione) ──
  // submit: il tecnico invia le PROPRIE ore (gate create; RLS modify = own).
  app.post('/time-entries/submit', { preHandler: [app.authenticate, requirePermission('time_entry:create')] },
    async (request) => {
      const { ids } = timeEntryIdsSchema.parse(request.body);
      return withRls(request.ctx, async (db) => {
        const sid = await lookupIdByCanonical(db, 'time_entry_status', 'submitted');
        const r = await db.query(
          `UPDATE time_entry SET approval_status_id = $1, submitted_at = now(), submitted_by = $2, updated_by = $2
           WHERE id = ANY($3::uuid[]) AND is_locked = false`, [sid, request.ctx.userId, ids]);
        return { updated: r.rowCount };
      });
    });

  // approva in blocco: solo time_entry:approve (Planner/Owner, scope tenant)
  app.post('/time-entries/approve', { preHandler: [app.authenticate, requirePermission('time_entry:approve')] },
    async (request) => {
      const { ids } = timeEntryIdsSchema.parse(request.body);
      return withRls(request.ctx, async (db) => {
        const sid = await lookupIdByCanonical(db, 'time_entry_status', 'approved');
        const r = await db.query(
          `UPDATE time_entry SET approval_status_id = $1, approved_at = now(), approved_by = $2, updated_by = $2
           WHERE id = ANY($3::uuid[]) AND is_locked = false`, [sid, request.ctx.userId, ids]);
        return { updated: r.rowCount };
      });
    });

  app.post('/time-entries/reject', { preHandler: [app.authenticate, requirePermission('time_entry:approve')] },
    async (request) => {
      const { ids, reason } = rejectTimeEntriesSchema.parse(request.body);
      return withRls(request.ctx, async (db) => {
        const sid = await lookupIdByCanonical(db, 'time_entry_status', 'rejected');
        const r = await db.query(
          `UPDATE time_entry SET approval_status_id = $1, rejection_reason = $2, updated_by = $3
           WHERE id = ANY($4::uuid[]) AND is_locked = false`, [sid, reason ?? null, request.ctx.userId, ids]);
        return { updated: r.rowCount };
      });
    });

  // blocco (PAYROLL/INVOICED/PERIOD_CLOSE/MANUAL): da qui in poi immodificabile
  app.post('/time-entries/lock', { preHandler: [app.authenticate, requirePermission('time_entry:approve')] },
    async (request) => {
      const { ids, reason } = lockTimeEntriesSchema.parse(request.body);
      return withRls(request.ctx, async (db) => {
        const r = await db.query(
          `UPDATE time_entry SET is_locked = true, locked_at = now(), locked_by = $1, lock_reason = $2, updated_by = $1
           WHERE id = ANY($3::uuid[]) AND is_locked = false`, [request.ctx.userId, reason, ids]);
        return { updated: r.rowCount };
      });
    });

  // sblocco controllato (lock_reason -> NULL nello stesso UPDATE, come da trigger)
  app.post('/time-entries/unlock', { preHandler: [app.authenticate, requirePermission('time_entry:approve')] },
    async (request) => {
      const { ids } = timeEntryIdsSchema.parse(request.body);
      return withRls(request.ctx, async (db) => {
        const r = await db.query(
          `UPDATE time_entry SET is_locked = false, lock_reason = NULL, locked_at = NULL, locked_by = NULL, updated_by = $1
           WHERE id = ANY($2::uuid[]) AND is_locked = true`, [request.ctx.userId, ids]);
        return { updated: r.rowCount };
      });
    });
}
