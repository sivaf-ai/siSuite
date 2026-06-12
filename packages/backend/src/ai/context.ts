/**
 * context.ts — ASSEMBLAGGIO DEL CONTESTO per l'estrazione.
 * "Qui si vince" (MVP §4): si passano al modello l'agenda/attività aperte, i
 * cataloghi (materiali, tipologie ore) e gli stati canonici, così risolve la
 * frase sugli ID REALI invece di inventare. Tutto entro la RLS dell'utente:
 * l'AI vede solo ciò che l'utente può vedere.
 *
 * (Rimandato: recupero semantico dei "precedenti simili" via pgvector.)
 */
import type { PoolClient } from '../db/pool.js';
import type { UserContext } from '@sisuite/shared';

export interface CtxActivity { id: string; title: string; statusCanonical: string | null; checklist: string[] }
export interface CtxMaterial { id: string; name: string; unit: string }
export interface ExtractionContext {
  today: string;
  engagement: { id: string; code: string; title: string } | null;
  activities: CtxActivity[];
  materials: CtxMaterial[];
  typologies: string[];
  activityStatuses: string[];
}

const DEFAULT_TYPOLOGIES = ['sviluppo', 'assistenza', 'addestramento', 'riunione', 'analisi'];

export async function assembleContext(
  db: PoolClient,
  ctx: UserContext,
  engagementId: string | undefined,
  now: Date = new Date(),
): Promise<ExtractionContext> {
  const today = now.toISOString().slice(0, 10);

  let engagement: ExtractionContext['engagement'] = null;
  if (engagementId) {
    const e = await db.query(`SELECT id, code, title FROM engagement WHERE id = $1`, [engagementId]);
    if (e.rows.length) engagement = { id: e.rows[0].id, code: e.rows[0].code, title: e.rows[0].title };
  }

  const actParams: unknown[] = [];
  let actWhere = `WHERE (s.canonical IS NULL OR s.canonical NOT IN ('cancelled'))`;
  if (engagementId) { actParams.push(engagementId); actWhere += ` AND a.engagement_id = $${actParams.length}`; }
  const acts = await db.query(
    `SELECT a.id, a.title, s.canonical AS status_canonical, a.checklist
     FROM activity a LEFT JOIN lookup_value s ON s.id = a.status_id
     ${actWhere}
     ORDER BY a.scheduled_start NULLS LAST, a.created_at
     LIMIT 60`,
    actParams,
  );
  const activities: CtxActivity[] = acts.rows.map((r) => ({
    id: r.id,
    title: r.title,
    statusCanonical: r.status_canonical ?? null,
    checklist: Array.isArray(r.checklist) ? r.checklist.map((c: { text: string }) => c.text) : [],
  }));

  const mats = await db.query(`SELECT id, name, unit FROM material WHERE archived_at IS NULL ORDER BY name LIMIT 200`);
  const materials: CtxMaterial[] = mats.rows.map((r) => ({ id: r.id, name: r.name, unit: r.unit }));

  const t = await db.query(`SELECT domain_pack FROM tenant WHERE id = $1`, [ctx.tenantId]);
  const dp = (t.rows[0]?.domain_pack ?? {}) as { time_typologies?: string[] };
  const typologies = Array.isArray(dp.time_typologies) && dp.time_typologies.length ? dp.time_typologies : DEFAULT_TYPOLOGIES;

  const st = await db.query(`SELECT code FROM canonical_state WHERE category = 'activity_status' ORDER BY sequence`);
  const activityStatuses = st.rows.map((r) => r.code as string);

  return { today, engagement, activities, materials, typologies, activityStatuses };
}
