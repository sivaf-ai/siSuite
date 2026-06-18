/**
 * RapportiniPage — lista Rapportini su EntityList v2. Click riga → /work-reports/:id
 * (archetipo Documento). Nuovo → /work-reports/new.
 */
import { useMemo, useState } from 'react';
import { useHistory } from 'react-router';
import type { WorkReportDto, EngagementDto } from '@sisuite/shared';
import { Page } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { EntityList, type ListColumn, type ListAction } from '../ui/EntityList';
import { useEntityActions } from '../ui/useEntityActions';
import { SlidersHorizontal, Sparkles, Plus } from '../ui/icons';
import { useApi } from '../api/hooks';
import { useLookups } from '../context/Lookups';
import { useAuth } from '../auth/AuthContext';

const AUDIENCE_LABEL: Record<string, string> = { customer: 'Cliente', internal: 'Interno' };

export function RapportiniPage() {
  const lk = useLookups();
  const history = useHistory();
  const { user } = useAuth();
  const canCreate = !!user?.permissions.includes('work_report:create' as never);
  const canDelete = !!user?.permissions.includes('work_report:delete' as never);

  const wr = useApi<{ items: WorkReportDto[] }>('/work-reports');
  const engs = useApi<{ items: EngagementDto[] }>('/engagements');
  const engById = useMemo(() => new Map((engs.data?.items ?? []).map((e) => [e.id, e])), [engs.data]);

  const { onDelete } = useEntityActions<WorkReportDto>({ basePath: '/work-reports', reload: () => void wr.reload(), noun: 'rapportino' });

  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();
  const rows = (wr.data?.items ?? []).filter((r) => {
    if (!ql) return true;
    const e = engById.get(r.engagementId);
    return `${e?.code ?? ''} ${e?.title ?? ''}`.toLowerCase().includes(ql);
  });

  const engLabel = (r: WorkReportDto) => { const e = engById.get(r.engagementId); return `${e?.code ?? ''} ${e?.title ?? ''}`.trim(); };
  const columns: ListColumn<WorkReportDto>[] = [
    { key: 'eng', header: 'Commessa', sub: 'cliente', value: engLabel, render: (r) => { const e = engById.get(r.engagementId); return (
      <div className="two"><span className="a mono">{e?.code ?? '—'}</span><span className="b">{e?.title ?? ''}</span></div>); } },
    { key: 'audience', header: 'Destinatario', value: (r) => AUDIENCE_LABEL[r.audience] ?? r.audience, render: (r) => <span className="chip">{AUDIENCE_LABEL[r.audience] ?? r.audience}</span> },
    { key: 'period', header: 'Periodo', num: true, value: (r) => (r.periodStart ? `${r.periodStart}→${r.periodEnd ?? ''}` : ''), render: (r) => <span className="mono faint">{r.periodStart ? `${r.periodStart}→${r.periodEnd ?? ''}` : '—'}</span> },
    { key: 'status', header: 'Stato', value: (r) => (lk.byId(r.statusId) ? lk.labelOf(r.statusId) : ''), render: (r) => lk.byId(r.statusId) ? <StatusPill label={lk.labelOf(r.statusId)} token={lk.byId(r.statusId)?.colorToken} /> : <span className="faint">—</span> },
    { key: 'ai', header: 'AI', value: (r) => (r.generatedByAi ? 'sì' : ''), render: (r) => (r.generatedByAi ? <Sparkles size={15} style={{ color: 'var(--brand)' }} /> : <span className="faint">—</span>) },
  ];

  const exportFields = [
    { key: 'eng', label: 'Commessa', value: engLabel },
    { key: 'audience', label: 'Destinatario', value: (r: WorkReportDto) => AUDIENCE_LABEL[r.audience] ?? r.audience },
    { key: 'periodStart', label: 'Periodo da', value: (r: WorkReportDto) => r.periodStart ?? '' },
    { key: 'periodEnd', label: 'Periodo a', value: (r: WorkReportDto) => r.periodEnd ?? '' },
    { key: 'status', label: 'Stato', value: (r: WorkReportDto) => (lk.byId(r.statusId) ? lk.labelOf(r.statusId) : '') },
    { key: 'ai', label: 'Generato da AI', value: (r: WorkReportDto) => (r.generatedByAi ? 'sì' : 'no') },
  ];

  const leftActions: ListAction[] = [{ key: 'filters', icon: SlidersHorizontal, tip: 'Filtri', disabled: true }];
  const rightActions: ListAction[] = canCreate
    ? [{ key: 'new', icon: Plus, tip: 'Nuovo rapportino', variant: 'primary' as const, onClick: () => history.push('/work-reports/new') }]
    : [];

  return (
    <Page>
      <EntityList<WorkReportDto>
        title="Rapportini" subtitle="Documenti di lavoro: testata, costi/ricavi e racconto AI"
        search={q} onSearch={setQ} searchPlaceholder="Cerca per commessa…"
        leftActions={leftActions} rightActions={rightActions}
        columns={columns} rows={rows} loading={wr.loading} error={wr.error}
        onRowClick={(r) => history.push(`/work-reports/${r.id}`)}
        onDelete={canDelete ? onDelete : undefined}
        exportName="rapportini" exportFields={exportFields}
        emptyText="Nessun rapportino."
      />
    </Page>
  );
}
