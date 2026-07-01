/**
 * Magazzino — STANDARD entità (lista + CRUD scheda con master-detail a TAB):
 *  - MagazzinoPage: LISTA dei magazzini (EntityList, toolbar ricca). Click → scheda.
 *  - MagazzinoDetailPage: scheda magazzino (ObjectPage) + RelatedTabs:
 *      Articoli & Giacenze · Movimenti · Ubicazioni.
 *  - DocumentiPage: lista standard dei documenti di magazzino (carico/trasferimento/rettifica).
 * Niente più tab-bar custom: tutto sullo standard (memory feedback_entity_standard).
 */
import { useEffect, useMemo, useState } from 'react';
import { useHistory, useParams, useLocation } from 'react-router';
import { Plus, CheckCircle2, Trash2, Download, Lock, RotateCcw, Pencil, Warehouse, CornerDownRight, Boxes, ArrowLeftRight, FileText, Cpu, Layers, AlertTriangle, LayoutGrid } from 'lucide-react';
import type {
  StockBalanceDto, StockMovementDto, StockDocumentDto, StockLocationDto, MaterialDto, EngagementDto, PermissionKey,
  StockLotDto, PurchaseOrderDto, PickListDto,
} from '@sisuite/shared';
import { CAPACITY_KINDS } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { Modal } from '../ui/Modal';
import { PickerField } from '../ui/PickerField';
import { ResourcePickerDialog } from '../ui/ResourcePickerDialog';
import { EngagementPickerDialog } from '../ui/EngagementPickerDialog';
import { MaterialPickerDialog } from '../ui/MaterialPickerDialog';
import { EntityList, type ListColumn, type ExportField, type ListAction } from '../ui/EntityList';
import { EntityTree, type EntityTreeConfig } from '../ui/EntityTree';
import { BusyOverlay } from '../ui/BusyOverlay';
import { NumInput } from '../ui/NumInput';
import { useEntityActions } from '../ui/useEntityActions';
import { ObjectPage, ObjectBox, RelatedTabs, type RelTab } from '../ui/ObjectPage';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { AuditDialog } from '../ui/AuditDialog';
import { useApi, mutate, useArchivedView } from '../api/hooks';
import { ApiError, apiFetch } from '../api/client';
import { useLookups, lookupLabel } from '../context/Lookups';
import { swatchColor } from '../theme/palette';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';
import { downloadXlsx } from '../lib/xlsx';

const errMsg = (e: unknown) => (e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message);

const num = (v: unknown) => (v == null ? '' : Number(v).toLocaleString('it-IT', { maximumFractionDigits: 2 }));
const eur = (v: number | null) => (v == null ? '—' : `€ ${Number(v).toFixed(2)}`);
const KIND_FALLBACK: Record<string, string> = { warehouse: 'Magazzino', sub_location: 'Ubicazione', van: 'Furgone' };
/** hook: etichette/opzioni dei tipi ubicazione dal catalogo lookup (stock_location_kind),
 *  con fallback ai canonici. `only` filtra i canonici ammessi in un certo contesto. */
function useLocationKinds(only?: string[]) {
  const lk = useLookups();
  const all = lk.byCategory('stock_location_kind');
  const label = (k: string) => { const m = all.find((l) => l.code === k); return m ? lookupLabel(m) : (KIND_FALLBACK[k] ?? k); };
  const options = (only ? all.filter((l) => only.includes(l.code)) : all).map((l) => ({ value: l.code, label: lookupLabel(l) }));
  const meta: Record<string, { icon: string | null; color: string }> = {};
  all.forEach((l) => { meta[l.code] = { icon: l.icon, color: swatchColor(l.colorToken) }; });
  return { label, options, meta };
}

function usePerms() {
  const { user } = useAuth();
  const perms = new Set<PermissionKey>((user?.permissions ?? []) as PermissionKey[]);
  return { canManage: perms.has('stock:manage'), canMove: perms.has('stock:move') };
}

/** Props di SELEZIONE: la stessa lista magazzini/ubicazioni richiamata in pop-up da
 *  un documento. Radio (single)/checkbox (multi); "+ Nuovo" e click-riga aprono la
 *  CRUD ubicazione in modale annidato (non si lascia il documento). */
export interface LocationPickProps {
  pick: 'single' | 'multi';
  selectedIds?: string[];
  onToggleSelect?: (l: StockLocationDto) => void;
  onCreated?: (l: StockLocationDto) => void;
}

/* ===================================================================== */
/* LISTA MAGAZZINI (standard EntityList + toolbar)                        */
/* ===================================================================== */
export function MagazzinoPage({ pickProps }: { pickProps?: LocationPickProps } = {}) {
  const history = useHistory();
  const toast = useToast();
  const { canManage } = usePerms();
  const pick = pickProps?.pick;
  const { label: kindLabel } = useLocationKinds();
  const [q, setQ] = useState('');
  const [filterParam, setFilterParam] = useState<string | null>(null);
  const [sortParam, setSortParam] = useState<string | null>(null);
  const [crud, setCrud] = useState<{ id: string } | null>(null);   // CRUD ubicazione in modale (pick mode)
  const [archived, setArchived] = useArchivedView();
  const [clearTok, setClearTok] = useState(0);
  const [audit, setAudit] = useState<{ id: string; title: string } | null>(null);

  const params = new URLSearchParams({ top: '1' });
  if (q.trim()) params.set('q', q.trim());
  if (filterParam) params.set('filter', filterParam);
  if (sortParam) params.set('sort', sortParam);
  if (archived) params.set('archived', '1');
  const { data, loading, error, reload } = useApi<{ items: StockLocationDto[] }>(`/stock/locations?${params.toString()}`);

  const onRestore = async (sel: StockLocationDto[]) => {
    try {
      for (const r of sel) await mutate('POST', `/stock/locations/${r.id}/restore`);
      toast(sel.length > 1 ? `${sel.length} magazzini ripristinati` : 'Magazzino ripristinato');
      setClearTok((x) => x + 1); reload();
    } catch (e) { toast(errMsg(e) || 'Errore durante il ripristino', 'error'); }
  };
  const onPurge = async (sel: StockLocationDto[]) => {
    try {
      for (const r of sel) await mutate('DELETE', `/stock/locations/${r.id}/purge`);
      toast(sel.length > 1 ? `${sel.length} magazzini eliminati definitivamente` : 'Magazzino eliminato definitivamente');
      setClearTok((x) => x + 1); reload();
    } catch (e) { toast(errMsg(e) || 'Errore durante l\'eliminazione', 'error'); }
  };

  const { onDelete, onDuplicate } = useEntityActions<StockLocationDto>({
    basePath: '/stock/locations', reload, noun: 'magazzino', newPath: '/warehouses/new',
    // niente `code` (identificativo univoco) né `isDefault` (uno solo può esserlo): si reimpostano.
    duplicateBody: (r) => ({ name: r.name, kind: r.kind, resourceId: r.resourceId ?? null, note: r.note ?? null }),
  });

  const cols: ListColumn<StockLocationDto>[] = [
    { key: 'name', header: 'Nome', value: (r) => r.name, render: (r) => <span className="cellname">{r.name}</span> },
    { key: 'kind', header: 'Tipo', value: (r) => kindLabel(r.kind), render: (r) => <span className="chip">{kindLabel(r.kind)}</span> },
    { key: 'default', header: 'Predefinito', value: (r) => (r.isDefault ? 'sì' : ''), render: (r) => (r.isDefault ? <span className="chip">predefinito</span> : <span className="faint">—</span>) },
  ];
  const exportFields: ExportField<StockLocationDto>[] = cols.map((c) => ({ key: c.key, label: c.header, value: c.value! }));
  // "+ Nuovo": in pick apre la CRUD ubicazione in modale; altrimenti naviga.
  const rightActions: ListAction[] = pick
    ? (canManage ? [{ key: 'new', icon: Plus, tip: 'Nuova ubicazione', variant: 'primary' as const, onClick: () => setCrud({ id: 'new' }) }] : [])
    : [
        { key: 'docs', icon: FileText, tip: 'Documenti (carico/trasferimento/rettifica)', onClick: () => history.push('/stock/documents') },
        ...(canManage ? [{ key: 'new', icon: Plus, tip: 'Nuovo magazzino', variant: 'primary' as const, onClick: () => history.push('/warehouses/new') }] : []),
      ];
  // click riga: in pick apre la CRUD per modificare (poi si seleziona col radio); altrimenti naviga.
  const onRowClick = (r: StockLocationDto) => (pick ? setCrud({ id: r.id }) : history.push(`/warehouses/${r.id}`));

  const list = (
      <EntityList<StockLocationDto>
        title={pick ? undefined : 'Magazzini'} subtitle={pick ? undefined : 'Magazzini, furgoni e relative ubicazioni'}
        search={q} onSearch={setQ} searchPlaceholder="Cerca magazzino…"
        mode={pick ? (pick === 'multi' ? 'pick-multi' : 'pick-single') : undefined}
        selectedIds={pick ? pickProps?.selectedIds : undefined}
        onToggleSelect={pick ? pickProps?.onToggleSelect : undefined}
        columns={cols} rows={data?.items ?? []} loading={loading} error={error}
        onRowClick={onRowClick}
        onDelete={!pick && canManage ? onDelete : undefined}
        onDuplicate={!pick && canManage ? onDuplicate : undefined}
        archived={archived}
        onToggleArchived={pick ? undefined : (v) => { setArchived(v); setClearTok((x) => x + 1); }}
        onRestore={pick ? undefined : (canManage ? onRestore : undefined)}
        onPurge={pick ? undefined : (canManage ? onPurge : undefined)}
        onHistory={pick ? undefined : (row) => setAudit({ id: row.id, title: row.name })}
        archivedBadge={(row) => row.archivedAt ? `Archiviato${row.archivedByName ? ' da ' + row.archivedByName : ''}` : null}
        clearSelectionToken={clearTok}
        exportName="magazzini" exportFields={exportFields} rightActions={rightActions}
        filterFields={[
          { key: 'name', label: 'Nome', type: 'text', section: 'Magazzino' },
          { key: 'kind', label: 'Tipo', type: 'enum', section: 'Magazzino', values: [{ value: 'warehouse', label: 'Magazzino' }, { value: 'van', label: 'Furgone' }] },
        ]}
        onFilterChange={(s) => setFilterParam(s ? JSON.stringify(s) : null)}
        onSortChange={(s) => setSortParam(s.length ? JSON.stringify(s) : null)}
        emptyText="Nessun magazzino. Crea il primo con “Nuovo magazzino”." />
  );

  // CRUD magazzino/ubicazione in modale centrato (solo in pick: "+ Nuovo" o modifica riga)
  const crudModal = crud && (
    <Modal open size="xl" title={crud.id === 'new' ? 'Nuovo magazzino' : 'Modifica magazzino'} onClose={() => setCrud(null)}>
      <MagazzinoDetailPage embed={{
        id: crud.id,
        onClose: () => setCrud(null),
        onSaved: (l, wasNew) => { void reload(); if (wasNew) pickProps?.onCreated?.(l); },
      }} />
    </Modal>
  );

  const auditModal = audit && (
    <AuditDialog entity="stock_location" entityId={audit.id} title={audit.title} onClose={() => setAudit(null)} />
  );

  if (pick) return <>{list}{crudModal}</>;
  return <Page>{list}{crudModal}{auditModal}</Page>;
}

