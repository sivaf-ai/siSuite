/**
 * SpecListsPages — liste minimali SPEC v1.1 (Deliverable 4, best-effort):
 *   Ordini d'acquisto · Pick list · Conteggi inventariali · Competenze · Aliquote IVA.
 * Sola lettura (EntityList standard, niente CRUD): le creazioni avvengono nei moduli
 * dedicati / drawer esistenti. Riusano gli endpoint backend già pronti.
 */
import { useState } from 'react';
import { useHistory } from 'react-router';
import type { PurchaseOrderDto, PickListDto, StockCountDto, SkillDto, TaxRateDto, StockDocumentDto } from '@sisuite/shared';
import { Page } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { EntityList, type ListColumn, type ListAction } from '../ui/EntityList';
import { useEntityActions } from '../ui/useEntityActions';
import { Modal } from '../ui/Modal';
import { NumInput } from '../ui/NumInput';
import { Plus, Sparkles } from '../ui/icons';
import { StockAssistModal } from './StockAssistModal';
import { useApi, useReloadOnEnter, useArchivedView, mutate } from '../api/hooks';
import { apiFetch, ApiError } from '../api/client';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';
import { AuditDialog } from '../ui/AuditDialog';
import { useLookups, lookupLabel } from '../context/Lookups';

const errMsg = (e: unknown) => (e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message);

const dfmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('it-IT') : '—');
const numberCell = (n: string | null) => <span className="cellname mono">{n ?? <em style={{ color: 'var(--ink-faint)' }}>bozza</em>}</span>;

const PO_STATUS: Record<string, { label: string; token: string }> = {
  draft: { label: 'Bozza', token: 'neutral' }, sent: { label: 'Inviato', token: 'info' },
  partial: { label: 'Ricevuto parz.', token: 'warning' }, received: { label: 'Ricevuto', token: 'success' },
  cancelled: { label: 'Annullato', token: 'danger' },
};
const PICK_STATUS: Record<string, { label: string; token: string }> = {
  draft: { label: 'Bozza', token: 'neutral' }, assigned: { label: 'Assegnata', token: 'info' },
  picking: { label: 'In prelievo', token: 'warning' }, done: { label: 'Completata', token: 'success' },
  cancelled: { label: 'Annullata', token: 'danger' },
};
const DOC_STATUS: Record<string, { label: string; token: string }> = {
  draft: { label: 'Bozza', token: 'neutral' }, confirmed: { label: 'Confermato', token: 'success' },
  cancelled: { label: 'Annullato', token: 'danger' },
};
const DOC_TYPE: Record<string, string> = { receipt: 'Carico', transfer: 'Trasferimento', adjustment: 'Rettifica' };
const pill = (m: Record<string, { label: string; token: string }>, s: string) => { const x = m[s] ?? { label: s, token: 'neutral' }; return <StatusPill label={x.label} token={x.token} />; };

