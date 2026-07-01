/**
 * MaterialeDetailPage — Scheda articolo (mock 45) su ObjectPage/ObjectBox/RelatedTabs.
 * Anagrafica + Magazzino&tracciamento; tab Unità seriali (parco installato letto da
 * status=installed) con sblocco password gated da serial:secret_read.
 */
import { useEffect, useMemo, useState } from 'react';
import { useHistory, useParams, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Package, Settings2, ScanLine, Layers, ArrowLeftRight, FileText, Eye, Lock, Image as ImageIcon, Star, Trash2, Upload } from 'lucide-react';
import type { MaterialDto, SerialUnitDto, FieldDefinitionDto, StockBalanceDto, StockMovementDto, MaterialImageDto, UnitDto, MaterialCategoryDto } from '@sisuite/shared';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useLookups } from '../context/Lookups';
import { Money } from '../ui/Num';
import { Page, Loading, ErrorBox } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { ObjectPage, ObjectBox, RelatedTabs, type RelTab } from '../ui/ObjectPage';
import { AttrBoxes } from '../ui/AttrFields';
import { NumInput } from '../ui/NumInput';
import { PickerField } from '../ui/PickerField';
import { UnitPickerDialog } from '../ui/UnitPickerDialog';
import { CategoryPickerDialog } from '../ui/CategoryPickerDialog';
import { useApi, mutate } from '../api/hooks';
import { apiFetch, apiUpload, ApiError } from '../api/client';
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

/** Modalità embedded: la stessa scheda CRUD richiamata in un Modal (es. "+ Nuovo"
 *  o modifica articolo dal popup di selezione del DDT) senza navigare via dalla pagina. */
export interface MaterialeEmbed {
  id: string;                                   // 'new' o uuid
  onClose: () => void;
  onSaved?: (m: MaterialDto, wasNew: boolean) => void;
}