/* ===================================================================== */
/* SCHEDA MAGAZZINO (ObjectPage + RelatedTabs)                           */
/* ===================================================================== */
/** Modalità embedded: la stessa scheda CRUD richiamata in un Modal (es. "+ Nuovo"
 *  o modifica ubicazione dal popup di selezione di un documento). Mostra solo
 *  l'anagrafica (niente tab) e salva via POST/PATCH /stock/locations. */
export interface LocationEmbed {
  id: string;                                       // 'new' o uuid
  onClose: () => void;
  onSaved?: (l: StockLocationDto, wasNew: boolean) => void;
}

export function MagazzinoDetailPage({ embed }: { embed?: LocationEmbed } = {}) {
  const routeParams = useParams<{ id: string }>();
  const id = embed ? embed.id : routeParams.id;
  const isNew = id === 'new';
  const history = useHistory();
  const toast = useToast();
  const { canManage } = usePerms();
  const { options: whKinds } = useLocationKinds(['warehouse', 'van']);   // i magazzini-radice sono Magazzino o Furgone
  const detail = useApi<StockLocationDto>(isNew ? null : `/stock/locations/${id}`);
  const resources = useApi<{ items: { id: string; label: string }[] }>('/resources');
  const [pickTec, setPickTec] = useState(false);
  const [form, setForm] = useState<{ name: string; kind: string; isDefault: boolean; resourceId: string; code: string; note: string }>({ name: '', kind: 'warehouse', isDefault: false, resourceId: '', code: '', note: '' });
  const tecName = resources.data?.items.find((r) => r.id === form.resourceId)?.label ?? (form.resourceId ? '…' : '');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('balances');
  // Duplica (standard): "nuovo" precompilato da location.state.prefill (no embed, senza code/isDefault).
  const location = useLocation();
  const prefill = (!embed && isNew) ? (location.state as { prefill?: Record<string, unknown> } | null)?.prefill : undefined;
  const d = detail.data;
  useEffect(() => {
    if (d) { setForm({ name: d.name, kind: d.kind, isDefault: d.isDefault, resourceId: d.resourceId ?? '', code: d.code ?? '', note: d.note ?? '' }); return; }
    if (isNew && prefill) setForm({ name: (prefill.name as string) ?? '', kind: (prefill.kind as string) ?? 'warehouse', isDefault: false, resourceId: (prefill.resourceId as string) ?? '', code: '', note: (prefill.note as string) ?? '' });
  }, [d, isNew, prefill]);

  async function save() {
    if (!form.name.trim()) { toast('Inserisci un nome', 'error'); return; }
    setBusy(true);
    const body = { name: form.name.trim(), kind: form.kind, isDefault: form.isDefault, resourceId: form.resourceId || null, code: form.code.trim() || null, note: form.note.trim() || null };
    try {
      if (isNew) {
        const c = await mutate<StockLocationDto>('POST', '/stock/locations', body); toast('Magazzino creato');
        if (embed) { embed.onSaved?.(c, true); embed.onClose(); } else history.replace(`/warehouses/${c.id}`);
      } else {
        const u = await mutate<StockLocationDto>('PATCH', `/stock/locations/${id}`, body); toast('Salvato');
        if (embed) { embed.onSaved?.(u, false); embed.onClose(); } else void detail.reload();
      }
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  const goBack = embed ? embed.onClose : () => history.push('/stock');
  if (!isNew && detail.loading) return embed ? <div className="dsx-empty">Carico…</div> : <Page title="Magazzino"><Loading /></Page>;
  if (!isNew && detail.error) return embed ? <ErrorBox message={detail.error} /> : <Page title="Magazzino"><ErrorBox message={detail.error} /></Page>;

  const tabs: RelTab[] = [
    { key: 'balances', label: 'Articoli & giacenze', icon: Boxes, content: <GiacenzeTab locationId={id} /> },
    { key: 'movements', label: 'Movimenti', icon: ArrowLeftRight, content: <MovimentiTab locationId={id} warehouseName={form.name || 'Magazzino'} /> },
    { key: 'children', label: 'Ubicazioni', icon: CornerDownRight, content: <UbicazioniTab parentId={id} canManage={canManage} /> },
    { key: 'occupancy', label: 'Mappa occupazione', icon: LayoutGrid, content: <OccupancyMap warehouseId={id} warehouseName={form.name || 'Magazzino'} /> },
    { key: 'serials', label: 'Seriali', icon: Cpu, content: <SerialiTab locationId={id} /> },
    { key: 'lots', label: 'Lotti', icon: Layers, content: <LottiTab /> },
    { key: 'documents', label: 'Documenti', icon: FileText, content: <DocumentiTab /> },
  ];

  const objectPage = (
      <ObjectPage backLabel="Magazzini" onBack={goBack}
        title={isNew ? 'Nuovo magazzino' : (form.name || 'Magazzino')}
        status={!isNew && form.isDefault ? <StatusPill label="Predefinito" token="brand" /> : undefined}
        onSave={canManage ? save : undefined} onCancel={goBack} saving={busy}>
        <ObjectBox icon={Warehouse} title="Anagrafica magazzino">
          <div className="bgrid">
            <div className="bf c3"><span className="bl">Nome</span><input className="bi" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!canManage} placeholder="es. Magazzino centrale" /></div>
            <div className="bf"><span className="bl">Tipo</span><select className="bi" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} disabled={!canManage}>{whKinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></div>
            <div className="bf"><span className="bl">Codice</span><input className="bi" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!canManage} placeholder="es. MAG-01" /></div>
            <div className="bf"><span className="bl">Predefinito</span><select className="bi" value={form.isDefault ? '1' : '0'} onChange={(e) => setForm({ ...form, isDefault: e.target.value === '1' })} disabled={!canManage}><option value="0">No</option><option value="1">Sì</option></select></div>
            {form.kind === 'van' && <div className="bf c2"><span className="bl">Tecnico assegnato (furgone)</span>
              <PickerField value={tecName || null} placeholder="Scegli il tecnico…" disabled={!canManage}
                onOpen={() => setPickTec(true)} onClear={() => setForm({ ...form, resourceId: '' })} /></div>}
            <div className="bf c4"><span className="bl">Note</span><input className="bi" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} disabled={!canManage} placeholder="Note interne" /></div>
          </div>
        </ObjectBox>
        {!isNew && !embed && <RelatedTabs tabs={tabs} active={tab} onChange={setTab} />}
      </ObjectPage>
  );

  return <>
    {embed ? objectPage : <Page bleed>{objectPage}</Page>}
    <ResourcePickerDialog open={pickTec} onClose={() => setPickTec(false)}
      onPick={(rs) => { const r = rs[0]; if (r) setForm((f) => ({ ...f, resourceId: r.id })); }} />
  </>;
}

