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
  const limit = 25;

  const params = new URLSearchParams({ view, limit: String(limit), offset: String(offset) });
  if (q.trim()) params.set('q', q.trim());
  const { data, loading, error } = useApi<ListResp>(`/price-list-items?${params.toString()}`);

  const views: ListView[] = (Object.keys(VIEW_LABEL) as ViewKey[]).map((k) => ({ key: k, label: VIEW_LABEL[k], count: data?.views[k] ?? 0 }));

  const columns: ListColumn<PriceListItemDto>[] = [
    { key: 'voce', header: 'Voce', sub: 'codice', render: (v) => (
      <div className="two"><span className="a">{v.description}</span><span className="b mono">{v.code}</span></div>) },
    { key: 'cat', header: 'Categoria', sub: 'unità', render: (v) => (
      <div className="two"><span className="a">{v.category ?? '—'}</span><span className="b">{v.unit}</span></div>) },
    { key: 'cost', header: 'Costo', sub: '€ / unità', num: true, render: (v) => <Money value={v.costPrice} /> },
    { key: 'rev', header: 'Ricavo', sub: '€ / unità', num: true, render: (v) => <Money value={v.revenuePrice} /> },
    { key: 'margin', header: 'Margine %', num: true, render: (v) => v.marginPct == null ? <span className="faint">—</span>
      : <span className="mono" style={{ color: v.marginPct >= 0 ? 'var(--success)' : 'var(--danger)' }}>{v.marginPct.toFixed(1)}%</span> },
    { key: 'ov', header: 'Ritocchi', num: true, render: (v) => v.overrideCount > 0
      ? <span className="serialtag">{v.overrideCount}</span> : <span className="faint">—</span> },
  ];

  const leftActions: ListAction[] = [
    { key: 'filters', icon: SlidersHorizontal, tip: 'Filtri', disabled: true },
    { key: 'cols', icon: Columns3, tip: 'Colonne', disabled: true },
  ];
  const rightActions: ListAction[] = canManage
    ? [{ key: 'new', icon: Plus, tip: 'Nuova voce', variant: 'primary' as const, onClick: () => history.push('/price-list/new') }] : [];

  return (
    <Page title="Listino voci di capitolato">
      <EntityList<PriceListItemDto>
        title="Listino voci di capitolato" subtitle="Prezzi costo/ricavo · regola: commessa › gestore › base"
        views={views} activeView={view} onView={(k) => { setView(k as ViewKey); setOffset(0); }}
        search={q} onSearch={(v) => { setQ(v); setOffset(0); }} searchPlaceholder="Cerca voce, codice, categoria…"
        leftActions={leftActions} rightActions={rightActions}
        columns={columns} rows={data?.items ?? []} loading={loading} error={error}
        onRowClick={(v) => history.push(`/price-list/${v.id}`)}
        total={data?.total} limit={limit} offset={offset} onPage={setOffset}
        emptyText="Nessuna voce in questa vista."
      />
    </Page>
  );
}
