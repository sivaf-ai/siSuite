/**
 * Magazzino — STANDARD entità (lista + CRUD scheda con master-detail a TAB):
 *  - MagazzinoPage: LISTA dei magazzini (EntityList, toolbar ricca). Click → scheda.
 *  - MagazzinoDetailPage: scheda magazzino (ObjectPage) + RelatedTabs:
 *      Articoli & Giacenze · Movimenti · Ubicazioni.
 *  - DocumentiPage: lista standard dei documenti di magazzino (carico/trasferimento/rettifica).
 * Niente più tab-bar custom: tutto sullo standard (memory feedback_entity_standard).
 */
import { useEffect, useMemo, useState } from 'react';
import { useHistory, useParams } from 'react-router';
import { Plus, CheckCircle2, Trash2, Download, Lock, RotateCcw, Pencil, Warehouse, CornerDownRight, Boxes, ArrowLeftRight, FileText } from 'lucide-react';
import type {
  StockBalanceDto, StockMovementDto, StockDocumentDto, StockLocationDto, MaterialDto, EngagementDto, PermissionKey,
} from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { EntityList, type ListColumn, type ExportField, type ListAction } from '../ui/EntityList';
import { ObjectPage, ObjectBox, RelatedTabs, type RelTab } from '../ui/ObjectPage';
import { Drawer } from '../ui/Drawer';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useApi, mutate } from '../api/hooks';
import { useLookups } from '../context/Lookups';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';
import { downloadXlsx } from '../lib/xlsx';

const num = (v: unknown) => (v == null ? '' : Number(v).toLocaleString('it-IT', { maximumFractionDigits: 2 }));
const eur = (v: number | null) => (v == null ? '—' : `€ ${Number(v).toFixed(2)}`);
const KIND_LABEL: Record<string, string> = { warehouse: 'Magazzino', sub_location: 'Ubicazione', van: 'Furgone' };

function usePerms() {
  const { user } = useAuth();
  const perms = new Set<PermissionKey>((user?.permissions ?? []) as PermissionKey[]);
  return { canManage: perms.has('stock:manage'), canMove: perms.has('stock:move') };
}

/* ===================================================================== */
/* LISTA MAGAZZINI (standard EntityList + toolbar)                        */
/* ===================================================================== */
export function MagazzinoPage() {
  const history = useHistory();
  const { canManage } = usePerms();
  const [q, setQ] = useState('');
  const [filterParam, setFilterParam] = useState<string | null>(null);
  const [sortParam, setSortParam] = useState<string | null>(null);

  const params = new URLSearchParams({ top: '1' });
  if (q.trim()) params.set('q', q.trim());
  if (filterParam) params.set('filter', filterParam);
  if (sortParam) params.set('sort', sortParam);
  const { data, loading, error, reload } = useApi<{ items: StockLocationDto[] }>(`/stock/locations?${params.toString()}`);

  async function onDelete(rows: StockLocationDto[]) {
    for (const r of rows) await mutate('DELETE', `/stock/locations/${r.id}`);
    await reload();
  }

  const cols: ListColumn<StockLocationDto>[] = [
    { key: 'name', header: 'Nome', value: (r) => r.name, render: (r) => <span className="cellname">{r.name}</span> },
    { key: 'kind', header: 'Tipo', value: (r) => KIND_LABEL[r.kind] ?? r.kind, render: (r) => <span className="chip">{KIND_LABEL[r.kind] ?? r.kind}</span> },
    { key: 'default', header: 'Predefinito', value: (r) => (r.isDefault ? 'sì' : ''), render: (r) => (r.isDefault ? <span className="chip">predefinito</span> : <span className="faint">—</span>) },
  ];
  const exportFields: ExportField<StockLocationDto>[] = cols.map((c) => ({ key: c.key, label: c.header, value: c.value! }));
  const rightActions: ListAction[] = [
    { key: 'docs', icon: FileText, tip: 'Documenti (carico/trasferimento/rettifica)', onClick: () => history.push('/stock/documents') },
    ...(canManage ? [{ key: 'new', icon: Plus, tip: 'Nuovo magazzino', variant: 'primary' as const, onClick: () => history.push('/warehouses/new') }] : []),
  ];

  return (
    <Page>
      <EntityList<StockLocationDto>
        title="Magazzini" subtitle="Magazzini, furgoni e relative ubicazioni"
        search={q} onSearch={setQ} searchPlaceholder="Cerca magazzino…"
        columns={cols} rows={data?.items ?? []} loading={loading} error={error}
        onRowClick={(r) => history.push(`/warehouses/${r.id}`)}
        onDelete={canManage ? onDelete : undefined}
        exportName="magazzini" exportFields={exportFields} rightActions={rightActions}
        filterFields={[
          { key: 'name', label: 'Nome', type: 'text', section: 'Magazzino' },
          { key: 'kind', label: 'Tipo', type: 'enum', section: 'Magazzino', values: [{ value: 'warehouse', label: 'Magazzino' }, { value: 'van', label: 'Furgone' }] },
        ]}
        onFilterChange={(s) => setFilterParam(s ? JSON.stringify(s) : null)}
        onSortChange={(s) => setSortParam(s.length ? JSON.stringify(s) : null)}
        emptyText="Nessun magazzino. Crea il primo con “Nuovo magazzino”." />
    </Page>
  );
}

