/** Piano e fatturazione (sola lettura). Mostra l'abbonamento corrente del
 *  tenant, la quota AI consumata nel mese e il catalogo piani. L'upgrade reale
 *  passa dal provider di pagamento (fuori da qui): pagina informativa. */
import { CreditCard, Check, Sparkles, Users } from 'lucide-react';
import type { BillingInfoDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../../components/Page';
import { StatusPill } from '../../components/StatusPill';
import { useApi } from '../../api/hooks';

const STATUS: Record<string, { label: string; token: string }> = {
  trial: { label: 'In prova', token: 'info' },
  active: { label: 'Attivo', token: 'success' },
  past_due: { label: 'Scaduto', token: 'warning' },
  suspended: { label: 'Sospeso', token: 'danger' },
  cancelled: { label: 'Annullato', token: 'neutral' },
  expired: { label: 'Scaduto', token: 'danger' },
};

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('it-IT') : '—');

export function BillingPage() {
  const { data, loading, error } = useApi<BillingInfoDto>('/billing');
  const sub = data?.subscription;
  const ent = (sub?.entitlements ?? {}) as Record<string, unknown>;
  const aiLimit = num(ent.ai_quota_month);
  const aiUsed = data?.usage.aiThisMonth ?? 0;
  const aiPct = aiLimit ? Math.min(100, Math.round((aiUsed / aiLimit) * 100)) : 0;

  return (
    <Page title="Piano">
      <div className="page-head">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}><CreditCard size={24} /> Piano e fatturazione</h1>
          <div className="sub">Abbonamento del tenant, consumo AI del mese e piani disponibili.</div>
        </div>
      </div>

      {loading && <Loading />}
      {error && <ErrorBox message={error} />}

      {data && (
        <>
          {sub && (
            <div className="card" style={{ padding: 20, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div className="pn" style={{ fontSize: 20 }}>{sub.planName}</div>
                <StatusPill label={(STATUS[sub.status] ?? STATUS.trial)!.label} token={(STATUS[sub.status] ?? STATUS.trial)!.token} />
              </div>
              <div className="kv" style={{ marginTop: 14 }}>
                {sub.trialEndsAt && <div><div className="k">Prova fino al</div><div className="v">{fmtDate(sub.trialEndsAt)}</div></div>}
                {sub.currentPeriodEnd && <div><div className="k">Rinnovo / scadenza</div><div className="v">{fmtDate(sub.currentPeriodEnd)}</div></div>}
                {num(ent.max_users) != null && <div><div className="k">Utenti inclusi</div><div className="v">{num(ent.max_users)}</div></div>}
              </div>

              <div className="quota" style={{ marginTop: 18 }}>
                <div className="qh">
                  <b style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Sparkles size={15} /> Estrazioni AI questo mese</b>
                  <span className="mono">{aiUsed}{aiLimit ? ` / ${aiLimit}` : ''}</span>
                </div>
                <div className="qbar"><span style={{ width: `${aiPct}%`, background: aiPct >= 90 ? 'var(--danger)' : 'var(--brand)' }} /></div>
                {!aiLimit && <div className="faint" style={{ fontSize: 12, marginTop: 6, color: 'var(--ink-faint)' }}>Nessun limite definito sul piano.</div>}
              </div>
            </div>
          )}

          <div className="eyebrow" style={{ margin: '4px 2px 12px' }}>Piani disponibili</div>
          <div className="plans">
            {data.plans.map((p) => {
              const e = p.entitlements as Record<string, unknown>;
              const current = sub?.planCode === p.code;
              return (
                <div key={p.id} className={`plan-card${current ? ' current' : ''}`}>
                  {current && <span className="badge-now">Attuale</span>}
                  <div className="pn">{p.name}</div>
                  <div className="pp">{p.priceMonth != null ? `€${p.priceMonth}` : '—'}<small> /mese</small></div>
                  <ul>
                    {num(e.max_users) != null && <li><Users size={15} /> {num(e.max_users)} utenti</li>}
                    {num(e.ai_quota_month) != null && <li><Sparkles size={15} /> {num(e.ai_quota_month)} estrazioni AI/mese</li>}
                    {Array.isArray(e.features) && (e.features as string[]).map((f) => (
                      <li key={f}><Check size={15} /> {f}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <p className="faint" style={{ fontSize: 13, marginTop: 16, color: 'var(--ink-faint)' }}>
            Il cambio piano e i pagamenti passano dal provider di fatturazione (fuori dall'app). Questa pagina è informativa.
          </p>
        </>
      )}
    </Page>
  );
}