/* ── Tab: Articoli & giacenze — consultazione per UBICAZIONE (bin) ─────
 *  subtreeOf: mostra la giacenza in TUTTE le ubicazioni del magazzino (non solo
 *  la radice), con la catena dell'ubicazione, lo stato di riordino (sotto scorta
 *  minima) e un filtro. Vista per articolo→ubicazioni, stile WMS. */
function GiacenzeTab({ locationId }: { locationId: string }) {
  const bal = useApi<{ items: StockBalanceDto[] }>(`/stock/balance?subtreeOf=${locationId}`);
  const [q, setQ] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const all = bal.data?.items ?? [];
  if (bal.loading) return <Loading />;
  const ql = q.trim().toLowerCase();
  const rows = all.filter((r) =>
    (!ql || (r.materialName ?? '').toLowerCase().includes(ql) || (r.sku ?? '').toLowerCase().includes(ql) || (r.locationPath ?? '').toLowerCase().includes(ql))
    && (!lowOnly || r.lowStock));
  const totVal = rows.reduce((s, r) => s + r.valueOnHand, 0);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <input className="txt" style={{ maxWidth: 280 }} placeholder="Cerca articolo / SKU / ubicazione…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 12.5, color: 'var(--ink-soft)', cursor: 'pointer' }}>
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Solo sotto scorta minima
        </label>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink-faint)' }}>{rows.length} righe · valore {eur(totVal)}</span>
      </div>
      <table className="subt">
        <thead><tr><th>Articolo</th><th>Ubicazione</th><th className="num">Giacenza</th><th className="num">Tot. articolo</th><th className="num">Costo medio</th><th className="num">Valore</th></tr></thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={`${r.materialId}_${r.locationId}_${ri}`}>
              <td className="cellname">{r.materialName ?? '—'}{r.sku ? <span className="muted mono" style={{ fontSize: 11 }}> · {r.sku}</span> : null}
                {r.lowStock && <span className="et-badge" style={{ marginLeft: 6, background: 'var(--danger)', color: '#fff' }} title={`Sotto scorta minima (${num(r.reorderPoint ?? null)})`}>riordino</span>}</td>
              <td className="cellsub" title={r.locationPath ?? ''}>{r.locationPath ?? r.locationName ?? '—'}</td>
              <td className="num mono" style={r.qtyOnHand <= 0 ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>{num(r.qtyOnHand)} {r.unit ?? ''}</td>
              <td className="num mono" style={r.lowStock ? { color: 'var(--danger)', fontWeight: 700 } : { color: 'var(--ink-faint)' }}>{num(r.materialTotal ?? null)}</td>
              <td className="num mono">{eur(r.avgCost)}</td>
              <td className="num mono">{eur(r.valueOnHand)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6}><div className="dsx-empty">Nessuna giacenza {ql || lowOnly ? 'con questi filtri' : 'in questo magazzino'}.</div></td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ── Tab: Movimenti (immutabile: Nuovo movimento + Rettifica) ──────── */
interface MovDraft { typeCode: 'in' | 'out' | 'adjust'; materialId: string; materialName: string; materialUnit: string; materialWeight: number | null; materialVolume: number | null; materialUdc: number | null; locationId: string; locationName: string; quantity: number | null; unitCost: number | null; engagementId: string; occurredOn: string; note: string }
const emptyMov = (locationId: string, locationName: string): MovDraft => ({ typeCode: 'in', materialId: '', materialName: '', materialUnit: '', materialWeight: null, materialVolume: null, materialUdc: null, locationId, locationName, quantity: null, unitCost: null, engagementId: '', occurredOn: '', note: '' });

function MovimentiTab({ locationId, warehouseName }: { locationId: string; warehouseName: string }) {
  const toast = useToast();
  const lk = useLookups();
  const { canMove } = usePerms();
  const mv = useApi<{ items: StockMovementDto[] }>(`/stock/movements?locationId=${locationId}`);
  const mats = useApi<{ items: MaterialDto[] }>('/materials');
  const engs = useApi<{ items: EngagementDto[] }>('/engagements');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revId, setRevId] = useState<string | null>(null);
  const [d, setD] = useState<MovDraft>(emptyMov(locationId, warehouseName));
  const [pickEng, setPickEng] = useState(false);
  const [pickMat, setPickMat] = useState(false);
  const [pickSrc, setPickSrc] = useState(false);
  const [pickPut, setPickPut] = useState(false);
  const engName = (() => { const e = engs.data?.items.find((x) => x.id === d.engagementId); return e ? `${e.code ? e.code + ' · ' : ''}${e.title}` : (d.engagementId ? '…' : ''); })();
  const matById = useMemo(() => new Map((mats.data?.items ?? []).map((m) => [m.id, m])), [mats.data]);
  const rows = mv.data?.items ?? [];
  const openNew = () => { setD(emptyMov(locationId, warehouseName)); setOpen(true); };

  async function save() {
    if (!d.materialId || !d.quantity) { toast('Articolo e quantità obbligatori', 'error'); return; }
    if (!d.locationId) { toast('Scegli l\'ubicazione', 'error'); return; }
    setBusy(true);
    try {
      await mutate('POST', '/stock/movements', {
        typeCode: d.typeCode, materialId: d.materialId, locationId: d.locationId, quantity: d.quantity,
        unit: d.materialUnit || matById.get(d.materialId)?.unit || 'pz', unitCost: d.unitCost ?? undefined,
        engagementId: d.engagementId || undefined, occurredOn: d.occurredOn || undefined, note: d.note || undefined,
      });
      toast('Movimento registrato', 'success'); setOpen(false); await mv.reload();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function reverse(mid: string) {
    setBusy(true);
    try { await mutate('POST', `/stock/movements/${mid}/reverse`); toast('Rettifica registrata', 'success'); await mv.reload(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); setRevId(null); }
  }

  if (mv.loading) return <Loading />;
  return (
    <>
      <div className="toolbar" style={{ margin: '8px 0', gap: 8 }}>
        <span className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink-soft)' }}><Lock size={13} /> Registro immutabile — si corregge con una rettifica</span>
        <span className="spacer" style={{ flex: 1 }} />
        {canMove && <button className="btn btn-primary btn-sm" onClick={openNew}><Plus size={15} /> Nuovo movimento</button>}
      </div>
      <table className="subt">
        <thead><tr><th>Data</th><th>Tipo</th><th>Articolo</th><th className="num">Qtà</th><th className="num">Costo</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => { const l = lk.byId(r.typeId); return (
            <tr key={r.id}>
              <td className="cellsub">{new Date(r.occurredOn).toLocaleDateString('it-IT')}</td>
              <td>{l ? <StatusPill label={lk.labelOf(r.typeId)} token={l.colorToken} /> : '—'}</td>
              <td className="cellname">{r.materialName ?? '—'}</td>
              <td className="num mono">{num(r.quantity)} {r.unit}</td>
              <td className="num mono">{eur(r.unitCost)}</td>
              <td className="num">{canMove && <button className="btn btn-ghost btn-sm" onClick={() => setRevId(r.id)}><RotateCcw size={13} /> Rettifica</button>}</td>
            </tr>
          ); })}
          {rows.length === 0 && <tr><td colSpan={6}><div className="dsx-empty">Nessun movimento in questo magazzino.</div></td></tr>}
        </tbody>
      </table>

      <Modal open={open} title="Nuovo movimento" size="lg" onClose={() => setOpen(false)} footer={
        <><button className="btn btn-ghost" onClick={() => setOpen(false)}>Annulla</button><button className="btn btn-primary" disabled={busy} onClick={save}>Registra</button></>
      }>
        <div className="dsx">
          <div className="bgrid">
            <div className="bf c2"><span className="bl">Tipo <span className="req">*</span></span><select className="bi" value={d.typeCode} onChange={(e) => setD({ ...d, typeCode: e.target.value as MovDraft['typeCode'], locationId: '', locationName: '' })}><option value="in">Carico (+)</option><option value="out">Scarico (−)</option><option value="adjust">Rettifica (delta)</option></select></div>
            <div className="bf c2"><span className="bl">Articolo <span className="req">*</span></span>
              <PickerField value={d.materialName || null} placeholder="Scegli l'articolo…"
                onOpen={() => setPickMat(true)} onClear={() => setD({ ...d, materialId: '', materialName: '', materialUnit: '' })} /></div>
            <div className="bf c4"><span className="bl">{d.typeCode === 'in' ? 'Ubicazione — dove versare' : 'Ubicazione — da dove prelevare'} <span className="req">*</span></span>
              <PickerField value={d.locationName || null} placeholder={d.typeCode === 'in' ? 'Scegli dove versare…' : 'Scegli da dove prelevare…'}
                onOpen={() => {
                  if (d.typeCode !== 'in') { if (!d.materialId) { toast('Scegli prima l\'articolo: ti mostro solo le ubicazioni dove è disponibile', 'error'); return; } setPickSrc(true); }
                  else setPickPut(true);
                }} onClear={() => setD({ ...d, locationId: '', locationName: '' })} /></div>
            <div className="bf c2"><span className="bl">Quantità <span className="req">*</span>{d.materialUnit && <span style={{ color: 'var(--ink-faint)' }}> ({d.materialUnit})</span>}</span><NumInput align="right" value={d.quantity} onChange={(n) => setD({ ...d, quantity: n })} /></div>
            <div className="bf c2"><span className="bl">Costo unitario (opz.)</span><NumInput align="right" value={d.unitCost} onChange={(n) => setD({ ...d, unitCost: n })} placeholder="€" /></div>
            <div className="bf c2"><span className="bl">Commessa (opz.)</span>
              <PickerField value={engName || null} placeholder="Scegli la commessa…"
                onOpen={() => setPickEng(true)} onClear={() => setD({ ...d, engagementId: '' })} /></div>
            <div className="bf c2"><span className="bl">Data (opz.)</span><input className="bi mono" type="date" value={d.occurredOn} onChange={(e) => setD({ ...d, occurredOn: e.target.value })} /></div>
            <div className="bf c4"><span className="bl">Note (opz.)</span><input className="bi" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></div>
          </div>
        </div>
      </Modal>
      <ConfirmDialog open={!!revId} title="Rettifica / storna movimento" message="Crea un movimento compensativo (quantità opposta). L'originale resta (registro immutabile)."
        confirmLabel="Crea rettifica" busy={busy} onConfirm={() => revId && void reverse(revId)} onCancel={() => setRevId(null)} />
      <EngagementPickerDialog open={pickEng} onClose={() => setPickEng(false)}
        onPick={(es) => { const e = es[0]; if (e) setD((s) => ({ ...s, engagementId: e.id })); }} />
      <MaterialPickerDialog open={pickMat} onClose={() => setPickMat(false)}
        onPick={(ms) => { const m = ms[0]; if (m) setD((s) => ({ ...s, materialId: m.id, materialName: m.name, materialUnit: m.unit, materialWeight: m.weight ?? null, materialVolume: m.volume ?? null, materialUdc: m.unitsPerUdc ?? null })); }} />
      <SourceLocationPicker warehouseId={locationId} materialId={d.materialId} open={pickSrc} onClose={() => setPickSrc(false)}
        onPick={(l) => { setD((s) => ({ ...s, locationId: l.id, locationName: l.name })); setPickSrc(false); }} />
      <PutawayLocationPicker warehouseId={locationId} warehouseName={warehouseName} quantity={d.quantity}
        material={d.materialId ? { weight: d.materialWeight, volume: d.materialVolume, unitsPerUdc: d.materialUdc } : null}
        open={pickPut} onClose={() => setPickPut(false)}
        onPick={(l) => { setD((s) => ({ ...s, locationId: l.id, locationName: l.name })); setPickPut(false); }} />
    </>
  );
}

