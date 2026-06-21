/**
 * SpecListsPages — liste minimali SPEC v1.1 (Deliverable 4, best-effort):
 *   Ordini d'acquisto · Pick list · Conteggi inventariali · Competenze · Aliquote IVA.
 * Sola lettura (EntityList standard, niente CRUD): le creazioni avvengono nei moduli
 * dedicati / drawer esistenti. Riusano gli endpoint backend già pronti.
 */
import { useState } from 'react';
import type { PurchaseOrderDto, PickListDto, StockCountDto, SkillDto, TaxRateDto } from '@sisuite/shared';
import { Page } from '../components/Page';
import { EntityList, type ListColumn } from '../ui/EntityList';
import { useApi } from '../api/hooks';

const dfmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('it-IT') : '—');

/* ── Ordini d'acquisto ─────────────────────────────────────────────── */
export function PurchaseOrdersPage() {
  const [q, setQ] = useState('');
  const { data, loading, error } = useApi<{ items: PurchaseOrderDto[] }>('/purchase-orders');
  const cols: ListColumn<PurchaseOrderDto>[] = [
    { key: 'number', header: 'Numero', value: (r) => r.number ?? 'bozza', render: (r) => <span className="cellname mono">{r.number ?? <em style={{ color: 'var(--ink-faint)' }}>bozza</em>}</span> },
    { key: 'supplier', header: 'Fornitore', value: (r) => r.supplierName ?? '', render: (r) => r.supplierName ?? '—' },
    { key: 'dest', header: 'Destinazione', value: (r) => r.destLocationName ?? '', render: (r) => r.destLocationName ?? '—' },
    { key: 'status', header: 'Stato', value: (r) => r.status, render: (r) => <span className="chip">{r.status}</span> },
    { key: 'orderDate', header: 'Data ordine', num: true, value: (r) => dfmt(r.orderDate), render: (r) => <span className="cellsub">{dfmt(r.orderDate)}</span> },
    { key: 'expected', header: 'Prevista', num: true, value: (r) => dfmt(r.expectedDate), render: (r) => <span className="cellsub">{dfmt(r.expectedDate)}</span> },
  ];
  return (
    <Page>
      <EntityList<PurchaseOrderDto> title="Ordini d'acquisto" subtitle="Ordini ai fornitori e ricezione merce"
        search={q} onSearch={setQ} searchPlaceholder="Cerca numero, fornitore…" selectable={false}
        columns={cols} rows={(data?.items ?? []).filter((r) => !q.trim() || `${r.number ?? ''} ${r.supplierName ?? ''}`.toLowerCase().includes(q.toLowerCase()))}
        loading={loading} error={error} exportName="ordini-acquisto" emptyText="Nessun ordine d'acquisto." />
    </Page>
  );
}

/* ── Pick list ─────────────────────────────────────────────────────── */
export function PickListsPage() {
  const [q, setQ] = useState('');
  const { data, loading, error } = useApi<{ items: PickListDto[] }>('/pick-lists');
  const cols: ListColumn<PickListDto>[] = [
    { key: 'number', header: 'Numero', value: (r) => r.number ?? 'bozza', render: (r) => <span className="cellname mono">{r.number ?? <em style={{ color: 'var(--ink-faint)' }}>bozza</em>}</span> },
    { key: 'source', header: 'Origine', value: (r) => r.sourceLocationName ?? '', render: (r) => r.sourceLocationName ?? '—' },
    { key: 'assigned', header: 'Assegnata a', value: (r) => r.assignedResourceLabel ?? '', render: (r) => r.assignedResourceLabel ?? '—' },
    { key: 'status', header: 'Stato', value: (r) => r.status, render: (r) => <span className="chip">{r.status}</span> },
    { key: 'created', header: 'Creata', num: true, value: (r) => dfmt(r.createdAt), render: (r) => <span className="cellsub">{dfmt(r.createdAt)}</span> },
  ];
  return (
    <Page>
      <EntityList<PickListDto> title="Pick list" subtitle="Prelievi di magazzino assegnati al campo"
        search={q} onSearch={setQ} searchPlaceholder="Cerca numero, origine…" selectable={false}
        columns={cols} rows={(data?.items ?? []).filter((r) => !q.trim() || `${r.number ?? ''} ${r.sourceLocationName ?? ''}`.toLowerCase().includes(q.toLowerCase()))}
        loading={loading} error={error} exportName="pick-list" emptyText="Nessuna pick list." />
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