/* ── Ordini d'acquisto ─────────────────────────────────────────────── */
export function PurchaseOrdersPage() {
  const [q, setQ] = useState('');
  const [sortParam, setSortParam] = useState<string | null>(null);
  const [filterParam, setFilterParam] = useState<string | null>(null);
  const history = useHistory();
  const { user } = useAuth();
  const canManage = !!user?.permissions.includes('stock:manage' as never);
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (sortParam) params.set('sort', sortParam);
  if (filterParam) params.set('filter', filterParam);
  const qs = params.toString();
  const { data, loading, error, reload } = useApi<{ items: PurchaseOrderDto[] }>(`/purchase-orders${qs ? `?${qs}` : ''}`);
  useReloadOnEnter(reload);
  const { onDelete } = useEntityActions<PurchaseOrderDto>({ basePath: '/purchase-orders', reload, noun: "ordine d'acquisto" });
  const cols: ListColumn<PurchaseOrderDto>[] = [
    { key: 'number', header: 'Numero', value: (r) => r.number ?? 'bozza', render: (r) => numberCell(r.number) },
    { key: 'supplier', header: 'Fornitore', value: (r) => r.supplierName ?? '', render: (r) => r.supplierName ?? '—' },
    { key: 'dest', header: 'Destinazione', value: (r) => r.destLocationName ?? '', render: (r) => r.destLocationName ?? '—' },
    { key: 'status', header: 'Stato', value: (r) => PO_STATUS[r.status]?.label ?? r.status, render: (r) => pill(PO_STATUS, r.status) },
    { key: 'orderDate', header: 'Data ordine', num: true, value: (r) => dfmt(r.orderDate), render: (r) => <span className="cellsub">{dfmt(r.orderDate)}</span> },
    { key: 'expected', header: 'Prevista', num: true, value: (r) => dfmt(r.expectedDate), render: (r) => <span className="cellsub">{dfmt(r.expectedDate)}</span> },
  ];
  const rightActions: ListAction[] = canManage ? [{ key: 'new', icon: Plus, tip: 'Nuovo ordine d\'acquisto', variant: 'primary', onClick: () => history.push('/purchase-orders/new') }] : [];
  return (
    <Page>
      <EntityList<PurchaseOrderDto> title="Ordini d'acquisto" subtitle="Ordini ai fornitori e ricezione merce"
        search={q} onSearch={setQ} searchPlaceholder="Cerca numero, fornitore…"
        rightActions={rightActions} onRowClick={(r) => history.push(`/purchase-orders/${r.id}`)}
        onDelete={canManage ? onDelete : undefined} rowLabel={(r) => r.number ?? 'bozza'}
        entity="purchase_order"
        sortFields={[{ key: 'number', label: 'Numero' }, { key: 'date', label: 'Data ordine' }, { key: 'expected', label: 'Prevista' }, { key: 'status', label: 'Stato' }, { key: 'supplier', label: 'Fornitore' }, { key: 'dest', label: 'Destinazione' }]}
        filterFields={[
          { key: 'number', label: 'Numero', type: 'text', section: 'Ordine' },
          { key: 'supplier', label: 'Fornitore', type: 'text', section: 'Ordine' },
          { key: 'dest', label: 'Destinazione', type: 'text', section: 'Ordine' },
          { key: 'status', label: 'Stato', type: 'enum', section: 'Ordine', values: Object.entries(PO_STATUS).map(([value, v]) => ({ value, label: v.label })) },
          { key: 'date', label: 'Data ordine', type: 'date', section: 'Date' },
          { key: 'expected', label: 'Prevista', type: 'date', section: 'Date' },
          { key: 'currency', label: 'Valuta', type: 'text', section: 'Altro' },
        ]}
        onSortChange={(s) => setSortParam(s.length ? JSON.stringify(s) : null)}
        onFilterChange={(s) => setFilterParam(s ? JSON.stringify(s) : null)}
        columns={cols} rows={data?.items ?? []}
        loading={loading} error={error} exportName="ordini-acquisto" emptyText="Nessun ordine d'acquisto." />
    </Page>
  );
}

