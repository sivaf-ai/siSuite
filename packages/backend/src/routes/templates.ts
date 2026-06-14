/** templates.ts — MODELLI di commessa (parte: instanziazione blueprint).
 *  - POST /engagements/:id/save-as-template : cattura fasi/attività/dipendenze
 *    della commessa in un blueprint jsonb.
 *  - GET /engagement-templates · DELETE /engagement-templates/:id
 *  - POST /engagements/from-template : crea una nuova commessa dal modello
 *    (fasi + attività + dipendenze FS), riusando codice/numeratore e stati di default. */
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from '../db/pool.js';
import { saveTemplateSchema, instantiateTemplateSchema, type EngagementTemplateDto } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';
import { nextNumber } from '../numberSeries.js';
import { lookupDefaultId } from '../status.js';

// I modelli vivono nella tabella `template` (scope='engagement'); il `type` della
// commessa (build/maintenance) è nel blueprint (la tabella template non ha colonna type).
interface Blueprint {
  type: 'build' | 'maintenance';
  phases: { name: string; seq: number }[];
  activities: { ref: string; title: string; estimatedMinutes: number | null; priorityCanonical: string | null; phaseName: string | null }[];
  deps: { predRef: string; succRef: string; lagMinutes: number }[];
}

async function maybePriorityId(db: PoolClient, canonical: string | null): Promise<string | null> {
  if (!canonical) return null;
  try { return await lookupDefaultId(db, 'priority', canonical); } catch { return null; }
}