export function MaterialeDetailPage({ embed }: { embed?: MaterialeEmbed } = {}) {
  const routeParams = useParams<{ id: string }>();
  const id = embed ? embed.id : routeParams.id;
  const isNew = id === 'new';
  const history = useHistory();
  const toast = useToast();
  const { user } = useAuth();
  const { t } = useTranslation();
  const can = (a: string) => !!user?.permissions.includes(a as never);

  const detail = useApi<MaterialDto>(isNew ? null : `/materials/${id}`);
  const serials = useApi<ListResp<SerialUnitDto>>(isNew ? null : `/materials/${id}/serials`);
  const fieldDefs = useApi<ListResp<FieldDefinitionDto>>('/field-definitions?entity=material');
  const units = useApi<ListResp<UnitDto>>('/units');
  const categories = useApi<ListResp<MaterialCategoryDto>>('/material-categories');

  const [form, setForm] = useState<Record<string, string | boolean>>({});
  // metriche fisiche unitarie (numeriche; il form base è solo string/bool) — WMS Fase 2 + UDC
  const [phys, setPhys] = useState<{ weight: number | null; volume: number | null; unitsPerUdc: number | null }>({ weight: null, volume: null, unitsPerUdc: null });
  const [attrs, setAttrs] = useState<Record<string, unknown>>({});
  const [tab, setTab] = useState('images');
  const [busy, setBusy] = useState(false);
  const [unitPick, setUnitPick] = useState(false);
  const [catPick, setCatPick] = useState(false);

  // Duplica (standard): in creazione la scheda parte PRECOMPILATA da location.state.prefill.
  const location = useLocation();
  const prefill = (!embed && isNew) ? (location.state as { prefill?: Record<string, unknown> } | null)?.prefill : undefined;

  const d = detail.data;
  useEffect(() => {
    if (!d) {
      if (isNew) {
        const pf = prefill;
        setForm({
          trackStock: true, costingMethod: 'avg',
          ...(pf ? {
            name: (pf.name as string) ?? '', unit: (pf.unit as string) ?? '', sku: (pf.sku as string) ?? '',
            categoryId: (pf.categoryId as string) ?? '',
            trackStock: (pf.trackStock as boolean) ?? true, trackedBySerial: (pf.trackedBySerial as boolean) ?? false,
            trackedByLot: (pf.trackedByLot as boolean) ?? false, costingMethod: (pf.costingMethod as string) ?? 'avg',
          } : {}),
        });
        if (pf?.attributes) setAttrs(pf.attributes as Record<string, unknown>);
      }
      return;
    }
    setForm({ name: d.name, code: d.code ?? '', unit: d.unit, sku: d.sku ?? '', categoryId: d.categoryId ?? '', trackStock: d.trackStock, trackedBySerial: d.trackedBySerial,
      trackedByLot: d.trackedByLot, costingMethod: d.costingMethod });
    setPhys({ weight: d.weight, volume: d.volume, unitsPerUdc: d.unitsPerUdc });
    setAttrs(d.attributes ?? {});
  }, [d, isNew, prefill]);

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const canSecret = can('serial:secret_read');
  // NB: gli hook devono stare PRIMA dei return condizionali (loading/error) sotto,
  // altrimenti il conteggio hook cambia tra i render → React crasha (pagina vuota).
  const catOptions = useMemo(() => (fieldDefs.data?.items ?? []).find((f) => f.key === 'item_type')?.options ?? [], [fieldDefs.data]);
  const unitOptions = useMemo(() => units.data?.items ?? [], [units.data]);
  // valore mostrato nei picker a lente: nome unità (fallback al codice se fuori catalogo) e nome categoria.
  const unitLabel = useMemo(() => {
    const code = (form.unit as string) ?? '';
    if (!code) return '';
    const u = unitOptions.find((x) => x.code === code);
    return u ? `${u.name} (${u.code})` : code;
  }, [form.unit, unitOptions]);
  const categoryName = useMemo(() => {
    const cid = (form.categoryId as string) ?? '';
    if (!cid) return '';
    const items = categories.data?.items ?? [];
    const byId = new Map(items.map((c) => [c.id, c]));
    const parts: string[] = [];
    let cur = byId.get(cid);
    while (cur) { parts.unshift(cur.name); cur = cur.parentId ? byId.get(cur.parentId) : undefined; }
    return parts.join(' › ');
  }, [form.categoryId, categories.data]);

  async function save() {
    if (!form.name || !form.unit) { toast('Nome e unità sono obbligatori', 'error'); return; }
    setBusy(true);
    const body = {
      name: form.name, code: (form.code as string)?.trim() || null, unit: form.unit, sku: (form.sku as string) || null,
      categoryId: (form.categoryId as string) || null,
      trackStock: !!form.trackStock, trackedBySerial: !!form.trackedBySerial, trackedByLot: !!form.trackedByLot,
      costingMethod: form.costingMethod || 'avg',
      defaultCost: attrs.__default_cost != null ? Number(attrs.__default_cost) : (d?.defaultCost ?? null),
      weight: phys.weight, volume: phys.volume, unitsPerUdc: phys.unitsPerUdc,
      attributes: attrs,
    };
    try {
      if (isNew) {
        const c = await apiFetch<MaterialDto>('/materials', { method: 'POST', body: JSON.stringify(body) });
        toast('Articolo creato');
        if (embed) { embed.onSaved?.(c, true); embed.onClose(); } else history.push(`/materials/${c.id}`);
      } else {
        const u = await mutate<MaterialDto>('PATCH', `/materials/${id}`, body); toast('Modifiche salvate');
        if (embed) { embed.onSaved?.(u, false); embed.onClose(); } else void detail.reload();
      }
    } catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  const goBack = embed ? embed.onClose : () => history.push('/materials');
  if (!isNew && detail.loading) return embed ? <div className="dsx-empty">Carico…</div> : <Page title={t('terms.material')}><Loading /></Page>;
  if (!isNew && detail.error) return embed ? <ErrorBox message={detail.error} /> : <Page title={t('terms.material')}><ErrorBox message={detail.error} /></Page>;

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
  const showStockTabs = !!(d?.trackStock || d?.trackedBySerial);
  const tabs: RelTab[] = [
    { key: 'images', label: 'Immagini', icon: ImageIcon, content: <MaterialImages materialId={id} canEdit={can('material:update')} /> },
    ...(d?.trackedBySerial ? [{ key: 'serials', label: 'Unità seriali', icon: ScanLine, count: serials.data?.items.length ?? 0, content: serialsTable }] : []),
    ...(showStockTabs ? [
      { key: 'balances', label: 'Giacenze per ubicazione', icon: Layers, content: <MaterialBalances materialId={id} /> },
      { key: 'movements', label: 'Movimenti', icon: ArrowLeftRight, content: <MaterialMovements materialId={id} /> },
      { key: 'docs', label: 'Documenti', icon: FileText, content: <MaterialDocs materialId={id} /> },
    ] : []),
  ];

  const objectPage = (
      <ObjectPage
        backLabel={t('terms.material_plural')} onBack={goBack}
        title={form.name as string || `Nuovo ${t('terms.material')}`} code={!isNew ? (d?.code ?? undefined) : undefined}
        status={!isNew ? <StatusPill label={trackTag.label} token={trackTag.token} /> : undefined}
        onSave={(isNew ? can('material:create') : can('material:update')) ? save : undefined}
        onCancel={goBack} saving={busy}
      >
        <ObjectBox icon={Package} title="Anagrafica articolo">
          <div className="bgrid">
            <div className="bf c2"><span className="bl">Nome <span className="req">*</span></span><input className="bi" value={form.name as string ?? ''} onChange={(e) => set('name', e.target.value)} /></div>
            <div className="bf"><span className="bl">Codice</span><input className="bi mono" value={form.code as string ?? ''} placeholder={isNew ? 'auto se vuoto' : ''} onChange={(e) => set('code', e.target.value)} /></div>
            <div className="bf"><span className="bl">SKU</span><input className="bi mono" value={form.sku as string ?? ''} onChange={(e) => set('sku', e.target.value)} /></div>
            <div className="bf"><span className="bl">Unità di misura <span className="req">*</span></span>
              <PickerField value={unitLabel} placeholder="Scegli l'unità…" invalid={!form.unit} onOpen={() => setUnitPick(true)} /></div>
            <div className="bf c2"><span className="bl">Categoria</span>
              <PickerField value={categoryName} placeholder="Scegli la categoria…"
                onOpen={() => setCatPick(true)} onClear={() => set('categoryId', '')} /></div>
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
              <div className="bf"><span className="bl">Scorta minima</span><NumInput align="right" value={(attrs.min_stock as number) ?? null} onChange={(n) => setAttrs((a) => ({ ...a, min_stock: n ?? undefined }))} /></div>
              <div className="bf"><span className="bl">Giacenza totale</span><div className="bi green" style={{ justifyContent: 'flex-end' }}>{d?.qtyOnHand?.toLocaleString('it-IT') ?? '0'}</div></div>
              {/* WMS Fase 2: metriche fisiche unitarie → alimentano la % di riempimento delle ubicazioni (capacità per volume/peso). */}
              <div className="bf"><span className="bl">Peso unitario (kg)</span><NumInput align="right" value={phys.weight} onChange={(n) => setPhys((p) => ({ ...p, weight: n }))} placeholder="kg" /></div>
              <div className="bf"><span className="bl">Volume unitario (m³)</span><NumInput align="right" value={phys.volume} onChange={(n) => setPhys((p) => ({ ...p, volume: n }))} placeholder="m³" /></div>
              <div className="bf"><span className="bl">Pezzi per pallet (UDC)</span><NumInput align="right" value={phys.unitsPerUdc} onChange={(n) => setPhys((p) => ({ ...p, unitsPerUdc: n }))} placeholder="pz/UDC" /></div>
            </div>
          </ObjectBox>
        )}

        <AttrBoxes defs={fieldDefs.data?.items ?? []} attrs={attrs} setAttr={(k, v) => setAttrs((a) => ({ ...a, [k]: v }))}
          exclude={['category', 'item_type', 'min_stock', 'supplier_code']} />

        {!isNew && d && <RelatedTabs tabs={tabs} active={tab} onChange={setTab} />}
      </ObjectPage>
  );

  // Picker a lente (riuso delle liste vere in popup): UM e Categoria.
  const pickers = (
    <>
      <UnitPickerDialog open={unitPick} onClose={() => setUnitPick(false)}
        onPick={(us) => { const u = us[0]; if (u) { set('unit', u.code); void units.reload(); } }} />
      <CategoryPickerDialog open={catPick} onClose={() => setCatPick(false)}
        onPick={(c) => { set('categoryId', c.id); void categories.reload(); }} />
    </>
  );

  return embed ? <>{objectPage}{pickers}</> : (
    <Page title={isNew ? `Nuovo ${t('terms.material')}` : t('terms.material')} bleed>{objectPage}{pickers}</Page>
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

/** Galleria immagini articolo (Blocco J): upload multipart + miniature + primaria + elimina.
 * Le src usano item.url (presigned, browser-safe). Niente Content-Type a mano sul FormData. */
function MaterialImages({ materialId, canEdit }: { materialId: string; canEdit: boolean }) {
  const { data, loading, reload } = useApi<{ items: MaterialImageDto[] }>(`/materials/${materialId}/images`);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const items = data?.items ?? [];

  async function upload(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!list.length) { toast('Seleziona un file immagine', 'error'); return; }
    setBusy(true);
    try {
      for (const f of list) {
        const form = new FormData();
        form.append('file', f);
        await apiUpload(`/materials/${materialId}/images`, form);
      }
      toast(list.length > 1 ? `${list.length} immagini caricate` : 'Immagine caricata'); await reload();
    } catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }
  async function setPrimary(iid: string) {
    setBusy(true);
    try { await apiFetch(`/material-images/${iid}/set-primary`, { method: 'POST' }); toast('Immagine primaria aggiornata'); await reload(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function doDelete() {
    if (!delId) return;
    setBusy(true);
    try { await apiFetch(`/material-images/${delId}`, { method: 'DELETE' }); toast('Immagine eliminata'); setDelId(null); await reload(); }
    catch (e) { toast((e as Error).message, 'error'); setDelId(null); } finally { setBusy(false); }
  }

  if (loading) return <div className="dsx-empty">Carico…</div>;
  return (
    <div style={{ paddingTop: 8 }}>
      {canEdit && (
        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) void upload(e.dataTransfer.files); }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: busy ? 'default' : 'pointer',
            border: `2px dashed ${drag ? 'var(--brand)' : 'var(--line)'}`, borderRadius: 'var(--r-md)',
            background: drag ? 'var(--brand-wash)' : 'var(--surface-soft, transparent)', color: 'var(--ink-soft)',
            padding: '18px 14px', marginBottom: 14, fontSize: 13.5,
          }}>
          <Upload size={18} /> {busy ? 'Carico…' : 'Trascina qui le immagini o clicca per selezionarle'}
          <input type="file" accept="image/*" multiple style={{ display: 'none' }} disabled={busy}
            onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ''; }} />
        </label>
      )}
      {items.length === 0 ? (
        <div className="dsx-empty">Nessuna immagine.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {items.map((img) => (
            <div key={img.id} style={{
              position: 'relative', borderRadius: 'var(--r-md)', overflow: 'hidden',
              border: `2px solid ${img.isPrimary ? 'var(--brand)' : 'var(--line)'}`, background: 'var(--card)',
            }}>
              <div style={{ aspectRatio: '1 / 1', background: 'var(--surface-soft, #f3f4f6)', display: 'grid', placeItems: 'center' }}>
                {img.url
                  ? <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <ImageIcon size={28} style={{ color: 'var(--ink-faint)' }} />}
              </div>
              {img.isPrimary && <span className="chip" style={{ position: 'absolute', top: 6, left: 6, background: 'var(--brand-wash)', color: 'var(--brand)' }}><Star size={12} /> Primaria</span>}
              {canEdit && (
                <div style={{ display: 'flex', gap: 6, padding: 6, justifyContent: 'space-between' }}>
                  <button className="btn btn-ghost btn-sm" disabled={busy || img.isPrimary} title="Imposta come primaria" onClick={() => void setPrimary(img.id)}><Star size={14} /></button>
                  <button className="btn btn-ghost btn-sm" disabled={busy} title="Elimina" style={{ color: 'var(--danger)' }} onClick={() => setDelId(img.id)}><Trash2 size={14} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog open={!!delId} danger title="Eliminare l'immagine?" message="L'immagine verrà rimossa dall'articolo."
        confirmLabel="Elimina" busy={busy} onConfirm={() => void doDelete()} onCancel={() => setDelId(null)} />
    </div>
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
