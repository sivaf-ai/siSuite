/** settings.ts — impostazioni dell'organizzazione (tenant). Oggi: orari di lavoro
 *  (alimentano il motore di pianificazione). Lettura a tutti gli autenticati;
 *  scrittura solo settings:manage. RLS: il tenant vede/modifica solo se stesso. */
import type { FastifyInstance } from 'fastify';
import { updateWorkingHoursSchema, updateTerminologySchema, type TenantSettingsDto, type TermOverrideDto } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/settings', { preHandler: [app.authenticate] }, async (request) => {
    return withRls(request.ctx, async (db): Promise<TenantSettingsDto> => {
      const r = await db.query(`SELECT name, vertical, default_locale, timezone, working_hours FROM tenant WHERE id = $1`, [request.ctx.tenantId]);
      const t = r.rows[0] ?? {};
      return {
        name: t.name ?? '', vertical: t.vertical ?? '', defaultLocale: t.default_locale ?? 'it-IT',
        timezone: t.timezone ?? 'Europe/Rome', workingHours: (t.working_hours as Record<string, [string, string][]>) ?? {},
      };
    });
  });

  app.patch('/settings/working-hours', { preHandler: [app.authenticate, requirePermission('settings:manage')] },
    async (request) => {
      const input = updateWorkingHoursSchema.parse(request.body);
      return withRls(request.ctx, async (db) => {
        await db.query(`UPDATE tenant SET working_hours = $2 WHERE id = $1`, [request.ctx.tenantId, JSON.stringify(input.workingHours)]);
        return { ok: true };
      });
    });

  // ── Terminologia di dominio per-tenant (glossario, parte 8 §1) ──────
  // Override del tenant per la lingua data; i default stanno nei file i18n (namespace terms).
  app.get<{ Querystring: { locale?: string } }>('/settings/terminology',
    { preHandler: [app.authenticate] },
    async (request) => {
      const locale = request.query.locale ?? 'it-IT';
      return withRls(request.ctx, async (db): Promise<{ items: TermOverrideDto[] }> => {
        const r = await db.query(
          `SELECT term_key, value_singular, value_plural FROM term_override WHERE locale = $1 ORDER BY term_key`, [locale]);
        return { items: r.rows.map((x) => ({ termKey: x.term_key, valueSingular: x.value_singular, valuePlural: x.value_plural ?? null })) };
      });
    });

  app.put('/settings/terminology', { preHandler: [app.authenticate, requirePermission('settings:manage')] },
    async (request) => {
      const input = updateTerminologySchema.parse(request.body);
      return withRls(request.ctx, async (db) => {
        for (const t of input.terms) {
          const sing = t.valueSingular.trim();
          if (!sing) {
            // valore vuoto = torna al default di sistema: rimuovi l'override
            await db.query(`DELETE FROM term_override WHERE tenant_id = $1 AND locale = $2 AND term_key = $3`,
              [request.ctx.tenantId, input.locale, t.termKey]);
            continue;
          }
          await db.query(
            `INSERT INTO term_override (tenant_id, locale, term_key, value_singular, value_plural)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (tenant_id, locale, term_key)
             DO UPDATE SET value_singular = EXCLUDED.value_singular, value_plural = EXCLUDED.value_plural, updated_at = now()`,
            [request.ctx.tenantId, input.locale, t.termKey, sing, t.valuePlural?.trim() || null]);
        }
        return { ok: true };
      });
    });
}
