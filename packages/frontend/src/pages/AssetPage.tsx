/**
 * AssetPage — Asset (oggetto gestito) su EntityList v2. Click riga → /assets/:id.
 */
import { useState } from 'react';
import { useHistory } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { AssetDto } from '@sisuite/shared';
import { Page } from '../components/Page';
import { EntityList, type ListColumn, type ListAction } from '../ui/EntityList';
import { useEntityActions } from '../ui/useEntityActions';
import { Plus } from '../ui/icons';
import { useApi, useReloadOnEnter, useArchivedView, mutate } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../ui/Toast';
import { ApiError } from '../api/client';
import { AuditDialog } from '../ui/AuditDialog';

const errMsg = (e: unknown) => (e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message);

interface ListResp { items: AssetDto[]; total: number; limit: number; offset: number }

export function AssetPage() {
  const { user } = useAuth();
  const history = useHistory();
  const { t } = useTranslation();
  const toast = useToast();
  const can = (a: string) => !!user?.permissions.includes(`asset:${a}` as never);

  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [filterParam, setFilterParam] = useState<string | null>(null);
  const [archived, setArchived] = useArchivedView();
  const [clearTok, setClearTok] = useState(0);
  const [audit, setAudit] = useState<{ id: string; title: string } | null>(null);
  const limit = 25;

  const params = new URLSearchParams({ limit: String(limit), offset: String(offset), sortBy: 'label', sortDir: 'asc' });
  if (q.trim()) params.set('q', q.trim());
  if (filterParam) params.set('filter', filterParam);
  if (archived) params.set('archived', '1');
  const { data, loading, error, reload } = useApi<ListResp>(`/assets?${params.toString()}`);
  useReloadOnEnter(reload);

  const onRestore = async (rows: AssetDto[]) => {
    try {
      for (const r of rows) await mutate('POST', `/assets/${r.id}/restore`);
      toast(rows.length > 1 ? `${rows.length} asset ripristinati` : 'Asset ripristinato');
      setClearTok((x) => x + 1); reload();
    } catch (e) { toast(errMsg(e) || 'Errore durante il ripristino', 'error'); }
  };
  const onPurge = async (rows: AssetDto[]) => {
    try {
      for (const r of rows) await mutate('DELETE', `/assets/${r.id}/purge`);
      toast(rows.length > 1 ? `${rows.length} asset eliminati definitivamente` : 'Asset eliminato definitivamente');
      setClearTok((x) => x + 1); reload();
    } catch (e) { toast(errMsg(e) || 'Errore durante l\'eliminazione', 'error'); }
  };

  const { onDelete, onDuplicate } = useEntityActions<AssetDto>({
    basePath: '/assets', reload, noun: 'asset',
    duplicateBody: (a) => ({ companyId: a.companyId, label: a.label, kind: a.kind, siteId: a.siteId ?? null, installedOn: a.installedOn ?? undefined, attributes: a.attributes }),
  });

  const columns: ListColumn<AssetDto>[] = [
    { key: 'label', header: t('cols.asset'), sub: t('cols.tipo'), value: (r) => r.label, render: (r) => (
      <div className="two"><span className="a">{r.label}</span><span className="b">{r.kind}</span></div>) },
    { key: 'company', header: t('cols.cliente'), sub: t('cols.sito'), value: (r) => r.companyName ?? '', render: (r) => (
      <div className="two"><span className="a">{r.companyName ?? '—'}</span><span className="b">{r.siteName ?? '—'}</span></div>) },
    { key: 'installed', header: t('cols.installato'), num: true, value: (r) => (r.installedOn ? new Date(r.installedOn).toLocaleDateString('it-IT') : ''), render: (r) => <span className="mono faint">{r.installedOn ? new Date(r.installedOn).toLocaleDateString('it-IT') : '—'}</span> },
  ];

  const exportFields = [
    { key: 'label', label: 'Etichetta', value: (r: AssetDto) => r.label },
    { key: 'kind', label: 'Tipo', value: (r: AssetDto) => r.kind },
    { key: 'company', label: 'Cliente', value: (r: AssetDto) => r.companyName ?? '' },
    { key: 'site', label: 'Sito / Località', value: (r: AssetDto) => r.siteName ?? '' },
    { key: 'installedOn', label: 'Installato il', value: (r: AssetDto) => (r.installedOn ? new Date(r.installedOn).toLocaleDateString('it-IT') : '') },
  ];

  const rightActions: ListAction[] = [
    ...(can('create') ? [{ key: 'new', icon: Plus, tip: 'Nuovo asset', variant: 'primary' as const, onClick: () => history.push('/assets/new') }] : []),
  ];

  return (
    <Page>
      <EntityList<AssetDto>
        title={t('terms.asset_plural')} subtitle="Oggetti gestiti: impianti, sistemi, apparati"
        search={q} onSearch={(v) => { setQ(v); setOffset(0); }} searchPlaceholder="Cerca etichetta o tipo…"
        rightActions={rightActions}
        columns={columns} rows={data?.items ?? []} loading={loading} error={error}
        onRowClick={(r) => history.push(`/assets/${r.id}`)}
        onDelete={can('delete') ? onDelete : undefined}
        onDuplicate={can('create') ? onDuplicate : undefined}
        archived={archived}
        onToggleArchived={(v) => { setArchived(v); setOffset(0); setClearTok((x) => x + 1); }}
        onRestore={can('delete') ? onRestore : undefined}
        onPurge={can('delete') ? onPurge : undefined}
        onHistory={(row) => setAudit({ id: row.id, title: row.label })}
        archivedBadge={(row) => row.archivedAt ? `Archiviato${row.archivedByName ? ' da ' + row.archivedByName : ''}` : null}
        clearSelectionToken={clearTok}
        exportName="asset" exportFields={exportFields} entity="asset"
        filterFields={[
          { key: 'label', label: 'Etichetta', type: 'text', section: 'Anagrafica', span: 2 },
          { key: 'kind', label: 'Tipo', type: 'text', section: 'Anagrafica' },
          { key: 'installedOn', label: 'Installato il', type: 'date', section: 'Anagrafica' },
        ]}
        onFilterChange={(s) => { setFilterParam(s ? JSON.stringify(s) : null); setOffset(0); }}
        total={data?.total} limit={limit} offset={offset} onPage={setOffset}
        emptyText="Nessun asset."
      />
      {audit && <AuditDialog entity="asset" entityId={audit.id} title={audit.title} onClose={() => setAudit(null)} />}
    </Page>
  );
}
