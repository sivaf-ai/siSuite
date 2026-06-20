/**
 * MagazzinoPage (PIANO motore §5) — CRUD COMPLETI. Quattro schede:
 *  - Giacenze   (sola lettura, derivata; click riga → drill-down sui movimenti che l'hanno generata)
 *  - Movimenti  (registro IMMUTABILE: si crea "Nuovo movimento" a mano, si corregge con "Rettifica/Storna"
 *               = movimento compensativo; mai edit/delete — vietato dal trigger DB)
 *  - Documenti  (carico/trasferimento/rettifica → alla conferma generano i movimenti, numerati)
 *  - Ubicazioni (magazzini/ubicazioni: crea/modifica/elimina-soft)
 * Ogni entità ha la sua strada MANUALE (l'AI è una seconda strada, non l'unica).
 */
import { useMemo, useState } from 'react';
import { Plus, CheckCircle2, Trash2, Download, Lock, RotateCcw, Pencil } from 'lucide-react';
import type {
  StockBalanceDto, StockMovementDto, StockDocumentDto, StockLocationDto, MaterialDto, EngagementDto, PermissionKey,
} from '@sisuite/shared';
import { Page } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { EntityList, type ListColumn, type ExportField, type ListAction } from '../ui/EntityList';
import { Drawer } from '../ui/Drawer';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useApi, mutate } from '../api/hooks';
import { useLookups } from '../context/Lookups';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';
import { downloadXlsx } from '../lib/xlsx';

type Tab = 'balance' | 'movements' | 'documents' | 'locations';
const TABS: { key: Tab; label: string }[] = [
  { key: 'balance', label: 'Giacenze' },
  { key: 'movements', label: 'Movimenti' },
  { key: 'documents', label: 'Documenti' },
  { key: 'locations', label: 'Ubicazioni' },
];
const num = (v: unknown) => (v == null ? '' : Number(v).toLocaleString('it-IT', { maximumFractionDigits: 2 }));
const eur = (v: number | null) => (v == null ? '—' : `€ ${Number(v).toFixed(2)}`);

export interface Drill { materialId: string; materialName: string; locationId: string; locationName: string }

async function exportAll<T>(name: string, sheet: string, fields: ExportField<T>[], rows: T[]) {
  if (!rows.length) return;
  await downloadXlsx(name, [{
    name: sheet.slice(0, 28),
    columns: fields.map((f) => ({ header: f.label, key: f.key, width: 20 })),
    rows: rows.map((r) => Object.fromEntries(fields.map((f) => [f.key, f.value(r) ?? '']))),
  }]);
}

export function MagazzinoPage() {
  const lk = useLookups();
  const { user } = useAuth();
  const perms = new Set<PermissionKey>((user?.permissions ?? []) as PermissionKey[]);
  const canManage = perms.has('stock:manage');
  const canMove = perms.has('stock:move');
  const [tab, setTab] = useState<Tab>('balance');
  const [drill, setDrill] = useState<Drill | null>(null);

  return (
    <Page title="Magazzino">
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="seg">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => { setTab(t.key); if (t.key !== 'movements') setDrill(null); }}>{t.label}</button>
          ))}
        </div>
      </div>
      {tab === 'balance' && <BalanceTab onDrill={(d) => { setDrill(d); setTab('movements'); }} />}
      {tab === 'movements' && <MovementsTab lk={lk} canMove={canMove} drill={drill} onClearDrill={() => setDrill(null)} />}
      {tab === 'documents' && <DocumentsTab lk={lk} canManage={canManage} />}
      {tab === 'locations' && <LocationsTab canManage={canManage} />}
    </Page>
  );
}

