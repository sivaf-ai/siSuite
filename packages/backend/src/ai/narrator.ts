/**
 * narrator.ts — "L'AI CHE RACCONTA" (lato USCITA del loop AI, brief Fase 1.1).
 * Raccoglie i dati strutturati di una commessa SOTTO RLS (vede solo ciò che
 * l'utente può vedere) e li fa riassumere all'LLM nella lingua dell'utente.
 * SOLA LETTURA: non scrive nulla, non passa dal validatore di scrittura.
 * Se ANTHROPIC_API_KEY non è configurata → ritorna un riassunto DETERMINISTICO
 * (calcolato dai dati) così il demo degrada con grazia. Costo basso (contesto stretto).
 */
import type { PoolClient } from '../db/pool.js';
import type { UserContext } from '@sisuite/shared';
import { config, aiEnabled } from '../config.js';
import { anthropic } from './client.js';

export interface NarrativeResult { available: boolean; text: string }

const LOCALE_NAME: Record<string, string> = { 'it-IT': 'italiano', en: 'English', 'es-AR': 'español (Argentina)' };

interface EngData {
  code: string; title: string; type: string; company: string | null; statusCanonical: string | null;
  activities: { title: string; status: string | null; minutes: number | null; fixed: boolean }[];
  loggedMinutes: number;
  materials: { name: string; quantity: number; unit: string }[];
}

async function gather(db: PoolClient, engagementId: string): Promise<EngData | null> {
  const e = await db.query(
    `SELECT e.code, e.title, e.type, c.display_name AS company, s.canonical AS status_canonical
     FROM engagement e LEFT JOIN company c ON c.id = e.company_id
     LEFT JOIN lookup_value s ON s.id = e.status_id
     WHERE e.id = $1`, [engagementId]);
  if (!e.rows.length) return null;
  const acts = await db.query(
    `SELECT a.title, s.canonical AS status_canonical, a.estimated_minutes, a.scheduled_start
     FROM activity a LEFT JOIN lookup_value s ON s.id = a.status_id
     WHERE a.engagement_id = $1 ORDER BY a.scheduled_start NULLS LAST, a.created_at`, [engagementId]);
  const te = await db.query(`SELECT COALESCE(sum(minutes),0)::int AS m FROM time_entry WHERE engagement_id = $1`, [engagementId]);
  const mc = await db.query(
    `SELECT m.name, mc.quantity, mc.unit FROM material_consumption mc
     JOIN material m ON m.id = mc.material_id
     JOIN activity a ON a.id = mc.activity_id
     WHERE a.engagement_id = $1`, [engagementId]);
  return {
    code: e.rows[0].code, title: e.rows[0].title, type: e.rows[0].type,
    company: e.rows[0].company ?? null, statusCanonical: e.rows[0].status_canonical ?? null,
    activities: acts.rows.map((r) => ({
      title: r.title, status: r.status_canonical ?? null,
      minutes: r.estimated_minutes ?? null, fixed: r.scheduled_start != null,
    })),
    loggedMinutes: Number(te.rows[0].m ?? 0),
    materials: mc.rows.map((r) => ({ name: r.name, quantity: Number(r.quantity), unit: r.unit })),
  };
}

/** Riassunto deterministico (fallback senza chiave + base per il prompt). */
function deterministicSummary(d: EngData): string {
  const done = d.activities.filter((a) => a.status === 'done').length;
  const inProg = d.activities.filter((a) => a.status === 'in_progress').map((a) => a.title);
  const planned = d.activities.filter((a) => a.status === 'planned').map((a) => a.title);
  const h = Math.round(d.loggedMinutes / 60);
  const parts: string[] = [];
  parts.push(`Commessa ${d.code} «${d.title}»${d.company ? ` per ${d.company}` : ''}: ${done}/${d.activities.length} attività completate, ${h}h registrate.`);
  if (inProg.length) parts.push(`In corso: ${inProg.join(', ')}.`);
  if (planned.length) parts.push(`Prossime: ${planned.slice(0, 4).join(', ')}${planned.length > 4 ? '…' : ''}.`);
  if (d.materials.length) parts.push(`Materiali usati: ${d.materials.map((m) => `${m.quantity} ${m.unit} ${m.name}`).join('; ')}.`);
  return parts.join(' ');
}

