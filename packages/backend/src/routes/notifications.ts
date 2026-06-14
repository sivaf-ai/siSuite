/** notifications.ts — feed notifiche DERIVATO (no tabella): scadenze a rischio
 *  e catture da rivedere, sotto RLS (ognuno vede ciò a cui ha accesso). v1 live:
 *  nessuno stato "letto" persistito (enhancement futuro: tabella + read-state). */
import type { FastifyInstance } from 'fastify';
import { withRls } from '../context/rls.js';

export interface NotificationDto {
  id: string; kind: 'deadline' | 'capture'; severity: 'danger' | 'warning' | 'info';
  title: string; detail: string; at: string | null; link: string;
}

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/notifications', { preHandler: [app.authenticate] }, async (request) => {
    return withRls(request.ctx, async (db): Promise<{ items: NotificationDto[]; count: number }> => {
      const items: NotificationDto[] = [];

      // scadenze entro 3 giorni (o già scadute), attività non concluse
      const dl = await db.query(
        `SELECT a.id, a.title, a.due_by, a.engagement_id, e.title AS eng_title
         FROM activity a JOIN lookup_value s ON s.id = a.status_id
         LEFT JOIN engagement e ON e.id = a.engagement_id
         WHERE a.due_by IS NOT NULL AND a.due_by < now() + interval '3 days'
           AND s.canonical NOT IN ('done','cancelled')
         ORDER BY a.due_by LIMIT 25`);
      for (const r of dl.rows) {
        const due = new Date(r.due_by as string);
        const overdue = due.getTime() < Date.now();
        items.push({
          id: `dl_${r.id}`, kind: 'deadline', severity: overdue ? 'danger' : 'warning',
          title: overdue ? `Scaduta: ${r.title}` : `In scadenza: ${r.title}`,
          detail: `${r.eng_title ?? 'Commessa'} · ${due.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}`,
          at: due.toISOString(), link: `/activities/${r.id}`,
        });
      }

      // catture da rivedere
      const cap = await db.query(
        `SELECT id, raw_text, created_at FROM capture WHERE status IN ('pending','proposed') ORDER BY created_at DESC LIMIT 25`);
      for (const r of cap.rows) {
        const raw = ((r.raw_text as string) ?? '').slice(0, 80);
        items.push({
          id: `cap_${r.id}`, kind: 'capture', severity: 'info',
          title: 'Cattura da rivedere', detail: raw || 'Nuova cattura', at: new Date(r.created_at as string).toISOString(), link: '/captures',
        });
      }

      // ordina: danger → warning → info, poi per data
      const rank = { danger: 0, warning: 1, info: 2 } as const;
      items.sort((a, b) => rank[a.severity] - rank[b.severity] || (b.at ?? '').localeCompare(a.at ?? ''));
      return { items, count: items.length };
    });
  });
}
