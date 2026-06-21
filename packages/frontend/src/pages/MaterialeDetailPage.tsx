/**
 * MaterialeDetailPage — Scheda articolo (mock 45) su ObjectPage/ObjectBox/RelatedTabs.
 * Anagrafica + Magazzino&tracciamento; tab Unità seriali (parco installato letto da
 * status=installed) con sblocco password gated da serial:secret_read.
 */
import { useEffect, useMemo, useState } from 'react';
import { useHistory, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Package, Settings2, ScanLine, Layers, ArrowLeftRight, FileText, Eye, Lock } from 'lucide-react';
import type { MaterialDto, SerialUnitDto, FieldDefinitionDto, StockBalanceDto, StockMovementDto } from '@sisuite/shared';
import { useLookups } from '../context/Lookups';
import { Money } from '../ui/Num';
import { Page, Loading, ErrorBox } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { ObjectPage, ObjectBox, RelatedTabs, type RelTab } from '../ui/ObjectPage';
import { AttrBoxes } from '../ui/AttrFields';
import { useApi, mutate } from '../api/hooks';
import { apiFetch, ApiError } from '../api/client';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';

interface ListResp<T> { items: T[] }
const SERIAL_PILL: Record<string, { label: string; token: string }> = {
  in_stock: { label: 'A magazzino', token: 'neutral' }, assigned: { label: 'Assegnato', token: 'info' },
  installed: { label: 'Installato', token: 'success' }, faulty: { label: 'Guasto / reso', token: 'danger' },
  returned: { label: 'Reso', token: 'warning' }, retired: { label: 'Dismesso', token: 'neutral' },
};

/** cella password seriale: lucchetto + "Mostra" gated. */
function SecretCell({ serialId, hasSecret, canReveal }: { serialId: string; hasSecret: boolean; canReveal: boolean }) {
  const [val, setVal] = useState<string | null>(null);
  const toast = useToast();
  if (!hasSecret) return <span className="faint">—</span>;
  if (val) return <span className="maskline"><span className="mk">{val}</span></span>;
  return (
    <button className={`reveal${canReveal ? '' : ' locked'}`} disabled={!canReveal}
      data-tip={canReveal ? undefined : 'Serve il permesso serial.secret.read'}
      onClick={async () => {
        try { const r = await apiFetch<{ password: string }>(`/serials/${serialId}/secret/reveal`, { method: 'POST' }); setVal(r.password); }
        catch (e) { toast(e instanceof ApiError ? `Errore ${e.status}` : 'Errore', 'error'); }
      }}>
      {canReveal ? <><Eye /> Mostra</> : <><Lock /> Bloccato</>}
    </button>
  );
}

