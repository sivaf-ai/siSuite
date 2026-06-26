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
import { Plus } from '../ui/icons';
import { useApi, useReloadOnEnter } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';

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
  const history = useHistory();
  const { user } = useAuth();
  const canManage = !!user?.permissions.includes('stock:manage' as never);
  const { data, loading, error, reload } = useApi<{ items: PurchaseOrderDto[] }>('/purchase-orders');
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
        columns={cols} rows={(data?.items ?? []).filter((r) => !q.trim() || `${r.number ?? ''} ${r.supplierName ?? ''}`.toLowerCase().includes(q.toLowerCase()))}
        loading={loading} error={error} exportName="ordini-acquisto" emptyText="Nessun ordine d'acquisto." />
    </Page>
  );
}

/* ── Pick list ─────────────────────────────────────────────────────── */
export function PickListsPage() {
  const [q, setQ] = useState('');
  const history = useHistory();
  const { user } = useAuth();
  const canManage = !!user?.permissions.includes('stock:manage' as never);
  const { data, loading, error, reload } = useApi<{ items: PickListDto[] }>('/pick-lists');
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
        columns={cols} rows={(data?.items ?? []).filter((r) => !q.trim() || `${r.number ?? ''} ${r.sourceLocationName ?? ''}`.toLowerCase().includes(q.toLowerCase()))}
        loading={loading} error={error} exportName="pick-list" emptyText="Nessuna pick list." />
    </Page>
  );
}

/* ── DDT / Documenti di magazzino ──────────────────────────────────── */
export function DdtPage() {
  const [q, setQ] = useState('');
  const history = useHistory();
  const { user } = useAuth();
  const canManage = !!user?.permissions.includes('stock:manage' as never);
  const { data, loading, error, reload } = useApi<{ items: StockDocumentDto[] }>('/stock/documents');
  useReloadOnEnter(reload);
  const { onDelete } = useEntityActions<StockDocumentDto>({ basePath: '/stock/documents', reload, noun: 'documento' });
  const cols: ListColumn<StockDocumentDto>[] = [
    { key: 'number', header: 'Numero', value: (r) => r.number ?? 'bozza', render: (r) => numberCell(r.number) },
    { key: 'type', header: 'Tipo', value: (r) => DOC_TYPE[r.typeCanonical ?? ''] ?? (r.typeCanonical ?? '—'), render: (r) => <span className="chip">{DOC_TYPE[r.typeCanonical ?? ''] ?? (r.typeCanonical ?? '—')}</span> },
    { key: 'status', header: 'Stato', value: (r) => DOC_STATUS[r.status]?.label ?? r.status, render: (r) => pill(DOC_STATUS, r.status) },
    { key: 'flow', header: 'Origine → Destinazione', value: (r) => `${r.sourceLocationName ?? ''} ${r.destLocationName ?? ''}`, render: (r) => <span className="cellsub">{(r.sourceLocationName ?? '—')} → {(r.destLocationName ?? '—')}</span> },
    { key: 'date', header: 'Data', num: true, value: (r) => dfmt(r.docDate), render: (r) => <span className="cellsub">{dfmt(r.docDate)}</span> },
  ];
  const rightActions: ListAction[] = canManage ? [{ key: 'new', icon: Plus, tip: 'Nuovo documento', variant: 'primary', onClick: () => history.push('/stock/documents/new') }] : [];
  return (
    <Page>
      <EntityList<StockDocumentDto> title="Documenti di magazzino" subtitle="DDT · Carichi · Trasferimenti · Rettifiche · solo le bozze sono eliminabili"
        search={q} onSearch={setQ} searchPlaceholder="Cerca numero, magazzino…"
        rightActions={rightActions} onRowClick={(r) => history.push(`/stock/documents/${r.id}`)}
        onDelete={canManage ? onDelete : undefined} rowLabel={(r) => r.number ?? 'bozza'}
        columns={cols} rows={(data?.items ?? []).filter((r) => !q.trim() || `${r.number ?? ''} ${r.sourceLocationName ?? ''} ${r.destLocationName ?? ''}`.toLowerCase().includes(q.toLowerCase()))}
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
export function SkillsPage() {
  const [q, setQ] = useState('');
  const { data, loading, error } = useApi<{ items: SkillDto[] }>('/skills');
  const cols: ListColumn<SkillDto>[] = [
    { key: 'name', header: 'Competenza', value: (r) => r.name, render: (r) => <span className="cellname">{r.name}</span> },
    { key: 'category', header: 'Categoria', value: (r) => r.category ?? '', render: (r) => r.category ?? '—' },
    { key: 'active', header: 'Attiva', value: (r) => (r.active ? 'sì' : 'no'), render: (r) => <span className="chip">{r.active ? 'attiva' : 'disattivata'}</span> },
  ];
  return (
    <Page>
      <EntityList<SkillDto> title="Competenze" subtitle="Catalogo competenze assegnabili alle risorse"
        search={q} onSearch={setQ} searchPlaceholder="Cerca competenza…" selectable={false}
        columns={cols} rows={(data?.items ?? []).filter((r) => !q.trim() || `${r.name} ${r.category ?? ''}`.toLowerCase().includes(q.toLowerCase()))}
        loading={loading} error={error} exportName="competenze" emptyText="Nessuna competenza." />
    </Page>
  );
}

/* ── Aliquote IVA (tax_rate) ───────────────────────────────────────── */
export function TaxRatesPage() {
  const [q, setQ] = useState('');
  const { data, loading, error } = useApi<{ items: TaxRateDto[] }>('/tax-rates');
  const cols: ListColumn<TaxRateDto>[] = [
    { key: 'code', header: 'Codice', value: (r) => r.code, render: (r) => <span className="cellname mono">{r.code}</span> },
    { key: 'label', header: 'Descrizione', value: (r) => r.label, render: (r) => r.label },
    { key: 'country', header: 'Paese', value: (r) => r.country, render: (r) => <span className="chip">{r.country}</span> },
    { key: 'percent', header: 'Aliquota', num: true, value: (r) => r.percent, render: (r) => <span className="mono">{r.percent}%</span> },
    { key: 'default', header: 'Predefinita', value: (r) => (r.isDefault ? 'sì' : ''), render: (r) => (r.isDefault ? <span className="chip">predefinita</span> : <span className="faint">—</span>) },
  ];
  return (
    <Page>
      <EntityList<TaxRateDto> title="Aliquote IVA" subtitle="Catalogo imposte per paese"
        search={q} onSearch={setQ} searchPlaceholder="Cerca codice, descrizione…" selectable={false}
        columns={cols} rows={(data?.items ?? []).filter((r) => !q.trim() || `${r.code} ${r.label} ${r.country}`.toLowerCase().includes(q.toLowerCase()))}
        loading={loading} error={error} exportName="aliquote-iva" emptyText="Nessuna aliquota." />
    </Page>
  );
}
