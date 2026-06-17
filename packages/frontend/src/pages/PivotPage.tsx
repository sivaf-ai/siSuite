/**
 * PivotPage — Preventivo–consuntivo (mock 47, Blocco G). Albero Commessa › Fase/WBS ›
 * Voce (cost_type) con sottototali e barre margine, dalla vista job_cost_ledger.
 * KPI ricavi/costi/margine/%. Export Excel (CSV UTF-8) incluso; "Esporta per CPM" add-on.
 */
import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, Download, FileOutput, Scale } from 'lucide-react';
import { Page, Loading, ErrorBox } from '../components/Page';
import { Money } from '../ui/Num';
import { TotalsStrip } from '../ui/DocumentArchetype';
import { downloadXlsx } from '../lib/xlsx';
import { useApi } from '../api/hooks';
import { useToast } from '../ui/Toast';
import { swatchColor } from '../theme/palette';

interface Leaf { costType: string; label: string; colorToken: string | null; quantity: number; cost: number; revenue: number; margin: number }
interface PhaseNode { phaseId: string | null; name: string; wbsCode: string | null; lines: Leaf[]; cost: number; revenue: number; margin: number }
interface EngNode { engagementId: string; code: string; title: string; company: string | null; phases: PhaseNode[]; cost: number; revenue: number; margin: number }
interface PivotResp { tree: EngNode[]; kpi: { cost: number; revenue: number; margin: number; marginPct: number | null }; costTypes: { canonical: string; label: string; color: string | null }[] }

const pct = (margin: number, revenue: number) => (revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : null);

/** barretta margine (verde/rosso) proporzionale al ricavo. */
function MarginBar({ margin, revenue }: { margin: number; revenue: number }) {
  const p = pct(margin, revenue);
  const w = Math.min(Math.abs(p ?? 0), 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
      <div style={{ flex: 1, height: 8, background: 'var(--line-2)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${w}%`, height: '100%', background: (p ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }} />
      </div>
      <span className="mono" style={{ fontSize: 12, color: (p ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)', minWidth: 44, textAlign: 'right' }}>{p != null ? `${p}%` : '—'}</span>
    </div>
  );
}

export function PivotPage() {
  const toast = useToast();
  const { data, loading, error } = useApi<PivotResp>('/finance/pivot');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const rows = useMemo(() => {
    const out: JSX.Element[] = [];
    for (const e of data?.tree ?? []) {
      const ek = `e_${e.engagementId}`;
      const eOpen = open.has(ek);
      out.push(
        <tr key={ek} className="pivrow lvl0" style={{ cursor: 'pointer', fontWeight: 700 }} onClick={() => toggle(ek)}>
          <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{eOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{e.code} · {e.title}</span></td>
          <td className="num"><Money value={e.revenue} /></td>
          <td className="num"><Money value={e.cost} /></td>
          <td className="num"><Money value={e.margin} /></td>
          <td><MarginBar margin={e.margin} revenue={e.revenue} /></td>
        </tr>,
      );
      if (!eOpen) continue;
      for (const p of e.phases) {
        const pk = `${ek}_p_${p.phaseId ?? 'none'}`;
        const pOpen = open.has(pk);
        out.push(
          <tr key={pk} className="pivrow lvl1" style={{ cursor: 'pointer' }} onClick={() => toggle(pk)}>
            <td style={{ paddingLeft: 28 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{pOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{p.wbsCode ? `${p.wbsCode} · ` : ''}{p.name}</span></td>
            <td className="num"><Money value={p.revenue} /></td>
            <td className="num"><Money value={p.cost} /></td>
            <td className="num"><Money value={p.margin} /></td>
            <td><MarginBar margin={p.margin} revenue={p.revenue} /></td>
          </tr>,
        );
        if (!pOpen) continue;
        for (const l of p.lines) {
          out.push(
            <tr key={`${pk}_l_${l.costType}`} className="pivrow lvl2">
              <td style={{ paddingLeft: 52 }}><span className="chip" style={{ background: swatchColor(l.colorToken), color: '#fff' }}>{l.label}</span></td>
              <td className="num"><Money value={l.revenue} /></td>
              <td className="num"><Money value={l.cost} /></td>
              <td className="num"><Money value={l.margin} /></td>
              <td><MarginBar margin={l.margin} revenue={l.revenue} /></td>
            </tr>,
          );
        }
      }
    }
    return out;
  }, [data, open]);

  async function exportXlsx() {
    if (!data) return;
    const rows: Record<string, unknown>[] = [];
    for (const e of data.tree) {
      for (const p of e.phases) {
        for (const l of p.lines) {
          rows.push({
            commessa: `${e.code} ${e.title}`, fase: `${p.wbsCode ?? ''} ${p.name}`.trim(), voce: l.label,
            quantita: l.quantity, ricavi: l.revenue, costi: l.cost, margine: l.margin, marginePct: pct(l.margin, l.revenue) ?? '',
          });
        }
      }
    }
    await downloadXlsx('preventivo-consuntivo', [{
      name: 'Preventivo-consuntivo',
      columns: [
        { header: 'Commessa', key: 'commessa', width: 30 }, { header: 'Fase/WBS', key: 'fase', width: 28 },
        { header: 'Voce', key: 'voce', width: 16 }, { header: 'Quantità', key: 'quantita', width: 12 },
        { header: 'Ricavi', key: 'ricavi', width: 14 }, { header: 'Costi', key: 'costi', width: 14 },
        { header: 'Margine', key: 'margine', width: 14 }, { header: 'Margine %', key: 'marginePct', width: 12 },
      ],
      rows,
    }]);
    toast('Esportato in Excel (.xlsx)');
  }

  if (loading) return <Page title="Preventivo–consuntivo"><Loading /></Page>;
  if (error) return <Page title="Preventivo–consuntivo"><ErrorBox message={error} /></Page>;

  return (
    <Page title="Preventivo–consuntivo">
      <div className="dsx">
        <div className="lh"><h1><Scale size={20} style={{ verticalAlign: '-4px', marginRight: 8 }} />Preventivo–consuntivo</h1><span className="sub">Costi e ricavi per commessa, fase e voce — da job_cost_ledger</span></div>

        <TotalsStrip cost={data?.kpi.cost ?? 0} revenue={data?.kpi.revenue ?? 0} margin={data?.kpi.margin ?? 0} marginPct={data?.kpi.marginPct ?? null} />

        <div className="dsx-toolbar">
          <div className="spacer" />
          <button className="tib" data-tip="Esporta Excel (.xlsx)" onClick={() => void exportXlsx()}><Download /></button>
          <button className="tib" data-tip="Esporta per CPM (add-on, presto)" disabled><FileOutput /></button>
        </div>

        <div className="card">
          <table className="t pivot">
            <thead><tr>
              <th>Commessa › Fase › Voce</th><th className="num">Ricavi</th><th className="num">Costi</th><th className="num">Margine</th><th>Margine %</th>
            </tr></thead>
            <tbody>
              {rows}
              {(data?.tree.length ?? 0) === 0 && <tr><td colSpan={5}><div className="dsx-empty">Nessun dato di costo/ricavo.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Page>
  );
}