/* ── Giacenze (sola lettura + drill-down) ──────────────────────────── */
type BalanceRow = StockBalanceDto & { id: string };
function BalanceTab({ onDrill }: { onDrill: (d: Drill) => void }) {
  const locs = useApi<{ items: StockLocationDto[] }>('/stock/locations');
  const [loc, setLoc] = useState('');
  const bal = useApi<{ items: StockBalanceDto[] }>(`/stock/balance${loc ? `?locationId=${loc}` : ''}`);
  const cols: ListColumn<BalanceRow>[] = [
    { key: 'material', header: 'Articolo', value: (r) => r.materialName ?? '', render: (r) => <span className="cellname">{r.materialName ?? '—'}</span> },
    { key: 'location', header: 'Ubicazione', value: (r) => r.locationName ?? '', render: (r) => <span className="cellsub">{r.locationName ?? '—'}</span> },
    { key: 'qty', header: 'Giacenza', num: true, value: (r) => `${num(r.qtyOnHand)} ${r.unit ?? ''}`.trim(), render: (r) => (
      <span className="mono" style={r.qtyOnHand <= 0 ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>{num(r.qtyOnHand)} {r.unit ?? ''}</span>
    ) },
    { key: 'avg', header: 'Costo medio', num: true, value: (r) => eur(r.avgCost), render: (r) => <span className="mono">{eur(r.avgCost)}</span> },
    { key: 'value', header: 'Valore', num: true, value: (r) => eur(r.valueOnHand), render: (r) => <span className="mono">{eur(r.valueOnHand)}</span> },
  ];
  const exportFields: ExportField<BalanceRow>[] = cols.map((c) => ({ key: c.key, label: c.header, value: c.value! }));
  const rows: BalanceRow[] = (bal.data?.items ?? []).map((r) => ({ ...r, id: `${r.materialId}_${r.locationId}` }));
  const rightActions: ListAction[] = [
    { key: 'export', icon: Download, tip: 'Esporta tutto', onClick: () => void exportAll('giacenze', 'Giacenze', exportFields, rows) },
  ];
  return (
    <>
      <div className="toolbar" style={{ marginBottom: 10 }}>
        <select className="txt" style={{ maxWidth: 280 }} value={loc} onChange={(e) => setLoc(e.target.value)}>
          <option value="">Tutte le ubicazioni</option>
          {(locs.data?.items ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <span className="help" style={{ marginLeft: 'auto', color: 'var(--ink-faint)', fontSize: 12 }}>La giacenza è derivata dai movimenti — clic su una riga per vedere come si è formata.</span>
      </div>
      <EntityList<BalanceRow>
        columns={cols} rows={rows} loading={bal.loading} error={bal.error}
        selectable={false}
        onRowClick={(r) => onDrill({ materialId: r.materialId, materialName: r.materialName ?? '', locationId: r.locationId, locationName: r.locationName ?? '' })}
        exportName="giacenze" exportFields={exportFields} rightActions={rightActions}
        emptyText="Nessuna giacenza. Registra un carico per popolare il magazzino." />
    </>
  );
}

/* ── Movimenti (immutabile: Nuovo movimento + Rettifica/Storna) ─────── */
interface MovDraft { typeCode: 'in' | 'out' | 'adjust'; materialId: string; locationId: string; quantity: string; unitCost: string; engagementId: string; occurredOn: string; note: string }
const emptyMov = (): MovDraft => ({ typeCode: 'in', materialId: '', locationId: '', quantity: '', unitCost: '', engagementId: '', occurredOn: '', note: '' });

function MovementsTab({ lk, canMove, drill, onClearDrill }: { lk: ReturnType<typeof useLookups>; canMove: boolean; drill: Drill | null; onClearDrill: () => void }) {
  const toast = useToast();
  const qs = drill ? `?materialId=${drill.materialId}&locationId=${drill.locationId}` : '';
  const mv = useApi<{ items: StockMovementDto[] }>(`/stock/movements${qs}`);
  const mats = useApi<{ items: MaterialDto[] }>('/materials');
  const locs = useApi<{ items: StockLocationDto[] }>('/stock/locations');
  const engs = useApi<{ items: EngagementDto[] }>('/engagements');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revId, setRevId] = useState<string | null>(null);
  const [d, setD] = useState<MovDraft>(emptyMov());
  const matById = useMemo(() => new Map((mats.data?.items ?? []).map((m) => [m.id, m])), [mats.data]);

  async function save() {
    if (!d.materialId || !d.locationId || !Number(d.quantity)) { toast('Articolo, ubicazione e quantità sono obbligatori', 'error'); return; }
    setBusy(true);
    try {
      await mutate('POST', '/stock/movements', {
        typeCode: d.typeCode, materialId: d.materialId, locationId: d.locationId,
        quantity: Number(d.quantity), unit: matById.get(d.materialId)?.unit ?? 'pz',
        unitCost: d.unitCost ? Number(d.unitCost) : undefined,
        engagementId: d.engagementId || undefined, occurredOn: d.occurredOn || undefined, note: d.note || undefined,
      });
      toast('Movimento registrato', 'success');
      setOpen(false); setD(emptyMov()); await mv.reload();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function reverse(id: string) {
    setBusy(true);
    try { await mutate('POST', `/stock/movements/${id}/reverse`); toast('Rettifica registrata (movimento compensativo)', 'success'); await mv.reload(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); setRevId(null); }
  }

  const cols: ListColumn<StockMovementDto>[] = [
    { key: 'date', header: 'Data', value: (r) => new Date(r.occurredOn).toLocaleDateString('it-IT'), render: (r) => <span className="cellsub">{new Date(r.occurredOn).toLocaleDateString('it-IT')}</span> },
    { key: 'type', header: 'Tipo', value: (r) => lk.labelOf(r.typeId), render: (r) => { const l = lk.byId(r.typeId); return l ? <StatusPill label={lk.labelOf(r.typeId)} token={l.colorToken} /> : '—'; } },
    { key: 'material', header: 'Articolo', value: (r) => r.materialName ?? '', render: (r) => <span className="cellname">{r.materialName ?? '—'}</span> },
    { key: 'location', header: 'Ubicazione', value: (r) => r.locationName ?? '', render: (r) => <span className="cellsub">{r.locationName ?? '—'}</span> },
    { key: 'qty', header: 'Qtà', num: true, value: (r) => `${num(r.quantity)} ${r.unit}`.trim(), render: (r) => <span className="mono">{num(r.quantity)} {r.unit}</span> },
    { key: 'cost', header: 'Costo unit.', num: true, value: (r) => eur(r.unitCost), render: (r) => <span className="mono">{eur(r.unitCost)}</span> },
    { key: 'act', header: '', render: (r) => (canMove
      ? <button className="btn btn-ghost btn-sm" disabled={busy} title="Rettifica / storna (crea un movimento compensativo)" onClick={(e) => { e.stopPropagation(); setRevId(r.id); }}><RotateCcw size={14} /> Rettifica</button>
      : null) },
  ];
  const exportFields: ExportField<StockMovementDto>[] = cols.filter((c) => c.value).map((c) => ({ key: c.key, label: c.header, value: c.value! }));
  const rows = mv.data?.items ?? [];
  const rightActions: ListAction[] = [
    ...(canMove ? [{ key: 'new', icon: Plus, tip: 'Nuovo movimento', variant: 'primary' as const, onClick: () => { setD({ ...emptyMov(), locationId: drill?.locationId ?? '', materialId: drill?.materialId ?? '' }); setOpen(true); } }] : []),
    { key: 'export', icon: Download, tip: 'Esporta tutto', onClick: () => void exportAll('movimenti', 'Movimenti', exportFields, rows) },
  ];
  return (
    <>
      <div className="toolbar" style={{ marginBottom: 10, gap: 8 }}>
        <span className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink-soft)' }}><Lock size={13} /> Registro immutabile — si corregge con una rettifica, non con modifiche</span>
        {drill && <span className="chip" style={{ background: 'var(--brand-wash)', color: 'var(--brand-ink)' }}>Giacenza: {drill.materialName} · {drill.locationName} <button className="lk" style={{ marginLeft: 6 }} onClick={onClearDrill}>✕</button></span>}
      </div>
      <EntityList<StockMovementDto>
        columns={cols} rows={rows} loading={mv.loading} error={mv.error}
        selectable={false}
        exportName="movimenti" exportFields={exportFields} rightActions={rightActions}
        emptyText="Nessun movimento. Crea un movimento o un documento di carico." />

      <Drawer open={open} title="Nuovo movimento" onClose={() => setOpen(false)} footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => setOpen(false)}>Annulla</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>Registra</button>
        </div>
      }>
        <div className="field"><label>Tipo</label>
          <select className="txt" value={d.typeCode} onChange={(e) => setD({ ...d, typeCode: e.target.value as MovDraft['typeCode'] })}>
            <option value="in">Carico (+)</option>
            <option value="out">Scarico (−)</option>
            <option value="adjust">Rettifica (delta con segno)</option>
          </select></div>
        <div className="field"><label>Articolo<span className="req">*</span></label>
          <select className="txt" value={d.materialId} onChange={(e) => setD({ ...d, materialId: e.target.value })}>
            <option value="">Articolo…</option>
            {(mats.data?.items ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select></div>
        <div className="field"><label>Ubicazione<span className="req">*</span></label>
          <select className="txt" value={d.locationId} onChange={(e) => setD({ ...d, locationId: e.target.value })}>
            <option value="">Ubicazione…</option>
            {(locs.data?.items ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select></div>
        <div className="field"><label>Quantità<span className="req">*</span> {d.materialId && <span style={{ color: 'var(--ink-faint)' }}>({matById.get(d.materialId)?.unit})</span>}</label>
          <input className="txt" type="number" value={d.quantity} onChange={(e) => setD({ ...d, quantity: e.target.value })} placeholder={d.typeCode === 'adjust' ? 'es. -3 o +5' : 'quantità'} /></div>
        <div className="field"><label>Costo unitario (opz.)</label>
          <input className="txt" type="number" value={d.unitCost} onChange={(e) => setD({ ...d, unitCost: e.target.value })} placeholder="€" /></div>
        <div className="field"><label>Commessa (opz.)</label>
          <select className="txt" value={d.engagementId} onChange={(e) => setD({ ...d, engagementId: e.target.value })}>
            <option value="">—</option>
            {(engs.data?.items ?? []).map((en) => <option key={en.id} value={en.id}>{en.code} · {en.title}</option>)}
          </select></div>
        <div className="field"><label>Data (opz.)</label>
          <input className="txt" type="date" value={d.occurredOn} onChange={(e) => setD({ ...d, occurredOn: e.target.value })} /></div>
        <div className="field"><label>Note (opz.)</label>
          <input className="txt" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></div>
      </Drawer>

      <ConfirmDialog open={!!revId} title="Rettifica / storna movimento"
        message="Crea un movimento COMPENSATIVO (quantità opposta) per correggere. Il movimento originale resta (registro immutabile)."
        confirmLabel="Crea rettifica" busy={busy} onConfirm={() => revId && void reverse(revId)} onCancel={() => setRevId(null)} />
    </>
  );
}

/* ── Documenti (testata → movimenti alla conferma) ─────────────────── */
interface LineDraft { materialId: string; quantity: string; unit: string; unitCost: string }
const emptyLine = (): LineDraft => ({ materialId: '', quantity: '', unit: '', unitCost: '' });

function DocumentsTab({ lk, canManage }: { lk: ReturnType<typeof useLookups>; canManage: boolean }) {
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
  function setLine(i: number, patch: Partial<LineDraft>) { setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l))); }
  function onPickMaterial(i: number, materialId: string) { setLine(i, { materialId, unit: matById.get(materialId)?.unit ?? '' }); }

  async function save(confirmAfter: boolean) {
    const cleaned = lines.filter((l) => l.materialId && Number(l.quantity) > 0).map((l) => ({
      materialId: l.materialId, quantity: Number(l.quantity), unit: l.unit || 'pz', unitCost: l.unitCost ? Number(l.unitCost) : undefined,
    }));
    if (!cleaned.length) { toast('Aggiungi almeno una riga valida', 'error'); return; }
    if (type === 'receipt' && !dest) { toast('Carico: scegli il magazzino di destinazione', 'error'); return; }
    if (type === 'transfer' && (!source || !dest || source === dest)) { toast('Trasferimento: origine e destinazione distinte', 'error'); return; }
    if (type === 'adjustment' && !dest) { toast('Rettifica: scegli l\'ubicazione', 'error'); return; }
    setBusy(true);
    try {
      const created = await mutate<{ id: string }>('POST', '/stock/documents', { typeCode: type, sourceLocationId: source || undefined, destLocationId: dest || undefined, externalRef: externalRef || undefined, lines: cleaned });
      if (confirmAfter) { const res = await mutate<{ number: string }>('POST', `/stock/documents/${created.id}/confirm`); toast(`Documento confermato: ${res.number}`, 'success'); }
      else toast('Bozza salvata', 'success');
      setOpen(false); reset(); await docs.reload();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function confirmDoc(id: string) {
    setBusy(true);
    try { const res = await mutate<{ number: string }>('POST', `/stock/documents/${id}/confirm`); toast(`Confermato: ${res.number}`, 'success'); await docs.reload(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  const cols: ListColumn<StockDocumentDto>[] = [
    { key: 'number', header: 'Numero', value: (r) => r.number ?? 'bozza', render: (r) => <span className="cellname">{r.number ?? <em style={{ color: 'var(--ink-faint)' }}>bozza</em>}</span> },
    { key: 'type', header: 'Tipo', value: (r) => lk.labelOf(r.typeId), render: (r) => { const l = lk.byId(r.typeId); return l ? <StatusPill label={lk.labelOf(r.typeId)} token={l.colorToken} /> : '—'; } },
    { key: 'date', header: 'Data', value: (r) => new Date(r.docDate).toLocaleDateString('it-IT'), render: (r) => <span className="cellsub">{new Date(r.docDate).toLocaleDateString('it-IT')}</span> },
    { key: 'status', header: 'Stato', value: (r) => r.status, render: (r) => <span className="chip">{r.status}</span> },
    { key: 'act', header: 'Azioni', render: (r) => (r.status === 'draft' && canManage
      ? <button className="btn btn-primary btn-sm" disabled={busy} onClick={(e) => { e.stopPropagation(); confirmDoc(r.id); }}><CheckCircle2 size={15} /> Conferma</button> : null) },
  ];
  const exportFields: ExportField<StockDocumentDto>[] = cols.filter((c) => c.value).map((c) => ({ key: c.key, label: c.header, value: c.value! }));
  const rows = docs.data?.items ?? [];
  const locOpts = locs.data?.items ?? [];
  const rightActions: ListAction[] = [
    ...(canManage ? [{ key: 'new', icon: Plus, tip: 'Nuovo documento', variant: 'primary' as const, onClick: () => { reset(); setOpen(true); } }] : []),
    { key: 'export', icon: Download, tip: 'Esporta tutto', onClick: () => void exportAll('documenti', 'Documenti', exportFields, rows) },
  ];
  return (
    <>
      <EntityList<StockDocumentDto>
        columns={cols} rows={rows} loading={docs.loading} error={docs.error}
        selectable={false}
        exportName="documenti" exportFields={exportFields} rightActions={rightActions}
        emptyText="Nessun documento. Crea un carico, un trasferimento o una rettifica." />

      <Drawer open={open} title="Nuovo documento" onClose={() => setOpen(false)} footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" disabled={busy} onClick={() => save(false)}>Salva bozza</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => save(true)}>Salva e conferma</button>
        </div>
      }>
        <div className="field"><label>Tipo</label>
          <select className="txt" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="receipt">Carico</option><option value="transfer">Trasferimento</option><option value="adjustment">Rettifica (giacenza contata)</option>
          </select></div>
        {type === 'transfer' && (
          <div className="field"><label>Da (origine)</label>
            <select className="txt" value={source} onChange={(e) => setSource(e.target.value)}><option value="">—</option>{locOpts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        )}
        <div className="field"><label>{type === 'transfer' ? 'A (destinazione)' : type === 'adjustment' ? 'Ubicazione' : 'Magazzino destinazione'}</label>
          <select className="txt" value={dest} onChange={(e) => setDest(e.target.value)}><option value="">—</option>{locOpts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        {type === 'receipt' && (
          <div className="field"><label>Rif. DDT fornitore</label><input className="txt" value={externalRef} onChange={(e) => setExternalRef(e.target.value)} placeholder="es. DDT 1234" /></div>
        )}
        <div className="field"><label>Righe</label></div>
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 80px 28px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <select className="txt" value={l.materialId} onChange={(e) => onPickMaterial(i, e.target.value)}><option value="">Articolo…</option>{(mats.data?.items ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            <input className="txt" type="number" placeholder={type === 'adjustment' ? 'contata' : 'qtà'} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
            <input className="txt" type="number" placeholder="€ costo" value={l.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value })} />
            <div className="act-icon danger" onClick={() => setLines((ls) => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)} title="Rimuovi"><Trash2 size={15} /></div>
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}><Plus size={15} /> Aggiungi riga</button>
        {type === 'adjustment' && <div className="help" style={{ marginTop: 8 }}>La rettifica imputa la differenza tra la quantità contata e la giacenza corrente.</div>}
      </Drawer>
    </>
  );
}

/* ── Ubicazioni (crea / modifica / elimina-soft) ───────────────────── */
const KIND_LABEL: Record<string, string> = { warehouse: 'Magazzino', sub_location: 'Sotto-ubicazione', van: 'Furgone' };
function LocationsTab({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const locs = useApi<{ items: StockLocationDto[] }>('/stock/locations');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'warehouse' | 'sub_location' | 'van'>('warehouse');
  const [parentId, setParentId] = useState('');

  const openNew = () => { setEditId(null); setName(''); setKind('warehouse'); setParentId(''); setOpen(true); };
  const openEdit = (l: StockLocationDto) => { setEditId(l.id); setName(l.name); setKind((l.kind as typeof kind) ?? 'warehouse'); setParentId(l.parentId ?? ''); setOpen(true); };

  async function save() {
    if (!name.trim()) { toast('Inserisci un nome', 'error'); return; }
    setBusy(true);
    try {
      if (editId) { await mutate('PATCH', `/stock/locations/${editId}`, { name: name.trim(), kind, parentId: parentId || null }); toast('Ubicazione aggiornata', 'success'); }
      else { await mutate('POST', '/stock/locations', { name: name.trim(), kind, parentId: parentId || undefined }); toast('Ubicazione creata', 'success'); }
      setOpen(false); await locs.reload();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function onDelete(rows: StockLocationDto[]) {
    for (const r of rows) await mutate('DELETE', `/stock/locations/${r.id}`);
    toast(rows.length > 1 ? `${rows.length} ubicazioni eliminate` : 'Ubicazione eliminata', 'success');
    await locs.reload();
  }

  const cols: ListColumn<StockLocationDto>[] = [
    { key: 'name', header: 'Nome', value: (r) => r.name, render: (r) => <span className="cellname">{r.name}</span> },
    { key: 'kind', header: 'Tipo', value: (r) => KIND_LABEL[r.kind] ?? r.kind, render: (r) => <span className="chip">{KIND_LABEL[r.kind] ?? r.kind}</span> },
    { key: 'parent', header: 'Dentro', value: (r) => (r.parentId ? (locs.data?.items.find((x) => x.id === r.parentId)?.name ?? '') : ''), render: (r) => <span className="cellsub">{r.parentId ? (locs.data?.items.find((x) => x.id === r.parentId)?.name ?? '—') : '—'}</span> },
    { key: 'default', header: 'Default', value: (r) => (r.isDefault ? 'predefinito' : ''), render: (r) => (r.isDefault ? <span className="chip">predefinito</span> : '') },
    { key: 'act', header: '', render: (r) => (canManage
      ? <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); openEdit(r); }}><Pencil size={14} /> Modifica</button> : null) },
  ];
  const exportFields: ExportField<StockLocationDto>[] = cols.filter((c) => c.value).map((c) => ({ key: c.key, label: c.header, value: c.value! }));
  const rows = locs.data?.items ?? [];
  const rightActions: ListAction[] = [
    ...(canManage ? [{ key: 'new', icon: Plus, tip: 'Nuova ubicazione', variant: 'primary' as const, onClick: openNew }] : []),
    { key: 'export', icon: Download, tip: 'Esporta tutto', onClick: () => void exportAll('ubicazioni', 'Ubicazioni', exportFields, rows) },
  ];
  return (
    <>
      <EntityList<StockLocationDto>
        columns={cols} rows={rows} loading={locs.loading} error={locs.error}
        selectable={canManage}
        onRowClick={canManage ? openEdit : undefined}
        onDelete={canManage ? onDelete : undefined}
        exportName="ubicazioni" exportFields={exportFields} rightActions={rightActions}
        emptyText="Nessuna ubicazione. Crea il primo magazzino." />

      <Drawer open={open} title={editId ? 'Modifica ubicazione' : 'Nuova ubicazione'} onClose={() => setOpen(false)} footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => setOpen(false)}>Annulla</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>Salva</button>
        </div>
      }>
        <div className="field"><label>Nome<span className="req">*</span></label><input className="txt" value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Magazzino centrale" /></div>
        <div className="field"><label>Tipo</label>
          <select className="txt" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="warehouse">Magazzino</option><option value="sub_location">Sotto-ubicazione</option><option value="van">Furgone</option>
          </select></div>
        <div className="field"><label>Dentro (opzionale)</label>
          <select className="txt" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— primo livello —</option>
            {(locs.data?.items ?? []).filter((l) => l.id !== editId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select></div>
      </Drawer>
    </>
  );
}