/* ── Tab: Ubicazioni (sotto-albero del magazzino) — EntityTree scoped ──
 *  STANDARD entità ad albero §9: "magazzino = radice". L'albero mostra le
 *  ubicazioni interne (a profondità libera): drag&drop, Sposta in…, ricerca,
 *  eliminazione a 3 modi, sequence. Campo extra «Tipo» (ubicazione/furgone). */
function ubicazioniConfig(parentId: string, kinds: { value: string; label: string }[], kindLabel: (k: string) => string, kindMeta: Record<string, { icon: string | null; color: string }>, onGenerateHere: (nodeId: string) => void): EntityTreeConfig {
  const def = kinds.find((o) => o.value === 'sub_location') ? 'sub_location' : (kinds[0]?.value ?? 'sub_location');
  return {
    entity: 'stock_location',
    endpoint: '/stock/locations',
    labels: { singular: 'Ubicazione', plural: 'Ubicazioni', subtitle: 'Ubicazioni interne del magazzino', newLabel: 'Nuova ubicazione' },
    permissions: { read: 'stock:read', write: 'stock:manage' },
    defaultIcon: 'corner-down-right',
    showAppearance: false,
    countNoun: 'articoli a giacenza',
    scopeQuery: { subtreeOf: parentId },
    rootParentId: parentId,                       // "radice" dell'albero = il magazzino
    createDefaults: { kind: def },
    nodeActions: [{ key: 'gen', label: 'Genera ubicazioni qui', icon: Layers, onClick: (n) => onGenerateHere(n.id) }],
    nodeAppearance: (n) => kindMeta[String(n.kind ?? def)] ?? {},
    rowMeta: (n) => {
      const fi = fillInfo(n);
      return [kindLabel(String(n.kind ?? def)), n.code ? `cod. ${n.code}` : '', fi ? fi.text : ''].filter(Boolean).join(' · ') || null;
    },
    extraCard: {
      init: (node) => ({ kind: (node?.kind as string) ?? def, code: (node?.code as string) ?? '', note: (node?.note as string) ?? '',
        capacityKind: (node?.capacityKind as string) ?? '', capacityMax: (node?.capacityMax as number) ?? null,
        capacityEnforce: !!node?.capacityEnforce, occupied: node?.occupied ?? null }),
      toBody: (vals) => ({ kind: vals.kind ?? def, code: (vals.code as string)?.trim() || null, note: (vals.note as string)?.trim() || null,
        capacityKind: (vals.capacityKind as string) || null,
        capacityMax: vals.capacityKind ? ((vals.capacityMax as number) ?? null) : null,
        capacityEnforce: !!vals.capacityEnforce }),
      render: (vals, set) => {
        const ck = String(vals.capacityKind ?? '');
        const unit = CAPACITY_KINDS.find((k) => k.code === ck)?.unit ?? '';
        const max = vals.capacityMax as number | null;
        const occ = vals.occupied as number | null;
        const pct = ck && max && occ != null ? Math.round((occ / max) * 100) : null;
        const over = pct != null && pct > 100;
        const barColor = over ? 'var(--danger, #c0392b)' : pct != null && pct >= 90 ? 'var(--warning, #e08a00)' : 'var(--brand, #1f7a4d)';
        return (
        <>
          <div className="tnc-field" style={{ border: '1.5px solid var(--line)', borderRadius: 10, padding: '9px 11px 7px' }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-faint)', marginBottom: 2 }}>Tipo</label>
            <select value={String(vals.kind ?? def)} onChange={(e) => set({ kind: e.target.value })}
              style={{ width: '100%', border: 0, outline: 'none', background: 'none', font: 'inherit', fontSize: 14, color: 'var(--ink)' }}>
              {kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>
          <div className="tnc-field" style={{ border: '1.5px solid var(--line)', borderRadius: 10, padding: '9px 11px 7px' }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-faint)', marginBottom: 2 }}>Codice</label>
            <input value={String(vals.code ?? '')} onChange={(e) => set({ code: e.target.value })} placeholder="es. A-02"
              style={{ width: '100%', border: 0, outline: 'none', background: 'none', font: 'inherit', fontSize: 14, color: 'var(--ink)' }} />
          </div>
          {/* WMS Fase 2 — capacità del bin */}
          <div className="tnc-field" style={{ gridColumn: '1 / -1', border: '1.5px solid var(--line)', borderRadius: 10, padding: '9px 11px 8px' }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-faint)', marginBottom: 4 }}>Capacità</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={ck} onChange={(e) => set({ capacityKind: e.target.value })}
                style={{ flex: '1 1 150px', border: '1px solid var(--line)', borderRadius: 8, height: 34, font: 'inherit', fontSize: 13.5, color: 'var(--ink)', background: 'var(--card)', padding: '0 8px' }}>
                <option value="">Nessun limite</option>
                {CAPACITY_KINDS.map((k) => <option key={k.code} value={k.code}>{k.label}</option>)}
              </select>
              {ck && <input type="number" inputMode="decimal" value={max ?? ''} placeholder={`max ${unit}`}
                onChange={(e) => set({ capacityMax: e.target.value === '' ? null : Number(e.target.value) })}
                style={{ flex: '0 1 120px', border: '1px solid var(--line)', borderRadius: 8, height: 34, font: 'inherit', fontSize: 13.5, color: 'var(--ink)', background: 'var(--card)', padding: '0 8px', textAlign: 'right' }} />}
              {ck && <label style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 12.5, color: 'var(--ink-soft)', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!vals.capacityEnforce} onChange={(e) => set({ capacityEnforce: e.target.checked })} /> Blocca al superamento
              </label>}
            </div>
            {pct != null && (
              <div style={{ marginTop: 7 }}>
                <div style={{ height: 8, borderRadius: 5, background: 'var(--neutral-wash, #eee)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: barColor, transition: 'width .2s' }} />
                </div>
                <div style={{ marginTop: 3, fontSize: 11.5, color: over ? 'var(--danger, #c0392b)' : 'var(--ink-faint)' }}>
                  {occ!.toLocaleString('it-IT')} / {max!.toLocaleString('it-IT')} {unit} · {pct}% pieno{over ? ' — oltre la capacità!' : ''}
                </div>
              </div>
            )}
          </div>
        </>
        );
      },
    },
  };
}

/** % di riempimento di un'ubicazione per il rowMeta dell'albero (WMS Fase 2). */
function fillInfo(n: Record<string, unknown>): { pct: number; text: string } | null {
  const kind = n.capacityKind as string | null; const max = n.capacityMax as number | null; const occ = n.occupied as number | null;
  if (!kind || !max || occ == null) return null;
  const pct = Math.round((occ / max) * 100);
  const unit = CAPACITY_KINDS.find((k) => k.code === kind)?.unit ?? '';
  return { pct, text: `${pct}% pieno${pct > 100 ? ' ⚠' : ''} (${occ.toLocaleString('it-IT')}/${max.toLocaleString('it-IT')} ${unit})` };
}

/* ── Picker Ubicazione (albero scoped al magazzino) per i movimenti/documenti ──
 *  Riusa l'albero VERO delle ubicazioni in modalità pick (radio + onPick), scoped
 *  al magazzino corrente. In cima l'opzione "il magazzino stesso" (la radice non è
 *  nel sotto-albero). Standard D-1: scegliere un'entità = riuso della sua lista vera. */
function UbicazionePickerModal({ warehouseId, warehouseName, open, onClose, onPick }: {
  warehouseId: string; warehouseName: string; open: boolean; onClose: () => void; onPick: (l: { id: string; name: string }) => void;
}) {
  const { options, label, meta } = useLocationKinds(['sub_location', 'van']);
  if (!open) return null;
  const cfg: EntityTreeConfig = { ...ubicazioniConfig(warehouseId, options, label, meta, () => {}), mode: 'pick', onPick: (n) => onPick({ id: n.id, name: (n as unknown as { pathLabel?: string }).pathLabel || n.name }) };
  return (
    <Modal open size="lg" title="Scegli l'ubicazione" onClose={onClose}>
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}
        onClick={() => onPick({ id: warehouseId, name: warehouseName })}>
        <Warehouse size={15} /> Usa il magazzino stesso ({warehouseName})
      </button>
      <EntityTree config={cfg} />
    </Modal>
  );
}

/* ── Prelievo GUIDATO (Fase B): solo ubicazioni dove l'articolo HA giacenza, ordinate
 *  FIFO (prima entrata) con la prima "consigliata". Riusa /stock/balance.
 *  warehouseId opzionale: se assente cerca in TUTTI i magazzini (documenti). */
export function SourceLocationPicker({ warehouseId, materialId, open, onClose, onPick }: {
  warehouseId?: string; materialId: string; open: boolean; onClose: () => void; onPick: (l: { id: string; name: string }) => void;
}) {
  const { data, loading } = useApi<{ items: StockBalanceDto[] }>(open && materialId ? `/stock/balance?materialId=${materialId}${warehouseId ? `&subtreeOf=${warehouseId}` : ''}` : null);
  if (!open) return null;
  const rows = (data?.items ?? []).filter((r) => r.qtyOnHand > 0)
    .sort((a, b) => (a.firstInAt ?? '9999-12-31').localeCompare(b.firstInAt ?? '9999-12-31') || b.qtyOnHand - a.qtyOnHand);
  return (
    <Modal open size="md" title="Preleva da — ubicazioni con giacenza (ordine FIFO)" onClose={onClose}>
      {loading ? <Loading />
        : rows.length === 0
          ? <div className="dsx-empty" style={{ padding: 20 }}>Questo articolo non ha giacenza in nessuna ubicazione di questo magazzino.</div>
          : <table className="subt"><thead><tr><th>Ubicazione</th><th className="num">Disponibile</th><th className="num">Prima entrata</th></tr></thead>
              <tbody>{rows.map((r, i) => (
                <tr key={r.locationId} style={{ cursor: 'pointer' }}
                  onClick={() => { onPick({ id: r.locationId, name: r.locationPath ?? r.locationName ?? '' }); onClose(); }}>
                  <td className="cellname">{r.locationPath ?? r.locationName}
                    {i === 0 && <span className="et-badge" style={{ marginLeft: 6, background: 'var(--brand)', color: '#fff' }}>consigliata</span>}</td>
                  <td className="num mono">{r.qtyOnHand.toLocaleString('it-IT')} {r.unit}</td>
                  <td className="num mono" style={{ color: 'var(--ink-faint)', fontSize: 12 }}>{r.firstInAt ? r.firstInAt.split('-').reverse().join('/') : '—'}</td>
                </tr>))}</tbody></table>}
    </Modal>
  );
}

/* ── Versamento GUIDATO / putaway (Fase B): elenca i bin con CAPACITÀ DISPONIBILE per la
 *  quantità da versare (criterio volume/peso/quantità), i più adatti in cima, con badge
 *  "consigliata". warehouseId opzionale (assente = tutti i magazzini, per i documenti);
 *  materialId opzionale → carica peso/volume dell'articolo per volume/peso. */
export function PutawayLocationPicker({ warehouseId, warehouseName, material, materialId, quantity, open, onClose, onPick }: {
  warehouseId?: string; warehouseName?: string; material?: { weight: number | null; volume: number | null; unitsPerUdc: number | null } | null;
  materialId?: string; quantity: number | null; open: boolean; onClose: () => void; onPick: (l: { id: string; name: string }) => void;
}) {
  const { data, loading } = useApi<{ items: StockLocationDto[] }>(open ? `/stock/locations${warehouseId ? `?subtreeOf=${warehouseId}` : ''}` : null);
  const matApi = useApi<MaterialDto>(open && materialId && !material ? `/materials/${materialId}` : null);
  if (!open) return null;
  const mat = material ?? (matApi.data ? { weight: matApi.data.weight, volume: matApi.data.volume, unitsPerUdc: matApi.data.unitsPerUdc } : null);
  const items = data?.items ?? [];
  const hasChild = new Set(items.map((i) => i.parentId).filter(Boolean) as string[]);
  const qty = quantity ?? 0;
  type Cand = { id: string; path: string; hasLimit: boolean; unit: string; remaining: number; fits: boolean; noStock: boolean };
  const cands: Cand[] = [
    // il magazzino stesso (radice): opzione senza limite, solo quando è scoped a un magazzino
    ...(warehouseId ? [{ id: warehouseId, path: warehouseName ?? 'Magazzino', hasLimit: false, unit: '', remaining: Infinity, fits: true, noStock: false }] : []),
    ...items.filter((n) => !hasChild.has(n.id) && n.holdsStock !== false).map((n) => {
      if (!n.capacityKind || n.capacityMax == null) return { id: n.id, path: n.pathLabel, hasLimit: false, unit: '', remaining: Infinity, fits: true, noStock: false };
      const unit = CAPACITY_KINDS.find((k) => k.code === n.capacityKind)?.unit ?? '';
      const perPiece = n.capacityKind === 'volume' ? (mat?.volume ?? 0)
        : n.capacityKind === 'weight' ? (mat?.weight ?? 0)
        : n.capacityKind === 'udc' ? (mat?.unitsPerUdc && mat.unitsPerUdc > 0 ? 1 / mat.unitsPerUdc : 0)
        : 1; // quantity
      const needed = qty * perPiece;
      const remaining = n.capacityMax - (n.occupied ?? 0);
      const noStock = n.capacityKind !== 'quantity' && !perPiece;
      return { id: n.id, path: n.pathLabel, hasLimit: true, unit, remaining, fits: remaining + 1e-9 >= needed, noStock };
    }),
  ].sort((a, b) => Number(b.fits) - Number(a.fits) || b.remaining - a.remaining);
  const firstFit = cands.findIndex((c) => c.fits);
  return (
    <Modal open size="md" title="Versa in — ubicazioni con spazio disponibile" onClose={onClose}>
      {loading || matApi.loading ? <Loading />
        : <table className="subt"><thead><tr><th>Ubicazione</th><th className="num">Spazio disponibile</th><th /></tr></thead>
            <tbody>{cands.map((c, i) => (
              <tr key={c.id} style={{ cursor: 'pointer', opacity: c.fits ? 1 : 0.55 }}
                onClick={() => { onPick({ id: c.id, name: c.path }); onClose(); }}>
                <td className="cellname">{c.path}
                  {i === firstFit && <span className="et-badge" style={{ marginLeft: 6, background: 'var(--brand)', color: '#fff' }}>consigliata</span>}</td>
                <td className="num mono">{!c.hasLimit ? <span style={{ color: 'var(--ink-faint)' }}>nessun limite</span>
                  : c.noStock ? <span style={{ color: 'var(--warning, #e08a00)' }}>manca peso/volume art.</span>
                  : `${c.remaining.toLocaleString('it-IT')} ${c.unit}`}</td>
                <td className="num">{c.hasLimit && !c.noStock && (c.fits
                  ? <span style={{ color: 'var(--brand, #1f7a4d)', fontSize: 12, fontWeight: 700 }}>entra</span>
                  : <span style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 700 }}>pieno</span>)}</td>
              </tr>))}</tbody></table>}
    </Modal>
  );
}

