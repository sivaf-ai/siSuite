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
import { Plus } from '../ui/icons';
import { useApi, useReloadOnEnter, mutate } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../ui/Toast';
import { ApiError } from '../api/client';
import { AuditDialog } from '../ui/AuditDialog';
import { Modal } from '../ui/Modal';
import { RisorsaDetailPage } from './RisorsaDetailPage';

const errMsg = (e: unknown) => (e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message);

/** Props di SELEZIONE: la stessa lista, richiamata in pop-up da un'altra maschera
 *  (es. risorsa assegnata di una pick list). Radio invece di checkbox; "+ Nuovo" e
 *  click-riga aprono la CRUD in un modale annidato (non si lascia il documento). */
export interface RisorsePickProps {
  pick: 'single' | 'multi';
  selectedIds?: string[];
  onToggleSelect?: (r: ResourceDto) => void;
  /** chiamato dopo aver creato una nuova risorsa con "+ Nuovo". */
  onCreated?: (r: ResourceDto) => void;
}

const KIND_LABEL: Record<string, string> = { person: 'Persona', vehicle: 'Mezzo', equipment: 'Attrezzatura' };
type ViewKey = 'all' | 'person' | 'vehicle' | 'equipment';
const VIEW_LABEL: Record<ViewKey, string> = { all: 'Tutte', person: 'Persone', vehicle: 'Mezzi', equipment: 'Attrezzature' };

interface ListResp { items: ResourceDto[]; total: number; limit: number; offset: number; views: Record<ViewKey, number> }

