/** absences.ts — MODULO ORE §4.4: assenze e saldi.
 *  Richiesta/registrazione (RLS own), approvazione (aggiorna absence_balance.used),
 *  saldi per risorsa/tipo/anno (carico manuale del maturato).
 *  Unità del saldo (scelta 2026-06-15): ore se 'hours' valorizzato, altrimenti
 *  giorni di calendario inclusivi (half_day = 0,5). Precisione CCNL → backlog. */
import type { FastifyInstance } from 'fastify';
import { createAbsenceSchema, upsertAbsenceBalanceSchema, type AbsenceDto, type AbsenceBalanceDto } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { lookupIdByCanonical } from '../lookupResolve.js';

function toDto(r: Record<string, unknown>): AbsenceDto {
  return {
    id: r.id as string, resourceId: r.resource_id as string, typeId: r.type_id as string,
    startsOn: r.starts_on as string, endsOn: r.ends_on as string,
    hours: r.hours === null ? null : Number(r.hours), halfDay: r.half_day as boolean,
    note: (r.note as string) ?? null, attachmentUrl: (r.attachment_url as string) ?? null,
    approvalStatusId: (r.approval_status_id as string) ?? null, createdAt: r.created_at as string,
  };
}

/** quantità "usata" da imputare al saldo. */
function usedAmount(a: { hours: number | null; startsOn: string; endsOn: string; halfDay: boolean }): number {
  if (a.hours !== null && a.hours !== undefined) return a.hours;
  const ms = new Date(a.endsOn).getTime() - new Date(a.startsOn).getTime();
  const days = Math.floor(ms / 86400000) + 1;       // inclusivo
  return a.halfDay ? days - 0.5 : days;
}

