/**
 * MagazzinoPage — MAGAZZINO MINIMO 6A (§8). Quattro schede:
 *  - Giacenze   (stock_balance: qtà, costo medio, valore per articolo/ubicazione)
 *  - Movimenti  (registro immutabile)
 *  - Documenti  (carico/trasferimento/rettifica → alla conferma generano i movimenti, numerati)
 *  - Ubicazioni (albero magazzini)
 * Le scritture passano dagli endpoint /stock/* (RLS+RBAC lato API).
 */
import { useMemo, useState } from 'react';
import { Plus, CheckCircle2, Trash2, Download } from 'lucide-react';
import type {
  StockBalanceDto, StockMovementDto, StockDocumentDto, StockLocationDto, MaterialDto, PermissionKey,
} from '@sisuite/shared';
import { Page } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { EntityList, type ListColumn, type ExportField, type ListAction } from '../ui/EntityList';
import { Drawer } from '../ui/Drawer';
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

/** Esporta TUTTE le righe della lista (export-all, indipendente dalla selezione). */
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
  const [tab, setTab] = useState<Tab>('balance');

  return (
    <Page title="Magazzino">
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="seg">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
      </div>
      {tab === 'balance' && <BalanceTab />}
      {tab === 'movements' && <MovementsTab lk={lk} />}
      {tab === 'documents' && <DocumentsTab lk={lk} canManage={canManage} />}
      {tab === 'locations' && <LocationsTab canManage={canManage} />}
    </Page>
  );
}

