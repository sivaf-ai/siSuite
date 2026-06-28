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
import { Plus } from '../ui/icons';
import { useApi, useReloadOnEnter, useStickyState, mutate } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../ui/Toast';
import { ApiError } from '../api/client';
import { AuditDialog } from '../ui/AuditDialog';
import { useLookups } from '../context/Lookups';

const errMsg = (e: unknown) => (e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message);

/** Props di SELEZIONE (solo selezione: creare una commessa inline è oneroso/atipico).
 *  Radio invece di checkbox; click-riga = seleziona invece di navigare. */
export interface EngagementsPickProps {
  pick: 'single' | 'multi';
  selectedIds?: string[];
  onToggleSelect?: (e: EngagementDto) => void;
}

type ViewKey = 'all' | 'build' | 'maintenance';
const VIEW_LABEL: Record<ViewKey, string> = { all: 'Tutte', build: 'Realizzazione', maintenance: 'Manutenzione' };

interface ListResp {
  items: EngagementDto[]; total: number; limit: number; offset: number;
  views: Record<ViewKey, number>;
}

export function EngagementsPage({ pickProps }: { pickProps?: EngagementsPickProps } = {}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const history = useHistory();
  const toast = useToast();
  const lk = useLookups();
  const can = (a: string) => !!user?.permissions.includes(`engagement:${a}` as never);
  const pick = pickProps?.pick;

  const [view, setView] = useState<ViewKey>('all');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [filterParam, setFilterParam] = useState<string | null>(null);
  const [sortParam, setSortParam] = useState<string | null>(null);
  const [archived, setArchived] = useStickyState('sisuite.engagements.archived', false);
  const [clearTok, setClearTok] = useState(0);
  const [audit, setAudit] = useState<{ id: string; title: string } | null>(null);
  const limit = 25;

  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (view !== 'all') params.set('type', view);
  if (q.trim()) params.set('q', q.trim());
  if (filterParam) params.set('filter', filterParam);
  if (sortParam) params.set('sort', sortParam);
  if (archived) params.set('archived', '1');
  const { data, loading, error, reload } = useApi<ListResp>(`/engagements?${params.toString()}`);
  useReloadOnEnter(reload);

  const onRestore = async (rows: EngagementDto[]) => {
    try {
      for (const r of rows) await mutate('POST', `/engagements/${r.id}/restore`);
      toast(rows.length > 1 ? `${rows.length} commesse ripristinate` : 'Commessa ripristinata');
      setClearTok((x) => x + 1); reload();
    } catch (e) { toast(errMsg(e) || 'Errore durante il ripristino', 'error'); }
  };
  const onPurge = async (rows: EngagementDto[]) => {
    try {
      for (const r of rows) await mutate('DELETE', `/engagements/${r.id}/purge`);
      toast(rows.length > 1 ? `${rows.length} commesse eliminate definitivamente` : 'Commessa eliminata definitivamente');
      setClearTok((x) => x + 1); reload();
    } catch (e) { toast(errMsg(e) || 'Errore durante l\'eliminazione', 'error'); }
  };

  const { onDelete, onDuplicate } = useEntityActions<EngagementDto>({
    basePath: '/engagements', reload, noun: t('terms.engagement'),
    duplicateBody: (e) => ({ companyId: e.companyId, type: e.type, title: e.title }),
  });

  const views: ListView[] = (Object.keys(VIEW_LABEL) as ViewKey[]).map((k) => ({ key: k, label: VIEW_LABEL[k], count: data?.views?.[k] ?? 0 }));

  const columns: ListColumn<EngagementDto>[] = [
    { key: 'code', header: t('cols.codice'), sub: t('cols.tipo'), value: (r) => r.code, render: (r) => (
      <div className="two"><span className="a mono">{r.code}</span><span className="b">{r.type === 'build' ? 'Realizzazione' : 'Manutenzione'}</span></div>) },
    { key: 'title', header: t('cols.titolo'), sub: t('cols.clienteLow'), value: (r) => r.title, render: (r) => (
      <div className="two"><span className="a">{r.title}</span><span className="b">{r.companyName ?? '—'}</span></div>) },
    { key: 'status', header: t('cols.stato'), value: (r) => lk.labelOf(r.statusId) || (r.statusCanonical ?? ''), render: (r) => <StatusPill label={lk.labelOf(r.statusId) || (r.statusCanonical ?? '')} token={lk.byId(r.statusId)?.colorToken} /> },
    { key: 'started', header: t('cols.inizio'), num: true, value: (r) => (r.startedOn ? new Date(r.startedOn).toLocaleDateString('it-IT') : ''), render: (r) => <span className="mono faint">{r.startedOn ? new Date(r.startedOn).toLocaleDateString('it-IT') : '—'}</span> },
    { key: 'created', header: t('cols.creata'), num: true, value: (r) => new Date(r.createdAt).toLocaleDateString('it-IT'), render: (r) => <span className="mono faint">{new Date(r.createdAt).toLocaleDateString('it-IT')}</span> },
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

  const rightActions: ListAction[] = pick ? [] : [
    ...(can('create') ? [{ key: 'new', icon: Plus, tip: 'Nuova commessa', variant: 'primary' as const, onClick: () => history.push('/engagements/new') }] : []),
  ];

  const list = (
      <EntityList<EngagementDto>
        title={pick ? undefined : t('terms.engagement_plural')} subtitle={pick ? undefined : 'Lavori di realizzazione e manutenzione'}
        views={views} activeView={view} onView={(k) => { setView(k as ViewKey); setOffset(0); }}
        search={q} onSearch={(v) => { setQ(v); setOffset(0); }} searchPlaceholder="Cerca per codice o titolo…"
        rightActions={rightActions}
        mode={pick ? (pick === 'multi' ? 'pick-multi' : 'pick-single') : undefined}
        selectedIds={pick ? pickProps?.selectedIds : undefined}
        onToggleSelect={pick ? pickProps?.onToggleSelect : undefined}
        columns={columns} rows={data?.items ?? []} loading={loading} error={error}
        onRowClick={pick ? undefined : (r) => history.push(`/engagements/${r.id}`)}
        onDelete={!pick && can('delete') ? onDelete : undefined}
        onDuplicate={!pick && can('create') ? onDuplicate : undefined}
        archived={archived}
        onToggleArchived={pick ? undefined : (v) => { setArchived(v); setOffset(0); setClearTok((x) => x + 1); }}
        onRestore={pick ? undefined : (can('delete') ? onRestore : undefined)}
        onPurge={pick ? undefined : (can('delete') ? onPurge : undefined)}
        onHistory={pick ? undefined : (row) => setAudit({ id: row.id, title: row.title })}
        archivedBadge={(row) => row.archivedAt ? `Archiviato${row.archivedByName ? ' da ' + row.archivedByName : ''}` : null}
        clearSelectionToken={clearTok}
        exportName="commesse" exportFields={exportFields} entity="engagement"
        sortFields={[{ key: 'code', label: 'Codice' }, { key: 'title', label: 'Titolo' }, { key: 'createdAt', label: 'Creato' }]}
        filterFields={[
          { key: 'code', label: 'Codice', type: 'text', section: 'Anagrafica' },
          { key: 'title', label: 'Titolo', type: 'text', section: 'Anagrafica', span: 2 },
          { key: 'type', label: 'Tipo', type: 'enum', section: 'Anagrafica', values: [{ value: 'build', label: 'Realizzazione' }, { value: 'maintenance', label: 'Manutenzione' }] },
          { key: 'company', label: 'Cliente', type: 'text', section: 'Anagrafica' },
          { key: 'status', label: 'Stato', type: 'text', section: 'Stato' },
          { key: 'startedOn', label: 'Iniziata il', type: 'date', section: 'Date' },
          { key: 'endedOn', label: 'Chiusa il', type: 'date', section: 'Date' },
          { key: 'createdAt', label: 'Creata il', type: 'date', section: 'Date' },
        ]}
        onSortChange={(s) => { setSortParam(s.length ? JSON.stringify(s) : null); setOffset(0); }}
        onFilterChange={(s) => { setFilterParam(s ? JSON.stringify(s) : null); setOffset(0); }}
        total={data?.total} limit={limit} offset={offset} onPage={setOffset}
        emptyText="Nessuna commessa in questa vista."
      />
  );

  const auditModal = audit && (
    <AuditDialog entity="engagement" entityId={audit.id} title={audit.title} onClose={() => setAudit(null)} />
  );

  if (pick) return list;
  return <Page>{list}{auditModal}</Page>;
}
