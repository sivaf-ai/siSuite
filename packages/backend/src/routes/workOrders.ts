/**
 * workOrders.ts — Ordinativi FTTH (brief §6.1, "maschera metro").
 *
 * Principi rispettati:
 *  - work_order = oggetto di prima classe; PII intestatario isolata in
 *    work_order_subject e MASCHERATA di default (in chiaro solo con pii:read,
 *    mai loggata). RLS isola per tenant; il gating PII e' applicativo.
 *  - code da number_series key 'work_order' (mai UUID in UI).
 *  - stato da lookup_value category 'work_order_status' (default canonico 'assigned').
 *  - attributi fibra (connection_type, ont_serial, ...) validati da field_definition.
 *  - import: rileva i doppioni sull'UNIQUE (tenant, operator_company, principal_order_ref).
 */
import type { FastifyInstance } from 'fastify';
import {
  listQuerySchema,
  createWorkOrderSchema,
  updateWorkOrderSchema,
  assignWorkOrdersSchema,
  importWorkOrdersSchema,
  workOrderItemSchema,
  type WorkOrderDto,
  type WorkOrderSubjectDto,
  type WorkOrderSubjectInput,
  type WorkOrderItemDto,
  type WorkOrderSerialDto,
} from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { validateAttributes } from '../fields.js';
import { nextNumber } from '../numberSeries.js';
import { lookupDefaultId } from '../status.js';
import { buildFilter } from '../filterSql.js';
import { buildOrderBy } from '../sortSql.js';
import type { PoolClient } from '../db/pool.js';

const SORTABLE: Record<string, string> = {
  code: 'wo.code', scheduled: 'wo.scheduled_on', operator: 'op.display_name', status: 'wo.status_id',
};

/* ── Mascheramento PII (mai in chiaro senza pii:read; mai loggato) ──────── */
function maskName(name: string | null): string | null {
  if (!name) return null;
  return name
    .trim()
    .split(/\s+/)
    .map((w) => (w ? `${w[0]}${'•'.repeat(4)}` : ''))
    .join(' ');
}
function maskTail(v: string | null, keep = 2): string | null {
  if (!v) return null;
  const digits = v.replace(/\D/g, '');
  const tail = digits.slice(-keep);
  return tail ? `••• ••• •• ${tail}` : '••••••';
}
function maskGeneric(v: string | null): string | null {
  if (!v) return null;
  return '•'.repeat(Math.min(8, Math.max(4, v.length)));
}

/** Livello di accesso PII (Decisione 6.2): full = nome+tel+CF; contact = solo
 *  telefono in chiaro (nome/CF mascherati, per il Tecnico); none = tutto mascherato. */
type PiiLevel = 'full' | 'contact' | 'none';
function piiLevel(perms: ReadonlySet<string>): PiiLevel {
  if (perms.has('pii:read')) return 'full';
  if (perms.has('pii:read_contact')) return 'contact';
  return 'none';
}

function subjectDto(r: Record<string, unknown> | undefined, level: PiiLevel): WorkOrderSubjectDto | undefined {
  if (!r) return undefined;
  const fullName = (r.full_name as string) ?? null;
  const phone = (r.phone as string) ?? null;
  const phoneAlt = (r.phone_alt as string) ?? null;
  const email = (r.email as string) ?? null;
  const fiscalCode = (r.fiscal_code as string) ?? null;
  const address = (r.address as string) ?? null;
  const full = level === 'full';
  const contact = level === 'contact';
  return {
    fullName: full ? fullName : maskName(fullName),
    phone: (full || contact) ? phone : maskTail(phone),         // il Tecnico vede il recapito
    phoneAlt: (full || contact) ? phoneAlt : maskTail(phoneAlt),
    email: full ? email : (email ? `${email[0]}•••@•••` : null),
    fiscalCode: full ? fiscalCode : maskGeneric(fiscalCode),
    address, // l'indirizzo di attivazione non e' PII forte: resta visibile (brief §6.1)
    unmasked: full,
  };
}