/* ===================================================================== */
/* SCHEDA MAGAZZINO (ObjectPage + RelatedTabs)                           */
/* ===================================================================== */
export function MagazzinoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const history = useHistory();
  const toast = useToast();
  const { canManage } = usePerms();
  const detail = useApi<StockLocationDto>(isNew ? null : `/stock/locations/${id}`);
  const resources = useApi<{ items: { id: string; label: string }[] }>('/resources');
  const [form, setForm] = useState<{ name: string; kind: string; isDefault: boolean; resourceId: string }>({ name: '', kind: 'warehouse', isDefault: false, resourceId: '' });
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('balances');
  const d = detail.data;
  useEffect(() => { if (d) setForm({ name: d.name, kind: d.kind, isDefault: d.isDefault, resourceId: d.resourceId ?? '' }); }, [d]);

  async function save() {
    if (!form.name.trim()) { toast('Inserisci un nome', 'error'); return; }
    setBusy(true);
    const body = { name: form.name.trim(), kind: form.kind, isDefault: form.isDefault, resourceId: form.resourceId || null };
    try {
      if (isNew) { const c = await mutate<StockLocationDto>('POST', '/stock/locations', body); toast('Magazzino creato'); history.replace(`/warehouses/${c.id}`); }
      else { await mutate('PATCH', `/stock/locations/${id}`, body); toast('Salvato'); void detail.reload(); }
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  if (!isNew && detail.loading) return <Page title="Magazzino"><Loading /></Page>;
  if (!isNew && detail.error) return <Page title="Magazzino"><ErrorBox message={detail.error} /></Page>;

  const tabs: RelTab[] = [
    { key: 'balances', label: 'Articoli & giacenze', icon: Boxes, content: <GiacenzeTab locationId={id} /> },
    { key: 'movements', label: 'Movimenti', icon: ArrowLeftRight, content: <MovimentiTab locationId={id} /> },
    { key: 'children', label: 'Ubicazioni', icon: CornerDownRight, content: <UbicazioniTab parentId={id} canManage={canManage} /> },
  ];

  return (
    <Page bleed>
      <ObjectPage backLabel="Magazzini" onBack={() => history.push('/stock')}
        title={isNew ? 'Nuovo magazzino' : (form.name || 'Magazzino')}
        status={!isNew && form.isDefault ? <StatusPill label="Predefinito" token="brand" /> : undefined}
        onSave={canManage ? save : undefined} onCancel={() => history.push('/stock')} saving={busy}>
        <ObjectBox icon={Warehouse} title="Anagrafica magazzino">
          <div className="bgrid">
            <div className="bf c2"><span className="bl">Nome</span><div className="bi"><input className="flin" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!canManage} placeholder="es. Magazzino centrale" /></div></div>
            <div className="bf"><span className="bl">Tipo</span><div className="bi"><select className="flin" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} disabled={!canManage}><option value="warehouse">Magazzino</option><option value="van">Furgone</option></select></div></div>
            <div className="bf"><span className="bl">Predefinito</span><div className="bi"><select className="flin" value={form.isDefault ? '1' : '0'} onChange={(e) => setForm({ ...form, isDefault: e.target.value === '1' })} disabled={!canManage}><option value="0">No</option><option value="1">Sì</option></select></div></div>
            {form.kind === 'van' && <div className="bf c2"><span className="bl">Tecnico assegnato (furgone)</span><div className="bi"><select className="flin" value={form.resourceId} onChange={(e) => setForm({ ...form, resourceId: e.target.value })} disabled={!canManage}><option value="">—</option>{(resources.data?.items ?? []).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></div></div>}
          </div>
        </ObjectBox>
        {!isNew && <RelatedTabs tabs={tabs} active={tab} onChange={setTab} />}
      </ObjectPage>
    </Page>
  );
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
interface MovDraft { typeCode: 'in' | 'out' | 'adjust'; materialId: string; quantity: string; unitCost: string; engagementId: string; occurredOn: string; note: string }
const emptyMov = (): MovDraft => ({ typeCode: 'in', materialId: '', quantity: '', unitCost: '', engagementId: '', occurredOn: '', note: '' });

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
    if (!d.materialId || !Number(d.quantity)) { toast('Articolo e quantità obbligatori', 'error'); return; }
    setBusy(true);
    try {
      await mutate('POST', '/stock/movements', {
        typeCode: d.typeCode, materialId: d.materialId, locationId, quantity: Number(d.quantity),
        unit: matById.get(d.materialId)?.unit ?? 'pz', unitCost: d.unitCost ? Number(d.unitCost) : undefined,
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

      <Drawer open={open} title="Nuovo movimento" onClose={() => setOpen(false)} footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button className="btn btn-ghost" onClick={() => setOpen(false)}>Annulla</button><button className="btn btn-primary" disabled={busy} onClick={save}>Registra</button></div>
      }>
        <div className="field"><label>Tipo</label><select className="txt" value={d.typeCode} onChange={(e) => setD({ ...d, typeCode: e.target.value as MovDraft['typeCode'] })}><option value="in">Carico (+)</option><option value="out">Scarico (−)</option><option value="adjust">Rettifica (delta)</option></select></div>
        <div className="field"><label>Articolo<span className="req">*</span></label><select className="txt" value={d.materialId} onChange={(e) => setD({ ...d, materialId: e.target.value })}><option value="">Articolo…</option>{(mats.data?.items ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
        <div className="field"><label>Quantità<span className="req">*</span> {d.materialId && <span style={{ color: 'var(--ink-faint)' }}>({matById.get(d.materialId)?.unit})</span>}</label><input className="txt" type="number" value={d.quantity} onChange={(e) => setD({ ...d, quantity: e.target.value })} /></div>
        <div className="field"><label>Costo unitario (opz.)</label><input className="txt" type="number" value={d.unitCost} onChange={(e) => setD({ ...d, unitCost: e.target.value })} placeholder="€" /></div>
        <div className="field"><label>Commessa (opz.)</label><select className="txt" value={d.engagementId} onChange={(e) => setD({ ...d, engagementId: e.target.value })}><option value="">—</option>{(engs.data?.items ?? []).map((en) => <option key={en.id} value={en.id}>{en.code} · {en.title}</option>)}</select></div>
        <div className="field"><label>Data (opz.)</label><input className="txt" type="date" value={d.occurredOn} onChange={(e) => setD({ ...d, occurredOn: e.target.value })} /></div>
        <div className="field"><label>Note (opz.)</label><input className="txt" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></div>
      </Drawer>
      <ConfirmDialog open={!!revId} title="Rettifica / storna movimento" message="Crea un movimento compensativo (quantità opposta). L'originale resta (registro immutabile)."
        confirmLabel="Crea rettifica" busy={busy} onConfirm={() => revId && void reverse(revId)} onCancel={() => setRevId(null)} />
    </>
  );
}

/* ── Tab: Ubicazioni (figli del magazzino: CRUD) ───────────────────── */
function UbicazioniTab({ parentId, canManage }: { parentId: string; canManage: boolean }) {
  const toast = useToast();
  const kids = useApi<{ items: StockLocationDto[] }>(`/stock/locations?parentId=${parentId}`);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('sub_location');
  const [delRow, setDelRow] = useState<StockLocationDto | null>(null);
  const rows = kids.data?.items ?? [];

  const openNew = () => { setEditId(null); setName(''); setKind('sub_location'); setOpen(true); };
  const openEdit = (l: StockLocationDto) => { setEditId(l.id); setName(l.name); setKind(l.kind); setOpen(true); };
  async function save() {
    if (!name.trim()) { toast('Inserisci un nome', 'error'); return; }
    setBusy(true);
    try {
      if (editId) await mutate('PATCH', `/stock/locations/${editId}`, { name: name.trim(), kind });
      else await mutate('POST', '/stock/locations', { name: name.trim(), kind, parentId });
      toast('Salvato', 'success'); setOpen(false); await kids.reload();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function doDelete() { if (!delRow) return; setBusy(true); try { await mutate('DELETE', `/stock/locations/${delRow.id}`); setDelRow(null); await kids.reload(); } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); } }

  if (kids.loading) return <Loading />;
  return (
    <>
      <div className="toolbar" style={{ margin: '8px 0' }}><span className="spacer" style={{ flex: 1 }} />{canManage && <button className="btn btn-primary btn-sm" onClick={openNew}><Plus size={15} /> Nuova ubicazione</button>}</div>
      <table className="subt">
        <thead><tr><th>Nome</th><th>Tipo</th><th /></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="cellname"><CornerDownRight size={13} style={{ color: 'var(--ink-faint)', marginRight: 6 }} />{c.name}</td>
              <td><span className="chip">{KIND_LABEL[c.kind] ?? c.kind}</span></td>
              <td className="num">{canManage && <span style={{ display: 'inline-flex', gap: 6 }}><button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}><Pencil size={13} /></button><button className="btn btn-ghost btn-sm" onClick={() => setDelRow(c)}><Trash2 size={13} /></button></span>}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={3}><div className="dsx-empty">Nessuna ubicazione interna. Aggiungine una.</div></td></tr>}
        </tbody>
      </table>
      <Drawer open={open} title={editId ? 'Modifica ubicazione' : 'Nuova ubicazione'} onClose={() => setOpen(false)} footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button className="btn btn-ghost" onClick={() => setOpen(false)}>Annulla</button><button className="btn btn-primary" disabled={busy} onClick={save}>Salva</button></div>
      }>
        <div className="field"><label>Nome<span className="req">*</span></label><input className="txt" value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Scaffale A / Ripiano 2" /></div>
        <div className="field"><label>Tipo</label><select className="txt" value={kind} onChange={(e) => setKind(e.target.value)}><option value="sub_location">Ubicazione</option><option value="van">Furgone</option></select></div>
      </Drawer>
      <ConfirmDialog open={!!delRow} danger title="Eliminare?" message={`«${delRow?.name ?? ''}» verrà archiviato.`} confirmLabel="Elimina" busy={busy} onConfirm={() => void doDelete()} onCancel={() => setDelRow(null)} />
    </>
  );
}

