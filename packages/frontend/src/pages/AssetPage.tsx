/**
 * AssetPage — Asset (oggetto gestito) su EntityList v2. Click riga → /assets/:id.
 */
import { useState } from 'react';
import { useHistory } from 'react-router';
import type { AssetDto } from '@sisuite/shared';
import { Page } from '../components/Page';
import { EntityList, type ListColumn, type ListAction } from '../ui/EntityList';
import { SlidersHorizontal, Columns3, Sparkles, Download, Plus } from '../ui/icons';
import { useApi } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';

interface ListResp { items: AssetDto[]; total: number; limit: number; offset: number }

export function AssetPage() {
  const { user } = useAuth();
  const history = useHistory();
  const can = (a: string) => !!user?.permissions.includes(`asset:${a}` as never);

  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const params = new URLSearchParams({ limit: String(limit), offset: String(offset), sortBy: 'label', sortDir: 'asc' });
  if (q.trim()) params.set('q', q.trim());
  const { data, loading, error } = useApi<ListResp>(`/assets?${params.toString()}`);

  const columns: ListColumn<AssetDto>[] = [
    { key: 'label', header: 'Asset', sub: 'tipo', render: (r) => (
      <div className="two"><span className="a">{r.label}</span><span className="b">{r.kind}</span></div>) },
    { key: 'company', header: 'Cliente', sub: 'sito', render: (r) => (
      <div className="two"><span className="a">{r.companyName ?? '—'}</span><span className="b">{r.siteName ?? '—'}</span></div>) },
    { key: 'installed', header: 'Installato', num: true, render: (r) => <span className="mono faint">{r.installedOn ? new Date(r.installedOn).toLocaleDateString('it-IT') : '—'}</span> },
  ];

  const leftActions: ListAction[] = [
    { key: 'filters', icon: SlidersHorizontal, tip: 'Filtri', disabled: true },
    { key: 'cols', icon: Columns3, tip: 'Colonne', disabled: true },
    { key: 'ai', icon: Sparkles, tip: 'Azioni AI (presto)', variant: 'ai', disabled: true },
  ];
  const rightActions: ListAction[] = [
    { key: 'export', icon: Download, tip: 'Esporta (presto)', disabled: true },
    ...(can('create') ? [{ key: 'new', icon: Plus, tip: 'Nuovo asset', variant: 'primary' as const, onClick: () => history.push('/assets/new') }] : []),
  ];

  return (
    <Page title="Asset">
      <EntityList<AssetDto>
        title="Asset" subtitle="Oggetti gestiti: impianti, sistemi, apparati"
        search={q} onSearch={(v) => { setQ(v); setOffset(0); }} searchPlaceholder="Cerca etichetta o tipo…"
        leftActions={leftActions} rightActions={rightActions}
        columns={columns} rows={data?.items ?? []} loading={loading} error={error}
        onRowClick={(r) => history.push(`/assets/${r.id}`)}
        total={data?.total} limit={limit} offset={offset} onPage={setOffset}
        emptyText="Nessun asset."
      />
    </Page>
  );
}