/* ── Giacenze ──────────────────────────────────────────────────────── */
type BalanceRow = StockBalanceDto & { id: string };
function BalanceTab() {
  const locs = useApi<{ items: StockLocationDto[] }>('/stock/locations');
  const [loc, setLoc] = useState('');
  const bal = useApi<{ items: StockBalanceDto[] }>(`/stock/balance${loc ? `?locationId=${loc}` : ''}`);
  const cols: ListColumn<BalanceRow>[] = [
    { key: 'material', header: 'Articolo', value: (r) => r.materialName ?? '', render: (r) => <span className="cellname">{r.materialName ?? '—'}</span> },
    { key: 'location', header: 'Ubicazione', value: (r) => r.locationName ?? '', render: (r) => <span className="cellsub">{r.locationName ?? '—'}</span> },
    { key: 'qty', header: 'Giacenza', num: true, value: (r) => `${num(r.qtyOnHand)} ${r.unit ?? ''}`.trim(), render: (r) => (
      <span className="mono" style={r.qtyOnHand <= 0 ? { color: 'var(--c-danger, #c0392b)', fontWeight: 700 } : undefined}>
        {num(r.qtyOnHand)} {r.unit ?? ''}</span>
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
      </div>
      <EntityList<BalanceRow>
        columns={cols} rows={rows} loading={bal.loading} error={bal.error}
        exportName="giacenze" exportFields={exportFields} rightActions={rightActions}
        emptyText="Nessuna giacenza. Registra un carico per popolare il magazzino." />
    </>
  );
}

/* ── Movimenti ─────────────────────────────────────────────────────── */
function MovementsTab({ lk }: { lk: ReturnType<typeof useLookups> }) {
  const mv = useApi<{ items: StockMovementDto[] }>('/stock/movements');
  const cols: ListColumn<StockMovementDto>[] = [
    { key: 'date', header: 'Data', value: (r) => new Date(r.occurredOn).toLocaleDateString('it-IT'), render: (r) => <span className="cellsub">{new Date(r.occurredOn).toLocaleDateString('it-IT')}</span> },
    { key: 'type', header: 'Tipo', value: (r) => lk.labelOf(r.typeId), render: (r) => {
      const l = lk.byId(r.typeId);
      return l ? <StatusPill label={lk.labelOf(r.typeId)} token={l.colorToken} /> : '—';
    } },
    { key: 'material', header: 'Articolo', value: (r) => r.materialName ?? '', render: (r) => <span className="cellname">{r.materialName ?? '—'}</span> },
    { key: 'location', header: 'Ubicazione', value: (r) => r.locationName ?? '', render: (r) => <span className="cellsub">{r.locationName ?? '—'}</span> },
    { key: 'qty', header: 'Qtà', num: true, value: (r) => `${num(r.quantity)} ${r.unit}`.trim(), render: (r) => (
      <span className="mono" style={{ color: r.quantity < 0 ? 'var(--ink)' : undefined }}>{num(r.quantity)} {r.unit}</span>
    ) },
    { key: 'cost', header: 'Costo unit.', num: true, value: (r) => eur(r.unitCost), render: (r) => <span className="mono">{eur(r.unitCost)}</span> },
  ];
  const exportFields: ExportField<StockMovementDto>[] = cols.map((c) => ({ key: c.key, label: c.header, value: c.value! }));
  const rows = mv.data?.items ?? [];
  const rightActions: ListAction[] = [
    { key: 'export', icon: Download, tip: 'Esporta tutto', onClick: () => void exportAll('movimenti', 'Movimenti', exportFields, rows) },
  ];
  return (
    <EntityList<StockMovementDto>
      columns={cols} rows={rows} loading={mv.loading} error={mv.error}
      selectable={false}
      exportName="movimenti" exportFields={exportFields} rightActions={rightActions}
      emptyText="Nessun movimento. I carichi/scarichi compaiono qui." />
  );
}

/* ── Documenti ─────────────────────────────────────────────────────── */
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

  function setLine(i: number, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }
  function onPickMaterial(i: number, materialId: string) {
    const unit = matById.get(materialId)?.unit ?? '';
    setLine(i, { materialId, unit });
  }

  async function save(confirmAfter: boolean) {
    const cleaned = lines.filter((l) => l.materialId && Number(l.quantity) > 0).map((l) => ({
      materialId: l.materialId, quantity: Number(l.quantity), unit: l.unit || 'pz',
      unitCost: l.unitCost ? Number(l.unitCost) : undefined,
    }));
    if (!cleaned.length) { toast('Aggiungi almeno una riga valida', 'error'); return; }
    if (type === 'receipt' && !dest) { toast('Carico: scegli il magazzino di destinazione', 'error'); return; }
    if (type === 'transfer' && (!source || !dest || source === dest)) { toast('Trasferimento: origine e destinazione distinte', 'error'); return; }
    if (type === 'adjustment' && !dest) { toast('Rettifica: scegli l\'ubicazione', 'error'); return; }
    setBusy(true);
    try {
      const body = {
        typeCode: type, sourceLocationId: source || undefined, destLocationId: dest || undefined,
        externalRef: externalRef || undefined, lines: cleaned,
      };
      const created = await mutate<{ id: string }>('POST', '/stock/documents', body);
      if (confirmAfter) {
        const res = await mutate<{ number: string }>('POST', `/stock/documents/${created.id}/confirm`);
        toast(`Documento confermato: ${res.number}`, 'success');
      } else {
        toast('Bozza salvata', 'success');
      }
      setOpen(false); reset(); await docs.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally { setBusy(false); }
  }

  async function confirmDoc(id: string) {
    setBusy(true);
    try {
      const res = await mutate<{ number: string }>('POST', `/stock/documents/${id}/confirm`);
      toast(`Confermato: ${res.number}`, 'success');
      await docs.reload();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  const cols: ListColumn<StockDocumentDto>[] = [
    { key: 'number', header: 'Numero', value: (r) => r.number ?? 'bozza', render: (r) => <span className="cellname">{r.number ?? <em style={{ color: 'var(--ink-faint)' }}>bozza</em>}</span> },
    { key: 'type', header: 'Tipo', value: (r) => lk.labelOf(r.typeId), render: (r) => { const l = lk.byId(r.typeId); return l ? <StatusPill label={lk.labelOf(r.typeId)} token={l.colorToken} /> : '—'; } },
    { key: 'date', header: 'Data', value: (r) => new Date(r.docDate).toLocaleDateString('it-IT'), render: (r) => <span className="cellsub">{new Date(r.docDate).toLocaleDateString('it-IT')}</span> },
    { key: 'status', header: 'Stato', value: (r) => r.status, render: (r) => <span className="chip">{r.status}</span> },
    // Azione-riga preservata (gate stock:manage, stessa POST /stock/documents/:id/confirm): render custom, niente value → fuori dall'export.
    { key: 'act', header: 'Azioni', render: (r) => (
      r.status === 'draft' && canManage
        ? <button className="btn btn-primary btn-sm" disabled={busy} onClick={(e) => { e.stopPropagation(); confirmDoc(r.id); }}><CheckCircle2 size={15} /> Conferma</button>
        : null
    ) },
  ];
  const exportFields: ExportField<StockDocumentDto>[] = cols
    .filter((c) => c.value)
    .map((c) => ({ key: c.key, label: c.header, value: c.value! }));
  const rows = docs.data?.items ?? [];
  const locOpts = locs.data?.items ?? [];
  const rightActions: ListAction[] = [
    { key: 'export', icon: Download, tip: 'Esporta tutto', onClick: () => void exportAll('documenti', 'Documenti', exportFields, rows) },
  ];
  return (
    <>
      {canManage && (
        <div className="toolbar" style={{ marginBottom: 10 }}>
          <span className="spacer" style={{ flex: 1 }} />
          <button className="btn btn-primary btn-sm" onClick={() => { reset(); setOpen(true); }}><Plus size={16} /> Nuovo documento</button>
        </div>
      )}
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
        <div className="field">
          <label>Tipo</label>
          <select className="txt" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="receipt">Carico</option>
            <option value="transfer">Trasferimento</option>
            <option value="adjustment">Rettifica (giacenza contata)</option>
          </select>
        </div>
        {type === 'transfer' && (
          <div className="field">
            <label>Da (origine)</label>
            <select className="txt" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">—</option>
              {locOpts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label>{type === 'transfer' ? 'A (destinazione)' : type === 'adjustment' ? 'Ubicazione' : 'Magazzino destinazione'}</label>
          <select className="txt" value={dest} onChange={(e) => setDest(e.target.value)}>
            <option value="">—</option>
            {locOpts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        {type === 'receipt' && (
          <div className="field">
            <label>Rif. DDT fornitore</label>
            <input className="txt" value={externalRef} onChange={(e) => setExternalRef(e.target.value)} placeholder="es. DDT 1234" />
          </div>
        )}

        <div className="field"><label>Righe</label></div>
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 80px 28px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <select className="txt" value={l.materialId} onChange={(e) => onPickMaterial(i, e.target.value)}>
              <option value="">Articolo…</option>
              {(mats.data?.items ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
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

/* ── Ubicazioni ────────────────────────────────────────────────────── */
function LocationsTab({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const locs = useApi<{ items: StockLocationDto[] }>('/stock/locations');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'warehouse' | 'sub_location' | 'van'>('warehouse');
  const [parentId, setParentId] = useState('');

  async function save() {
    if (!name.trim()) { toast('Inserisci un nome', 'error'); return; }
    setBusy(true);
    try {
      await mutate('POST', '/stock/locations', { name: name.trim(), kind, parentId: parentId || undefined });
      toast('Ubicazione creata', 'success');
      setOpen(false); setName(''); setKind('warehouse'); setParentId(''); await locs.reload();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  const KIND_LABEL: Record<string, string> = { warehouse: 'Magazzino', sub_location: 'Sotto-ubicazione', van: 'Furgone' };
  const cols: ListColumn<StockLocationDto>[] = [
    { key: 'name', header: 'Nome', value: (r) => r.name, render: (r) => <span className="cellname">{r.name}</span> },
    { key: 'kind', header: 'Tipo', value: (r) => KIND_LABEL[r.kind] ?? r.kind, render: (r) => <span className="chip">{KIND_LABEL[r.kind] ?? r.kind}</span> },
    { key: 'default', header: 'Default', value: (r) => (r.isDefault ? 'predefinito' : ''), render: (r) => (r.isDefault ? <span className="chip">predefinito</span> : '') },
  ];
  const exportFields: ExportField<StockLocationDto>[] = cols.map((c) => ({ key: c.key, label: c.header, value: c.value! }));
  const rows = locs.data?.items ?? [];
  const rightActions: ListAction[] = [
    { key: 'export', icon: Download, tip: 'Esporta tutto', onClick: () => void exportAll('ubicazioni', 'Ubicazioni', exportFields, rows) },
  ];
  return (
    <>
      {canManage && (
        <div className="toolbar" style={{ marginBottom: 10 }}>
          <span className="spacer" style={{ flex: 1 }} />
          <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}><Plus size={16} /> Nuova ubicazione</button>
        </div>
      )}
      <EntityList<StockLocationDto>
        columns={cols} rows={rows} loading={locs.loading} error={locs.error}
        exportName="ubicazioni" exportFields={exportFields} rightActions={rightActions}
        emptyText="Nessuna ubicazione. Crea il primo magazzino." />

      <Drawer open={open} title="Nuova ubicazione" onClose={() => setOpen(false)} footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => setOpen(false)}>Annulla</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>Salva</button>
        </div>
      }>
        <div className="field"><label>Nome<span className="req">*</span></label>
          <input className="txt" value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Magazzino centrale" /></div>
        <div className="field"><label>Tipo</label>
          <select className="txt" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="warehouse">Magazzino</option>
            <option value="sub_location">Sotto-ubicazione</option>
            <option value="van">Furgone</option>
          </select></div>
        <div className="field"><label>Dentro (opzionale)</label>
          <select className="txt" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— primo livello —</option>
            {(locs.data?.items ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select></div>
      </Drawer>
    </>
  );
}
