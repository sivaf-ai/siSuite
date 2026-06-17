/**
 * LavorazioneDetailPage — Scheda lavorazione (mock 49, Blocco E) su ObjectPage.
 * Box Lavorazione (voce, fase/WBS, data; prezzi FOTOGRATATI con resolvePrice;
 * quantità read-only se da libretto; ricavo calcolato) + tab Libretto misure
 * (label · formula · valore; riga totale = quantità).
 */
import { useEffect, useState } from 'react';
import { useHistory, useParams, useLocation } from 'react-router';
import { Wrench, Ruler, Plus, Trash2 } from 'lucide-react';
import type { WorkLineDto, PriceListItemDto, PhaseDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { ObjectPage, ObjectBox, RelatedTabs, type RelTab } from '../ui/ObjectPage';
import { Money } from '../ui/Num';
import { useApi, mutate } from '../api/hooks';
import { apiFetch, ApiError } from '../api/client';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';

interface ListResp<T> { items: T[] }
type Measure = { label: string; formula: string; value: number };

export function LavorazioneDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const history = useHistory();
  const toast = useToast();
  const { user } = useAuth();
  const canWrite = !!user?.permissions.includes('engagement:update' as never);
  const engFromQuery = new URLSearchParams(useLocation().search).get('engagement') ?? '';

  const detail = useApi<WorkLineDto>(isNew ? null : `/work-lines/${id}`);
  const items = useApi<ListResp<PriceListItemDto>>('/price-list-items?limit=200');
  const d = detail.data;
  const engagementId = d?.engagementId ?? engFromQuery;
  const phases = useApi<PhaseDto[]>(engagementId ? `/engagements/${engagementId}/phases` : null);

  const [form, setForm] = useState<Record<string, string>>({});
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [tab, setTab] = useState('libretto');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!d) return;
    setForm({ priceListItemId: d.priceListItemId ?? '', phaseId: d.phaseId ?? '', unit: d.unit, occurredOn: d.occurredOn ?? '', description: d.description ?? '' });
    setMeasures((d.measures ?? []).map((m) => ({ label: m.label ?? '', formula: m.formula ?? '', value: m.value })));
  }, [d]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const itemOpts = items.data?.items ?? [];
  const selItem = itemOpts.find((i) => i.id === form.priceListItemId);
  const sumMeasures = measures.reduce((a, m) => a + (Number(m.value) || 0), 0);
  const hasLibretto = measures.length > 0;
  const quantity = hasLibretto ? sumMeasures : (d?.quantity ?? 0);
  // prezzo ricavo: fotografato (esistente) o base della voce (anteprima in creazione)
  const revPrice = d?.revenuePrice ?? selItem?.revenuePrice ?? null;
  const costPrice = d?.costPrice ?? selItem?.costPrice ?? null;
  const ricavo = revPrice != null ? quantity * revPrice : 0;

  async function save() {
    if (!engagementId) { toast('Commessa mancante', 'error'); return; }
    if (!hasLibretto && !(d?.quantity)) { toast('Aggiungi il libretto misure o una quantità', 'error'); return; }
    setBusy(true);
    try {
      if (isNew) {
        const body = {
          engagementId, priceListItemId: form.priceListItemId || null, phaseId: form.phaseId || null,
          description: form.description || null, unit: form.unit || selItem?.unit || 'cad',
          occurredOn: form.occurredOn || undefined,
          measures: measures.map((m) => ({ label: m.label || null, formula: m.formula || null, value: Number(m.value) })),
        };
        const c = await apiFetch<WorkLineDto>('/work-lines', { method: 'POST', body: JSON.stringify(body) });
        toast('Lavorazione creata'); history.push(`/work-lines/${c.id}`);
      } else {
        await mutate('PATCH', `/work-lines/${id}`, { phaseId: form.phaseId || null, description: form.description || null, unit: form.unit, occurredOn: form.occurredOn || null });
        await mutate('PUT', `/work-lines/${id}/measures`, { measures: measures.map((m) => ({ label: m.label || null, formula: m.formula || null, value: Number(m.value) })) });
        toast('Modifiche salvate'); void detail.reload();
      }
    } catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  if (!isNew && detail.loading) return <Page title="Lavorazione"><Loading /></Page>;
  if (!isNew && detail.error) return <Page title="Lavorazione"><ErrorBox message={detail.error} /></Page>;

  const libretto = (
    <>
      <table className="subt">
        <thead><tr><th>Descrizione misura</th><th>Formula</th><th className="num">Valore</th><th style={{ width: 44 }} /></tr></thead>
        <tbody>
          {measures.map((m, i) => (
            <tr key={i}>
              <td><input className="bi" style={{ minHeight: 30 }} value={m.label} placeholder="es. Tratta A — marciapiede dx" onChange={(e) => setMeasures((a) => a.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} /></td>
              <td><input className="bi mono" style={{ minHeight: 30, width: 130 }} value={m.formula} placeholder="24 × 1,00" onChange={(e) => setMeasures((a) => a.map((x, j) => j === i ? { ...x, formula: e.target.value } : x))} /></td>
              <td className="num"><input className="bi mono" style={{ minHeight: 30, width: 90, textAlign: 'right' }} type="number" value={m.value} onChange={(e) => setMeasures((a) => a.map((x, j) => j === i ? { ...x, value: Number(e.target.value) } : x))} /></td>
              <td>{canWrite && <button className="reveal locked" style={{ background: 'none', color: 'var(--ink-faint)' }} onClick={() => setMeasures((a) => a.filter((_, j) => j !== i))}><Trash2 /></button>}</td>
            </tr>
          ))}
          <tr><td colSpan={2} style={{ textAlign: 'right', fontWeight: 700 }}>Totale (= quantità)</td><td className="num mono" style={{ fontWeight: 700 }}>{sumMeasures.toLocaleString('it-IT')}</td><td /></tr>
        </tbody>
      </table>
      {canWrite && <div className="addline" onClick={() => setMeasures((a) => [...a, { label: '', formula: '', value: 0 }])}><Plus size={15} /> Aggiungi misura</div>}
    </>
  );
  const tabs: RelTab[] = [
    { key: 'libretto', label: 'Libretto misure', icon: Ruler, count: measures.length, content: libretto },
  ];

  return (
    <Page title={isNew ? 'Nuova lavorazione' : 'Lavorazione'} bleed>
      <ObjectPage
        backLabel="Lavorazioni" onBack={() => history.push('/work-lines')}
        title={selItem?.description || d?.itemDescription || form.description || 'Lavorazione'}
        code={!isNew ? (d?.itemCode ?? undefined) : undefined}
        onSave={canWrite ? save : undefined} onCancel={() => history.push('/work-lines')} saving={busy}
      >
        <ObjectBox icon={Wrench} title="Lavorazione">
          <div className="bgrid">
            <div className="bf c2"><span className="bl">Voce di capitolato</span>
              <select className="bi" value={form.priceListItemId ?? ''} disabled={!isNew} onChange={(e) => { const it = itemOpts.find((x) => x.id === e.target.value); set('priceListItemId', e.target.value); if (it) set('unit', it.unit); }}>
                <option value="">— manuale —</option>
                {itemOpts.map((it) => <option key={it.id} value={it.id}>{it.code} · {it.description}</option>)}
              </select></div>
            <div className="bf"><span className="bl">Fase / WBS</span>
              <select className="bi" value={form.phaseId ?? ''} onChange={(e) => set('phaseId', e.target.value)}>
                <option value="">—</option>
                {(phases.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
            <div className="bf"><span className="bl">Data</span><input type="date" className="bi mono" value={form.occurredOn ?? ''} onChange={(e) => set('occurredOn', e.target.value)} /></div>
            <div className="bf"><span className="bl">Quantità {hasLibretto && <span className="faint">(da libretto)</span>}</span><div className="bi green mono" style={{ justifyContent: 'flex-end' }}>{quantity.toLocaleString('it-IT')} {form.unit}</div></div>
            <div className="bf"><span className="bl">Prezzo costo (fotogr.)</span><div className="bi mono" style={{ justifyContent: 'flex-end' }}>{costPrice != null ? `€ ${costPrice.toLocaleString('it-IT', { minimumFractionDigits: 2 })}` : '—'}</div></div>
            <div className="bf"><span className="bl">Prezzo ricavo (fotogr.)</span><div className="bi mono" style={{ justifyContent: 'flex-end' }}>{revPrice != null ? `€ ${revPrice.toLocaleString('it-IT', { minimumFractionDigits: 2 })}` : '—'}</div></div>
            <div className="bf"><span className="bl">Ricavo</span><div className="bi green" style={{ justifyContent: 'flex-end' }}><Money value={ricavo} /></div></div>
            {!form.priceListItemId && <div className="bf c2"><span className="bl">Descrizione (manuale)</span><input className="bi" value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} /></div>}
          </div>
        </ObjectBox>

        <RelatedTabs tabs={tabs} active={tab} onChange={setTab} />
      </ObjectPage>
    </Page>
  );
}
