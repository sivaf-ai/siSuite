/** workReports.ts — RAPPORTINO AI (§5).
 *  Flusso: raw -> (genera) ai_proposed -> (uomo conferma final_text) confirmed
 *  -> (firma) signed. Regola billing_mode: fixed = niente ore né costi al cliente;
 *  hourly = ore, mai costi. audience 'internal' = ore per categoria CON costi.
 *  L'AI non scrive mai lo stato finale; senza chiave degrada a testo deterministico. */
import type { FastifyInstance } from 'fastify';
import {
  createWorkReportSchema, updateWorkReportSchema, signWorkReportSchema, type WorkReportDto,
} from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import type { PoolClient } from '../db/pool.js';
import { lookupIdByCanonical } from '../lookupResolve.js';
import { config, aiEnabled } from '../config.js';
import { anthropic } from '../ai/client.js';

const LOCALE_NAME: Record<string, string> = { 'it-IT': 'italiano', en: 'English', 'es-AR': 'español (Argentina)' };

function toDto(r: Record<string, unknown>): WorkReportDto {
  return {
    id: r.id as string, engagementId: r.engagement_id as string, activityId: (r.activity_id as string) ?? null,
    periodStart: (r.period_start as string) ?? null, periodEnd: (r.period_end as string) ?? null,
    audience: r.audience as string, statusId: (r.status_id as string) ?? null, rawText: (r.raw_text as string) ?? null,
    aiText: (r.ai_text as string) ?? null, finalText: (r.final_text as string) ?? null,
    signerName: (r.signer_name as string) ?? null, signatureUrl: (r.signature_url as string) ?? null,
    signedAt: (r.signed_at as string) ?? null, generatedByAi: r.generated_by_ai as boolean, createdAt: r.created_at as string,
  };
}

const SELECT = `SELECT id, engagement_id, activity_id, period_start, period_end, audience, status_id, raw_text,
  ai_text, final_text, signer_name, signature_url, signed_at, generated_by_ai, created_at FROM work_report`;

interface GatherData {
  code: string; title: string; company: string | null; billingMode: string | null;  // 'hourly'|'fixed'
  agreedPrice: number | null;
  lines: { typology: string | null; minutes: number; costRate: number | null; billRate: number | null }[];
  rawText: string | null;
}

async function gather(db: PoolClient, wr: Record<string, unknown>): Promise<GatherData> {
  const e = (await db.query(
    `SELECT e.code, e.title, c.display_name AS company, bm.canonical AS billing_mode,
            COALESCE(e.budget_amount, (e.attributes->>'budget')::numeric) AS agreed_price
     FROM engagement e LEFT JOIN company c ON c.id = e.company_id
     LEFT JOIN lookup_value bm ON bm.id = e.billing_mode_id WHERE e.id = $1`, [wr.engagement_id])).rows[0] ?? {};
  // ore collegate al rapportino (se presenti) oppure tutte le ore della commessa/attività
  const linked = (await db.query(`SELECT time_entry_id FROM work_report_time_entry WHERE work_report_id = $1`, [wr.id])).rows;
  let teRows;
  if (linked.length) {
    teRows = (await db.query(
      `SELECT te.minutes, te.cost_rate, te.bill_rate, lv.canonical AS typology
       FROM time_entry te LEFT JOIN lookup_value lv ON lv.id = te.typology_id
       WHERE te.id = ANY($1::uuid[])`, [linked.map((l) => l.time_entry_id)])).rows;
  } else {
    const cond = wr.activity_id ? 'te.activity_id = $1' : 'te.engagement_id = $1';
    teRows = (await db.query(
      `SELECT te.minutes, te.cost_rate, te.bill_rate, lv.canonical AS typology
       FROM time_entry te LEFT JOIN lookup_value lv ON lv.id = te.typology_id
       WHERE ${cond}`, [wr.activity_id ?? wr.engagement_id])).rows;
  }
  return {
    code: e.code ?? '', title: e.title ?? '', company: e.company ?? null, billingMode: e.billing_mode ?? null,
    agreedPrice: e.agreed_price === null || e.agreed_price === undefined ? null : Number(e.agreed_price),
    lines: teRows.map((r) => ({
      typology: r.typology ?? null, minutes: Number(r.minutes),
      costRate: r.cost_rate === null ? null : Number(r.cost_rate), billRate: r.bill_rate === null ? null : Number(r.bill_rate),
    })),
    rawText: (wr.raw_text as string) ?? null,
  };
}