function listDto(r: Record<string, unknown>, level: PiiLevel): WorkOrderDto {
  const fullName = (r.subject_full_name as string) ?? null;
  return {
    id: r.id as string,
    code: r.code as string,
    engagementId: r.engagement_id as string,
    engagementTitle: (r.engagement_title as string) ?? null,
    principalCompanyId: (r.principal_company_id as string) ?? null,
    principalCompanyName: (r.principal_company_name as string) ?? null,
    principalOrderRef: (r.principal_order_ref as string) ?? null,
    typeId: (r.type_id as string) ?? null,
    typeLabel: (r.type_label as string) ?? null,
    statusId: r.status_id as string,
    statusCanonical: (r.status_canonical as string) ?? null,
    assignedResourceId: (r.assigned_resource_id as string) ?? null,
    assignedResourceLabel: (r.assigned_resource_label as string) ?? null,
    address: (r.address as string) ?? null,
    scheduledOn: (r.scheduled_on as Date | null)?.toISOString().slice(0, 10) ?? null,
    completedOn: (r.completed_on as Date | null)?.toISOString().slice(0, 10) ?? null,
    subjectNameDisplay: level === 'full' ? fullName : maskName(fullName),
    plannedCount: Number(r.planned_count ?? 0),
    installedCount: Number(r.installed_count ?? 0),
    attributes: (r.attributes as Record<string, unknown>) ?? {},
  };
}

/* ── Upsert dell'intestatario (1:1) ────────────────────────────────────── */
async function upsertSubject(
  db: PoolClient, tenantId: string, workOrderId: string, userId: string,
  s: WorkOrderSubjectInput | undefined,
): Promise<void> {
  if (!s) return;
  await db.query(
    `INSERT INTO work_order_subject
       (tenant_id, work_order_id, full_name, phone, phone_alt, email, fiscal_code, address, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
     ON CONFLICT (work_order_id) DO UPDATE SET
       full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, phone_alt = EXCLUDED.phone_alt,
       email = EXCLUDED.email, fiscal_code = EXCLUDED.fiscal_code, address = EXCLUDED.address,
       updated_by = EXCLUDED.updated_by`,
    [tenantId, workOrderId, s.fullName ?? null, s.phone ?? null, s.phoneAlt ?? null,
     s.email || null, s.fiscalCode ?? null, s.address ?? null, userId],
  );
}

const WO_FILTER_FIELDS: Record<string, string> = {
  code: 'wo.code', principalOrderRef: 'wo.principal_order_ref', address: 'wo.address',
  scheduledOn: 'wo.scheduled_on', principalCompanyName: 'op.display_name', status: 'lv.canonical',
};
const WO_FILTER_ANY = ['wo.code', 'wo.principal_order_ref', 'wo.address', 'op.display_name'];

const LIST_SELECT = `
  SELECT wo.id, wo.code, wo.engagement_id, e.title AS engagement_title,
         wo.principal_company_id, op.display_name AS principal_company_name,
         wo.principal_order_ref, wo.type_id, lvt.label->>'it-IT' AS type_label,
         wo.status_id, lv.canonical AS status_canonical,
         wo.assigned_resource_id, r.label AS assigned_resource_label,
         wo.address, wo.scheduled_on, wo.completed_on, wo.attributes,
         sub.full_name AS subject_full_name,
         (SELECT count(*)::int FROM work_order_item wi WHERE wi.work_order_id = wo.id) AS planned_count,
         (SELECT count(*)::int FROM stock_serial_unit su WHERE su.work_order_id = wo.id AND su.status = 'installed') AS installed_count
  FROM work_order wo
  LEFT JOIN engagement e   ON e.id = wo.engagement_id
  LEFT JOIN company op      ON op.id = wo.principal_company_id
  LEFT JOIN lookup_value lv ON lv.id = wo.status_id
  LEFT JOIN lookup_value lvt ON lvt.id = wo.type_id
  LEFT JOIN resource r      ON r.id = wo.assigned_resource_id
  LEFT JOIN work_order_subject sub ON sub.work_order_id = wo.id`;

