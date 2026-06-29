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
import { Plus, CheckCircle2, Trash2, Download, Lock, RotateCcw, Pencil, Warehouse, CornerDownRight, Boxes, ArrowLeftRight, FileText, Cpu, Layers, AlertTriangle } from 'lucide-react';
import type {
  StockBalanceDto, StockMovementDto, StockDocumentDto, StockLocationDto, MaterialDto, EngagementDto, PermissionKey,
  StockLotDto, PurchaseOrderDto, PickListDto,
} from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { Modal } from '../ui/Modal';
import { EntityList, type ListColumn, type ExportField, type ListAction } from '../ui/EntityList';
import { EntityTree, type EntityTreeConfig } from '../ui/EntityTree';
import { NumInput } from '../ui/NumInput';
import { useEntityActions } from '../ui/useEntityActions';
import { ObjectPage, ObjectBox, RelatedTabs, type RelTab } from '../ui/ObjectPage';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { AuditDialog } from '../ui/AuditDialog';
import { useApi, mutate, useArchivedView } from '../api/hooks';
import { ApiError } from '../api/client';
import { useLookups, lookupLabel } from '../context/Lookups';
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
  return { label, options };
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
  const [form, setForm] = useState<{ name: string; kind: string; isDefault: boolean; resourceId: string; code: string; note: string }>({ name: '', kind: 'warehouse', isDefault: false, resourceId: '', code: '', note: '' });
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
    { key: 'movements', label: 'Movimenti', icon: ArrowLeftRight, content: <MovimentiTab locationId={id} /> },
    { key: 'children', label: 'Ubicazioni', icon: CornerDownRight, content: <UbicazioniTab parentId={id} canManage={canManage} /> },
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
            {form.kind === 'van' && <div className="bf c2"><span className="bl">Tecnico assegnato (furgone)</span><select className="bi" value={form.resourceId} onChange={(e) => setForm({ ...form, resourceId: e.target.value })} disabled={!canManage}><option value="">—</option>{(resources.data?.items ?? []).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></div>}
            <div className="bf c4"><span className="bl">Note</span><input className="bi" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} disabled={!canManage} placeholder="Note interne" /></div>
          </div>
        </ObjectBox>
        {!isNew && !embed && <RelatedTabs tabs={tabs} active={tab} onChange={setTab} />}
      </ObjectPage>
  );

  return embed ? objectPage : <Page bleed>{objectPage}</Page>;
}