/* ── Pick list ─────────────────────────────────────────────────────── */
export function PickListsPage() {
  const [q, setQ] = useState('');
  const [sortParam, setSortParam] = useState<string | null>(null);
  const [filterParam, setFilterParam] = useState<string | null>(null);
  const history = useHistory();
  const { user } = useAuth();
  const canManage = !!user?.permissions.includes('stock:manage' as never);
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (sortParam) params.set('sort', sortParam);
  if (filterParam) params.set('filter', filterParam);
  const qs = params.toString();
  const { data, loading, error, reload } = useApi<{ items: PickListDto[] }>(`/pick-lists${qs ? `?${qs}` : ''}`);
  useReloadOnEnter(reload);
  const { onDelete } = useEntityActions<PickListDto>({ basePath: '/pick-lists', reload, noun: 'pick list' });
  const cols: ListColumn<PickListDto>[] = [
    { key: 'number', header: 'Numero', value: (r) => r.number ?? 'bozza', render: (r) => numberCell(r.number) },
    { key: 'source', header: 'Origine', value: (r) => r.sourceLocationName ?? '', render: (r) => r.sourceLocationName ?? '—' },
    { key: 'assigned', header: 'Assegnata a', value: (r) => r.assignedResourceLabel ?? '', render: (r) => r.assignedResourceLabel ?? '—' },
    { key: 'status', header: 'Stato', value: (r) => PICK_STATUS[r.status]?.label ?? r.status, render: (r) => pill(PICK_STATUS, r.status) },
    { key: 'created', header: 'Creata', num: true, value: (r) => dfmt(r.createdAt), render: (r) => <span className="cellsub">{dfmt(r.createdAt)}</span> },
  ];
  const rightActions: ListAction[] = canManage ? [{ key: 'new', icon: Plus, tip: 'Nuova pick list', variant: 'primary', onClick: () => history.push('/pick-lists/new') }] : [];
  return (
    <Page>
      <EntityList<PickListDto> title="Pick list" subtitle="Prelievi di magazzino assegnati al campo"
        search={q} onSearch={setQ} searchPlaceholder="Cerca numero, origine…"
        rightActions={rightActions} onRowClick={(r) => history.push(`/pick-lists/${r.id}`)}
        onDelete={canManage ? onDelete : undefined} rowLabel={(r) => r.number ?? 'bozza'}
        entity="pick_list"
        sortFields={[{ key: 'number', label: 'Numero' }, { key: 'status', label: 'Stato' }, { key: 'source', label: 'Origine' }, { key: 'resource', label: 'Assegnata a' }, { key: 'created', label: 'Creata' }]}
        filterFields={[
          { key: 'number', label: 'Numero', type: 'text', section: 'Prelievo' },
          { key: 'source', label: 'Origine', type: 'text', section: 'Prelievo' },
          { key: 'resource', label: 'Assegnata a', type: 'text', section: 'Prelievo' },
          { key: 'status', label: 'Stato', type: 'enum', section: 'Prelievo', values: Object.entries(PICK_STATUS).map(([value, v]) => ({ value, label: v.label })) },
          { key: 'created', label: 'Creata', type: 'date', section: 'Date' },
        ]}
        onSortChange={(s) => setSortParam(s.length ? JSON.stringify(s) : null)}
        onFilterChange={(s) => setFilterParam(s ? JSON.stringify(s) : null)}
        columns={cols} rows={data?.items ?? []}
        loading={loading} error={error} exportName="pick-list" emptyText="Nessuna pick list." />
    </Page>
  );
}

