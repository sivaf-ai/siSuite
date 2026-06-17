/** finance.ts — PIVOT preventivo–consuntivo (mock 47, Blocco G).
 *  Aggrega la vista `job_cost_ledger` per Commessa › Fase/WBS › Voce (cost_type),
 *  con KPI ricavi/costi/margine/% e etichette/colori da lookup_value('cost_type').
 *  Sola lettura (report:read). L'export Excel è generato dal client (CSV UTF-8). */
import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';

interface LeafLine { costType: string; label: string; colorToken: string | null; quantity: number; cost: number; revenue: number; margin: number }
interface PhaseNode { phaseId: string | null; name: string; wbsCode: string | null; lines: LeafLine[]; cost: number; revenue: number; margin: number }
interface EngNode { engagementId: string; code: string; title: string; company: string | null; phases: PhaseNode[]; cost: number; revenue: number; margin: number }

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function financeRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { engagementId?: string } }>('/finance/pivot',
    { preHandler: [app.authenticate, requirePermission('report:read')] },
    async (request) => {
      const engId = request.query.engagementId;
      return withRls(request.ctx, async (db) => {
        // etichette/colori dei tipi di costo
        const ct = (await db.query(
          `SELECT canonical, label->>'it-IT' AS it, color_token FROM lookup_value WHERE category='cost_type'`)).rows;
        const ctMap = new Map(ct.map((r) => [r.canonical as string, { label: (r.it as string) ?? r.canonical, color: (r.color_token as string) ?? null }]));

        const params: unknown[] = [];
        let where = '';
        if (engId) { params.push(engId); where = 'WHERE l.engagement_id = $1'; }
        const rows = (await db.query(
          `SELECT l.engagement_id, e.code, e.title, c.display_name AS company,
                  l.phase_id, p.name AS phase_name, p.wbs_code,
                  l.cost_type,
                  SUM(l.quantity)::numeric AS quantity,
                  SUM(l.cost_amount)::numeric AS cost,
                  SUM(l.revenue_amount)::numeric AS revenue
           FROM job_cost_ledger l
           JOIN engagement e ON e.id = l.engagement_id
           LEFT JOIN company c ON c.id = e.company_id
           LEFT JOIN phase p ON p.id = l.phase_id
           ${where}
           GROUP BY l.engagement_id, e.code, e.title, c.display_name, l.phase_id, p.name, p.wbs_code, l.cost_type
           ORDER BY e.code, p.wbs_code NULLS FIRST, p.name NULLS FIRST, l.cost_type`, params)).rows;

        const engs = new Map<string, EngNode>();
        for (const row of rows) {
          const eId = row.engagement_id as string;
          let eng = engs.get(eId);
          if (!eng) { eng = { engagementId: eId, code: row.code, title: row.title, company: row.company ?? null, phases: [], cost: 0, revenue: 0, margin: 0 }; engs.set(eId, eng); }
          const pKey = (row.phase_id as string) ?? '∅';
          let ph = eng.phases.find((x) => (x.phaseId ?? '∅') === pKey);
          if (!ph) { ph = { phaseId: (row.phase_id as string) ?? null, name: (row.phase_name as string) ?? 'Senza fase', wbsCode: (row.wbs_code as string) ?? null, lines: [], cost: 0, revenue: 0, margin: 0 }; eng.phases.push(ph); }
          const cost = r2(Number(row.cost)); const revenue = r2(Number(row.revenue)); const margin = r2(revenue - cost);
          const meta = ctMap.get(row.cost_type as string) ?? { label: row.cost_type as string, color: null };
          ph.lines.push({ costType: row.cost_type as string, label: meta.label, colorToken: meta.color, quantity: r2(Number(row.quantity)), cost, revenue, margin });
          ph.cost += cost; ph.revenue += revenue; ph.margin += margin;
          eng.cost += cost; eng.revenue += revenue; eng.margin += margin;
        }
        const tree = [...engs.values()].map((e) => ({
          ...e, cost: r2(e.cost), revenue: r2(e.revenue), margin: r2(e.margin),
          phases: e.phases.map((p) => ({ ...p, cost: r2(p.cost), revenue: r2(p.revenue), margin: r2(p.margin) })),
        }));
        const cost = r2(tree.reduce((a, e) => a + e.cost, 0));
        const revenue = r2(tree.reduce((a, e) => a + e.revenue, 0));
        const margin = r2(revenue - cost);
        const marginPct = revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : null;
        return { tree, kpi: { cost, revenue, margin, marginPct }, costTypes: [...ctMap.entries()].map(([k, v]) => ({ canonical: k, ...v })) };
      });
    });
}