/* ── Picker Ubicazione ad ALBERO COMPLETO (tutti i magazzini + loro ubicazioni) ──
 *  Per i documenti (DDT/pick list): origine/destinazione possono essere un magazzino
 *  O una specifica ubicazione (bin). Riusa l'albero vero in pick mode (§D-1). */
export function LocationTreePickerDialog({ open, onClose, onPick }: {
  open: boolean; onClose: () => void; onPick: (l: { id: string; name: string }) => void;
}) {
  const { label, meta } = useLocationKinds(['warehouse', 'sub_location', 'van']);
  if (!open) return null;
  const cfg: EntityTreeConfig = {
    entity: 'stock_location', endpoint: '/stock/locations',
    labels: { singular: 'Ubicazione', plural: 'Ubicazioni', subtitle: 'Magazzini e relative ubicazioni', newLabel: 'Nuova ubicazione' },
    permissions: { read: 'stock:read', write: 'stock:manage' },
    defaultIcon: 'warehouse', showAppearance: false, countNoun: 'articoli a giacenza',
    nodeAppearance: (n) => meta[String(n.kind ?? 'sub_location')] ?? {},
    rowMeta: (n) => [label(String(n.kind ?? 'sub_location')), n.code ? `cod. ${String(n.code)}` : ''].filter(Boolean).join(' · ') || null,
    mode: 'pick', onPick: (n) => onPick({ id: n.id, name: (n as unknown as { pathLabel?: string }).pathLabel || n.name }),
  };
  return <Modal open size="lg" title="Scegli magazzino / ubicazione" onClose={onClose}><EntityTree config={cfg} /></Modal>;
}