/** testo deterministico secondo audience + billing_mode (niente leak costi al cliente). */
function deterministic(d: GatherData, audience: string): string {
  const totalMin = d.lines.reduce((s, l) => s + l.minutes, 0);
  const hours = Math.round((totalMin / 60) * 10) / 10;
  const head = `Rapportino commessa ${d.code} «${d.title}»${d.company ? ` per ${d.company}` : ''}.`;
  if (audience === 'internal') {
    const byTyp = new Map<string, { min: number; cost: number }>();
    for (const l of d.lines) {
      const k = l.typology ?? 'altro';
      const cur = byTyp.get(k) ?? { min: 0, cost: 0 };
      cur.min += l.minutes; cur.cost += (l.minutes / 60) * (l.costRate ?? 0);
      byTyp.set(k, cur);
    }
    const rows = [...byTyp.entries()].map(([k, v]) => `${k}: ${Math.round(v.min / 60 * 10) / 10}h (costo €${v.cost.toFixed(2)})`);
    return `${head} (DOCUMENTO INTERNO) Ore per categoria — ${rows.join('; ')}. Totale ${hours}h.`;
  }
  // customer
  if (d.billingMode === 'fixed') {
    return `${head} Lavori eseguiti${d.rawText ? `: ${d.rawText}` : ' come da accordi'}.` +
      (d.agreedPrice !== null ? ` Importo concordato: €${d.agreedPrice.toFixed(2)}.` : '');
  }
  // hourly (default): ore sì, costi no
  return `${head} Lavori eseguiti${d.rawText ? `: ${d.rawText}` : ''}. Ore complessive: ${hours}h.`;
}

/** dati "safe" da passare all'LLM: per il cliente NIENTE costi (e per fixed niente ore). */
function llmPayload(d: GatherData, audience: string): unknown {
  if (audience === 'internal') return d;
  const base = { code: d.code, title: d.title, company: d.company, rawText: d.rawText, billingMode: d.billingMode };
  if (d.billingMode === 'fixed') return { ...base, agreedPrice: d.agreedPrice };
  return { ...base, totalHours: Math.round(d.lines.reduce((s, l) => s + l.minutes, 0) / 60 * 10) / 10 };
}