export async function templateRoutes(app: FastifyInstance): Promise<void> {
  // Salva una commessa esistente come modello
  app.post<{ Params: { id: string } }>('/engagements/:id/save-as-template',
    { preHandler: [app.authenticate, requirePermission('engagement:create')] },
    async (request, reply) => {
      const { name } = saveTemplateSchema.parse(request.body);
      const out = await withRls(request.ctx, async (db) => {
        const eng = await db.query(`SELECT id, type FROM engagement WHERE id = $1`, [request.params.id]);
        if (!eng.rows.length) return null;
        const phases = (await db.query(`SELECT name, seq FROM phase WHERE engagement_id = $1 ORDER BY seq`, [request.params.id])).rows;
        const acts = (await db.query(
          `SELECT a.id, a.title, a.estimated_minutes, p.name AS phase_name, pr.canonical AS priority_canonical
           FROM activity a LEFT JOIN phase p ON p.id = a.phase_id LEFT JOIN lookup_value pr ON pr.id = a.priority_id
           WHERE a.engagement_id = $1 ORDER BY a.created_at`, [request.params.id])).rows;
        const refOf = new Map<string, string>();
        acts.forEach((a, i) => refOf.set(a.id as string, `a${i}`));
        const deps = (await db.query(
          `SELECT d.predecessor_id, d.successor_id, d.lag_minutes
           FROM activity_dependency d JOIN activity ap ON ap.id = d.predecessor_id
           WHERE ap.engagement_id = $1`, [request.params.id])).rows
          .filter((d) => refOf.has(d.predecessor_id as string) && refOf.has(d.successor_id as string));
        const blueprint: Blueprint = {
          type: eng.rows[0].type as 'build' | 'maintenance',
          phases: phases.map((p) => ({ name: p.name as string, seq: (p.seq as number) ?? 0 })),
          activities: acts.map((a) => ({
            ref: refOf.get(a.id as string)!, title: a.title as string,
            estimatedMinutes: (a.estimated_minutes as number) ?? null,
            priorityCanonical: (a.priority_canonical as string) ?? null,
            phaseName: (a.phase_name as string) ?? null,
          })),
          deps: deps.map((d) => ({ predRef: refOf.get(d.predecessor_id as string)!, succRef: refOf.get(d.successor_id as string)!, lagMinutes: (d.lag_minutes as number) ?? 0 })),
        };
        const ins = await db.query(
          `INSERT INTO template (tenant_id, scope, name, blueprint, created_by, updated_by) VALUES ($1,'engagement',$2,$3,$4,$4) RETURNING id`,
          [request.ctx.tenantId, name, JSON.stringify(blueprint), request.ctx.userId]);
        return ins.rows[0].id as string;
      });
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Commessa non trovata', statusCode: 404 });
      return reply.code(201).send({ id: out });
    });

  // Lista modelli (con conteggi)
  app.get('/engagement-templates',
    { preHandler: [app.authenticate, requirePermission('engagement:read')] },
    async (request) =>
      withRls(request.ctx, async (db): Promise<{ items: EngagementTemplateDto[] }> => {
        const rows = (await db.query(
          `SELECT id, name, blueprint, created_at FROM template
           WHERE scope = 'engagement' AND active AND archived_at IS NULL ORDER BY created_at DESC`)).rows;
        return {
          items: rows.map((r) => {
            const bp = (r.blueprint ?? {}) as Partial<Blueprint>;
            return {
              id: r.id as string, name: r.name as string, type: (bp.type as 'build' | 'maintenance') ?? 'build',
              phaseCount: (bp.phases ?? []).length, activityCount: (bp.activities ?? []).length,
              createdAt: r.created_at as string,
            };
          }),
        };
      }));

  app.delete<{ Params: { id: string } }>('/engagement-templates/:id',
    { preHandler: [app.authenticate, requirePermission('engagement:create')] },
    async (request, reply) => {
      await withRls(request.ctx, (db) => db.query(`DELETE FROM template WHERE id = $1 AND scope = 'engagement'`, [request.params.id]));
      return reply.code(204).send();
    });

  // Istanzia una nuova commessa da un modello
  app.post('/engagements/from-template',
    { preHandler: [app.authenticate, requirePermission('engagement:create')] },
    async (request, reply) => {
      const input = instantiateTemplateSchema.parse(request.body);
      const ctx = request.ctx;
      const out = await withRls(ctx, async (db) => {
        const t = await db.query(`SELECT name, blueprint FROM template WHERE id = $1 AND scope = 'engagement'`, [input.templateId]);
        if (!t.rows.length) return null;
        const bp = (t.rows[0].blueprint ?? {}) as Blueprint;
        const engType = bp.type ?? 'build';
        const statusId = await lookupDefaultId(db, 'engagement_status', 'open');
        const code = await nextNumber(db, 'engagement');
        const engId = (await db.query(
          `INSERT INTO engagement (tenant_id, company_id, code, type, title, status_id, asset_id, started_on, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id`,
          [ctx.tenantId, input.companyId, code, engType, input.title || (t.rows[0].name as string),
           statusId, input.assetId ?? null, input.startedOn ?? null, ctx.userId])).rows[0].id as string;

        const phaseStatus = await lookupDefaultId(db, 'phase_status', 'pending');
        const actStatus = await lookupDefaultId(db, 'activity_status', 'planned');
        const phaseId = new Map<string, string>();
        for (const p of bp.phases ?? []) {
          const pid = (await db.query(
            `INSERT INTO phase (tenant_id, engagement_id, name, seq, status_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
            [ctx.tenantId, engId, p.name, p.seq ?? 0, phaseStatus])).rows[0].id as string;
          phaseId.set(p.name, pid);
        }
        const actId = new Map<string, string>();
        for (const a of bp.activities ?? []) {
          const prio = await maybePriorityId(db, a.priorityCanonical);
          const aid = (await db.query(
            `INSERT INTO activity (tenant_id, engagement_id, phase_id, title, status_id, estimated_minutes, priority_id, created_by, updated_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id`,
            [ctx.tenantId, engId, a.phaseName ? phaseId.get(a.phaseName) ?? null : null, a.title, actStatus, a.estimatedMinutes ?? null, prio, ctx.userId])).rows[0].id as string;
          actId.set(a.ref, aid);
        }
        for (const d of bp.deps ?? []) {
          const pr = actId.get(d.predRef); const su = actId.get(d.succRef);
          if (pr && su) await db.query(
            `INSERT INTO activity_dependency (tenant_id, predecessor_id, successor_id, type, lag_minutes) VALUES ($1,$2,$3,'FS',$4)`,
            [ctx.tenantId, pr, su, d.lagMinutes ?? 0]);
        }
        return engId;
      });
      if (!out) return reply.code(404).send({ error: 'not_found', message: 'Modello non trovato', statusCode: 404 });
      return reply.code(201).send({ id: out });
    });
}
