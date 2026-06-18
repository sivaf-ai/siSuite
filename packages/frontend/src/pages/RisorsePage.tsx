/**
 * RisorsePage — Risorse (persone/mezzi/attrezzature) su EntityList v2.
 * Viste per tipo; click riga → /resources/:id (ObjectPage).
 */
import { useState } from 'react';
import { useHistory } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { ResourceDto } from '@sisuite/shared';
import { Page } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { Money } from '../ui/Num';
import { EntityList, type ListColumn, type ListView, type ListAction } from '../ui/EntityList';
import { useEntityActions } from '../ui/useEntityActions';
import { SlidersHorizontal, Columns3, Sparkles, Plus } from '../ui/icons';
import { useApi } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';

const KIND_LABEL: Record<string, string> = { person: 'Persona', vehicle: 'Mezzo', equipment: 'Attrezzatura' };
type ViewKey = 'all' | 'person' | 'vehicle' | 'equipment';
const VIEW_LABEL: Record<ViewKey, string> = { all: 'Tutte', person: 'Persone', vehicle: 'Mezzi', equipment: 'Attrezzature' };

interface ListResp { items: ResourceDto[]; total: number; limit: number; offset: number; views: Record<ViewKey, number> }

export function RisorsePage() {
  const { user } = useAuth();
  const history = useHistory();
  const { t } = useTranslation();
  const can = (a: string) => !!user?.permissions.includes(`resource:${a}` as never);

  const [view, setView] = useState<ViewKey>('all');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [filterParam, setFilterParam] = useState<string | null>(null);
  const limit = 25;

  const params = new URLSearchParams({ limit: String(limit), offset: String(offset), sortBy: 'label', sortDir: 'asc' });
  if (view !== 'all') params.set('kind', view);
  if (q.trim()) params.set('q', q.trim());
  if (filterParam) params.set('filter', filterParam);
  const { data, loading, error, reload } = useApi<ListResp>(`/resources?${params.toString()}`);

  const { onDelete, onDuplicate } = useEntityActions<ResourceDto>({
    basePath: '/resources', reload, noun: 'risorsa',
    duplicateBody: (r) => ({ kind: r.kind, label: `${r.label} (copia)`, active: r.active, attributes: r.attributes }),
  });

  const views: ListView[] = (Object.keys(VIEW_LABEL) as ViewKey[]).map((k) => ({ key: k, label: VIEW_LABEL[k], count: data?.views?.[k] ?? 0 }));

  const columns: ListColumn<ResourceDto>[] = [
    { key: 'label', header: 'Nome', sub: 'tipo', value: (r) => r.label, render: (r) => (
      <div className="two"><span className="a">{r.label}</span><span className="b">{KIND_LABEL[r.kind]}</span></div>) },
    { key: 'cost', header: 'Costo orario', sub: '€ / h', num: true, value: (r) => ((r.attributes as Record<string, unknown>)?.hourly_cost as number) ?? '', render: (r) => <Money value={(r.attributes as Record<string, unknown>)?.hourly_cost as number ?? null} /> },
    { key: 'active', header: 'Stato', value: (r) => (r.active ? 'Attiva' : 'Disattivata'), render: (r) => <StatusPill label={r.active ? 'Attiva' : 'Disattivata'} token={r.active ? 'success' : 'neutral'} /> },
  ];

  const exportFields = [
    { key: 'label', label: 'Nome', value: (r: ResourceDto) => r.label },
    { key: 'kind', label: 'Tipo', value: (r: ResourceDto) => KIND_LABEL[r.kind] },
    { key: 'hourly_cost', label: 'Costo orario (€/h)', value: (r: ResourceDto) => ((r.attributes as Record<string, unknown>)?.hourly_cost as number) ?? '' },
    { key: 'active', label: 'Stato', value: (r: ResourceDto) => (r.active ? 'Attiva' : 'Disattivata') },
    { key: 'userName', label: 'Utente collegato', value: (r: ResourceDto) => r.userName ?? '' },
  ];

  const leftActions: ListAction[] = [
    { key: 'filters', icon: SlidersHorizontal, tip: 'Filtri', disabled: true },
    { key: 'cols', icon: Columns3, tip: 'Colonne', disabled: true },
    { key: 'ai', icon: Sparkles, tip: 'Azioni AI (presto)', variant: 'ai', disabled: true },
  ];
  const rightActions: ListAction[] = [
    ...(can('create') ? [{ key: 'new', icon: Plus, tip: 'Nuova risorsa', variant: 'primary' as const, onClick: () => history.push('/resources/new') }] : []),
  ];

  return (
    <Page>
      <EntityList<ResourceDto>
        title={t('terms.resource_plural')} subtitle="Persone, mezzi e attrezzature"
        views={views} activeView={view} onView={(k) => { setView(k as ViewKey); setOffset(0); }}
        search={q} onSearch={(v) => { setQ(v); setOffset(0); }} searchPlaceholder="Cerca per nome…"
        leftActions={leftActions} rightActions={rightActions}
        columns={columns} rows={data?.items ?? []} loading={loading} error={error}
        onRowClick={(r) => history.push(`/resources/${r.id}`)}
        onDelete={can('delete') ? onDelete : undefined}
        onDuplicate={can('create') ? onDuplicate : undefined}
        exportName="risorse" exportFields={exportFields} entity="resource"
        onFilterChange={(s) => { setFilterParam(s ? JSON.stringify(s) : null); setOffset(0); }}
        total={data?.total} limit={limit} offset={offset} onPage={setOffset}
        emptyText="Nessuna risorsa in questa vista."
      />
    </Page>
  );
}
