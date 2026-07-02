/**
 * StockInquiryPage — Consultazione giacenze (WMS Fase C). Tre viste:
 *   • Per articolo   : dove si trova un articolo (tutte le ubicazioni), totale, valore, riordino.
 *   • Per ubicazione : cosa contiene un magazzino/ubicazione (drill-down del sotto-albero).
 *   • Riordino       : articoli sotto la scorta minima, con deficit da riordinare.
 * Riusa gli endpoint esistenti (/stock/balance con subtreeOf/materialId, /materials).
 */
import { Fragment, useMemo, useState } from 'react';
import { useHistory } from 'react-router';
import { Search, Package, MapPin, AlertTriangle, ChevronRight, ChevronDown } from 'lucide-react';
import type { StockBalanceDto, ReorderReportDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { PickerField } from '../ui/PickerField';
import { useApi } from '../api/hooks';
import { LocationTreePickerDialog } from './MagazzinoPage';

type Mode = 'material' | 'location' | 'reorder';
const eur = (n: number | null | undefined) => n == null ? '—' : `€ ${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qn = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString('it-IT');

export function StockInquiryPage() {
  const [mode, setMode] = useState<Mode>('material');
  return (
    <Page title="Consultazione giacenze" bleed>
      <div className="dsx" style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {([['material', 'Per articolo', Package], ['location', 'Per ubicazione', MapPin], ['reorder', 'Riordino', AlertTriangle]] as const).map(([m, lbl, I]) => (
            <button key={m} className={`btn btn-sm ${mode === m ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode(m)}>
              <I size={15} /> {lbl}
            </button>
          ))}
        </div>
        {mode === 'material' && <ByMaterial />}
        {mode === 'location' && <ByLocation />}
        {mode === 'reorder' && <Reorder />}
      </div>
    </Page>
  );
}

