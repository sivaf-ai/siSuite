/** settings.ts — impostazioni dell'organizzazione (tenant). Oggi: orari di lavoro
 *  (alimentano il motore di pianificazione). Lettura a tutti gli autenticati;
 *  scrittura solo settings:manage. RLS: il tenant vede/modifica solo se stesso. */
import type { FastifyInstance } from 'fastify';
import { updateWorkingHoursSchema, type TenantSettingsDto } from '@sisuite/shared';
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
}
