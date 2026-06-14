/** budget.ts — BUDGET/MARGINE (§7).
 *  Rollup per commessa: previsto vs fatto (costo/ricavo) e margine, dai dati
 *  fotografati (time_entry.cost_rate/bill_rate, stock_movement out su lavoro).
 *  - Fatto costo  = Σ ore×cost_rate + Σ |out|×unit_cost
 *  - Fatto ricavo = Σ ore×bill_rate (escl. billable=false) + Σ |out|×unit_price
 *                   (se commessa 'fixed' → ricavo = prezzo concordato)
 *  - Previsto = budget_amount (COALESCE attributes.budget); fallback stima
 *    = ore stimate × tariffa default tenant. Allarme se fatto/previsto > 0,85.
 *  Breakdown costo/ricavo manodopera per fase. */
import type { FastifyInstance } from 'fastify';
import type { EngagementBudgetDto } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';

const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

export async function budgetRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>('/engagements/:id/budget',
    { preHandler: [app.authenticate, requirePermission('engagement:read')] },
    async (request, reply) => {
      const id = request.params.id;
      return withRls(request.ctx, async (db): Promise<EngagementBudgetDto> => {
        const e = (await db.query(
          `SELECT e.id, bm.canonical AS billing_mode, e.budget_currency,
                  COALESCE(e.budget_amount, (e.attributes->>'budget')::numeric) AS budget,
                  t.default_bill_rate, t.default_currency
           FROM engagement e LEFT JOIN lookup_value bm ON bm.id = e.billing_mode_id
           CROSS JOIN tenant t WHERE e.id = $1 AND t.id = app_current_tenant()`, [id])).rows[0];
        if (!e) { reply.code(404); throw Object.assign(new Error('Commessa inesistente'), { statusCode: 404 }); }

        // manodopera (fotografata sulle righe ore)
        const labor = (await db.query(
          `SELECT COALESCE(SUM(minutes/60.0 * COALESCE(cost_rate,0)),0) AS cost,
                  COALESCE(SUM(CASE WHEN billable THEN minutes/60.0 * COALESCE(bill_rate,0) ELSE 0 END),0) AS rev
           FROM time_entry te WHERE te.engagement_id = $1`, [id])).rows[0];
        const laborCost = n(labor.cost), laborRevenue = n(labor.rev);

        // materiali da magazzino: movimenti 'out' su lavoro di questa commessa
        const mat = (await db.query(
          `SELECT COALESCE(SUM(ABS(sm.quantity) * COALESCE(sm.unit_cost,0)),0) AS cost,
                  COALESCE(SUM(ABS(sm.quantity) * COALESCE(sm.unit_price,0)),0) AS rev
           FROM stock_movement sm JOIN lookup_value lv ON lv.id = sm.type_id
           WHERE sm.engagement_id = $1 AND lv.canonical = 'out'`, [id])).rows[0];
        const materialCost = n(mat.cost), materialRevenue = n(mat.rev);

        // ore stimate (per la stima del previsto in assenza di budget)
        const estim = (await db.query(
          `SELECT COALESCE(SUM(estimated_minutes),0) AS m FROM activity WHERE engagement_id = $1`, [id])).rows[0];
        const estHours = n(estim.m) / 60;

        // breakdown manodopera per fase
        const phaseRows = (await db.query(
          `SELECT a.phase_id, p.name,
                  COALESCE(SUM(te.minutes/60.0 * COALESCE(te.cost_rate,0)),0) AS cost,
                  COALESCE(SUM(CASE WHEN te.billable THEN te.minutes/60.0 * COALESCE(te.bill_rate,0) ELSE 0 END),0) AS rev
           FROM time_entry te JOIN activity a ON a.id = te.activity_id
           LEFT JOIN phase p ON p.id = a.phase_id
           WHERE te.engagement_id = $1 GROUP BY a.phase_id, p.name ORDER BY p.name NULLS LAST`, [id])).rows;

        const costoFatto = laborCost + materialCost;
        const isFixed = e.billing_mode === 'fixed';
        const budget = e.budget === null || e.budget === undefined ? null : Number(e.budget);
        const ricavoFatto = isFixed ? (budget ?? 0) : laborRevenue + materialRevenue;

        let previsto: number | null = budget;
        let previstoSource: EngagementBudgetDto['previstoSource'] = budget !== null ? 'budget' : 'none';
        if (previsto === null && estHours > 0 && e.default_bill_rate) {
          previsto = estHours * Number(e.default_bill_rate);
          previstoSource = 'stima';
        }
        const margine = ricavoFatto - costoFatto;
        const rimane = previsto !== null ? previsto - costoFatto : null;
        const allarme = previsto !== null && previsto > 0 && costoFatto / previsto > 0.85;

        return {
          engagementId: id, currency: e.budget_currency ?? e.default_currency ?? 'EUR', billingMode: e.billing_mode ?? null,
          previsto, previstoSource, costoFatto, ricavoFatto, margine, rimane, allarme,
          laborCost, laborRevenue, materialCost, materialRevenue,
          phases: phaseRows.map((r) => ({
            phaseId: r.phase_id ?? null, name: r.name ?? null, costoFatto: n(r.cost), ricavoFatto: n(r.rev),
          })),
        };
      });
    });
}