/* ── Per articolo: raggruppa le giacenze per articolo, espandibili per ubicazione ── */
function ByMaterial() {
  const { data, loading, error } = useApi<{ items: StockBalanceDto[] }>('/stock/balance');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; sku: string | null; unit: string | null; total: number; value: number; low: boolean; rows: StockBalanceDto[] }>();
    for (const r of data?.items ?? []) {
      let g = m.get(r.materialId);
      if (!g) { g = { name: r.materialName ?? '—', sku: r.sku ?? null, unit: r.unit ?? null, total: 0, value: 0, low: !!r.lowStock, rows: [] }; m.set(r.materialId, g); }
      g.total += r.qtyOnHand; g.value += r.valueOnHand; g.rows.push(r);
    }
    return [...m.entries()].map(([id, g]) => ({ id, ...g })).sort((a, b) => a.name.localeCompare(b.name, 'it'));
  }, [data]);
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  const ql = q.trim().toLowerCase();
  const shown = groups.filter((g) => !ql || g.name.toLowerCase().includes(ql) || (g.sku ?? '').toLowerCase().includes(ql) || g.rows.some((r) => (r.locationPath ?? '').toLowerCase().includes(ql)));
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
        <div style={{ position: 'relative', flex: '0 1 320px' }}>
          <Search size={15} style={{ position: 'absolute', left: 9, top: 10, color: 'var(--ink-faint)' }} />
          <input className="txt" style={{ paddingLeft: 30 }} placeholder="Cerca articolo / SKU / ubicazione…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink-faint)' }}>{shown.length} articoli</span>
      </div>
      <table className="subt">
        <thead><tr><th style={{ width: 28 }} /><th>Articolo</th><th className="num">Giacenza totale</th><th className="num">Ubicazioni</th><th className="num">Valore</th></tr></thead>
        <tbody>
          {shown.map((g) => (
            <Fragment key={g.id}>
              <tr style={{ cursor: 'pointer' }} onClick={() => toggle(g.id)}>
                <td>{open.has(g.id) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                <td className="cellname">{g.name}{g.sku ? <span className="muted mono" style={{ fontSize: 11 }}> · {g.sku}</span> : null}
                  {g.low && <span className="et-badge" style={{ marginLeft: 6, background: 'var(--danger)', color: '#fff' }}>riordino</span>}</td>
                <td className="num mono" style={g.total <= 0 ? { color: 'var(--danger)', fontWeight: 700 } : { fontWeight: 700 }}>{qn(g.total)} {g.unit ?? ''}</td>
                <td className="num mono">{g.rows.length}</td>
                <td className="num mono">{eur(g.value)}</td>
              </tr>
              {open.has(g.id) && g.rows.slice().sort((a, b) => (a.locationPath ?? '').localeCompare(b.locationPath ?? '', 'it')).map((r, ri) => (
                <tr key={`${g.id}_${r.locationId}_${ri}`} style={{ background: 'var(--paper)' }}>
                  <td />
                  <td className="cellsub" style={{ paddingLeft: 18 }}><MapPin size={12} style={{ marginRight: 5, color: 'var(--ink-faint)' }} />{r.locationPath ?? r.locationName ?? '—'}</td>
                  <td className="num mono">{qn(r.qtyOnHand)} {r.unit ?? ''}</td>
                  <td />
                  <td className="num mono">{eur(r.valueOnHand)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
          {shown.length === 0 && <tr><td colSpan={5}><div className="dsx-empty">Nessuna giacenza {ql ? 'con questa ricerca' : ''}.</div></td></tr>}
        </tbody>
      </table>
    </>
  );
}

/* ── Per ubicazione: cosa contiene un magazzino/ubicazione (sotto-albero) ── */
function ByLocation() {
  const [loc, setLoc] = useState<{ id: string; name: string } | null>(null);
  const [pick, setPick] = useState(false);
  const { data, loading } = useApi<{ items: StockBalanceDto[] }>(loc ? `/stock/balance?subtreeOf=${loc.id}` : null);
  const rows = (data?.items ?? []).slice().sort((a, b) => (a.locationPath ?? '').localeCompare(b.locationPath ?? '', 'it') || (a.materialName ?? '').localeCompare(b.materialName ?? '', 'it'));
  const totVal = rows.reduce((s, r) => s + r.valueOnHand, 0);
  return (
    <>
      <div style={{ maxWidth: 480, marginBottom: 10 }}>
        <div className="bf"><span className="bl">Magazzino / ubicazione</span>
          <PickerField value={loc?.name ?? null} placeholder="Scegli dove guardare…" onOpen={() => setPick(true)} onClear={() => setLoc(null)} /></div>
      </div>
      {!loc ? <div className="dsx-empty" style={{ padding: 20 }}>Scegli un magazzino o un'ubicazione per vedere cosa contiene (incluse le sotto-ubicazioni).</div>
        : loading ? <Loading />
          : <>
            <div style={{ display: 'flex', marginBottom: 6 }}><span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink-faint)' }}>{rows.length} righe · valore {eur(totVal)}</span></div>
            <table className="subt">
              <thead><tr><th>Ubicazione</th><th>Articolo</th><th className="num">Giacenza</th><th className="num">Costo medio</th><th className="num">Valore</th></tr></thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={`${r.locationId}_${r.materialId}_${ri}`}>
                    <td className="cellsub" title={r.locationPath ?? ''}>{r.locationPath ?? r.locationName ?? '—'}</td>
                    <td className="cellname">{r.materialName ?? '—'}{r.sku ? <span className="muted mono" style={{ fontSize: 11 }}> · {r.sku}</span> : null}</td>
                    <td className="num mono" style={r.qtyOnHand <= 0 ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>{qn(r.qtyOnHand)} {r.unit ?? ''}</td>
                    <td className="num mono">{eur(r.avgCost)}</td>
                    <td className="num mono">{eur(r.valueOnHand)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={5}><div className="dsx-empty">Nessuna giacenza in questa ubicazione.</div></td></tr>}
              </tbody>
            </table>
          </>}
      <LocationTreePickerDialog open={pick} onClose={() => setPick(false)} onPick={(l) => { setLoc(l); setPick(false); }} />
    </>
  );
}

/* ── Riordino: report SERVER-SIDE (sotto scorta, deficit, qtà suggerita) ── */
function Reorder() {
  const [limit, setLimit] = useState(100);
  const { data, loading, error } = useApi<ReorderReportDto>(`/stock/reorder?limit=${limit}`);
  const history = useHistory();
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 2px 8px', flexWrap: 'wrap' }}>
        <p className="faint" style={{ fontSize: 12.5, color: 'var(--ink-faint)', margin: 0, flex: 1 }}>
          Articoli con giacenza totale sotto il <b>punto di riordino</b>, ordinati per <b>gravità</b> (deficit). «Da ordinare» è la quantità suggerita per riportarsi al livello obiettivo (max / scorta di sicurezza).
        </p>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: total ? 'var(--danger)' : 'var(--ink-faint)' }}>{total} sotto scorta</span>
      </div>
      <table className="subt">
        <thead><tr><th>Articolo</th><th>Fornitore abituale</th><th className="num">Giacenza</th><th className="num">Riordino</th><th className="num">Deficit</th><th className="num">Da ordinare</th></tr></thead>
        <tbody>
          {items.map((m) => (
            <tr key={m.materialId} style={{ cursor: 'pointer' }} onClick={() => history.push(`/materials/${m.materialId}`)}>
              <td className="cellname">{m.name}{m.sku ? <span className="muted mono" style={{ fontSize: 11 }}> · {m.sku}</span> : null}</td>
              <td className="cellsub">{m.preferredVendorName ?? '—'}</td>
              <td className="num mono" style={{ color: 'var(--danger)', fontWeight: 700 }}>{qn(m.onHand)} {m.unit ?? ''}</td>
              <td className="num mono">{qn(m.reorderPoint)}</td>
              <td className="num mono" style={{ fontWeight: 700 }}>{qn(m.deficit)} {m.unit ?? ''}</td>
              <td className="num mono" style={{ fontWeight: 700, color: 'var(--brand)' }}>{qn(m.suggestedQty)} {m.unit ?? ''}</td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={6}><div className="dsx-empty">Nessun articolo sotto la scorta minima. 👍</div></td></tr>}
        </tbody>
      </table>
      {total > items.length && (
        <div style={{ textAlign: 'center', marginTop: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setLimit((l) => Math.min(l + 100, 500))}>
            Carica altri — mostrati {items.length} di {total}
          </button>
          {total > 500 && items.length >= 500 && <p className="faint" style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 6 }}>Report limitato ai 500 più gravi; usa i filtri o riduci i sotto-scorta.</p>}
        </div>
      )}
    </>
  );
}
