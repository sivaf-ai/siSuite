/**
 * BudgetPanel — BUDGET / MARGINE (§7). Rollup di una commessa:
 * previsto vs fatto (costo/ricavo), margine, rimane, allarme >85%, breakdown
 * per fase. Interruttore Costo / Ricavo / Margine per la lettura delle barre.
 */
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { EngagementBudgetDto } from '@sisuite/shared';
import { useApi } from '../api/hooks';
import { Loading, ErrorBox } from './Page';

type Metric = 'cost' | 'revenue' | 'margin';
const METRICS: { key: Metric; label: string }[] = [
  { key: 'cost', label: 'Costo' }, { key: 'revenue', label: 'Ricavo' }, { key: 'margin', label: 'Margine' },
];

function money(v: number | null, currency: string | null): string {
  if (v == null) return '—';
  try { return new Intl.NumberFormat('it-IT', { style: 'currency', currency: currency || 'EUR' }).format(v); }
  catch { return `€ ${v.toFixed(2)}`; }
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' | 'warn' }) {
  const color = tone === 'good' ? 'var(--c-success, #1e8e4e)' : tone === 'bad' ? 'var(--c-danger, #c0392b)' : tone === 'warn' ? 'var(--c-warning, #c77700)' : 'var(--ink)';
  return (
    <div style={{ flex: '1 1 140px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px' }}>
      <div className="cellsub" style={{ marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

export function BudgetPanel({ engagementId }: { engagementId: string }) {
  const { data, loading, error } = useApi<EngagementBudgetDto>(`/engagements/${engagementId}/budget`);
  const [metric, setMetric] = useState<Metric>('cost');
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;
  const cur = data.currency;

  const pct = data.previsto && data.previsto > 0 ? Math.min(100, Math.round((data.costoFatto / data.previsto) * 100)) : null;
  const phaseVal = (p: { costoFatto: number; ricavoFatto: number }) =>
    metric === 'cost' ? p.costoFatto : metric === 'revenue' ? p.ricavoFatto : p.ricavoFatto - p.costoFatto;
  const maxPhase = Math.max(1, ...data.phases.map((p) => Math.abs(phaseVal(p))));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* riepilogo */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Stat label={`Previsto${data.previstoSource === 'stima' ? ' (stima)' : ''}`} value={money(data.previsto, cur)} />
        <Stat label="Costo a oggi" value={money(data.costoFatto, cur)} />
        <Stat label="Ricavo a oggi" value={money(data.ricavoFatto, cur)} />
        <Stat label="Margine" value={money(data.margine, cur)} tone={data.margine >= 0 ? 'good' : 'bad'} />
        <Stat label="Rimane" value={money(data.rimane, cur)} tone={data.allarme ? 'warn' : undefined} />
      </div>

      {/* barra avanzamento costo vs previsto */}
      {pct != null && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="cellsub">Costo / previsto</span>
            <span className="mono" style={{ fontWeight: 700, color: data.allarme ? 'var(--c-danger, #c0392b)' : 'var(--ink)' }}>
              {pct}% {data.allarme && <AlertTriangle size={14} style={{ verticalAlign: 'middle' }} />}
            </span>
          </div>
          <div style={{ height: 10, borderRadius: 6, background: 'var(--neutral-wash)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: data.allarme ? 'var(--c-danger, #c0392b)' : 'var(--c-success, #1e8e4e)' }} />
          </div>
        </div>
      )}

      {/* breakdown per fase */}
      <div>
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <strong>Per fase</strong>
          <span style={{ flex: 1 }} />
          <div className="seg">
            {METRICS.map((m) => <button key={m.key} className={metric === m.key ? 'on' : ''} onClick={() => setMetric(m.key)}>{m.label}</button>)}
          </div>
        </div>
        {data.phases.length === 0
          ? <div className="cellsub">Nessuna ora registrata per fase.</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.phases.map((p, i) => {
                const v = phaseVal(p);
                const w = Math.round((Math.abs(v) / maxPhase) * 100);
                return (
                  <div key={p.phaseId ?? `np_${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 180, minWidth: 120 }} className="cellname">{p.name ?? 'Senza fase'}</div>
                    <div style={{ flex: 1, height: 8, borderRadius: 5, background: 'var(--neutral-wash)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${w}%`, background: v < 0 ? 'var(--c-danger, #c0392b)' : 'var(--c-info, #2d7ef7)' }} />
                    </div>
                    <div className="mono" style={{ width: 110, textAlign: 'right' }}>{money(v, cur)}</div>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}
