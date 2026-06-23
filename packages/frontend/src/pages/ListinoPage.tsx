/**
 * ListinoPage — Listino voci di capitolato (mock 46, Blocco D), su EntityList.
 * Viste = filtri salvati; margine calcolato; conteggio ritocchi (override).
 */
import { useState } from 'react';
import { useHistory } from 'react-router';
import type { PriceListItemDto } from '@sisuite/shared';
import { Page } from '../components/Page';
import { Money } from '../ui/Num';
import { EntityList, type ListColumn, type ListView, type ListAction } from '../ui/EntityList';
import { useEntityActions } from '../ui/useEntityActions';
import { SlidersHorizontal, Columns3, Plus } from '../ui/icons';
import { useApi } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';

interface ListResp {
  items: PriceListItemDto[]; total: number; limit: number; offset: number;
  views: { all: number; overrides: number; inactive: number };
}
type ViewKey = 'all' | 'overrides' | 'inactive';
const VIEW_LABEL: Record<ViewKey, string> = { all: 'Tutte', overrides: 'Con ritocchi', inactive: 'Disattivate' };

export function ListinoPage() {
  const { user } = useAuth();
  const history = useHistory();
  const canManage = !!user?.permissions.includes('settings:manage' as never);

  const [view, setView] = useState<ViewKey>('all');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [filterParam, setFilterParam] = useState<string | null>(null);
  const limit = 25;

  const params = new URLSearchParams({ view, limit: String(limit), offset: String(offset) });
  if (q.trim()) params.set('q', q.trim());
  if (filterParam) params.set('filter', filterParam);
  const { data, loading, error, reload } = useApi<ListResp>(`/price-list-items?${params.toString()}`);

  const { onDelete, onDuplicate } = useEntityActions<PriceListItemDto>({
    basePath: '/price-list-items', reload, noun: 'voce', newPath: '/price-list/new',
    // niente `code` (chiave univoca del listino: lo reinserisce l'utente)
    duplicateBody: (v) => ({ description: `${v.description} (copia)`, unit: v.unit, category: v.category ?? null, costPrice: v.costPrice, revenuePrice: v.revenuePrice }),
  });

  const views: ListView[] = (Object.keys(VIEW_LABEL) as ViewKey[]).map((k) => ({ key: k, label: VIEW_LABEL[k], count: data?.views[k] ?? 0 }));

  const columns: ListColumn<PriceListItemDto>[] = [
    { key: 'voce', header: 'Voce', sub: 'codice', value: (v) => v.description, render: (v) => (
      <div className="two"><span className="a">{v.description}</span><span className="b mono">{v.code}</span></div>) },
    { key: 'cat', header: 'Categoria', sub: 'unità', value: (v) => v.category ?? '', render: (v) => (
      <div className="two"><span className="a">{v.category ?? '—'}</span><span className="b">{v.unit}</span></div>) },
    { key: 'cost', header: 'Costo', sub: '€ / unità', num: true, value: (v) => v.costPrice ?? '', render: (v) => <Money value={v.costPrice} /> },
    { key: 'rev', header: 'Ricavo', sub: '€ / unità', num: true, value: (v) => v.revenuePrice ?? '', render: (v) => <Money value={v.revenuePrice} /> },
    { key: 'margin', header: 'Margine %', num: true, value: (v) => v.marginPct ?? '', render: (v) => v.marginPct == null ? <span className="faint">—</span>
      : <span className="mono" style={{ color: v.marginPct >= 0 ? 'var(--success)' : 'var(--danger)' }}>{v.marginPct.toFixed(1)}%</span> },
    { key: 'ov', header: 'Ritocchi', num: true, value: (v) => v.overrideCount, render: (v) => v.overrideCount > 0
      ? <span className="serialtag">{v.overrideCount}</span> : <span className="faint">—</span> },
  ];

  const exportFields = [
    { key: 'code', label: 'Codice', value: (v: PriceListItemDto) => v.code },
    { key: 'description', label: 'Descrizione', value: (v: PriceListItemDto) => v.description },
    { key: 'category', label: 'Categoria', value: (v: PriceListItemDto) => v.category ?? '' },
    { key: 'unit', label: 'Unità', value: (v: PriceListItemDto) => v.unit },
    { key: 'costPrice', label: 'Costo', value: (v: PriceListItemDto) => v.costPrice ?? '' },
    { key: 'revenuePrice', label: 'Ricavo', value: (v: PriceListItemDto) => v.revenuePrice ?? '' },
    { key: 'marginPct', label: 'Margine %', value: (v: PriceListItemDto) => v.marginPct ?? '' },
    { key: 'overrideCount', label: 'Ritocchi', value: (v: PriceListItemDto) => v.overrideCount },
  ];

  const leftActions: ListAction[] = [
    { key: 'filters', icon: SlidersHorizontal, tip: 'Filtri', disabled: true },
    { key: 'cols', icon: Columns3, tip: 'Colonne', disabled: true },
  ];
  const rightActions: ListAction[] = canManage
    ? [{ key: 'new', icon: Plus, tip: 'Nuova voce', variant: 'primary' as const, onClick: () => history.push('/price-list/new') }] : [];

  return (
    <Page>
      <EntityList<PriceListItemDto>
        title="Listino voci di capitolato" subtitle="Prezzi costo/ricavo · regola: commessa › gestore › base"
        views={views} activeView={view} onView={(k) => { setView(k as ViewKey); setOffset(0); }}
        search={q} onSearch={(v) => { setQ(v); setOffset(0); }} searchPlaceholder="Cerca voce, codice, categoria…"
        leftActions={leftActions} rightActions={rightActions}
        columns={columns} rows={data?.items ?? []} loading={loading} error={error}
        onRowClick={(v) => history.push(`/price-list/${v.id}`)}
        onDelete={canManage ? onDelete : undefined}
        onDuplicate={canManage ? onDuplicate : undefined}
        exportName="listino" exportFields={exportFields}
        onFilterChange={(s) => { setFilterParam(s ? JSON.stringify(s) : null); setOffset(0); }}
        total={data?.total} limit={limit} offset={offset} onPage={setOffset}
        emptyText="Nessuna voce in questa vista."
      />
    </Page>
  );
}
