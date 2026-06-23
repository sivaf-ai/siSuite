/**
 * ListinoItemDetailPage — Scheda voce di capitolato (mock 46, Blocco D) su
 * ObjectPage. Box Voce (con margine calcolato) + tab Ritocchi (override) che
 * rende esplicita la regola "più specifico": commessa › gestore › base.
 */
import { useEffect, useState } from 'react';
import { useHistory, useParams, useLocation } from 'react-router';
import { Tags, Sliders, History, Wrench, Plus, Trash2 } from 'lucide-react';
import { marginPct, type PriceListItemDto, type PriceOverrideDto, type PriceListDto, type CompanyDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { ObjectPage, ObjectBox, RelatedTabs, type RelTab } from '../ui/ObjectPage';
import { Money } from '../ui/Num';
import { useApi, mutate } from '../api/hooks';
import { apiFetch, ApiError } from '../api/client';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';

type Detail = PriceListItemDto & { overrides: PriceOverrideDto[] };
interface ListResp<T> { items: T[] }
interface UsageRow {
  id: string; description: string | null; engagementCode: string | null; engagementTitle: string | null;
  quantity: number; unit: string | null; costPrice: number | null; revenuePrice: number | null; occurredOn: string | null;
}

export function ListinoItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const history = useHistory();
  const toast = useToast();
  const { user } = useAuth();
  const canManage = !!user?.permissions.includes('settings:manage' as never);

  const detail = useApi<Detail>(isNew ? null : `/price-list-items/${id}`);
  const usage = useApi<{ items: UsageRow[] }>(isNew ? null : `/price-list-items/${id}/usage`);
  const priceLists = useApi<ListResp<PriceListDto>>('/price-lists');
  const companies = useApi<ListResp<CompanyDto>>('/companies?role=operator&limit=200');
  const engagements = useApi<ListResp<{ id: string; title?: string; code?: string }>>('/engagements');

  const [form, setForm] = useState<Record<string, string>>({});
  const [tab, setTab] = useState('overrides');
  const [busy, setBusy] = useState(false);
  // form nuovo ritocco
  const [ovScope, setOvScope] = useState<'company' | 'engagement'>('company');
  const [ovTarget, setOvTarget] = useState('');
  const [ovCost, setOvCost] = useState(''); const [ovRev, setOvRev] = useState('');

  // Duplica (standard): "nuovo" precompilato da location.state.prefill (senza il codice, chiave).
  const location = useLocation();
  const prefill = isNew ? (location.state as { prefill?: Record<string, unknown> } | null)?.prefill : undefined;

  const d = detail.data;
  useEffect(() => {
    if (!d) {
      if (isNew && prefill) {
        setForm({
          code: '',
          description: (prefill.description as string) ?? '',
          unit: (prefill.unit as string) ?? '',
          category: (prefill.category as string) ?? '',
          costPrice: prefill.costPrice != null ? String(prefill.costPrice) : '',
          revenuePrice: prefill.revenuePrice != null ? String(prefill.revenuePrice) : '',
        });
      }
      return;
    }
    setForm({ code: d.code, description: d.description, unit: d.unit, category: d.category ?? '',
      costPrice: d.costPrice?.toString() ?? '', revenuePrice: d.revenuePrice?.toString() ?? '' });
  }, [d, isNew, prefill]);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const cost = form.costPrice === '' ? null : Number(form.costPrice);
  const rev = form.revenuePrice === '' ? null : Number(form.revenuePrice);
  const margin = marginPct(cost, rev);

  async function save() {
    if (!form.code || !form.description || !form.unit) { toast('Codice, descrizione e unità obbligatori', 'error'); return; }
    setBusy(true);
    const body = { code: form.code, description: form.description, unit: form.unit, category: form.category || null, costPrice: cost, revenuePrice: rev };
    try {
      if (isNew) {
        const plId = priceLists.data?.items.find((p) => p.isDefault)?.id ?? priceLists.data?.items[0]?.id;
        if (!plId) { toast('Nessun listino disponibile', 'error'); setBusy(false); return; }
        const c = await apiFetch<PriceListItemDto>('/price-list-items', { method: 'POST', body: JSON.stringify({ priceListId: plId, ...body }) });
        toast('Voce creata'); history.push(`/price-list/${c.id}`);
      } else { await mutate('PATCH', `/price-list-items/${id}`, body); toast('Modifiche salvate'); void detail.reload(); }
    } catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  async function addOverride() {
    if (!ovTarget) { toast('Scegli il soggetto/commessa del ritocco', 'error'); return; }
    try {
      await apiFetch('/price-list-overrides', { method: 'POST', body: JSON.stringify({
        baseItemId: id, scopeType: ovScope,
        companyId: ovScope === 'company' ? ovTarget : null, engagementId: ovScope === 'engagement' ? ovTarget : null,
        costPrice: ovCost === '' ? null : Number(ovCost), revenuePrice: ovRev === '' ? null : Number(ovRev),
      }) });
      toast('Ritocco aggiunto'); setOvTarget(''); setOvCost(''); setOvRev(''); void detail.reload();
    } catch (e) { toast(e instanceof ApiError ? `Errore ${e.status}` : 'Errore', 'error'); }
  }
  async function delOverride(oid: string) {
    try { await mutate('DELETE', `/price-list-overrides/${oid}`); toast('Ritocco eliminato'); void detail.reload(); }
    catch (e) { toast(e instanceof ApiError ? `Errore ${e.status}` : 'Errore', 'error'); }
  }

  if (!isNew && detail.loading) return <Page title="Voce"><Loading /></Page>;
  if (!isNew && detail.error) return <Page title="Voce"><ErrorBox message={detail.error} /></Page>;

  const overridesTable = (
    <>
      <div className="privacy-note" style={{ color: 'var(--brand-ink)', background: 'var(--brand-wash)', borderColor: '#D9D4FB' }}>
        <Sliders size={14} /><div>Regola del prezzo «più specifico»: <b>override di commessa</b> › <b>override di gestore</b> › <b>prezzo base</b>. Il ritocco più specifico vince; i campi lasciati vuoti ricadono sul prezzo base.</div>
      </div>
      <table className="subt">
        <thead><tr><th>Ambito</th><th>Soggetto / Commessa</th><th className="num">Costo</th><th className="num">Ricavo</th><th>Validità</th><th style={{ width: 44 }} /></tr></thead>
        <tbody>
          {(d?.overrides ?? []).map((o) => (
            <tr key={o.id}>
              <td><span className="serialtag">{o.scopeType === 'engagement' ? 'Commessa' : 'Gestore'}</span></td>
              <td>{o.scopeType === 'engagement' ? (o.engagementTitle ?? '—') : (o.companyName ?? '—')}</td>
              <td className="num">{o.costPrice != null ? <Money value={o.costPrice} /> : <span className="faint">base</span>}</td>
              <td className="num">{o.revenuePrice != null ? <Money value={o.revenuePrice} /> : <span className="faint">base</span>}</td>
              <td className="mono" style={{ fontSize: 11.5 }}>{o.validFrom ?? '—'}{o.validTo ? ` → ${o.validTo}` : ''}</td>
              <td>{canManage && <button className="reveal locked" style={{ background: 'none', color: 'var(--ink-faint)' }} onClick={() => delOverride(o.id)}><Trash2 /></button>}</td>
            </tr>
          ))}
          {(d?.overrides ?? []).length === 0 && <tr><td colSpan={6}><div className="dsx-empty">Nessun ritocco: si applica il prezzo base.</div></td></tr>}
        </tbody>
      </table>
      {canManage && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', flexWrap: 'wrap' }}>
          <select className="bi" style={{ minHeight: 32, width: 120 }} value={ovScope} onChange={(e) => { setOvScope(e.target.value as 'company' | 'engagement'); setOvTarget(''); }}>
            <option value="company">Gestore</option><option value="engagement">Commessa</option>
          </select>
          <select className="bi" style={{ minHeight: 32, flex: 1, minWidth: 160 }} value={ovTarget} onChange={(e) => setOvTarget(e.target.value)}>
            <option value="">— scegli —</option>
            {ovScope === 'company'
              ? (companies.data?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)
              : (engagements.data?.items ?? []).map((e) => <option key={e.id} value={e.id}>{e.code ? `${e.code} · ` : ''}{e.title}</option>)}
          </select>
          <input className="bi mono" style={{ minHeight: 32, width: 90 }} type="number" placeholder="Costo" value={ovCost} onChange={(e) => setOvCost(e.target.value)} />
          <input className="bi mono" style={{ minHeight: 32, width: 90 }} type="number" placeholder="Ricavo" value={ovRev} onChange={(e) => setOvRev(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={addOverride}><Plus size={14} /> Aggiungi ritocco</button>
        </div>
      )}
    </>
  );
  const usageRows = usage.data?.items ?? [];
  // storico prezzi = snapshot distinti (data, costo, ricavo) fotografati sulle lavorazioni
  const priceHistory = (() => {
    const seen = new Set<string>(); const out: UsageRow[] = [];
    for (const u of usageRows) {
      const k = `${u.occurredOn}|${u.costPrice}|${u.revenuePrice}`;
      if (seen.has(k)) continue; seen.add(k); out.push(u);
    }
    return out;
  })();

  const usageTable = (
    <table className="subt">
      <thead><tr><th>Lavorazione</th><th>Commessa</th><th>Data</th><th className="num">Q.tà</th><th className="num">Costo</th><th className="num">Ricavo</th></tr></thead>
      <tbody>
        {usageRows.map((u) => (
          <tr key={u.id}>
            <td>{u.description ?? '—'}</td>
            <td className="mono">{u.engagementCode ?? '—'}</td>
            <td className="mono faint">{u.occurredOn ?? '—'}</td>
            <td className="num mono">{u.quantity.toLocaleString('it-IT')} {u.unit ?? ''}</td>
            <td className="num"><Money value={u.costPrice} /></td>
            <td className="num"><Money value={u.revenuePrice} /></td>
          </tr>
        ))}
        {usageRows.length === 0 && <tr><td colSpan={6}><div className="dsx-empty">Nessuna lavorazione usa questa voce.</div></td></tr>}
      </tbody>
    </table>
  );
  const historyTable = (
    <table className="subt">
      <thead><tr><th>Data</th><th className="num">Costo fotografato</th><th className="num">Ricavo fotografato</th><th className="num">Margine</th></tr></thead>
      <tbody>
        {priceHistory.map((u, i) => { const m = marginPct(u.costPrice, u.revenuePrice); return (
          <tr key={i}>
            <td className="mono faint">{u.occurredOn ?? '—'}</td>
            <td className="num"><Money value={u.costPrice} /></td>
            <td className="num"><Money value={u.revenuePrice} /></td>
            <td className="num mono">{m == null ? '—' : `${m.toFixed(1)}%`}</td>
          </tr>
        ); })}
        {priceHistory.length === 0 && <tr><td colSpan={4}><div className="dsx-empty">Nessun prezzo storicizzato (la voce non è ancora stata usata in lavorazioni).</div></td></tr>}
      </tbody>
    </table>
  );

  const tabs: RelTab[] = [
    { key: 'overrides', label: 'Ritocchi (override)', icon: Sliders, count: d?.overrides?.length ?? 0, content: overridesTable },
    { key: 'history', label: 'Storico prezzi', icon: History, count: priceHistory.length, content: historyTable },
    { key: 'usage', label: 'Lavorazioni che la usano', icon: Wrench, count: usageRows.length, content: usageTable },
  ];

  return (
    <Page title={isNew ? 'Nuova voce' : 'Voce di capitolato'} bleed>
      <ObjectPage
        backLabel="Listino" onBack={() => history.push('/price-list')}
        title={form.description || 'Nuova voce'} code={!isNew ? d?.code : undefined}
        onSave={canManage ? save : undefined} onCancel={() => history.push('/price-list')} saving={busy}
      >
        <ObjectBox icon={Tags} title="Voce di capitolato">
          <div className="bgrid">
            <div className="bf"><span className="bl">Codice <span className="req">*</span></span><input className="bi mono" value={form.code ?? ''} onChange={(e) => set('code', e.target.value)} placeholder="B-1.1" /></div>
            <div className="bf c3"><span className="bl">Descrizione <span className="req">*</span></span><input className="bi" value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} /></div>
            <div className="bf"><span className="bl">Unità <span className="req">*</span></span><input className="bi" value={form.unit ?? ''} onChange={(e) => set('unit', e.target.value)} placeholder="m, cad, m3…" /></div>
            <div className="bf c2"><span className="bl">Categoria</span><input className="bi" value={form.category ?? ''} onChange={(e) => set('category', e.target.value)} /></div>
            <div className="bf"><span className="bl">Prezzo costo</span><input className="bi mono" style={{ justifyContent: 'flex-end' }} type="number" value={form.costPrice ?? ''} onChange={(e) => set('costPrice', e.target.value)} /></div>
            <div className="bf"><span className="bl">Prezzo ricavo</span><input className="bi mono" type="number" value={form.revenuePrice ?? ''} onChange={(e) => set('revenuePrice', e.target.value)} /></div>
            <div className="bf"><span className="bl">Margine</span><div className="bi green" style={{ justifyContent: 'flex-end' }}>{margin == null ? '—' : `${margin.toFixed(1)}%`}</div></div>
          </div>
        </ObjectBox>

        {!isNew && <RelatedTabs tabs={tabs} active={tab} onChange={setTab} />}
      </ObjectPage>
    </Page>
  );
}