export function MaterialeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const history = useHistory();
  const toast = useToast();
  const { user } = useAuth();
  const { t } = useTranslation();
  const can = (a: string) => !!user?.permissions.includes(a as never);

  const detail = useApi<MaterialDto>(isNew ? null : `/materials/${id}`);
  const serials = useApi<ListResp<SerialUnitDto>>(isNew ? null : `/materials/${id}/serials`);
  const fieldDefs = useApi<ListResp<FieldDefinitionDto>>('/field-definitions?entity=material');

  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [attrs, setAttrs] = useState<Record<string, unknown>>({});
  const [tab, setTab] = useState('balances');
  const [busy, setBusy] = useState(false);

  const d = detail.data;
  useEffect(() => {
    if (!d) { if (isNew) setForm({ trackStock: true, costingMethod: 'avg' }); return; }
    setForm({ name: d.name, unit: d.unit, sku: d.sku ?? '', trackStock: d.trackStock, trackedBySerial: d.trackedBySerial,
      trackedByLot: d.trackedByLot, costingMethod: d.costingMethod });
    setAttrs(d.attributes ?? {});
  }, [d, isNew]);

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const canSecret = can('serial:secret_read');
  // NB: gli hook devono stare PRIMA dei return condizionali (loading/error) sotto,
  // altrimenti il conteggio hook cambia tra i render → React crasha (pagina vuota).
  const catOptions = useMemo(() => (fieldDefs.data?.items ?? []).find((f) => f.key === 'item_type')?.options ?? [], [fieldDefs.data]);

  async function save() {
    if (!form.name || !form.unit) { toast('Nome e unità sono obbligatori', 'error'); return; }
    setBusy(true);
    const body = {
      name: form.name, unit: form.unit, sku: (form.sku as string) || null,
      trackStock: !!form.trackStock, trackedBySerial: !!form.trackedBySerial, trackedByLot: !!form.trackedByLot,
      costingMethod: form.costingMethod || 'avg',
      defaultCost: attrs.__default_cost != null ? Number(attrs.__default_cost) : (d?.defaultCost ?? null),
      attributes: attrs,
    };
    try {
      if (isNew) { const c = await apiFetch<MaterialDto>('/materials', { method: 'POST', body: JSON.stringify(body) }); toast('Articolo creato'); history.push(`/materials/${c.id}`); }
      else { await mutate('PATCH', `/materials/${id}`, body); toast('Modifiche salvate'); void detail.reload(); }
    } catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  if (!isNew && detail.loading) return <Page title={t('terms.material')}><Loading /></Page>;
  if (!isNew && detail.error) return <Page title={t('terms.material')}><ErrorBox message={detail.error} /></Page>;

  const itemType = (attrs.item_type as string) ?? 'article';
  const trackTag = itemType === 'service' ? { label: 'Servizio', token: 'neutral' } : form.trackedBySerial ? { label: 'A seriale', token: 'brand' } : { label: 'A magazzino', token: 'neutral' };

  const serialsTable = (
    <table className="subt">
      <thead><tr><th>Seriale</th><th>Stato</th><th>Dove si trova / installato presso</th><th>Ordinativo</th><th className="num">Aggiornato</th><th>Password</th></tr></thead>
      <tbody>
        {(serials.data?.items ?? []).map((s) => { const p = SERIAL_PILL[s.status] ?? { label: s.status, token: 'neutral' }; return (
          <tr key={s.id}>
            <td><span className="serialtag">{s.serial}</span></td>
            <td><StatusPill label={p.label} token={p.token} /></td>
            <td>{s.whereLabel ?? '—'}{s.status === 'installed' && <span className="muted"> · parco installato</span>}</td>
            <td className="mono">{s.workOrderCode ?? '—'}</td>
            <td className="num mono">{s.updatedAt.slice(0, 10).split('-').reverse().join('/')}</td>
            <td><SecretCell serialId={s.id} hasSecret={s.hasSecret} canReveal={canSecret} /></td>
          </tr>
        ); })}
        {(serials.data?.items ?? []).length === 0 && <tr><td colSpan={6}><div className="dsx-empty">Nessuna unità seriale.</div></td></tr>}
      </tbody>
    </table>
  );
  const tabs: RelTab[] = [
    ...(d?.trackedBySerial ? [{ key: 'serials', label: 'Unità seriali', icon: ScanLine, count: serials.data?.items.length ?? 0, content: serialsTable }] : []),
    { key: 'balances', label: 'Giacenze per ubicazione', icon: Layers, content: <MaterialBalances materialId={id} /> },
    { key: 'movements', label: 'Movimenti', icon: ArrowLeftRight, content: <MaterialMovements materialId={id} /> },
    { key: 'docs', label: 'Documenti', icon: FileText, content: <MaterialDocs materialId={id} /> },
  ];

  return (
    <Page title={isNew ? `Nuovo ${t('terms.material')}` : t('terms.material')} bleed>
      <ObjectPage
        backLabel={t('terms.material_plural')} onBack={() => history.push('/materials')}
        title={form.name as string || `Nuovo ${t('terms.material')}`} code={!isNew ? (d?.sku ?? undefined) : undefined}
        status={!isNew ? <StatusPill label={trackTag.label} token={trackTag.token} /> : undefined}
        onSave={(isNew ? can('material:create') : can('material:update')) ? save : undefined}
        onCancel={() => history.push('/materials')} saving={busy}
      >
        <ObjectBox icon={Package} title="Anagrafica articolo">
          <div className="bgrid">
            <div className="bf c2"><span className="bl">Nome <span className="req">*</span></span><input className="bi" value={form.name as string ?? ''} onChange={(e) => set('name', e.target.value)} /></div>
            <div className="bf"><span className="bl">SKU</span><input className="bi mono" value={form.sku as string ?? ''} onChange={(e) => set('sku', e.target.value)} /></div>
            <div className="bf"><span className="bl">Unità di misura <span className="req">*</span></span><input className="bi" value={form.unit as string ?? ''} onChange={(e) => set('unit', e.target.value)} placeholder="pz, m, cad…" /></div>
            <div className="bf c2"><span className="bl">Categoria</span><input className="bi" value={(attrs.category as string) ?? ''} onChange={(e) => setAttrs((a) => ({ ...a, category: e.target.value || undefined }))} /></div>
            <div className="bf"><span className="bl">Tipo</span>
              <select className="bi" value={itemType} onChange={(e) => setAttrs((a) => ({ ...a, item_type: e.target.value }))}>
                {(catOptions.length ? catOptions : [{ value: 'article', label: { 'it-IT': 'Articolo' } }, { value: 'service', label: { 'it-IT': 'Servizio' } }]).map((o) => <option key={o.value} value={o.value}>{o.label['it-IT'] ?? o.value}</option>)}
              </select></div>
            <div className="bf"><span className="bl">Codice fornitore</span><input className="bi mono" value={(attrs.supplier_code as string) ?? ''} onChange={(e) => setAttrs((a) => ({ ...a, supplier_code: e.target.value || undefined }))} /></div>
          </div>
        </ObjectBox>

        {itemType !== 'service' && (
          <ObjectBox icon={Settings2} title="Magazzino & tracciamento">
            <div className="bgrid">
              <div className="bf"><span className="bl">Gestito a magazzino</span>
                <label className="bi" style={{ justifyContent: 'space-between', cursor: 'pointer' }}>{form.trackStock ? 'Sì' : 'No'}<input type="checkbox" checked={!!form.trackStock} onChange={(e) => set('trackStock', e.target.checked)} /></label></div>
              <div className="bf"><span className="bl">Gestito a seriale</span>
                <label className="bi" style={{ justifyContent: 'space-between', cursor: 'pointer' }}>{form.trackedBySerial ? 'Sì' : 'No'}<input type="checkbox" checked={!!form.trackedBySerial} onChange={(e) => set('trackedBySerial', e.target.checked)} /></label></div>
              <div className="bf"><span className="bl">A lotto</span>
                <label className="bi" style={{ justifyContent: 'space-between', cursor: 'pointer' }}>{form.trackedByLot ? 'Sì' : 'No'}<input type="checkbox" checked={!!form.trackedByLot} onChange={(e) => set('trackedByLot', e.target.checked)} /></label></div>
              <div className="bf"><span className="bl">Metodo costo</span>
                <select className="bi" value={form.costingMethod as string ?? 'avg'} onChange={(e) => set('costingMethod', e.target.value)}>
                  <option value="avg">Medio mobile</option><option value="fifo">FIFO</option><option value="standard">Standard</option>
                </select></div>
              <div className="bf"><span className="bl">Costo medio</span><div className="bi mono" style={{ justifyContent: 'flex-end' }}>{d?.avgCost != null ? `€ ${d.avgCost.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</div></div>
              <div className="bf"><span className="bl">Scorta minima</span><input className="bi mono" style={{ textAlign: 'right' }} type="number" value={(attrs.min_stock as number) ?? ''} onChange={(e) => setAttrs((a) => ({ ...a, min_stock: e.target.value === '' ? undefined : Number(e.target.value) }))} /></div>
              <div className="bf"><span className="bl">Giacenza totale</span><div className="bi green" style={{ justifyContent: 'flex-end' }}>{d?.qtyOnHand?.toLocaleString('it-IT') ?? '0'}</div></div>
            </div>
          </ObjectBox>
        )}

        <AttrBoxes defs={fieldDefs.data?.items ?? []} attrs={attrs} setAttr={(k, v) => setAttrs((a) => ({ ...a, [k]: v }))}
          exclude={['category', 'item_type', 'min_stock', 'supplier_code']} />

        {!isNew && (d?.trackStock || d?.trackedBySerial) && <RelatedTabs tabs={tabs} active={tab} onChange={setTab} />}
      </ObjectPage>
    </Page>
  );
}

const itDate = (d: string) => new Date(d).toLocaleDateString('it-IT');

/** Giacenze per ubicazione dell'articolo (Blocco H). */
function MaterialBalances({ materialId }: { materialId: string }) {
  const { data, loading } = useApi<{ items: StockBalanceDto[] }>(`/stock/balance?materialId=${materialId}`);
  if (loading) return <div className="dsx-empty">Carico…</div>;
  const rows = data?.items ?? [];
  return (
    <table className="subt">
      <thead><tr><th>Ubicazione</th><th className="num">Giacenza</th><th className="num">Costo medio</th><th className="num">Valore</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.locationId}`}>
            <td>{r.locationName ?? '—'}</td>
            <td className="num mono">{r.qtyOnHand.toLocaleString('it-IT')} {r.unit ?? ''}</td>
            <td className="num"><Money value={r.avgCost} /></td>
            <td className="num"><Money value={r.valueOnHand} /></td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={4}><div className="dsx-empty">Nessuna giacenza per questo articolo.</div></td></tr>}
      </tbody>
    </table>
  );
}

/** Registro movimenti dell'articolo. */
function MaterialMovements({ materialId }: { materialId: string }) {
  const lk = useLookups();
  const { data, loading } = useApi<{ items: StockMovementDto[] }>(`/stock/movements?materialId=${materialId}`);
  if (loading) return <div className="dsx-empty">Carico…</div>;
  const rows = data?.items ?? [];
  return (
    <table className="subt">
      <thead><tr><th>Data</th><th>Tipo</th><th>Ubicazione</th><th className="num">Qtà</th><th className="num">Costo unit.</th><th>Rif.</th></tr></thead>
      <tbody>
        {rows.map((r) => {
          const l = lk.byId(r.typeId);
          return (
            <tr key={r.id}>
              <td className="mono faint">{itDate(r.occurredOn)}</td>
              <td>{l ? <StatusPill label={lk.labelOf(r.typeId)} token={l.colorToken} /> : '—'}</td>
              <td>{r.locationName ?? '—'}</td>
              <td className="num mono" style={r.quantity < 0 ? { color: 'var(--danger)' } : undefined}>{r.quantity.toLocaleString('it-IT')} {r.unit}</td>
              <td className="num"><Money value={r.unitCost} /></td>
              <td className="mono faint">{r.documentRef ?? (r.workOrderId ? 'ordine' : '—')}</td>
            </tr>
          );
        })}
        {rows.length === 0 && <tr><td colSpan={6}><div className="dsx-empty">Nessun movimento.</div></td></tr>}
      </tbody>
    </table>
  );
}

/** Documenti che hanno toccato l'articolo (derivati dai movimenti con riferimento documento). */
function MaterialDocs({ materialId }: { materialId: string }) {
  const { data, loading } = useApi<{ items: StockMovementDto[] }>(`/stock/movements?materialId=${materialId}`);
  if (loading) return <div className="dsx-empty">Carico…</div>;
  const docs = (data?.items ?? []).filter((m) => m.documentRef || m.workOrderId);
  return (
    <table className="subt">
      <thead><tr><th>Data</th><th>Riferimento</th><th className="num">Qtà</th></tr></thead>
      <tbody>
        {docs.map((r) => (
          <tr key={r.id}>
            <td className="mono faint">{itDate(r.occurredOn)}</td>
            <td>{r.documentRef ?? (r.workOrderId ? 'Scarico su ordine di lavoro' : '—')}</td>
            <td className="num mono">{r.quantity.toLocaleString('it-IT')} {r.unit}</td>
          </tr>
        ))}
        {docs.length === 0 && <tr><td colSpan={3}><div className="dsx-empty">Nessun documento collegato.</div></td></tr>}
      </tbody>
    </table>
  );
}