export function RisorsePage({ pickProps }: { pickProps?: RisorsePickProps } = {}) {
  const { user } = useAuth();
  const history = useHistory();
  const { t } = useTranslation();
  const toast = useToast();
  const can = (a: string) => !!user?.permissions.includes(`resource:${a}` as never);
  const pick = pickProps?.pick;

  const [view, setView] = useState<ViewKey>('all');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [filterParam, setFilterParam] = useState<string | null>(null);
  const [crud, setCrud] = useState<{ id: string } | null>(null);   // CRUD risorsa in modale (pick mode)
  const [archived, setArchived] = useState(false);
  const [clearTok, setClearTok] = useState(0);
  const [audit, setAudit] = useState<{ id: string; title: string } | null>(null);
  const limit = 25;

  const params = new URLSearchParams({ limit: String(limit), offset: String(offset), sortBy: 'label', sortDir: 'asc' });
  if (view !== 'all') params.set('kind', view);
  if (q.trim()) params.set('q', q.trim());
  if (filterParam) params.set('filter', filterParam);
  if (archived) params.set('archived', '1');
  const { data, loading, error, reload } = useApi<ListResp>(`/resources?${params.toString()}`);
  useReloadOnEnter(reload);

  const onRestore = async (rows: ResourceDto[]) => {
    try {
      for (const r of rows) await mutate('POST', `/resources/${r.id}/restore`);
      toast(rows.length > 1 ? `${rows.length} risorse ripristinate` : 'Risorsa ripristinata');
      setClearTok((x) => x + 1); reload();
    } catch (e) { toast(errMsg(e) || 'Errore durante il ripristino', 'error'); }
  };
  const onPurge = async (rows: ResourceDto[]) => {
    try {
      for (const r of rows) await mutate('DELETE', `/resources/${r.id}/purge`);
      toast(rows.length > 1 ? `${rows.length} risorse eliminate definitivamente` : 'Risorsa eliminata definitivamente');
      setClearTok((x) => x + 1); reload();
    } catch (e) { toast(errMsg(e) || 'Errore durante l\'eliminazione', 'error'); }
  };

  const { onDelete, onDuplicate } = useEntityActions<ResourceDto>({
    basePath: '/resources', reload, noun: 'risorsa',
    // niente identificativi/collegamenti: code (sigla), email, phone, userId si reinseriscono.
    duplicateBody: (r) => {
      const { code: _c, email: _e, phone: _p, ...attrs } = (r.attributes ?? {}) as Record<string, unknown>;
      return { kind: r.kind, label: r.label, active: r.active, attributes: attrs };
    },
  });

  const views: ListView[] = (Object.keys(VIEW_LABEL) as ViewKey[]).map((k) => ({ key: k, label: VIEW_LABEL[k], count: data?.views?.[k] ?? 0 }));

  const columns: ListColumn<ResourceDto>[] = [
    { key: 'label', header: t('cols.nome'), sub: t('cols.tipo'), value: (r) => r.label, render: (r) => (
      <div className="two"><span className="a">{r.label}</span><span className="b">{KIND_LABEL[r.kind]}</span></div>) },
    { key: 'cost', header: t('cols.costoOrario'), sub: t('cols.perOra'), num: true, value: (r) => ((r.attributes as Record<string, unknown>)?.hourly_cost as number) ?? '', render: (r) => <Money value={(r.attributes as Record<string, unknown>)?.hourly_cost as number ?? null} /> },
    { key: 'active', header: t('cols.stato'), value: (r) => (r.active ? 'Attiva' : 'Disattivata'), render: (r) => <StatusPill label={r.active ? 'Attiva' : 'Disattivata'} token={r.active ? 'success' : 'neutral'} /> },
  ];

  const exportFields = [
    { key: 'label', label: 'Nome', value: (r: ResourceDto) => r.label },
    { key: 'kind', label: 'Tipo', value: (r: ResourceDto) => KIND_LABEL[r.kind] },
    { key: 'hourly_cost', label: 'Costo orario (€/h)', value: (r: ResourceDto) => ((r.attributes as Record<string, unknown>)?.hourly_cost as number) ?? '' },
    { key: 'active', label: 'Stato', value: (r: ResourceDto) => (r.active ? 'Attiva' : 'Disattivata') },
    { key: 'userName', label: 'Utente collegato', value: (r: ResourceDto) => r.userName ?? '' },
  ];

  // "+ Nuovo": in pick apre la CRUD in modale (resti nel documento); altrimenti naviga.
  const rightActions: ListAction[] = [
    ...(can('create') ? [{ key: 'new', icon: Plus, tip: 'Nuova risorsa', variant: 'primary' as const,
      onClick: () => (pick ? setCrud({ id: 'new' }) : history.push('/resources/new')) }] : []),
  ];
  // click riga: in pick apre la CRUD per modificare (poi si seleziona col radio); altrimenti naviga.
  const onRowClick = (r: ResourceDto) => (pick ? setCrud({ id: r.id }) : history.push(`/resources/${r.id}`));

  const list = (
      <EntityList<ResourceDto>
        title={pick ? undefined : t('terms.resource_plural')} subtitle={pick ? undefined : 'Persone, mezzi e attrezzature'}
        views={views} activeView={view} onView={(k) => { setView(k as ViewKey); setOffset(0); }}
        search={q} onSearch={(v) => { setQ(v); setOffset(0); }} searchPlaceholder="Cerca per nome…"
        rightActions={rightActions}
        mode={pick ? (pick === 'multi' ? 'pick-multi' : 'pick-single') : undefined}
        selectedIds={pick ? pickProps?.selectedIds : undefined}
        onToggleSelect={pick ? pickProps?.onToggleSelect : undefined}
        columns={columns} rows={data?.items ?? []} loading={loading} error={error}
        onRowClick={onRowClick}
        onDelete={!pick && can('delete') ? onDelete : undefined}
        onDuplicate={!pick && can('create') ? onDuplicate : undefined}
        archived={archived}
        onToggleArchived={pick ? undefined : (v) => { setArchived(v); setOffset(0); setClearTok((x) => x + 1); }}
        onRestore={can('delete') ? onRestore : undefined}
        onPurge={can('delete') ? onPurge : undefined}
        onHistory={pick ? undefined : (row) => setAudit({ id: row.id, title: row.label })}
        archivedBadge={(row) => row.archivedAt ? `Archiviato${row.archivedByName ? ' da ' + row.archivedByName : ''}` : null}
        clearSelectionToken={clearTok}
        exportName="risorse" exportFields={exportFields} entity="resource"
        filterFields={[
          { key: 'label', label: 'Nome', type: 'text', section: 'Anagrafica', span: 2 },
          { key: 'kind', label: 'Tipo', type: 'enum', section: 'Anagrafica', values: [{ value: 'person', label: 'Persona' }, { value: 'vehicle', label: 'Mezzo' }, { value: 'equipment', label: 'Attrezzatura' }] },
          { key: 'active', label: 'Attiva', type: 'enum', section: 'Anagrafica', values: [{ value: 'true', label: 'Attiva' }, { value: 'false', label: 'Non attiva' }] },
          { key: 'hourly_cost', label: 'Costo orario', type: 'number', section: 'Economia' },
        ]}
        onFilterChange={(s) => { setFilterParam(s ? JSON.stringify(s) : null); setOffset(0); }}
        total={data?.total} limit={limit} offset={offset} onPage={setOffset}
        emptyText="Nessuna risorsa in questa vista."
      />
  );

  // CRUD risorsa in modale centrato (solo in pick: "+ Nuovo" o modifica riga)
  const crudModal = crud && (
    <Modal open size="xl" title={crud.id === 'new' ? 'Nuova risorsa' : 'Modifica risorsa'} onClose={() => setCrud(null)}>
      <RisorsaDetailPage embed={{
        id: crud.id,
        onClose: () => setCrud(null),
        onSaved: (r, wasNew) => { void reload(); if (wasNew) pickProps?.onCreated?.(r); },
      }} />
    </Modal>
  );

  const auditModal = audit && (
    <AuditDialog entity="resource" entityId={audit.id} title={audit.title} onClose={() => setAudit(null)} />
  );

  if (pick) return <>{list}{crudModal}{auditModal}</>;
  return <Page>{list}{crudModal}{auditModal}</Page>;
}