/* ── DDT / Documenti di magazzino ──────────────────────────────────── */
export function DdtPage() {
  const [q, setQ] = useState('');
  const [sortParam, setSortParam] = useState<string | null>(null);
  const [filterParam, setFilterParam] = useState<string | null>(null);
  const history = useHistory();
  const { user } = useAuth();
  const canManage = !!user?.permissions.includes('stock:manage' as never);
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (sortParam) params.set('sort', sortParam);
  if (filterParam) params.set('filter', filterParam);
  const qs = params.toString();
  const { data, loading, error, reload } = useApi<{ items: StockDocumentDto[] }>(`/stock/documents${qs ? `?${qs}` : ''}`);
  useReloadOnEnter(reload);
  const { onDelete } = useEntityActions<StockDocumentDto>({ basePath: '/stock/documents', reload, noun: 'documento' });
  const cols: ListColumn<StockDocumentDto>[] = [
    { key: 'number', header: 'Numero', value: (r) => r.number ?? 'bozza', render: (r) => numberCell(r.number) },
    { key: 'type', header: 'Tipo', value: (r) => DOC_TYPE[r.typeCanonical ?? ''] ?? (r.typeCanonical ?? '—'), render: (r) => <span className="chip">{DOC_TYPE[r.typeCanonical ?? ''] ?? (r.typeCanonical ?? '—')}</span> },
    { key: 'status', header: 'Stato', value: (r) => DOC_STATUS[r.status]?.label ?? r.status, render: (r) => pill(DOC_STATUS, r.status) },
    { key: 'flow', header: 'Origine → Destinazione', value: (r) => `${r.sourceLocationName ?? ''} ${r.destLocationName ?? ''}`, render: (r) => <span className="cellsub">{(r.sourceLocationName ?? '—')} → {(r.destLocationName ?? '—')}</span> },
    { key: 'date', header: 'Data', num: true, value: (r) => dfmt(r.docDate), render: (r) => <span className="cellsub">{dfmt(r.docDate)}</span> },
  ];
  const [assist, setAssist] = useState(false);
  const rightActions: ListAction[] = canManage ? [
    { key: 'ai', icon: Sparkles, tip: 'Assistente AI: crea un documento da testo', onClick: () => setAssist(true) },
    { key: 'new', icon: Plus, tip: 'Nuovo documento', variant: 'primary', onClick: () => history.push('/stock/documents/new') },
  ] : [];
  return (
    <Page>
      <StockAssistModal open={assist} onClose={() => setAssist(false)} />
      <EntityList<StockDocumentDto> title="Documenti di magazzino" subtitle="DDT · Carichi · Trasferimenti · Rettifiche · solo le bozze sono eliminabili"
        search={q} onSearch={setQ} searchPlaceholder="Cerca numero, magazzino…"
        rightActions={rightActions} onRowClick={(r) => history.push(`/stock/documents/${r.id}`)}
        onDelete={canManage ? onDelete : undefined} rowLabel={(r) => r.number ?? 'bozza'}
        entity="stock_document"
        sortFields={[{ key: 'number', label: 'Numero' }, { key: 'date', label: 'Data' }, { key: 'status', label: 'Stato' }, { key: 'type', label: 'Tipo' }, { key: 'source', label: 'Origine' }, { key: 'dest', label: 'Destinazione' }]}
        filterFields={[
          { key: 'number', label: 'Numero', type: 'text', section: 'Documento' },
          { key: 'type', label: 'Tipo', type: 'enum', section: 'Documento', values: Object.entries(DOC_TYPE).map(([value, label]) => ({ value, label })) },
          { key: 'status', label: 'Stato', type: 'enum', section: 'Documento', values: Object.entries(DOC_STATUS).map(([value, v]) => ({ value, label: v.label })) },
          { key: 'source', label: 'Origine', type: 'text', section: 'Flusso' },
          { key: 'dest', label: 'Destinazione', type: 'text', section: 'Flusso' },
          { key: 'company', label: 'Controparte', type: 'text', section: 'Flusso' },
          { key: 'date', label: 'Data', type: 'date', section: 'Date' },
          { key: 'externalRef', label: 'Rif. esterno', type: 'text', section: 'Altro' },
        ]}
        onSortChange={(s) => setSortParam(s.length ? JSON.stringify(s) : null)}
        onFilterChange={(s) => setFilterParam(s ? JSON.stringify(s) : null)}
        columns={cols} rows={data?.items ?? []}
        loading={loading} error={error} exportName="documenti-magazzino" emptyText="Nessun documento di magazzino." />
    </Page>
  );
}

/* ── Conteggi inventariali ─────────────────────────────────────────── */
export function StockCountsPage() {
  const [q, setQ] = useState('');
  const { data, loading, error } = useApi<{ items: StockCountDto[] }>('/stock-counts');
  const cols: ListColumn<StockCountDto>[] = [
    { key: 'number', header: 'Numero', value: (r) => r.number ?? 'bozza', render: (r) => <span className="cellname mono">{r.number ?? <em style={{ color: 'var(--ink-faint)' }}>bozza</em>}</span> },
    { key: 'location', header: 'Magazzino', value: (r) => r.locationName ?? '', render: (r) => r.locationName ?? '—' },
    { key: 'status', header: 'Stato', value: (r) => r.status, render: (r) => <span className="chip">{r.status}</span> },
    { key: 'date', header: 'Data', num: true, value: (r) => dfmt(r.countDate), render: (r) => <span className="cellsub">{dfmt(r.countDate)}</span> },
  ];
  return (
    <Page>
      <EntityList<StockCountDto> title="Conteggi inventariali" subtitle="Inventari fisici e rettifiche giacenza"
        search={q} onSearch={setQ} searchPlaceholder="Cerca numero, magazzino…" selectable={false}
        columns={cols} rows={(data?.items ?? []).filter((r) => !q.trim() || `${r.number ?? ''} ${r.locationName ?? ''}`.toLowerCase().includes(q.toLowerCase()))}
        loading={loading} error={error} exportName="conteggi" emptyText="Nessun conteggio." />
    </Page>
  );
}