export async function absenceRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { resourceId?: string } }>('/absences',
    { preHandler: [app.authenticate, requirePermission('absence:read')] },
    async (request) => {
      const rows = await withRls(request.ctx, (db) => {
        const params: unknown[] = []; let where = '';
        if (request.query.resourceId) { params.push(request.query.resourceId); where = `WHERE resource_id = $1`; }
        return db.query(
          `SELECT id, resource_id, type_id, starts_on, ends_on, hours, half_day, note, attachment_url,
                  approval_status_id, created_at FROM absence_entry ${where}
           ORDER BY starts_on DESC LIMIT 500`, params).then((r) => r.rows);
      });
      return { items: rows.map(toDto) };
    });

  app.get<{ Params: { id: string } }>('/absences/:id',
    { preHandler: [app.authenticate, requirePermission('absence:read')] },
    async (request, reply) => {
      const row = await withRls(request.ctx, (db) =>
        db.query(
          `SELECT id, resource_id, type_id, starts_on, ends_on, hours, half_day, note, attachment_url,
                  approval_status_id, created_at FROM absence_entry WHERE id = $1`, [request.params.id])
          .then((r) => r.rows[0]));
      if (!row) return reply.code(404).send({ error: 'not_found', message: 'Assenza inesistente', statusCode: 404 });
      return toDto(row);
    });

  app.post('/absences', { preHandler: [app.authenticate, requirePermission('absence:create')] },
    async (request, reply) => {
      const input = createAbsenceSchema.parse(request.body);
      const dto = await withRls(request.ctx, async (db) => {
        const draftId = await lookupIdByCanonical(db, 'time_entry_status', 'draft');
        const r = await db.query(
          `INSERT INTO absence_entry (tenant_id, resource_id, type_id, starts_on, ends_on, hours, half_day, note,
             attachment_url, approval_status_id, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,false),$8,$9,$10,$11,$11)
           RETURNING id, resource_id, type_id, starts_on, ends_on, hours, half_day, note, attachment_url, approval_status_id, created_at`,
          [request.ctx.tenantId, input.resourceId, input.typeId, input.startsOn, input.endsOn, input.hours ?? null,
           input.halfDay ?? null, input.note ?? null, input.attachmentUrl ?? null, draftId, request.ctx.userId]);
        return toDto(r.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  // approva: stato -> approved e imputa l'uso al saldo (residuo = accrued - used)
  app.post<{ Params: { id: string } }>('/absences/:id/approve',
    { preHandler: [app.authenticate, requirePermission('absence:approve')] },
    async (request, reply) => {
      return withRls(request.ctx, async (db) => {
        const cur = await db.query(
          `SELECT id, resource_id, type_id, starts_on, ends_on, hours, half_day, approval_status_id
           FROM absence_entry WHERE id = $1`, [request.params.id]);
        const a = cur.rows[0];
        if (!a) return reply.code(404).send({ error: 'not_found', message: 'Assenza inesistente', statusCode: 404 });
        const approvedId = await lookupIdByCanonical(db, 'time_entry_status', 'approved');
        const wasApproved = a.approval_status_id === approvedId;
        await db.query(`UPDATE absence_entry SET approval_status_id = $1, updated_by = $2 WHERE id = $3`,
          [approvedId, request.ctx.userId, a.id]);
        if (!wasApproved) {   // imputa al saldo una sola volta
          const used = usedAmount({ hours: a.hours === null ? null : Number(a.hours), startsOn: a.starts_on, endsOn: a.ends_on, halfDay: a.half_day });
          const year = new Date(a.starts_on).getUTCFullYear();
          await db.query(
            `INSERT INTO absence_balance (tenant_id, resource_id, type_id, year, accrued, used)
             VALUES ($1,$2,$3,$4,0,$5)
             ON CONFLICT (tenant_id, resource_id, type_id, year) DO UPDATE SET used = absence_balance.used + EXCLUDED.used`,
            [request.ctx.tenantId, a.resource_id, a.type_id, year, used]);
        }
        return { ok: true };
      });
    });

  app.delete<{ Params: { id: string } }>('/absences/:id',
    { preHandler: [app.authenticate, requirePermission('absence:delete')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`DELETE FROM absence_entry WHERE id = $1`, [request.params.id]));
      return reply.code(204).send();
    });

  // ── Saldi ────────────────────────────────────────────────────────────
  app.get<{ Querystring: { resourceId?: string; year?: string } }>('/absence-balances',
    { preHandler: [app.authenticate, requirePermission('absence:read')] },
    async (request) => {
      const rows = await withRls(request.ctx, (db) => {
        const params: unknown[] = []; const conds: string[] = [];
        if (request.query.resourceId) { params.push(request.query.resourceId); conds.push(`resource_id = $${params.length}`); }
        if (request.query.year) { params.push(Number(request.query.year)); conds.push(`year = $${params.length}`); }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        return db.query(`SELECT resource_id, type_id, year, accrued, used FROM absence_balance ${where} ORDER BY year DESC`, params)
          .then((r) => r.rows);
      });
      const items: AbsenceBalanceDto[] = rows.map((r) => ({
        resourceId: r.resource_id, typeId: r.type_id, year: r.year, accrued: Number(r.accrued),
        used: Number(r.used), residual: Number(r.accrued) - Number(r.used),
      }));
      return { items };
    });

  // carico/rettifica manuale del maturato
  app.put('/absence-balances', { preHandler: [app.authenticate, requirePermission('absence:approve')] },
    async (request) => {
      const input = upsertAbsenceBalanceSchema.parse(request.body);
      return withRls(request.ctx, async (db) => {
        await db.query(
          `INSERT INTO absence_balance (tenant_id, resource_id, type_id, year, accrued, used)
           VALUES ($1,$2,$3,$4,$5,0)
           ON CONFLICT (tenant_id, resource_id, type_id, year) DO UPDATE SET accrued = EXCLUDED.accrued`,
          [request.ctx.tenantId, input.resourceId, input.typeId, input.year, input.accrued]);
        return { ok: true };
      });
    });
}
