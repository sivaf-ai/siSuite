/**
 * AttivitaPage — Attività (vista globale) su EntityList v2. Viste per stato.
 * Click riga → /activities/:id. Le attività si creano dentro la commessa (albero).
 */
import { useState } from 'react';
import { useHistory } from 'react-router';
import type { ActivityDto } from '@sisuite/shared';
import { Page } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { Dur } from '../ui/Num';
import { EntityList, type ListColumn, type ListView, type ListAction } from '../ui/EntityList';
import { SlidersHorizontal, Columns3, Sparkles } from '../ui/icons';
import { useApi } from '../api/hooks';
import { useLookups } from '../context/Lookups';

type ViewKey = 'all' | 'planned' | 'in_progress' | 'done';
const VIEW_LABEL: Record<ViewKey, string> = { all: 'Tutte', planned: 'Pianificate', in_progress: 'In corso', done: 'Concluse' };

interface ListResp { items: ActivityDto[]; total: number; limit: number; offset: number; views: Record<ViewKey, number> }

export function AttivitaPage() {
  const history = useHistory();
  const lk = useLookups();

  const [view, setView] = useState<ViewKey>('all');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (view !== 'all') params.set('status', view);
  if (q.trim()) params.set('q', q.trim());
  const { data, loading, error } = useApi<ListResp>(`/activities?${params.toString()}`);

  const views: ListView[] = (Object.keys(VIEW_LABEL) as ViewKey[]).map((k) => ({ key: k, label: VIEW_LABEL[k], count: data?.views?.[k] ?? 0 }));

  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('it-IT') : '—');
  const columns: ListColumn<ActivityDto>[] = [
    { key: 'title', header: 'Attività', sub: 'commessa', render: (r) => (
      <div className="two"><span className="a">{r.title}</span><span className="b">{r.engagementCode ? `${r.engagementCode} · ${r.engagementTitle ?? ''}` : '—'}</span></div>) },
    { key: 'dur', header: 'Durata stim.', sub: 'h:mm', num: true, render: (r) => <Dur minutes={r.estimatedMinutes} /> },
    { key: 'when', header: 'Pianificata', num: true, render: (r) => <span className="mono faint">{r.isFixed ? fmtDate(r.scheduledStart) : '—'}</span> },
    { key: 'status', header: 'Stato', render: (r) => <StatusPill label={lk.labelOf(r.statusId) || (r.statusCanonical ?? '')} token={lk.byId(r.statusId)?.colorToken} /> },
  ];

  const leftActions: ListAction[] = [
    { key: 'filters', icon: SlidersHorizontal, tip: 'Filtri', disabled: true },
    { key: 'cols', icon: Columns3, tip: 'Colonne', disabled: true },
    { key: 'ai', icon: Sparkles, tip: 'Azioni AI (presto)', variant: 'ai', disabled: true },
  ];

  return (
    <Page title="Attività">
      <EntityList<ActivityDto>
        title="Attività" subtitle="Tutte le attività delle commesse"
        views={views} activeView={view} onView={(k) => { setView(k as ViewKey); setOffset(0); }}
        search={q} onSearch={(v) => { setQ(v); setOffset(0); }} searchPlaceholder="Cerca attività o commessa…"
        leftActions={leftActions}
        columns={columns} rows={data?.items ?? []} loading={loading} error={error}
        onRowClick={(r) => history.push(`/activities/${r.id}`)}
        total={data?.total} limit={limit} offset={offset} onPage={setOffset}
        emptyText="Nessuna attività in questa vista."
      />
    </Page>
  );
}
