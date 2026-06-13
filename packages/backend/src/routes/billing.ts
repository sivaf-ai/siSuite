/** billing.ts — piano e abbonamento del tenant (sola lettura, billing:read).
 *  Gli entitlement EFFETTIVI = plan.entitlements + subscription.entitlement_overrides.
 *  Il gating è separato dall'RBAC (piano vs ruolo); qui solo lettura informativa.
 *  La quota AI consumata = numero di capture del mese corrente (tenant-scoped). */
import type { FastifyInstance } from 'fastify';
import type { BillingInfoDto, PlanDto, SubscriptionDto } from '@sisuite/shared';
import { requirePermission } from '../context/authenticate.js';
import { withRls } from '../context/rls.js';

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/billing', { preHandler: [app.authenticate, requirePermission('billing:read')] }, async (request) => {
    return withRls(request.ctx, async (db): Promise<BillingInfoDto> => {
      const sub = await db.query(
        `SELECT s.status, s.trial_ends_at, s.current_period_end, s.cancel_at,
                s.entitlement_overrides, p.code AS plan_code, p.name AS plan_name, p.entitlements AS plan_entitlements
         FROM subscription s JOIN plan p ON p.id = s.plan_id
         WHERE s.tenant_id = $1 ORDER BY s.created_at DESC LIMIT 1`,
        [request.ctx.tenantId],
      );
      const plansRes = await db.query(
        `SELECT id, code, name, billing_model, price_month, currency, entitlements, active
         FROM plan WHERE active ORDER BY price_month NULLS FIRST`,
      );
      const usageRes = await db.query(
        `SELECT count(*)::int AS n FROM capture WHERE date_trunc('month', created_at) = date_trunc('month', now())`,
      );

      const subscription: SubscriptionDto | null = sub.rows.length
        ? {
          status: sub.rows[0].status as string,
          trialEndsAt: (sub.rows[0].trial_ends_at as string) ?? null,
          currentPeriodEnd: (sub.rows[0].current_period_end as string) ?? null,
          cancelAt: (sub.rows[0].cancel_at as string) ?? null,
          planCode: sub.rows[0].plan_code as string,
          planName: sub.rows[0].plan_name as string,
          entitlements: {
            ...((sub.rows[0].plan_entitlements as Record<string, unknown>) ?? {}),
            ...((sub.rows[0].entitlement_overrides as Record<string, unknown>) ?? {}),
          },
        }
        : null;

      const plans: PlanDto[] = plansRes.rows.map((r) => ({
        id: r.id as string,
        code: r.code as string,
        name: r.name as string,
        billingModel: r.billing_model as string,
        priceMonth: r.price_month != null ? Number(r.price_month) : null,
        currency: r.currency as string,
        entitlements: (r.entitlements as Record<string, unknown>) ?? {},
        active: r.active as boolean,
      }));

      return { subscription, plans, usage: { aiThisMonth: usageRes.rows[0].n as number } };
    });
  });
}
