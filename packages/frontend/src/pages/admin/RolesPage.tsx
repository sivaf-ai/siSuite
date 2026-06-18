/**
 * RolesPage — Ruoli RBAC su EntityList v2. I ruoli di sistema sono in sola lettura
 * (la scheda disabilita Salva). Click riga → /admin/roles/:id.
 */
import { useState } from 'react';
import { useHistory } from 'react-router';
import type { RoleDto } from '@sisuite/shared';
import { Page } from '../../components/Page';
import { StatusPill } from '../../components/StatusPill';
import { EntityList, type ListColumn, type ListAction } from '../../ui/EntityList';
import { useEntityActions } from '../../ui/useEntityActions';
import { SlidersHorizontal, Plus } from '../../ui/icons';
import { useApi } from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';

const SCOPE_LABEL: Record<string, string> = { own: 'Proprie', team: 'Team', tenant: 'Tutto il tenant', customer: 'Cliente' };
interface ListResp { items: RoleDto[]; total: number; limit: number; offset: number }

export function RolesPage() {
  const { user } = useAuth();
  const history = useHistory();
  const canManage = !!user?.permissions.includes('role:manage' as never);

  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [filterParam, setFilterParam] = useState<string | null>(null);
  const limit = 25;

  const params = new URLSearchParams({ limit: String(limit), offset: String(offset), sortBy: 'name', sortDir: 'asc' });
  if (q.trim()) params.set('q', q.trim());
  if (filterParam) params.set('filter', filterParam);
  const { data, loading, error, reload } = useApi<ListResp>(`/roles?${params.toString()}`);

  const { onDelete, onDuplicate } = useEntityActions<RoleDto>({
    basePath: '/roles', reload, noun: 'ruolo',
    duplicateBody: (r) => ({ name: `${r.name} (copia)`, description: r.description ?? null, dataScope: r.dataScope, permissions: r.permissions }),
  });

  const columns: ListColumn<RoleDto>[] = [
    { key: 'name', header: 'Ruolo', sub: 'descrizione', value: (r) => r.name, render: (r) => (
      <div className="two"><span className="a">{r.name}</span><span className="b">{r.description ?? '—'}</span></div>) },
    { key: 'scope', header: 'Visibilità', value: (r) => SCOPE_LABEL[r.dataScope] ?? r.dataScope, render: (r) => <span className="chip">{SCOPE_LABEL[r.dataScope] ?? r.dataScope}</span> },
    { key: 'perms', header: 'Permessi', num: true, value: (r) => r.permissions.length, render: (r) => <span className="mono">{r.permissions.length}</span> },
    { key: 'sys', header: 'Tipo', value: (r) => (r.isSystem ? 'Sistema' : 'Personalizzato'), render: (r) => <StatusPill label={r.isSystem ? 'Sistema' : 'Personalizzato'} token={r.isSystem ? 'neutral' : 'brand'} /> },
  ];

  const exportFields = [
    { key: 'name', label: 'Ruolo', value: (r: RoleDto) => r.name },
    { key: 'description', label: 'Descrizione', value: (r: RoleDto) => r.description ?? '' },
    { key: 'dataScope', label: 'Visibilità', value: (r: RoleDto) => SCOPE_LABEL[r.dataScope] ?? r.dataScope },
    { key: 'permissions', label: 'N. permessi', value: (r: RoleDto) => r.permissions.length },
    { key: 'isSystem', label: 'Tipo', value: (r: RoleDto) => (r.isSystem ? 'Sistema' : 'Personalizzato') },
  ];

  const leftActions: ListAction[] = [{ key: 'filters', icon: SlidersHorizontal, tip: 'Filtri', disabled: true }];
  const rightActions: ListAction[] = canManage
    ? [{ key: 'new', icon: Plus, tip: 'Nuovo ruolo', variant: 'primary' as const, onClick: () => history.push('/admin/roles/new') }]
    : [];

  return (
    <Page>
      <EntityList<RoleDto>
        title="Ruoli & permessi" subtitle="Ruoli di sistema e personalizzati"
        search={q} onSearch={(v) => { setQ(v); setOffset(0); }} searchPlaceholder="Cerca ruolo…"
        leftActions={leftActions} rightActions={rightActions}
        columns={columns} rows={data?.items ?? []} loading={loading} error={error}
        onRowClick={(r) => history.push(`/admin/roles/${r.id}`)}
        onDelete={canManage ? onDelete : undefined}
        onDuplicate={canManage ? onDuplicate : undefined}
        exportName="ruoli" exportFields={exportFields}
        onFilterChange={(s) => { setFilterParam(s ? JSON.stringify(s) : null); setOffset(0); }}
        total={data?.total} limit={limit} offset={offset} onPage={setOffset}
        emptyText="Nessun ruolo."
      />
    </Page>
  );
}