/** Racconto della GIORNATA del tecnico (vista mobile). Sotto RLS: con scope 'own'
 *  vede solo le proprie attività. Deterministico senza chiave, LLM con chiave. */
export async function narrateToday(db: PoolClient, ctx: UserContext): Promise<NarrativeResult> {
  const acts = await db.query(
    `SELECT a.title, s.canonical AS status_canonical, a.estimated_minutes, a.scheduled_start
     FROM activity a LEFT JOIN lookup_value s ON s.id = a.status_id
     WHERE (a.scheduled_start::date = current_date)
        OR (a.scheduled_start IS NULL AND (s.canonical IS NULL OR s.canonical NOT IN ('done','cancelled')))
     ORDER BY a.scheduled_start NULLS LAST, a.created_at LIMIT 50`,
  );
  const rows = acts.rows.map((r) => ({ title: r.title as string, status: (r.status_canonical as string) ?? null, minutes: (r.estimated_minutes as number) ?? null, fixed: r.scheduled_start != null }));
  const fixed = rows.filter((a) => a.fixed).length;
  const minutes = rows.reduce((s, a) => s + (a.minutes ?? 0), 0);
  const h = Math.floor(minutes / 60), mm = minutes % 60;
  const inProg = rows.filter((a) => a.status === 'in_progress').map((a) => a.title);
  const fallback = rows.length === 0
    ? 'Oggi non hai attività in agenda.'
    : `Oggi hai ${rows.length} attività (${fixed} a orario fisso), circa ${h}h${mm ? ` ${mm}m` : ''}.` +
      (inProg.length ? ` In corso: ${inProg.join(', ')}.` : '');
  if (!aiEnabled()) return { available: false, text: fallback };
  const lang = LOCALE_NAME[ctx.locale] ?? 'italiano';
  try {
    const msg = await anthropic().messages.create({
      model: config.ai.extractionModel, max_tokens: 250,
      system: `Sei l'assistente di un tecnico sul campo. Riassumi la sua GIORNATA in ${lang}, 1-2 frasi, tono diretto e incoraggiante. Solo testo. Usa solo i dati forniti.`,
      messages: [{ role: 'user', content: `Attività di oggi (JSON):\n${JSON.stringify(rows)}` }],
    });
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    return { available: true, text: text || fallback };
  } catch { return { available: false, text: fallback }; }
}

export async function narrateEngagement(db: PoolClient, ctx: UserContext, engagementId: string): Promise<NarrativeResult | null> {
  const d = await gather(db, engagementId);
  if (!d) return null;
  const fallback = deterministicSummary(d);
  if (!aiEnabled()) return { available: false, text: fallback };

  const lang = LOCALE_NAME[ctx.locale] ?? 'italiano';
  try {
    const msg = await anthropic().messages.create({
      model: config.ai.extractionModel,
      max_tokens: 400,
      system:
        `Sei l'assistente di un gestionale di cantiere. Riassumi lo STATO di una commessa in ${lang}, ` +
        `in 3-5 frasi chiare e concrete per un titolare/tecnico. Solo testo semplice (niente markdown, niente elenchi puntati). ` +
        `USA SOLO i dati forniti: non inventare numeri, date o attività. Tono professionale e sintetico.`,
      messages: [{ role: 'user', content: `Dati della commessa (JSON):\n${JSON.stringify(d)}` }],
    });
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    return { available: true, text: text || fallback };
  } catch {
    // qualunque errore AI → degrada al riassunto deterministico (il demo non si rompe mai)
    return { available: false, text: fallback };
  }
}