/* ===================================================================== */
/* DOCUMENTI (lista standard + drawer carico/trasferimento/rettifica)    */
/* ===================================================================== */
interface LineDraft { materialId: string; quantity: string; unit: string; unitCost: string }
const emptyLine = (): LineDraft => ({ materialId: '', quantity: '', unit: '', unitCost: '' });

export function DocumentiPage() {
  const history = useHistory();
  const lk = useLookups();
  const { canManage } = usePerms();
  const toast = useToast();
  const docs = useApi<{ items: StockDocumentDto[] }>('/stock/documents');
  const locs = useApi<{ items: StockLocationDto[] }>('/stock/locations');
  const mats = useApi<{ items: MaterialDto[] }>('/materials');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<'receipt' | 'transfer' | 'adjustment'>('receipt');
  const [source, setSource] = useState('');
  const [dest, setDest] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const matById = useMemo(() => new Map((mats.data?.items ?? []).map((m) => [m.id, m])), [mats.data]);
  const reset = () => { setType('receipt'); setSource(''); setDest(''); setExternalRef(''); setLines([emptyLine()]); };
  const setLine = (i: number, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function saveDoc(confirmAfter: boolean) {
    const cleaned = lines.filter((l) => l.materialId && Number(l.quantity) > 0).map((l) => ({ materialId: l.materialId, quantity: Number(l.quantity), unit: l.unit || 'pz', unitCost: l.unitCost ? Number(l.unitCost) : undefined }));
    if (!cleaned.length) { toast('Aggiungi almeno una riga valida', 'error'); return; }
    if (type !== 'transfer' && !dest) { toast('Scegli l\'ubicazione/destinazione', 'error'); return; }
    if (type === 'transfer' && (!source || !dest || source === dest)) { toast('Trasferimento: origine e destinazione distinte', 'error'); return; }
    setBusy(true);
    try {
      const created = await mutate<{ id: string }>('POST', '/stock/documents', { typeCode: type, sourceLocationId: source || undefined, destLocationId: dest || undefined, externalRef: externalRef || undefined, lines: cleaned });
      if (confirmAfter) { const res = await mutate<{ number: string }>('POST', `/stock/documents/${created.id}/confirm`); toast(`Confermato: ${res.number}`, 'success'); } else toast('Bozza salvata', 'success');
      setOpen(false); reset(); await docs.reload();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function confirmDoc(did: string) { setBusy(true); try { const res = await mutate<{ number: string }>('POST', `/stock/documents/${did}/confirm`); toast(`Confermato: ${res.number}`, 'success'); await docs.reload(); } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); } }

  const cols: ListColumn<StockDocumentDto>[] = [
    { key: 'number', header: 'Numero', value: (r) => r.number ?? 'bozza', render: (r) => <span className="cellname">{r.number ?? <em style={{ color: 'var(--ink-faint)' }}>bozza</em>}</span> },
    { key: 'type', header: 'Tipo', value: (r) => lk.labelOf(r.typeId), render: (r) => { const l = lk.byId(r.typeId); return l ? <StatusPill label={lk.labelOf(r.typeId)} token={l.colorToken} /> : '—'; } },
    { key: 'date', header: 'Data', value: (r) => new Date(r.docDate).toLocaleDateString('it-IT'), render: (r) => <span className="cellsub">{new Date(r.docDate).toLocaleDateString('it-IT')}</span> },
    { key: 'status', header: 'Stato', value: (r) => r.status, render: (r) => <span className="chip">{r.status}</span> },
    { key: 'act', header: 'Azioni', render: (r) => (r.status === 'draft' && canManage ? <button className="btn btn-primary btn-sm" disabled={busy} onClick={(e) => { e.stopPropagation(); confirmDoc(r.id); }}><CheckCircle2 size={15} /> Conferma</button> : null) },
  ];
  const exportFields: ExportField<StockDocumentDto>[] = cols.filter((c) => c.value).map((c) => ({ key: c.key, label: c.header, value: c.value! }));
  const locOpts = locs.data?.items ?? [];
  const rightActions: ListAction[] = [
    { key: 'back', icon: Warehouse, tip: 'Magazzini', onClick: () => history.push('/stock') },
    ...(canManage ? [{ key: 'new', icon: Plus, tip: 'Nuovo documento', variant: 'primary' as const, onClick: () => { reset(); setOpen(true); } }] : []),
    { key: 'export', icon: Download, tip: 'Esporta', onClick: () => { void downloadXlsx('documenti', [{ name: 'Documenti', columns: exportFields.map((f) => ({ header: f.label, key: f.key, width: 20 })), rows: (docs.data?.items ?? []).map((r) => Object.fromEntries(exportFields.map((f) => [f.key, f.value(r) ?? '']))) }]); } },
  ];

  return (
    <Page>
      <EntityList<StockDocumentDto>
        title="Documenti di magazzino" subtitle="Carico · Trasferimento · Rettifica → alla conferma generano i movimenti"
        columns={cols} rows={docs.data?.items ?? []} loading={docs.loading} error={docs.error}
        selectable={false} exportName="documenti" exportFields={exportFields} rightActions={rightActions}
        emptyText="Nessun documento. Crea un carico, un trasferimento o una rettifica." />

      <Drawer open={open} title="Nuovo documento" onClose={() => setOpen(false)} footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button className="btn btn-ghost" disabled={busy} onClick={() => saveDoc(false)}>Salva bozza</button><button className="btn btn-primary" disabled={busy} onClick={() => saveDoc(true)}>Salva e conferma</button></div>
      }>
        <div className="field"><label>Tipo</label><select className="txt" value={type} onChange={(e) => setType(e.target.value as typeof type)}><option value="receipt">Carico</option><option value="transfer">Trasferimento</option><option value="adjustment">Rettifica (giacenza contata)</option></select></div>
        {type === 'transfer' && <div className="field"><label>Da (origine)</label><select className="txt" value={source} onChange={(e) => setSource(e.target.value)}><option value="">—</option>{locOpts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>}
        <div className="field"><label>{type === 'transfer' ? 'A (destinazione)' : type === 'adjustment' ? 'Ubicazione' : 'Magazzino destinazione'}</label><select className="txt" value={dest} onChange={(e) => setDest(e.target.value)}><option value="">—</option>{locOpts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        {type === 'receipt' && <div className="field"><label>Rif. DDT fornitore</label><input className="txt" value={externalRef} onChange={(e) => setExternalRef(e.target.value)} placeholder="es. DDT 1234" /></div>}
        <div className="field"><label>Righe</label></div>
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 80px 28px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <select className="txt" value={l.materialId} onChange={(e) => setLine(i, { materialId: e.target.value, unit: matById.get(e.target.value)?.unit ?? '' })}><option value="">Articolo…</option>{(mats.data?.items ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            <input className="txt" type="number" placeholder="qtà" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
            <input className="txt" type="number" placeholder="€" value={l.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value })} />
            <div className="act-icon danger" onClick={() => setLines((ls) => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)} title="Rimuovi"><Trash2 size={15} /></div>
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}><Plus size={15} /> Aggiungi riga</button>
      </Drawer>
    </Page>
  );
}
