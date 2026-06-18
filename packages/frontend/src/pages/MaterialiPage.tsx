/**
 * MaterialiPage — Articoli & seriali, lista (mock 45), sul componente EntityList.
 * Viste = filtri salvati; righe a 2 livelli; giacenza/costo a destra; stato a pill.
 */
import { useState } from 'react';
import { useHistory } from 'react-router';
import type { MaterialDto } from '@sisuite/shared';
import { Page } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { Money } from '../ui/Num';
import { EntityList, type ListColumn, type ListView, type ListAction } from '../ui/EntityList';
import { useEntityActions } from '../ui/useEntityActions';
import { SlidersHorizontal, Columns3, Sparkles, Plus } from '../ui/icons';
import { useApi } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';

interface ListResp {
  items: MaterialDto[]; total: number; limit: number; offset: number;
  views: { all: number; stock: number; serial: number; service: number; low: number };
}
type ViewKey = 'all' | 'stock' | 'serial' | 'service' | 'low';
const VIEW_LABEL: Record<ViewKey, string> = {
  all: 'Tutti', stock: 'A magazzino', serial: 'A seriale', service: 'Servizi', low: 'Scorta bassa',
};
const attr = (m: MaterialDto, k: string) => (m.attributes as Record<string, unknown>)[k] as string | undefined;

function trackingTag(m: MaterialDto): string {
  if (attr(m, 'item_type') === 'service') return 'servizio';
  if (m.trackedBySerial) return 'a seriale';
  if (m.trackStock) return 'a magazzino';
  return '—';
}
function statusOf(m: MaterialDto): { label: string; token: string } {
  if (attr(m, 'item_type') === 'service') return { label: 'Servizio', token: 'neutral' };
  if (m.lowStock) return { label: 'Scorta bassa', token: 'warning' };
  if (m.qtyOnHand > 0) return { label: 'Disponibile', token: 'success' };
  return { label: 'Esaurito', token: 'neutral' };
}

export function MaterialiPage() {
  const { user } = useAuth();
  const history = useHistory();
  const can = (a: string) => !!user?.permissions.includes(`material:${a}` as never);

  const [view, setView] = useState<ViewKey>('all');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [filterParam, setFilterParam] = useState<string | null>(null);
  const limit = 25;

  const params = new URLSearchParams({ view, limit: String(limit), offset: String(offset) });
  if (q.trim()) params.set('q', q.trim());
  if (filterParam) params.set('filter', filterParam);
  const { data, loading, error, reload } = useApi<ListResp>(`/materials?${params.toString()}`);

  const { onDelete, onDuplicate } = useEntityActions<MaterialDto>({
    basePath: '/materials', reload, noun: 'articolo',
    duplicateBody: (m) => ({ name: `${m.name} (copia)`, unit: m.unit, sku: null, trackStock: m.trackStock, trackedBySerial: m.trackedBySerial, trackedByLot: m.trackedByLot, costingMethod: m.costingMethod, attributes: m.attributes }),
  });

  const views: ListView[] = (Object.keys(VIEW_LABEL) as ViewKey[]).map((k) => ({ key: k, label: VIEW_LABEL[k], count: data?.views[k] ?? 0 }));

  const columns: ListColumn<MaterialDto>[] = [
    { key: 'name', header: 'Articolo', sub: 'SKU', value: (m) => m.name, render: (m) => (
      <div className="two"><span className="a">{m.name}</span><span className="b mono">{m.sku ?? '—'}</span></div>) },
    { key: 'cat', header: 'Categoria', sub: 'tracciamento', value: (m) => attr(m, 'category') ?? '', render: (m) => (
      <div className="two"><span className="a">{attr(m, 'category') ?? '—'}</span><span className="b"><span className="serialtag">{trackingTag(m)}</span></span></div>) },
    { key: 'qty', header: 'Giacenza', sub: 'unità', num: true, value: (m) => (attr(m, 'item_type') === 'service' ? '' : m.qtyOnHand), render: (m) => (attr(m, 'item_type') === 'service'
      ? <span className="faint">—</span>
      : <div className="two"><span className="a mono">{m.qtyOnHand.toLocaleString('it-IT')}</span><span className="b">{m.unit}</span></div>) },
    { key: 'cost', header: 'Costo medio', sub: '€ / unità', num: true, value: (m) => m.avgCost ?? m.defaultCost ?? '', render: (m) => <Money value={m.avgCost ?? m.defaultCost} /> },
    { key: 'st', header: 'Stato', value: (m) => statusOf(m).label, render: (m) => { const s = statusOf(m); return <StatusPill label={s.label} token={s.token} />; } },
  ];

  const exportFields = [
    { key: 'name', label: 'Articolo', value: (m: MaterialDto) => m.name },
    { key: 'sku', label: 'SKU', value: (m: MaterialDto) => m.sku ?? '' },
    { key: 'unit', label: 'Unità di misura', value: (m: MaterialDto) => m.unit },
    { key: 'category', label: 'Categoria', value: (m: MaterialDto) => attr(m, 'category') ?? '' },
    { key: 'item_type', label: 'Tipo', value: (m: MaterialDto) => attr(m, 'item_type') ?? '' },
    { key: 'supplier_code', label: 'Codice fornitore', value: (m: MaterialDto) => attr(m, 'supplier_code') ?? '' },
    { key: 'tracking', label: 'Tracciamento', value: (m: MaterialDto) => trackingTag(m) },
    { key: 'costingMethod', label: 'Metodo costo', value: (m: MaterialDto) => m.costingMethod },
    { key: 'qtyOnHand', label: 'Giacenza', value: (m: MaterialDto) => m.qtyOnHand },
    { key: 'avgCost', label: 'Costo medio', value: (m: MaterialDto) => m.avgCost ?? m.defaultCost ?? '' },
    { key: 'min_stock', label: 'Scorta minima', value: (m: MaterialDto) => (attr(m, 'min_stock') as unknown as number) ?? '' },
    { key: 'status', label: 'Stato', value: (m: MaterialDto) => statusOf(m).label },
  ];

  const leftActions: ListAction[] = [
    { key: 'filters', icon: SlidersHorizontal, tip: 'Filtri', disabled: true },
    { key: 'cols', icon: Columns3, tip: 'Colonne', disabled: true },
    { key: 'ai', icon: Sparkles, tip: 'Azioni AI (presto)', variant: 'ai', disabled: true },
  ];
  const rightActions: ListAction[] = [
    ...(can('create') ? [{ key: 'new', icon: Plus, tip: 'Nuovo articolo', variant: 'primary' as const, onClick: () => history.push('/materials/new') }] : []),
  ];

  return (
    <Page>
      <EntityList<MaterialDto>
        title="Articoli & seriali" subtitle="Catalogo magazzino & servizi"
        views={views} activeView={view} onView={(k) => { setView(k as ViewKey); setOffset(0); }}
        search={q} onSearch={(v) => { setQ(v); setOffset(0); }} searchPlaceholder="Cerca nome, SKU, categoria…"
        leftActions={leftActions} rightActions={rightActions}
        columns={columns} rows={data?.items ?? []} loading={loading} error={error}
        onRowClick={(m) => history.push(`/materials/${m.id}`)}
        onDelete={can('delete') ? onDelete : undefined}
        onDuplicate={can('create') ? onDuplicate : undefined}
        exportName="articoli" exportFields={exportFields} entity="material"
        onFilterChange={(s) => { setFilterParam(s ? JSON.stringify(s) : null); setOffset(0); }}
        total={data?.total} limit={limit} offset={offset} onPage={setOffset}
        emptyText="Nessun articolo in questa vista."
      />
    </Page>
  );
}