export async function workOrderRoutes(app: FastifyInstance): Promise<void> {
  /* ── LISTA ── viste: all | unassigned | in_progress | done | ko ───────── */
  app.get('/work-orders', { preHandler: [app.authenticate, requirePermission('work_order:read')] }, async (request) => {
    const q = listQuerySchema.parse(request.query);
    const view = String((request.query as Record<string, unknown>).view ?? 'all');
    const engagementId = (request.query as Record<string, unknown>).engagementId as string | undefined;
    const level = piiLevel(new Set(request.ctx.permissions));
    const orderBy = buildOrderBy((request.query as Record<string, unknown>).sort as string | undefined, SORTABLE, SORTABLE[q.sortBy ?? ''] ?? 'wo.scheduled_on', q.sortDir, 'wo.attributes');
    return withRls(request.ctx, async (db) => {
      const params: unknown[] = [];
      let where = `WHERE wo.archived_at IS NULL`;
      if (engagementId) { params.push(engagementId); where += ` AND wo.engagement_id = $${params.length}`; }
      if (view === 'unassigned') where += ` AND wo.assigned_resource_id IS NULL AND lv.canonical = 'assigned'`;
      else if (view === 'in_progress') where += ` AND lv.canonical = 'in_progress'`;
      else if (view === 'done') where += ` AND lv.canonical = 'done'`;
      else if (view === 'ko') where += ` AND lv.canonical = 'ko'`;
      if (q.q) {
        params.push(`%${q.q}%`);
        const i = params.length;
        where += ` AND (wo.code ILIKE $${i} OR wo.principal_order_ref ILIKE $${i} OR wo.address ILIKE $${i}
                        OR op.display_name ILIKE $${i}
                        OR EXISTS (SELECT 1 FROM stock_serial_unit su WHERE su.work_order_id = wo.id AND su.serial ILIKE $${i}))`;
      }
      const fsql = buildFilter((request.query as Record<string, unknown>).filter as string | undefined, WO_FILTER_FIELDS, WO_FILTER_ANY, params);
      if (fsql) where += ` AND ${fsql}`;
      const total = await db.query(
        `SELECT count(*)::int AS n FROM work_order wo
         LEFT JOIN company op ON op.id = wo.principal_company_id
         LEFT JOIN lookup_value lv ON lv.id = wo.status_id ${where}`, params);
      params.push(q.limit, q.offset);
      const rows = await db.query(
        `${LIST_SELECT} ${where} ORDER BY ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params);
      // conteggi per le viste (chip) — rispettano engagementId E filtro attivo; param-bind (no injection)
      const vParams: unknown[] = [];
      let vWhere = `WHERE wo.archived_at IS NULL`;
      if (engagementId) { vParams.push(engagementId); vWhere += ` AND wo.engagement_id = $${vParams.length}`; }
      const vfsql = buildFilter((request.query as Record<string, unknown>).filter as string | undefined, WO_FILTER_FIELDS, WO_FILTER_ANY, vParams);
      if (vfsql) vWhere += ` AND ${vfsql}`;
      const counts = await db.query(
        `SELECT lv.canonical, count(*)::int AS n,
                count(*) FILTER (WHERE wo.assigned_resource_id IS NULL AND lv.canonical='assigned')::int AS unassigned
         FROM work_order wo LEFT JOIN lookup_value lv ON lv.id = wo.status_id
              LEFT JOIN company op ON op.id = wo.principal_company_id
         ${vWhere} GROUP BY lv.canonical`, vParams);
      const byCanon: Record<string, number> = {};
      let unassigned = 0; let all = 0;
      for (const c of counts.rows) { byCanon[c.canonical as string] = c.n as number; all += c.n as number; unassigned += c.unassigned as number; }
      return {
        items: rows.rows.map((r) => listDto(r, level)),
        total: total.rows[0].n as number, limit: q.limit, offset: q.offset,
        views: { all, unassigned, in_progress: byCanon.in_progress ?? 0, done: byCanon.done ?? 0, ko: byCanon.ko ?? 0 },
      };
    });
  });

  /* ── DETTAGLIO ── include intestatario (mascherato salvo pii:read), apparati, seriali */
  app.get<{ Params: { id: string } }>('/work-orders/:id',
    { preHandler: [app.authenticate, requirePermission('work_order:read')] }, async (request, reply) => {
      const level = piiLevel(new Set(request.ctx.permissions));
      return withRls(request.ctx, async (db) => {
        const r = await db.query(`${LIST_SELECT} WHERE wo.id = $1 AND wo.archived_at IS NULL`, [request.params.id]);
        if (r.rows.length === 0) return reply.code(404).send({ error: 'not_found', message: 'Ordinativo non trovato', statusCode: 404 });
        const dto = listDto(r.rows[0], level);
        const sub = await db.query(`SELECT * FROM work_order_subject WHERE work_order_id = $1`, [request.params.id]);
        dto.subject = subjectDto(sub.rows[0], level) ?? { fullName: null, phone: null, phoneAlt: null, email: null, fiscalCode: null, address: null, unmasked: level === 'full' };
        const items = await db.query(
          `SELECT wi.id, wi.material_id, m.name AS material_name, m.unit, wi.planned_qty, wi.note, m.tracked_by_serial
           FROM work_order_item wi LEFT JOIN material m ON m.id = wi.material_id
           WHERE wi.work_order_id = $1 ORDER BY wi.created_at`, [request.params.id]);
        dto.items = items.rows.map((x): WorkOrderItemDto => ({
          id: x.id as string, materialId: x.material_id as string, materialName: (x.material_name as string) ?? null,
          unit: (x.unit as string) ?? null, plannedQty: Number(x.planned_qty), note: (x.note as string) ?? null,
          trackedBySerial: (x.tracked_by_serial as boolean) ?? false,
        }));
        const serials = await db.query(
          `SELECT su.id, su.material_id, m.name AS material_name, su.serial, su.status, su.installed_on,
                  (su.secrets <> '{}'::jsonb) AS has_secret
           FROM stock_serial_unit su LEFT JOIN material m ON m.id = su.material_id
           WHERE su.work_order_id = $1 ORDER BY su.installed_on NULLS LAST, su.serial`, [request.params.id]);
        dto.serials = serials.rows.map((x): WorkOrderSerialDto => ({
          id: x.id as string, materialId: x.material_id as string, materialName: (x.material_name as string) ?? null,
          serial: x.serial as string, status: x.status as string,
          installedOn: (x.installed_on as Date | null)?.toISOString().slice(0, 10) ?? null,
          hasSecret: (x.has_secret as boolean) ?? false,
        }));
        return dto;
      });
    });

  /* ── CREA ── */
  app.post('/work-orders', { preHandler: [app.authenticate, requirePermission('work_order:create')] }, async (request, reply) => {
    const input = createWorkOrderSchema.parse(request.body);
    const ctx = request.ctx;
    const dto = await withRls(ctx, async (db) => {
      const attrs = await validateAttributes(db, ctx.tenantId, 'work_order', input.attributes);
      const code = await nextNumber(db, 'work_order');
      const statusId = input.statusId ?? (await lookupDefaultId(db, 'work_order_status', 'assigned'));
      const typeId = input.typeId ?? (await lookupDefaultId(db, 'work_order_type', 'activation'));
      const ins = await db.query(
        `INSERT INTO work_order
           (tenant_id, engagement_id, code, principal_company_id, principal_order_ref, type_id, status_id,
            assigned_resource_id, address, scheduled_on, attributes, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING id`,
        [ctx.tenantId, input.engagementId, code, input.principalCompanyId ?? null, input.principalOrderRef ?? null,
         typeId, statusId, input.assignedResourceId ?? null, input.address ?? null, input.scheduledOn ?? null, attrs, ctx.userId]);
      const id = ins.rows[0].id as string;
      if (input.subject) await upsertSubject(db, ctx.tenantId, id, ctx.userId, input.subject);
      const r = await db.query(`${LIST_SELECT} WHERE wo.id = $1`, [id]);
      return listDto(r.rows[0], piiLevel(new Set(ctx.permissions)));
    });
    return reply.code(201).send(dto);
  });

  /* ── MODIFICA ── */
  app.patch<{ Params: { id: string } }>('/work-orders/:id',
    { preHandler: [app.authenticate, requirePermission('work_order:update')] }, async (request) => {
      const input = updateWorkOrderSchema.parse(request.body);
      const ctx = request.ctx;
      return withRls(ctx, async (db) => {
        const attrs = input.attributes ? await validateAttributes(db, ctx.tenantId, 'work_order', input.attributes) : null;
        await db.query(
          `UPDATE work_order SET
             principal_company_id = COALESCE($2, principal_company_id),
             principal_order_ref   = COALESCE($3, principal_order_ref),
             status_id           = COALESCE($4, status_id),
             assigned_resource_id = $5,
             address             = COALESCE($6, address),
             scheduled_on        = COALESCE($7, scheduled_on),
             completed_on        = COALESCE($8, completed_on),
             attributes          = COALESCE($9, attributes),
             type_id             = COALESCE($11, type_id),
             updated_by          = $10
           WHERE id = $1 AND archived_at IS NULL`,
          [request.params.id, input.principalCompanyId ?? null, input.principalOrderRef ?? null, input.statusId ?? null,
           input.assignedResourceId ?? null, input.address ?? null, input.scheduledOn ?? null, input.completedOn ?? null,
           attrs, ctx.userId, input.typeId ?? null]);
        if (input.subject !== undefined && input.subject !== null) await upsertSubject(db, ctx.tenantId, request.params.id, ctx.userId, input.subject);
        const r = await db.query(`${LIST_SELECT} WHERE wo.id = $1`, [request.params.id]);
        return listDto(r.rows[0], piiLevel(new Set(ctx.permissions)));
      });
    });

  /* ── ELIMINA (soft) ── */
  app.delete<{ Params: { id: string } }>('/work-orders/:id',
    { preHandler: [app.authenticate, requirePermission('work_order:delete')] }, async (request, reply) => {
      await withRls(request.ctx, (db) =>
        db.query(`UPDATE work_order SET archived_at = now(), updated_by = $2 WHERE id = $1`, [request.params.id, request.ctx.userId]));
      return reply.code(204).send();
    });

  /* ── APPARATI PIANIFICATI: sostituisci l'elenco (PUT) ── */
  app.put<{ Params: { id: string } }>('/work-orders/:id/items',
    { preHandler: [app.authenticate, requirePermission('work_order:update')] }, async (request) => {
      const body = request.body as { items?: unknown[] };
      const items = (body.items ?? []).map((it) => workOrderItemSchema.parse(it));
      const ctx = request.ctx;
      return withRls(ctx, async (db) => {
        await db.query(`DELETE FROM work_order_item WHERE work_order_id = $1`, [request.params.id]);
        for (const it of items) {
          await db.query(
            `INSERT INTO work_order_item (tenant_id, work_order_id, material_id, planned_qty, note)
             VALUES ($1,$2,$3,$4,$5)`,
            [ctx.tenantId, request.params.id, it.materialId, it.plannedQty, it.note ?? null]);
        }
        return { ok: true, count: items.length };
      });
    });

  /* ── ASSEGNA BULK a squadra ── */
  app.post('/work-orders/assign', { preHandler: [app.authenticate, requirePermission('work_order:assign')] }, async (request) => {
    const input = assignWorkOrdersSchema.parse(request.body);
    return withRls(request.ctx, async (db) => {
      const r = await db.query(
        `UPDATE work_order SET assigned_resource_id = $2, updated_by = $3
         WHERE id = ANY($1::uuid[]) AND archived_at IS NULL`,
        [input.ids, input.assignedResourceId, request.ctx.userId]);
      return { updated: r.rowCount ?? 0 };
    });
  });

  /* ── IMPORT da CSV/portale ── righe gia' mappate dal client (mapping configurabile,
   *    decisione §12.2). Rileva i doppioni sull'UNIQUE (tenant, operator_company, principal_order_ref). */
  app.post('/work-orders/import', { preHandler: [app.authenticate, requirePermission('work_order:import')] }, async (request) => {
    const input = importWorkOrdersSchema.parse(request.body);
    const ctx = request.ctx;
    return withRls(ctx, async (db) => {
      const statusId = await lookupDefaultId(db, 'work_order_status', 'assigned');
      let created = 0; const duplicates: string[] = []; const errors: { row: string; message: string }[] = [];
      for (const row of input.rows) {
        try {
          const code = await nextNumber(db, 'work_order');
          const ins = await db.query(
            `INSERT INTO work_order (tenant_id, engagement_id, code, principal_company_id, principal_order_ref, status_id, address, scheduled_on, created_by, updated_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
             ON CONFLICT (tenant_id, principal_company_id, principal_order_ref) DO NOTHING
             RETURNING id`,
            [ctx.tenantId, input.engagementId, code, row.principalCompanyId ?? null, row.principalOrderRef, statusId,
             row.address ?? null, row.scheduledOn ?? null, ctx.userId]);
          if (ins.rows.length === 0) { duplicates.push(row.principalOrderRef); continue; }
          if (row.subject) await upsertSubject(db, ctx.tenantId, ins.rows[0].id as string, ctx.userId, row.subject);
          created += 1;
        } catch (e) {
          errors.push({ row: row.principalOrderRef, message: (e as Error).message });
        }
      }
      return { created, duplicates, errors, total: input.rows.length };
    });
  });
}
