/** dashboard.ts — KPI sintetici + liste per la home (mock 05). Rispettano RLS. */
import type { FastifyInstance } from 'fastify';
import { withRls } from '../context/rls.js';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/dashboard', { preHandler: [app.authenticate] }, async (request) => {
    return withRls(request.ctx, async (db) => {
      const n = async (sql: string) => Number((await db.query(sql)).rows[0]?.n ?? 0);

      const commesseAttive = await n(
        `SELECT count(*) n FROM engagement e JOIN lookup_value s ON s.id = e.status_id
         WHERE e.archived_at IS NULL AND s.canonical NOT IN ('closed','cancelled')`);
      const oreSettimana = await n(
        `SELECT COALESCE(sum(minutes),0) n FROM time_entry WHERE occurred_on >= date_trunc('week', current_date)`);
      const cattureDaRivedere = await n(
        `SELECT count(*) n FROM capture WHERE status IN ('pending','proposed')`);
      const scadenzeARischio = await n(
        `SELECT count(*) n FROM activity a JOIN lookup_value s ON s.id = a.status_id
         WHERE a.due_by IS NOT NULL AND a.due_by < now() + interval '3 days' AND s.canonical NOT IN ('done','cancelled')`);

      const attivitaOggi = (await db.query(
        `SELECT a.id, a.title, a.scheduled_start, a.status_id, s.canonical AS status_canonical, e.title AS engagement_title
         FROM activity a JOIN lookup_value s ON s.id = a.status_id
         LEFT JOIN engagement e ON e.id = a.engagement_id
         WHERE (a.scheduled_start::date = current_date)
            OR (a.scheduled_start IS NULL AND s.canonical NOT IN ('done','cancelled'))
         ORDER BY a.scheduled_start NULLS LAST, a.created_at LIMIT 8`)).rows.map((r) => ({
        id: r.id as string, title: r.title as string,
        scheduledStart: (r.scheduled_start as string) ?? null,
        statusId: r.status_id as string, statusCanonical: (r.status_canonical as string) ?? null,
        engagementTitle: (r.engagement_title as string) ?? null,
      }));

      const cattureRecenti = (await db.query(
        `SELECT id, raw_text, status, created_at FROM capture ORDER BY created_at DESC LIMIT 5`)).rows.map((r) => ({
        id: r.id as string, rawText: (r.raw_text as string) ?? '', status: r.status as string, createdAt: r.created_at as string,
      }));

      const totaleAttivitaOggi = await n(
        `SELECT count(*) n FROM activity a JOIN lookup_value s ON s.id = a.status_id
         WHERE (a.scheduled_start::date = current_date) OR (a.scheduled_start IS NULL AND s.canonical NOT IN ('done','cancelled'))`);

      // ── dati per i GRAFICI (parte 8 §4.1) ──
      // ore per giorno della settimana corrente (lun..dom)
      const orePerGiorno = (await db.query(
        `WITH giorni AS (
           SELECT generate_series(date_trunc('week', current_date), date_trunc('week', current_date) + interval '6 days', interval '1 day')::date AS d)
         SELECT g.d, COALESCE(sum(t.minutes),0)::int AS minuti
         FROM giorni g LEFT JOIN time_entry t ON t.occurred_on = g.d
         GROUP BY g.d ORDER BY g.d`)).rows.map((r) => ({
        date: (r.d as Date).toISOString().slice(0, 10), minutes: r.minuti as number,
      }));

      // commesse per stato (non chiuse/annullate escluse? no: tutte le attive+altre)
      const commessePerStato = (await db.query(
        `SELECT s.canonical, s.label, s.color_token, count(*)::int AS n
         FROM engagement e JOIN lookup_value s ON s.id = e.status_id
         WHERE e.archived_at IS NULL
         GROUP BY s.canonical, s.label, s.color_token, s.sequence ORDER BY s.sequence`)).rows.map((r) => ({
        canonical: r.canonical as string,
        label: (r.label as Record<string, string>)?.['it-IT'] ?? (r.canonical as string),
        colorToken: (r.color_token as string) ?? 'neutral', count: r.n as number,
      }));

      // avanzamento commesse attive: % attività done su totale
      const avanzamentoCommesse = (await db.query(
        `SELECT e.id, e.title,
                count(a.*)::int AS tot,
                count(a.*) FILTER (WHERE s.canonical = 'done')::int AS fatte
         FROM engagement e
         JOIN lookup_value es ON es.id = e.status_id AND es.canonical NOT IN ('closed','cancelled')
         LEFT JOIN activity a ON a.engagement_id = e.id
         LEFT JOIN lookup_value s ON s.id = a.status_id
         WHERE e.archived_at IS NULL
         GROUP BY e.id, e.title ORDER BY e.created_at DESC LIMIT 6`)).rows.map((r) => ({
        id: r.id as string, title: r.title as string, total: r.tot as number, done: r.fatte as number,
        pct: (r.tot as number) > 0 ? Math.round(((r.fatte as number) / (r.tot as number)) * 100) : 0,
      }));

      return {
        commesseAttive, oreSettimana, cattureDaRivedere, scadenzeARischio,
        attivitaOggi, cattureRecenti, totaleAttivitaOggi,
        orePerGiorno, commessePerStato, avanzamentoCommesse,
      };
    });
  });
}