/* ── Tab: Mappa occupazione (WMS Fase 3) — heatmap % riempimento per zona/scaffale ──
 *  Riusa /stock/locations?subtreeOf=<magazzino> (ogni nodo porta già occupied+capacity).
 *  Raggruppa le foglie (bin) per genitore (scaffale/zona): tiles colorati per % pieno
 *  + roll-up aggregato del gruppo (se i bin condividono lo stesso criterio). */
function heatColor(pct: number | null): string {
  if (pct == null) return 'var(--neutral-wash, #eceef1)';   // senza limite
  if (pct > 100) return '#c0392b';                          // oltre capacità
  if (pct >= 90) return '#e8590c';
  if (pct >= 75) return '#f0a020';
  if (pct >= 50) return '#94c11f';
  if (pct > 0) return '#5bb85b';
  return '#dcebdc';                                          // vuoto (0%)
}
const heatInk = (pct: number | null): string => (pct != null && pct >= 75 ? '#fff' : '#16241a');

function OccupancyMap({ warehouseId, warehouseName }: { warehouseId: string; warehouseName: string }) {
  const { data, loading, error } = useApi<{ items: StockLocationDto[] }>(`/stock/locations?subtreeOf=${warehouseId}`);
  const [onlyLimited, setOnlyLimited] = useState(false);
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  const items = data?.items ?? [];
  const fillOf = (n: StockLocationDto): number | null =>
    n.capacityKind && n.capacityMax && n.occupied != null ? Math.round((n.occupied / n.capacityMax) * 100) : null;
  const hasCap = (n: StockLocationDto): boolean => !!(n.capacityKind && n.capacityMax);
  const hasChild = new Set(items.map((i) => i.parentId).filter(Boolean) as string[]);
  // tile = OGNI nodo con un limite di capacità + le foglie (bin) senza figli. Così un'ubicazione
  // con capacità compare SEMPRE, anche se ha sotto-ubicazioni (container).
  const tiles = items.filter((i) => hasCap(i) || !hasChild.has(i.id));
  if (!tiles.length) return <div className="dsx-empty" style={{ padding: 24 }}>Nessuna ubicazione interna. Crea o genera ubicazioni nella tab «Ubicazioni».</div>;
  const nameById = new Map(items.map((i) => [i.id, i.name] as const));

  // raggruppa i tile per genitore (scaffale/zona)
  const groupsMap = new Map<string, StockLocationDto[]>();
  for (const lf of tiles) {
    const k = lf.parentId ?? warehouseId;
    if (!groupsMap.has(k)) groupsMap.set(k, []);
    groupsMap.get(k)!.push(lf);
  }
  let groups = [...groupsMap.entries()].map(([pid, bins]) => ({
    pid, name: pid === warehouseId ? warehouseName : (nameById.get(pid) ?? '—'),
    bins: bins.slice().sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name, 'it')),
  })).sort((a, b) => a.name.localeCompare(b.name, 'it'));
  if (onlyLimited) groups = groups.map((g) => ({ ...g, bins: g.bins.filter(hasCap) })).filter((g) => g.bins.length);

  // KPI su tutti i nodi con limite
  const limited = items.filter(hasCap);
  const pcts = limited.map(fillOf).filter((p): p is number => p != null);
  const avg = pcts.length ? Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length) : null;
  const over = pcts.filter((p) => p > 100).length;
  const near = pcts.filter((p) => p >= 90 && p <= 100).length;

  // aggregato per gruppo: somma solo i bin con lo STESSO criterio (altrimenti "criteri misti")
  const groupAgg = (bins: StockLocationDto[]) => {
    const lim = bins.filter((b) => b.capacityKind && b.capacityMax);
    if (!lim.length) return null;
    const kinds = new Set(lim.map((b) => b.capacityKind));
    if (kinds.size > 1) return { mixed: true as const };
    const occ = lim.reduce((s, b) => s + (b.occupied ?? 0), 0);
    const max = lim.reduce((s, b) => s + (b.capacityMax ?? 0), 0);
    const unit = CAPACITY_KINDS.find((k) => k.code === [...kinds][0])?.unit ?? '';
    return { mixed: false as const, pct: max ? Math.round((occ / max) * 100) : 0, occ, max, unit };
  };

  const kpi = (label: string, value: string, tone?: string) => (
    <div style={{ flex: '1 1 120px', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', background: 'var(--card)' }}>
      <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: tone ?? 'var(--ink)' }}>{value}</div>
    </div>
  );
  const legend: [string, number | null][] = [['vuoto', 0], ['<50%', 49], ['50–74%', 60], ['75–89%', 80], ['90–100%', 95], ['>100%', 120], ['senza limite', null]];

  return (
    <div style={{ marginTop: 8 }}>
      {/* KPI */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {kpi('Bin con limite', String(limited.length))}
        {kpi('Riempimento medio', avg == null ? '—' : `${avg}%`)}
        {kpi('Quasi pieni (≥90%)', String(near), near ? '#e8590c' : undefined)}
        {kpi('In eccesso (>100%)', String(over), over ? '#c0392b' : undefined)}
      </div>
      {/* Legenda + toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {legend.map(([lbl, p]) => (
            <span key={lbl} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--ink-soft)' }}>
              <span style={{ width: 13, height: 13, borderRadius: 3, background: heatColor(p), border: '1px solid var(--line)' }} />{lbl}
            </span>
          ))}
        </div>
        <label style={{ marginLeft: 'auto', display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 12.5, color: 'var(--ink-soft)', cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyLimited} onChange={(e) => setOnlyLimited(e.target.checked)} /> Solo con limite di capacità
        </label>
      </div>
      {limited.length === 0 && (
        <div className="dsx-empty" style={{ padding: 16, marginBottom: 12 }}>
          Nessun bin ha un limite di capacità. Impostalo nella scheda di un'ubicazione (tab «Ubicazioni» → apri un bin → sezione «Capacità»). La mappa mostra comunque la disposizione delle ubicazioni.
        </div>
      )}
      {/* Gruppi (scaffale/zona) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {groups.map((g) => {
          const agg = groupAgg(g.bins);
          return (
            <div key={g.pid} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '11px 13px', background: 'var(--card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{g.name}</span>
                <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>{g.bins.length} {g.bins.length === 1 ? 'ubicazione' : 'ubicazioni'}</span>
                {agg && !agg.mixed && (
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 200 }}>
                    <span style={{ flex: 1, height: 7, borderRadius: 5, background: 'var(--neutral-wash, #eee)', overflow: 'hidden', minWidth: 90 }}>
                      <span style={{ display: 'block', height: '100%', width: `${Math.min(agg.pct, 100)}%`, background: heatColor(agg.pct) }} />
                    </span>
                    <span style={{ fontSize: 11.5, color: agg.pct > 100 ? '#c0392b' : 'var(--ink-faint)', whiteSpace: 'nowrap' }}>
                      {agg.occ.toLocaleString('it-IT')}/{agg.max.toLocaleString('it-IT')} {agg.unit} · {agg.pct}%
                    </span>
                  </span>
                )}
                {agg && agg.mixed && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--ink-faint)' }}>criteri misti</span>}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {g.bins.map((b) => {
                  const pct = fillOf(b);
                  const unit = CAPACITY_KINDS.find((k) => k.code === b.capacityKind)?.unit ?? '';
                  const tip = b.capacityKind && b.capacityMax
                    ? `${b.name}\n${(b.occupied ?? 0).toLocaleString('it-IT')}/${b.capacityMax.toLocaleString('it-IT')} ${unit} · ${pct}% pieno${pct != null && pct > 100 ? ' — oltre la capacità' : ''}`
                    : `${b.name}\nNessun limite di capacità`;
                  return (
                    <div key={b.id} title={tip}
                      style={{ width: 76, height: 52, borderRadius: 8, background: heatColor(pct), color: heatInk(pct),
                        border: pct != null && pct > 100 ? '2px solid #7b1f15' : '1px solid rgba(0,0,0,.08)',
                        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 3, overflow: 'hidden', cursor: 'default' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, lineHeight: 1.1, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{b.code || b.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{pct == null ? '—' : `${pct}%`}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function UbicazioniTab({ parentId, canManage }: { parentId: string; canManage: boolean }) {
  const { options, label, meta } = useLocationKinds(['sub_location', 'van']);   // dentro un magazzino: ubicazioni o furgoni, non altri magazzini
  const [genTarget, setGenTarget] = useState<string | null>(null);   // parent sotto cui generare (magazzino o un nodo)
  return (
    <div style={{ marginTop: 8 }}>
      {canManage && <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setGenTarget(parentId)}><Layers size={15} /> Genera ubicazioni (scaffalatura)</button>
      </div>}
      <EntityTree config={ubicazioniConfig(parentId, options, label, meta, (id) => setGenTarget(id))} />
      {genTarget && <GeneraUbicazioniModal parentId={genTarget} onClose={() => setGenTarget(null)} />}
    </div>
  );
}

/* ── Genera massivo ubicazioni a coordinate (WMS Fase 1) ───────────────
 *  L'utente definisce le dimensioni attive (Corsia/Scaffale/Ripiano/Posizione)
 *  con un range da→a (numerico con zero-padding o alfabetico). Il sistema crea
 *  TUTTE le combinazioni come bin figli, con codice composto (es. A-01-03-B). */
type Dim = { key: 'aisle' | 'rack' | 'level' | 'position'; label: string; on: boolean; mode: 'num' | 'alpha'; from: string; to: string; pad: number };
function genValues(d: Dim): string[] {
  const out: string[] = [];
  if (d.mode === 'num') {
    const a = parseInt(d.from, 10), b = parseInt(d.to, 10);
    if (isNaN(a) || isNaN(b) || b < a || b - a > 299) return [];
    for (let i = a; i <= b; i++) out.push(String(i).padStart(d.pad || 0, '0'));
  } else {
    const a = (d.from || 'A').toUpperCase().charCodeAt(0), b = (d.to || 'A').toUpperCase().charCodeAt(0);
    if (b < a || b - a > 299) return [];
    for (let i = a; i <= b; i++) out.push(String.fromCharCode(i));
  }
  return out;
}
function GeneraUbicazioniModal({ parentId, onClose }: { parentId: string; onClose: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [sep, setSep] = useState('-');
  const [hier, setHier] = useState(false);   // false = bin piatti col code; true = nodi annidati
  const [dims, setDims] = useState<Dim[]>([
    { key: 'rack', label: 'Scaffale', on: true, mode: 'num', from: '1', to: '10', pad: 2 },
    { key: 'level', label: 'Ripiano', on: true, mode: 'num', from: '1', to: '5', pad: 2 },
    { key: 'position', label: 'Posizione', on: true, mode: 'alpha', from: 'A', to: 'C', pad: 0 },
    { key: 'aisle', label: 'Corsia', on: false, mode: 'alpha', from: 'A', to: 'B', pad: 0 },
  ]);
  const upd = (i: number, p: Partial<Dim>) => setDims((s) => s.map((d, j) => (j === i ? { ...d, ...p } : d)));
  const active = dims.filter((d) => d.on);
  const valuesByDim = active.map((d) => genValues(d));
  const total = valuesByDim.reduce((n, v) => n * (v.length || 0), 1);
  const sample = valuesByDim.every((v) => v.length)
    ? valuesByDim.reduce<string[]>((acc, vals) => acc.flatMap((p) => vals.map((v) => (p ? `${p}${sep}${v}` : v))), ['']).slice(0, 6)
    : [];

  async function generate() {
    if (!active.length || !total || valuesByDim.some((v) => !v.length)) { toast('Controlla i range (da/a validi)', 'error'); return; }
    setBusy(true);
    try {
      const res = await apiFetch<{ created: number; skipped: number; total: number }>(`/stock/locations/${parentId}/generate`, {
        method: 'POST',
        body: JSON.stringify({ separator: sep, hierarchical: hier, dims: active.map((d, i) => ({ key: d.key, label: d.label, values: valuesByDim[i] })) }),
      });
      toast(`Create ${res.created} ubicazioni${res.skipped ? ` (${res.skipped} già esistenti saltate)` : ''}`);
      onClose();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  }

  return (
    <><BusyOverlay open={busy} message="Genero le ubicazioni…" />
    <Modal open size="md" title="Genera ubicazioni a coordinate" onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Annulla</button>
      <button className="btn btn-primary" onClick={generate} disabled={busy || !total}>{busy ? 'Genero…' : `Genera ${total || 0}`}</button>
    </>}>
      <div className="dsx">
        <p className="faint" style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 12px' }}>
          Attiva le dimensioni e imposta i range: il sistema crea tutte le combinazioni come ubicazioni figlie, con codice composto.
        </p>
        {dims.map((d, i) => (
          <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--line-2)', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 110, fontWeight: 600 }}>
              <input type="checkbox" checked={d.on} onChange={(e) => upd(i, { on: e.target.checked })} /> {d.label}
            </label>
            <select className="bi" style={{ width: 110 }} value={d.mode} onChange={(e) => upd(i, { mode: e.target.value as Dim['mode'] })} disabled={!d.on}>
              <option value="num">Numerico</option><option value="alpha">Alfabetico</option>
            </select>
            <input className="bi" style={{ width: 64 }} value={d.from} onChange={(e) => upd(i, { from: e.target.value })} disabled={!d.on} placeholder="da" />
            <span>→</span>
            <input className="bi" style={{ width: 64 }} value={d.to} onChange={(e) => upd(i, { to: e.target.value })} disabled={!d.on} placeholder="a" />
            {d.mode === 'num' && <label style={{ fontSize: 12, color: 'var(--ink-faint)' }}>zeri: <input className="bi" style={{ width: 48 }} type="number" value={d.pad} onChange={(e) => upd(i, { pad: Number(e.target.value) })} disabled={!d.on} /></label>}
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Struttura</span>
          <select className="bi" style={{ width: 230 }} value={hier ? 'h' : 'f'} onChange={(e) => setHier(e.target.value === 'h')}>
            <option value="f">Piatta (un bin per posizione, codice composto)</option>
            <option value="h">Gerarchica (Scaffale › Ripiano › Posizione)</option>
          </select>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Separatore</span>
          <input className="bi" style={{ width: 50 }} value={sep} onChange={(e) => setSep(e.target.value)} />
          <span className="faint" style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>Totale: <b>{total || 0}</b> {hier ? 'bin foglia' : 'ubicazioni'}</span>
        </div>
        {sample.length > 0 && <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--ink-faint)' }}>
          {hier ? <>Albero: <span className="mono">{active.map((d) => `${d.label} ${valuesByDim[active.indexOf(d)]?.[0] ?? ''}`).join(' › ')}</span> …</>
            : <>Esempi: <span className="mono">{sample.join(', ')}{total > 6 ? ' …' : ''}</span></>}
        </div>}
      </div>
    </Modal></>
  );
}

/* ── Tab: Seriali per magazzino (GET /stock/locations/:id/serials) ───── */
interface LocationSerial { id: string; materialName: string | null; serial: string; status: string; workOrderCode: string | null; installedOn: string | null; hasSecret: boolean }
const SERIAL_PILL: Record<string, { label: string; token: string }> = {
  in_stock: { label: 'A magazzino', token: 'neutral' }, assigned: { label: 'Assegnato', token: 'info' },
  installed: { label: 'Installato', token: 'success' }, faulty: { label: 'Guasto / reso', token: 'danger' },
  returned: { label: 'Reso', token: 'warning' }, retired: { label: 'Dismesso', token: 'neutral' },
};
function SerialiTab({ locationId }: { locationId: string }) {
  const ser = useApi<{ items: LocationSerial[] }>(`/stock/locations/${locationId}/serials`);
  const rows = ser.data?.items ?? [];
  if (ser.loading) return <Loading />;
  return (
    <table className="subt">
      <thead><tr><th>Seriale</th><th>Articolo</th><th>Stato</th><th>Ordinativo</th><th>Installato il</th><th>Password</th></tr></thead>
      <tbody>
        {rows.map((s) => { const p = SERIAL_PILL[s.status] ?? { label: s.status, token: 'neutral' }; return (
          <tr key={s.id}>
            <td><span className="serialtag">{s.serial}</span></td>
            <td className="cellname">{s.materialName ?? '—'}</td>
            <td><StatusPill label={p.label} token={p.token} /></td>
            <td className="mono">{s.workOrderCode ?? '—'}</td>
            <td className="cellsub mono">{s.installedOn ? new Date(s.installedOn).toLocaleDateString('it-IT') : '—'}</td>
            <td>{s.hasSecret ? <span className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Lock size={12} /> protetta</span> : <span className="faint">—</span>}</td>
          </tr>
        ); })}
        {rows.length === 0 && <tr><td colSpan={6}><div className="dsx-empty">Nessun seriale in questo magazzino.</div></td></tr>}
      </tbody>
    </table>
  );
}

/* ── Tab: Lotti (stock-lots tenant-wide, evidenzia scadenze vicine) ──── */
function LottiTab() {
  const lots = useApi<{ items: StockLotDto[] }>('/stock-lots');
  const rows = lots.data?.items ?? [];
  const daysTo = (iso: string | null) => (iso == null ? null : Math.round((new Date(iso).getTime() - Date.now()) / 86400000));
  if (lots.loading) return <Loading />;
  return (
    <>
      <div className="toolbar" style={{ margin: '8px 0', gap: 8 }}>
        <span className="chip" style={{ color: 'var(--ink-soft)' }}>Lotti dell'organizzazione — le scadenze entro 30 giorni sono evidenziate</span>
      </div>
      <table className="subt">
        <thead><tr><th>Lotto</th><th>Articolo</th><th>Produzione</th><th>Scadenza</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const dd = daysTo(r.expiryDate);
            const near = dd != null && dd <= 30;
            return (
              <tr key={r.id}>
                <td className="cellname mono">{r.lotNumber}</td>
                <td>{r.materialName ?? '—'}</td>
                <td className="cellsub">{r.mfgDate ? new Date(r.mfgDate).toLocaleDateString('it-IT') : '—'}</td>
                <td className="mono" style={near ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>
                  {r.expiryDate ? new Date(r.expiryDate).toLocaleDateString('it-IT') : '—'}
                  {near && <AlertTriangle size={13} style={{ marginLeft: 6, verticalAlign: 'text-bottom' }} />}
                  {dd != null && dd < 0 && ' (scaduto)'}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={4}><div className="dsx-empty">Nessun lotto registrato.</div></td></tr>}
        </tbody>
      </table>
    </>
  );
}

/* ── Tab: Documenti (unifica documenti magazzino + ordini + pick list) ── */
interface UnifiedDoc { id: string; tipo: string; numero: string; stato: string; data: string }
function DocumentiTab() {
  const lk = useLookups();
  const docs = useApi<{ items: StockDocumentDto[] }>('/stock/documents');
  const pos = useApi<{ items: PurchaseOrderDto[] }>('/purchase-orders');
  const picks = useApi<{ items: PickListDto[] }>('/pick-lists');
  const dfmt = (iso: string) => new Date(iso).toLocaleDateString('it-IT');
  if (docs.loading || pos.loading || picks.loading) return <Loading />;
  const rows: UnifiedDoc[] = [
    ...(docs.data?.items ?? []).map((r) => ({ id: `doc_${r.id}`, tipo: lk.labelOf(r.typeId) || 'Documento', numero: r.number ?? 'bozza', stato: r.status, data: r.docDate })),
    ...(pos.data?.items ?? []).map((r) => ({ id: `po_${r.id}`, tipo: "Ordine d'acquisto", numero: r.number ?? 'bozza', stato: r.status, data: r.orderDate })),
    ...(picks.data?.items ?? []).map((r) => ({ id: `pk_${r.id}`, tipo: 'Pick list', numero: r.number ?? 'bozza', stato: r.status, data: r.createdAt })),
  ].sort((a, b) => (a.data < b.data ? 1 : -1));
  return (
    <>
      <div className="toolbar" style={{ margin: '8px 0', gap: 8 }}>
        <span className="chip" style={{ color: 'var(--ink-soft)' }}>Documenti, ordini d'acquisto e pick list (elenco dell'organizzazione)</span>
      </div>
      <table className="subt">
        <thead><tr><th>Tipo</th><th>Numero</th><th>Stato</th><th>Data</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><span className="chip">{r.tipo}</span></td>
              <td className="cellname mono">{r.numero}</td>
              <td><span className="chip">{r.stato}</span></td>
              <td className="cellsub">{dfmt(r.data)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4}><div className="dsx-empty">Nessun documento.</div></td></tr>}
        </tbody>
      </table>
    </>
  );
}