/* ── Competenze (skill) ────────────────────────────────────────────── */
/** Anagrafica COMPLETA come UnitsPage: toolbar standard + CRUD in Modal centrato +
 *  soft-delete (archivia/ripristina/elimina-definitiva/storico). Riusa i permessi
 *  resource:create/update/read. La Elimina lato backend archivia + controllo d'uso
 *  (409 se la competenza è assegnata a risorse → messaggio via toast). */
export function SkillsPage() {
  const [q, setQ] = useState('');
  const toast = useToast();
  const lk = useLookups();
  const skillCats = lk.byCategory('skill_category');
  const catLabel = (code: string | null) => (code ? (skillCats.find((c) => c.code === code) ? lookupLabel(skillCats.find((c) => c.code === code)!) : code) : '—');
  const { user } = useAuth();
  const canWrite = !!user?.permissions.includes('resource:create' as never) || !!user?.permissions.includes('resource:update' as never);
  const [archived, setArchived] = useArchivedView();
  const [clearTok, setClearTok] = useState(0);
  const [audit, setAudit] = useState<{ id: string; title: string } | null>(null);
  const { data, loading, error, reload } = useApi<{ items: SkillDto[] }>(`/skills${archived ? '?archived=1' : ''}`);
  useReloadOnEnter(reload);

  // editing: undefined = chiuso, null = nuovo, SkillDto = modifica
  const [editing, setEditing] = useState<SkillDto | null | undefined>(undefined);
  const [form, setForm] = useState<{ name: string; category: string; active: boolean }>({ name: '', category: '', active: true });
  const [busy, setBusy] = useState(false);

  function openNew(prefill?: SkillDto) {
    setForm({ name: prefill?.name ?? '', category: prefill?.category ?? '', active: prefill?.active ?? true });
    setEditing(null);
  }
  function openEdit(row: SkillDto) {
    setForm({ name: row.name, category: row.category ?? '', active: row.active });
    setEditing(row);
  }

  async function save() {
    if (!form.name.trim()) { toast('Il nome è obbligatorio', 'error'); return; }
    setBusy(true);
    try {
      const body = { name: form.name.trim(), category: form.category.trim() || null, active: form.active };
      if (editing) await mutate('PATCH', `/skills/${editing.id}`, body);
      else await apiFetch('/skills', { method: 'POST', body: JSON.stringify(body) });
      toast(editing ? 'Modifiche salvate' : 'Competenza creata');
      setEditing(undefined); reload();
    } catch (e) { toast(errMsg(e), 'error'); }
    finally { setBusy(false); }
  }

  // Cancellazione DIRETTA: EntityList ha già chiesto conferma (col nome). Niente seconda conferma.
  // Il backend archivia + 409 se la competenza è assegnata a risorse.
  async function deleteSkills(rs: SkillDto[]) {
    try {
      for (const r of rs) await mutate('DELETE', `/skills/${r.id}`);
      toast(rs.length > 1 ? `${rs.length} competenze eliminate` : 'Competenza eliminata');
      setClearTok((x) => x + 1); reload();
    } catch (e) { toast(errMsg(e), 'error'); }
  }
  async function onRestore(rs: SkillDto[]) {
    try {
      for (const r of rs) await mutate('POST', `/skills/${r.id}/restore`);
      toast(rs.length > 1 ? `${rs.length} competenze ripristinate` : 'Competenza ripristinata');
      setClearTok((x) => x + 1); reload();
    } catch (e) { toast(errMsg(e) || 'Errore durante il ripristino', 'error'); }
  }
  async function onPurge(rs: SkillDto[]) {
    try {
      for (const r of rs) await mutate('DELETE', `/skills/${r.id}/purge`);
      toast(rs.length > 1 ? `${rs.length} competenze eliminate definitivamente` : 'Competenza eliminata definitivamente');
      setClearTok((x) => x + 1); reload();
    } catch (e) { toast(errMsg(e) || 'Errore durante l\'eliminazione', 'error'); }
  }

  const cols: ListColumn<SkillDto>[] = [
    { key: 'name', header: 'Competenza', value: (r) => r.name, render: (r) => <span className="cellname">{r.name}</span> },
    { key: 'category', header: 'Categoria', value: (r) => catLabel(r.category), render: (r) => catLabel(r.category) },
    { key: 'active', header: 'Attiva', value: (r) => (r.active ? 'sì' : 'no'), render: (r) => <span className="chip">{r.active ? 'attiva' : 'disattivata'}</span> },
  ];
  const rightActions: ListAction[] = canWrite ? [{ key: 'new', icon: Plus, tip: 'Nuova competenza', variant: 'primary', onClick: () => openNew() }] : [];

  const rows = (data?.items ?? []).filter((r) => !q.trim() || `${r.name} ${r.category ?? ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <Page>
      <EntityList<SkillDto> title="Competenze" subtitle="Catalogo competenze assegnabili alle risorse"
        search={q} onSearch={setQ} searchPlaceholder="Cerca competenza…"
        rightActions={rightActions}
        onRowClick={canWrite ? openEdit : undefined}
        onEdit={canWrite ? openEdit : undefined}
        onDuplicate={canWrite ? (r) => openNew(r) : undefined}
        onDelete={canWrite ? deleteSkills : undefined}
        rowLabel={(r) => r.name}
        archived={archived}
        clearSelectionToken={clearTok}
        onToggleArchived={(v) => { setArchived(v); setClearTok((x) => x + 1); }}
        onRestore={canWrite ? onRestore : undefined}
        onPurge={canWrite ? onPurge : undefined}
        onHistory={(row) => setAudit({ id: row.id, title: row.name })}
        archivedBadge={(row) => row.archivedAt ? `Archiviato${row.archivedByName ? ' da ' + row.archivedByName : ''}` : null}
        columns={cols} rows={rows} loading={loading} error={error}
        exportName="competenze" emptyText="Nessuna competenza." />

      <Modal open={editing !== undefined} size="md" title={editing ? 'Modifica competenza' : 'Nuova competenza'} onClose={() => setEditing(undefined)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setEditing(undefined)} disabled={busy}>Annulla</button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>{busy ? 'Salvo…' : 'Salva'}</button>
        </>}>
        <div className="dsx">
          <div className="bgrid">
            <div className="bf c4"><span className="bl">Nome <span className="req">*</span></span>
              <input className="bi" autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Saldatura, Cablaggio…" /></div>
            <div className="bf c2"><span className="bl">Categoria</span>
              <select className="bi" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                <option value="">— nessuna —</option>
                {skillCats.map((c) => <option key={c.code} value={c.code}>{lookupLabel(c)}</option>)}
                {form.category && !skillCats.some((c) => c.code === form.category) && <option value={form.category}>{form.category}</option>}
              </select></div>
            <div className="bf c2"><span className="bl">Attiva</span>
              <select className="bi" value={form.active ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === '1' }))}>
                <option value="1">Sì</option><option value="0">No</option></select></div>
          </div>
        </div>
      </Modal>

      {audit && <AuditDialog entity="skill" entityId={audit.id} title={audit.title} onClose={() => setAudit(null)} />}
    </Page>
  );
}

/* ── Aliquote IVA (tax_rate) ───────────────────────────────────────── */
/** Gestione COMPLETA come UnitsPage: toolbar standard + CRUD in Modal centrato.
 *  Le righe di SISTEMA (isSystem) sono in sola lettura; la Duplica è consentita
 *  anche su di esse (senza copiare lo stato di sistema). */
const COUNTRIES = ['IT', 'AR'];

export function TaxRatesPage() {
  const [q, setQ] = useState('');
  const toast = useToast();
  const { user } = useAuth();
  const canWrite = !!user?.permissions.includes('settings:manage' as never);
  const [archived, setArchived] = useArchivedView();
  const [clearTok, setClearTok] = useState(0);
  const [audit, setAudit] = useState<{ id: string; title: string } | null>(null);
  const { data, loading, error, reload } = useApi<{ items: TaxRateDto[] }>(`/tax-rates${archived ? '?archived=1' : ''}`);
  useReloadOnEnter(reload);

  // editing: undefined = chiuso, null = nuovo, TaxRateDto = modifica
  const [editing, setEditing] = useState<TaxRateDto | null | undefined>(undefined);
  const [form, setForm] = useState<{ country: string; code: string; label: string; percent: number | null; isDefault: boolean; active: boolean }>(
    { country: 'IT', code: '', label: '', percent: null, isDefault: false, active: true });
  const [busy, setBusy] = useState(false);

  function openNew(prefill?: TaxRateDto) {
    setForm({
      country: prefill?.country ?? 'IT', code: prefill?.code ?? '', label: prefill?.label ?? '',
      percent: prefill?.percent ?? null, isDefault: prefill?.isDefault ?? false, active: prefill?.active ?? true,
    });
    setEditing(null);
  }
  function openEdit(row: TaxRateDto) {
    if (row.isSystem) { toast('Voce di sistema: in sola lettura', 'error'); return; }
    setForm({ country: row.country, code: row.code, label: row.label, percent: row.percent, isDefault: row.isDefault, active: row.active });
    setEditing(row);
  }

  async function save() {
    if (form.country.trim().length !== 2) { toast('Il paese deve essere un codice di 2 lettere', 'error'); return; }
    if (!form.code.trim() || !form.label.trim()) { toast('Codice e descrizione sono obbligatori', 'error'); return; }
    if (form.percent == null) { toast("L'aliquota è obbligatoria", 'error'); return; }
    setBusy(true);
    try {
      const body = { country: form.country.trim().toUpperCase(), code: form.code.trim(), label: form.label.trim(), percent: form.percent, isDefault: form.isDefault, active: form.active };
      if (editing) await mutate('PATCH', `/tax-rates/${editing.id}`, body);
      else await apiFetch('/tax-rates', { method: 'POST', body: JSON.stringify(body) });
      toast(editing ? 'Modifiche salvate' : 'Aliquota creata');
      setEditing(undefined); reload();
    } catch (e) { toast(errMsg(e), 'error'); }
    finally { setBusy(false); }
  }

  // Cancellazione DIRETTA: EntityList ha già chiesto conferma (col nome). Niente seconda conferma.
  async function deleteRates(rs: TaxRateDto[]) {
    const own = rs.filter((r) => !r.isSystem);
    if (rs.some((r) => r.isSystem)) toast('Le aliquote di sistema non sono eliminabili', 'error');
    if (!own.length) return;
    try {
      for (const r of own) await mutate('DELETE', `/tax-rates/${r.id}`);
      toast(own.length > 1 ? `${own.length} aliquote eliminate` : 'Aliquota eliminata');
      setClearTok((x) => x + 1); reload();
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  async function onRestore(rs: TaxRateDto[]) {
    try {
      for (const r of rs) await mutate('POST', `/tax-rates/${r.id}/restore`);
      toast(rs.length > 1 ? `${rs.length} aliquote ripristinate` : 'Aliquota ripristinata');
      setClearTok((x) => x + 1); reload();
    } catch (e) { toast(errMsg(e) || 'Errore durante il ripristino', 'error'); }
  }
  async function onPurge(rs: TaxRateDto[]) {
    try {
      for (const r of rs) await mutate('DELETE', `/tax-rates/${r.id}/purge`);
      toast(rs.length > 1 ? `${rs.length} aliquote eliminate definitivamente` : 'Aliquota eliminata definitivamente');
      setClearTok((x) => x + 1); reload();
    } catch (e) { toast(errMsg(e) || 'Errore durante l\'eliminazione', 'error'); }
  }

  const cols: ListColumn<TaxRateDto>[] = [
    { key: 'code', header: 'Codice', value: (r) => r.code, render: (r) => <span className="cellname mono">{r.code}</span> },
    { key: 'label', header: 'Descrizione', value: (r) => r.label, render: (r) => r.label },
    { key: 'country', header: 'Paese', value: (r) => r.country, render: (r) => <span className="chip">{r.country}</span> },
    { key: 'percent', header: 'Aliquota', num: true, value: (r) => r.percent, render: (r) => <span className="mono">{r.percent}%</span> },
    { key: 'default', header: 'Predefinita', value: (r) => (r.isDefault ? 'sì' : ''), render: (r) => (r.isDefault ? <span className="chip">predefinita</span> : <span className="faint">—</span>) },
    { key: 'system', header: 'Origine', value: (r) => (r.isSystem ? 'Sistema' : 'Tenant'), render: (r) => <span className="chip">{r.isSystem ? 'Sistema' : 'Personalizzata'}</span> },
  ];
  const rightActions: ListAction[] = canWrite ? [{ key: 'new', icon: Plus, tip: 'Nuova aliquota IVA', variant: 'primary', onClick: () => openNew() }] : [];

  const rows = (data?.items ?? []).filter((r) => !q.trim() || `${r.code} ${r.label} ${r.country}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <Page>
      <EntityList<TaxRateDto> title="Aliquote IVA" subtitle="Catalogo imposte per paese — le voci di sistema sono in sola lettura"
        search={q} onSearch={setQ} searchPlaceholder="Cerca codice, descrizione…"
        rightActions={rightActions}
        onRowClick={canWrite ? openEdit : undefined}
        onEdit={canWrite ? openEdit : undefined}
        onDuplicate={canWrite ? (r) => openNew(r) : undefined}
        onDelete={canWrite ? deleteRates : undefined}
        rowLabel={(r) => r.code}
        archived={archived}
        clearSelectionToken={clearTok}
        onToggleArchived={(v) => { setArchived(v); setClearTok((x) => x + 1); }}
        onRestore={canWrite ? onRestore : undefined}
        onPurge={canWrite ? onPurge : undefined}
        onHistory={(row) => setAudit({ id: row.id, title: row.code })}
        archivedBadge={(row) => row.archivedAt ? `Archiviato${row.archivedByName ? ' da ' + row.archivedByName : ''}` : null}
        columns={cols} rows={rows} loading={loading} error={error}
        exportName="aliquote-iva" emptyText="Nessuna aliquota." />

      <Modal open={editing !== undefined} size="md" title={editing ? 'Modifica aliquota IVA' : 'Nuova aliquota IVA'} onClose={() => setEditing(undefined)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setEditing(undefined)} disabled={busy}>Annulla</button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>{busy ? 'Salvo…' : 'Salva'}</button>
        </>}>
        <div className="dsx">
          <div className="bgrid">
            <div className="bf c2"><span className="bl">Paese <span className="req">*</span></span>
              <select className="bi" value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            <div className="bf c2"><span className="bl">Codice <span className="req">*</span></span>
              <input className="bi mono" autoFocus value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="IVA22, IVA10…" /></div>
            <div className="bf c4"><span className="bl">Descrizione <span className="req">*</span></span>
              <input className="bi" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="IVA ordinaria 22%…" /></div>
            <div className="bf c2"><span className="bl">Aliquota %</span>
              <NumInput value={form.percent} onChange={(n) => setForm((f) => ({ ...f, percent: n }))} align="right" placeholder="22" /></div>
            <div className="bf c2"><span className="bl">Predefinita</span>
              <select className="bi" value={form.isDefault ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.value === '1' }))}>
                <option value="0">No</option><option value="1">Sì</option></select></div>
            <div className="bf c2"><span className="bl">Attiva</span>
              <select className="bi" value={form.active ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === '1' }))}>
                <option value="1">Sì</option><option value="0">No</option></select></div>
          </div>
        </div>
      </Modal>

      {audit && <AuditDialog entity="tax_rate" entityId={audit.id} title={audit.title} onClose={() => setAudit(null)} />}
    </Page>
  );
}