export async function workReportRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { engagementId?: string } }>('/work-reports',
    { preHandler: [app.authenticate, requirePermission('work_report:read')] },
    async (request) => {
      const rows = await withRls(request.ctx, (db) => {
        const params: unknown[] = []; let where = '';
        if (request.query.engagementId) { params.push(request.query.engagementId); where = 'WHERE engagement_id = $1'; }
        return db.query(`${SELECT} ${where} ORDER BY created_at DESC LIMIT 500`, params).then((r) => r.rows);
      });
      return { items: rows.map(toDto) };
    });

  app.post('/work-reports', { preHandler: [app.authenticate, requirePermission('work_report:create')] },
    async (request, reply) => {
      const input = createWorkReportSchema.parse(request.body);
      const dto = await withRls(request.ctx, async (db) => {
        const rawId = await lookupIdByCanonical(db, 'work_report_status', 'raw');
        const r = await db.query(
          `INSERT INTO work_report (tenant_id, engagement_id, activity_id, period_start, period_end, audience, status_id, raw_text, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING ${SELECT.replace('SELECT ', '').replace(' FROM work_report', '')}`,
          [request.ctx.tenantId, input.engagementId, input.activityId ?? null, input.periodStart ?? null,
           input.periodEnd ?? null, input.audience, rawId, input.rawText ?? null, request.ctx.userId]);
        if (input.timeEntryIds?.length) {
          for (const teId of input.timeEntryIds) {
            await db.query(
              `INSERT INTO work_report_time_entry (work_report_id, time_entry_id, tenant_id) VALUES ($1,$2,$3)
               ON CONFLICT DO NOTHING`, [r.rows[0].id, teId, request.ctx.tenantId]);
          }
        }
        return toDto(r.rows[0]);
      });
      return reply.code(201).send(dto);
    });

  // genera ai_text e porta a 'ai_proposed' (l'AI non scrive lo stato finale)
  app.post<{ Params: { id: string } }>('/work-reports/:id/generate',
    { preHandler: [app.authenticate, requirePermission('work_report:create')] },
    async (request, reply) => {
      return withRls(request.ctx, async (db) => {
        const wr = (await db.query(`${SELECT} WHERE id = $1`, [request.params.id])).rows[0];
        if (!wr) return reply.code(404).send({ error: 'not_found', message: 'Rapportino inesistente', statusCode: 404 });
        const d = await gather(db, wr);
        const audience = wr.audience as string;
        let text = deterministic(d, audience);
        let byAi = false;
        if (aiEnabled()) {
          const lang = LOCALE_NAME[request.ctx.locale] ?? 'italiano';
          const guard = audience === 'internal'
            ? 'Documento INTERNO: includi le ore per categoria e i costi.'
            : d.billingMode === 'fixed'
              ? 'Rapportino CLIENTE a corpo: descrivi i lavori e l\'importo concordato. NON citare ore né costi.'
              : 'Rapportino CLIENTE a ore: descrivi i lavori e le ore complessive. NON citare costi.';
          try {
            const msg = await anthropic().messages.create({
              model: config.ai.extractionModel, max_tokens: 500,
              system: `Sei l'assistente che redige un rapportino di lavoro in ${lang}. ${guard} Solo testo semplice, ` +
                `professionale e sintetico. USA SOLO i dati forniti, non inventare.`,
              messages: [{ role: 'user', content: JSON.stringify(llmPayload(d, audience)) }],
            });
            const t = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
            if (t) { text = t; byAi = true; }
          } catch { /* degrada al deterministico */ }
        }
        const proposedId = await lookupIdByCanonical(db, 'work_report_status', 'ai_proposed');
        const upd = await db.query(
          `UPDATE work_report SET ai_text = $1, generated_by_ai = $2, status_id = $3, updated_by = $4 WHERE id = $5
           RETURNING ${SELECT.replace('SELECT ', '').replace(' FROM work_report', '')}`,
          [text, byAi, proposedId, request.ctx.userId, wr.id]);
        return toDto(upd.rows[0]);
      });
    });

  // l'uomo modifica final_text e (opz.) conferma
  app.patch<{ Params: { id: string } }>('/work-reports/:id',
    { preHandler: [app.authenticate, requirePermission('work_report:update')] },
    async (request) => {
      const input = updateWorkReportSchema.parse(request.body);
      return withRls(request.ctx, async (db) => {
        const sets: string[] = []; const params: unknown[] = [];
        const put = (c: string, v: unknown) => { params.push(v); sets.push(`${c} = $${params.length}`); };
        if (input.finalText !== undefined) put('final_text', input.finalText);
        if (input.confirm) { const cid = await lookupIdByCanonical(db, 'work_report_status', 'confirmed'); put('status_id', cid); }
        if (!sets.length) return { ok: true };
        params.push(request.ctx.userId); sets.push(`updated_by = $${params.length}`);
        params.push(request.params.id);
        const r = await db.query(`UPDATE work_report SET ${sets.join(', ')} WHERE id = $${params.length}
          RETURNING ${SELECT.replace('SELECT ', '').replace(' FROM work_report', '')}`, params);
        return r.rows[0] ? toDto(r.rows[0]) : { ok: false };
      });
    });

  // firma -> 'signed' (richiede final_text confermato)
  app.post<{ Params: { id: string } }>('/work-reports/:id/sign',
    { preHandler: [app.authenticate, requirePermission('work_report:update')] },
    async (request, reply) => {
      const input = signWorkReportSchema.parse(request.body);
      return withRls(request.ctx, async (db) => {
        const cur = (await db.query(`SELECT final_text FROM work_report WHERE id = $1`, [request.params.id])).rows[0];
        if (!cur) return reply.code(404).send({ error: 'not_found', message: 'Rapportino inesistente', statusCode: 404 });
        if (!cur.final_text) return reply.code(400).send({ error: 'bad_request', message: 'Conferma il testo prima della firma', statusCode: 400 });
        const signedId = await lookupIdByCanonical(db, 'work_report_status', 'signed');
        const r = await db.query(
          `UPDATE work_report SET signer_name = $1, signature_url = $2, signed_at = now(), status_id = $3, updated_by = $4 WHERE id = $5
           RETURNING ${SELECT.replace('SELECT ', '').replace(' FROM work_report', '')}`,
          [input.signerName, input.signatureUrl ?? null, signedId, request.ctx.userId, request.params.id]);
        return toDto(r.rows[0]);
      });
    });

  app.delete<{ Params: { id: string } }>('/work-reports/:id',
    { preHandler: [app.authenticate, requirePermission('work_report:delete')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`DELETE FROM work_report WHERE id = $1`, [request.params.id]));
      return reply.code(204).send();
    });
}