/* ── Tab: Articoli & giacenze (sola lettura, derivata) ─────────────── */
function GiacenzeTab({ locationId }: { locationId: string }) {
  const bal = useApi<{ items: StockBalanceDto[] }>(`/stock/balance?locationId=${locationId}`);
  const rows = bal.data?.items ?? [];
  if (bal.loading) return <Loading />;
  return (
    <table className="subt">
      <thead><tr><th>Articolo</th><th className="num">Giacenza</th><th className="num">Costo medio</th><th className="num">Valore</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.materialId}_${r.locationId}`}>
            <td className="cellname">{r.materialName ?? '—'}</td>
            <td className="num mono" style={r.qtyOnHand <= 0 ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>{num(r.qtyOnHand)} {r.unit ?? ''}</td>
            <td className="num mono">{eur(r.avgCost)}</td>
            <td className="num mono">{eur(r.valueOnHand)}</td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={4}><div className="dsx-empty">Nessuna giacenza in questo magazzino.</div></td></tr>}
      </tbody>
    </table>
  );
}

/* ── Tab: Movimenti (immutabile: Nuovo movimento + Rettifica) ──────── */
interface MovDraft { typeCode: 'in' | 'out' | 'adjust'; materialId: string; quantity: number | null; unitCost: number | null; engagementId: string; occurredOn: string; note: string }
const emptyMov = (): MovDraft => ({ typeCode: 'in', materialId: '', quantity: null, unitCost: null, engagementId: '', occurredOn: '', note: '' });

function MovimentiTab({ locationId }: { locationId: string }) {
  const toast = useToast();
  const lk = useLookups();
  const { canMove } = usePerms();
  const mv = useApi<{ items: StockMovementDto[] }>(`/stock/movements?locationId=${locationId}`);
  const mats = useApi<{ items: MaterialDto[] }>('/materials');
  const engs = useApi<{ items: EngagementDto[] }>('/engagements');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revId, setRevId] = useState<string | null>(null);
  const [d, setD] = useState<MovDraft>(emptyMov());
  const matById = useMemo(() => new Map((mats.data?.items ?? []).map((m) => [m.id, m])), [mats.data]);
  const rows = mv.data?.items ?? [];

  async function save() {
    if (!d.materialId || !d.quantity) { toast('Articolo e quantità obbligatori', 'error'); return; }
    setBusy(true);
    try {
      await mutate('POST', '/stock/movements', {
        typeCode: d.typeCode, materialId: d.materialId, locationId, quantity: d.quantity,
        unit: matById.get(d.materialId)?.unit ?? 'pz', unitCost: d.unitCost ?? undefined,
        engagementId: d.engagementId || undefined, occurredOn: d.occurredOn || undefined, note: d.note || undefined,
      });
      toast('Movimento registrato', 'success'); setOpen(false); setD(emptyMov()); await mv.reload();
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
        {canMove && <button className="btn btn-primary btn-sm" onClick={() => { setD(emptyMov()); setOpen(true); }}><Plus size={15} /> Nuovo movimento</button>}
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

      <Modal open={open} title="Nuovo movimento" size="md" onClose={() => setOpen(false)} footer={
        <><button className="btn btn-ghost" onClick={() => setOpen(false)}>Annulla</button><button className="btn btn-primary" disabled={busy} onClick={save}>Registra</button></>
      }>
        <div className="bgrid">
          <div className="bf c2"><span className="bl">Tipo</span><select className="bi" value={d.typeCode} onChange={(e) => setD({ ...d, typeCode: e.target.value as MovDraft['typeCode'] })}><option value="in">Carico (+)</option><option value="out">Scarico (−)</option><option value="adjust">Rettifica (delta)</option></select></div>
          <div className="bf c2"><span className="bl">Articolo <span className="req">*</span></span><select className="bi" value={d.materialId} onChange={(e) => setD({ ...d, materialId: e.target.value })}><option value="">Articolo…</option>{(mats.data?.items ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
          <div className="bf c2"><span className="bl">Quantità <span className="req">*</span>{d.materialId && <span style={{ color: 'var(--ink-faint)' }}> ({matById.get(d.materialId)?.unit})</span>}</span><NumInput align="right" value={d.quantity} onChange={(n) => setD({ ...d, quantity: n })} /></div>
          <div className="bf c2"><span className="bl">Costo unitario (opz.)</span><NumInput align="right" value={d.unitCost} onChange={(n) => setD({ ...d, unitCost: n })} placeholder="€" /></div>
          <div className="bf c2"><span className="bl">Commessa (opz.)</span><select className="bi" value={d.engagementId} onChange={(e) => setD({ ...d, engagementId: e.target.value })}><option value="">—</option>{(engs.data?.items ?? []).map((en) => <option key={en.id} value={en.id}>{en.code} · {en.title}</option>)}</select></div>
          <div className="bf c2"><span className="bl">Data (opz.)</span><input className="bi mono" type="date" value={d.occurredOn} onChange={(e) => setD({ ...d, occurredOn: e.target.value })} /></div>
          <div className="bf c4"><span className="bl">Note (opz.)</span><input className="bi" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></div>
        </div>
      </Modal>
      <ConfirmDialog open={!!revId} title="Rettifica / storna movimento" message="Crea un movimento compensativo (quantità opposta). L'originale resta (registro immutabile)."
        confirmLabel="Crea rettifica" busy={busy} onConfirm={() => revId && void reverse(revId)} onCancel={() => setRevId(null)} />
    </>
  );
}

/* ── Tab: Ubicazioni (sotto-albero del magazzino) — EntityTree scoped ──
 *  STANDARD entità ad albero §9: "magazzino = radice". L'albero mostra le
 *  ubicazioni interne (a profondità libera): drag&drop, Sposta in…, ricerca,
 *  eliminazione a 3 modi, sequence. Campo extra «Tipo» (ubicazione/furgone). */
function ubicazioniConfig(parentId: string, kinds: { value: string; label: string }[], kindLabel: (k: string) => string): EntityTreeConfig {
  const def = kinds.find((o) => o.value === 'sub_location') ? 'sub_location' : (kinds[0]?.value ?? 'sub_location');
  return {
    entity: 'stock_location',
    endpoint: '/stock/locations',
    labels: { singular: 'Ubicazione', plural: 'Ubicazioni', subtitle: 'Ubicazioni interne del magazzino' },
    permissions: { read: 'stock:read', write: 'stock:manage' },
    defaultIcon: 'corner-down-right',
    showAppearance: false,
    countNoun: 'articoli a giacenza',
    scopeQuery: { subtreeOf: parentId },
    rootParentId: parentId,                       // "radice" dell'albero = il magazzino
    createDefaults: { kind: def },
    rowMeta: (n) => [kindLabel(String(n.kind ?? def)), n.code ? `cod. ${n.code}` : ''].filter(Boolean).join(' · ') || null,
    extraCard: {
      init: (node) => ({ kind: (node?.kind as string) ?? def, code: (node?.code as string) ?? '', note: (node?.note as string) ?? '' }),
      toBody: (vals) => ({ kind: vals.kind ?? def, code: (vals.code as string)?.trim() || null, note: (vals.note as string)?.trim() || null }),
      render: (vals, set) => (
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
        </>
      ),
    },
  };
}
function UbicazioniTab({ parentId }: { parentId: string; canManage: boolean }) {
  const { options, label } = useLocationKinds(['sub_location', 'van']);   // dentro un magazzino: ubicazioni o furgoni, non altri magazzini
  return <div style={{ marginTop: 8 }}><EntityTree config={ubicazioniConfig(parentId, options, label)} /></div>;
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

