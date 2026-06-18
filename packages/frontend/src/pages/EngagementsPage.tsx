/**
 * EngagementsPage — Commesse su EntityList v2. Viste per tipo (Tutte/Realizzazione/
 * Manutenzione). Click riga → scheda /engagements/:id (ObjectPage). Nessuna icona-azione.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router';
import type { EngagementDto } from '@sisuite/shared';
import { Page } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { EntityList, type ListColumn, type ListView, type ListAction } from '../ui/EntityList';
import { useEntityActions } from '../ui/useEntityActions';
import { SlidersHorizontal, Columns3, Sparkles, Plus } from '../ui/icons';
import { useApi } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { useLookups } from '../context/Lookups';

type ViewKey = 'all' | 'build' | 'maintenance';
const VIEW_LABEL: Record<ViewKey, string> = { all: 'Tutte', build: 'Realizzazione', maintenance: 'Manutenzione' };

interface ListResp {
  items: EngagementDto[]; total: number; limit: number; offset: number;
  views: Record<ViewKey, number>;
}

export function EngagementsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const history = useHistory();
  const lk = useLookups();
  const can = (a: string) => !!user?.permissions.includes(`engagement:${a}` as never);

  const [view, setView] = useState<ViewKey>('all');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [filterParam, setFilterParam] = useState<string | null>(null);
  const limit = 25;

  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (view !== 'all') params.set('type', view);
  if (q.trim()) params.set('q', q.trim());
  if (filterParam) params.set('filter', filterParam);
  const { data, loading, error, reload } = useApi<ListResp>(`/engagements?${params.toString()}`);

  const { onDelete, onDuplicate } = useEntityActions<EngagementDto>({
    basePath: '/engagements', reload, noun: t('terms.engagement'),
    duplicateBody: (e) => ({ companyId: e.companyId, type: e.type, title: `${e.title} (copia)` }),
  });

  const views: ListView[] = (Object.keys(VIEW_LABEL) as ViewKey[]).map((k) => ({ key: k, label: VIEW_LABEL[k], count: data?.views?.[k] ?? 0 }));

  const columns: ListColumn<EngagementDto>[] = [
    { key: 'code', header: 'Codice', sub: 'tipo', value: (r) => r.code, render: (r) => (
      <div className="two"><span className="a mono">{r.code}</span><span className="b">{r.type === 'build' ? 'Realizzazione' : 'Manutenzione'}</span></div>) },
    { key: 'title', header: 'Titolo', sub: 'cliente', value: (r) => r.title, render: (r) => (
      <div className="two"><span className="a">{r.title}</span><span className="b">{r.companyName ?? '—'}</span></div>) },
    { key: 'status', header: 'Stato', value: (r) => lk.labelOf(r.statusId) || (r.statusCanonical ?? ''), render: (r) => <StatusPill label={lk.labelOf(r.statusId) || (r.statusCanonical ?? '')} token={lk.byId(r.statusId)?.colorToken} /> },
    { key: 'started', header: 'Inizio', num: true, value: (r) => (r.startedOn ? new Date(r.startedOn).toLocaleDateString('it-IT') : ''), render: (r) => <span className="mono faint">{r.startedOn ? new Date(r.startedOn).toLocaleDateString('it-IT') : '—'}</span> },
    { key: 'created', header: 'Creata', num: true, value: (r) => new Date(r.createdAt).toLocaleDateString('it-IT'), render: (r) => <span className="mono faint">{new Date(r.createdAt).toLocaleDateString('it-IT')}</span> },
  ];

  const exportFields = [
    { key: 'code', label: 'Codice', value: (r: EngagementDto) => r.code },
    { key: 'title', label: 'Titolo', value: (r: EngagementDto) => r.title },
    { key: 'type', label: 'Tipo', value: (r: EngagementDto) => (r.type === 'build' ? 'Realizzazione' : 'Manutenzione') },
    { key: 'company', label: 'Cliente', value: (r: EngagementDto) => r.companyName ?? '' },
    { key: 'status', label: 'Stato', value: (r: EngagementDto) => lk.labelOf(r.statusId) || (r.statusCanonical ?? '') },
    { key: 'startedOn', label: 'Inizio', value: (r: EngagementDto) => (r.startedOn ? new Date(r.startedOn).toLocaleDateString('it-IT') : '') },
    { key: 'endedOn', label: 'Fine', value: (r: EngagementDto) => (r.endedOn ? new Date(r.endedOn).toLocaleDateString('it-IT') : '') },
    { key: 'createdAt', label: 'Creata', value: (r: EngagementDto) => new Date(r.createdAt).toLocaleDateString('it-IT') },
  ];

  const leftActions: ListAction[] = [
    { key: 'filters', icon: SlidersHorizontal, tip: 'Filtri', disabled: true },
    { key: 'cols', icon: Columns3, tip: 'Colonne', disabled: true },
    { key: 'ai', icon: Sparkles, tip: 'Azioni AI (presto)', variant: 'ai', disabled: true },
  ];
  const rightActions: ListAction[] = [
    ...(can('create') ? [{ key: 'new', icon: Plus, tip: 'Nuova commessa', variant: 'primary' as const, onClick: () => history.push('/engagements/new') }] : []),
  ];

  return (
    <Page>
      <EntityList<EngagementDto>
        title={t('terms.engagement_plural')} subtitle="Lavori di realizzazione e manutenzione"
        views={views} activeView={view} onView={(k) => { setView(k as ViewKey); setOffset(0); }}
        search={q} onSearch={(v) => { setQ(v); setOffset(0); }} searchPlaceholder="Cerca per codice o titolo…"
        leftActions={leftActions} rightActions={rightActions}
        columns={columns} rows={data?.items ?? []} loading={loading} error={error}
        onRowClick={(r) => history.push(`/engagements/${r.id}`)}
        onDelete={can('delete') ? onDelete : undefined}
        onDuplicate={can('create') ? onDuplicate : undefined}
        exportName="commesse" exportFields={exportFields} entity="engagement"
        onFilterChange={(s) => { setFilterParam(s ? JSON.stringify(s) : null); setOffset(0); }}
        total={data?.total} limit={limit} offset={offset} onPage={setOffset}
        emptyText="Nessuna commessa in questa vista."
      />
    </Page>
  );
}
