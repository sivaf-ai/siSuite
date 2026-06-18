/**
 * UsersPage — Utenti del tenant su EntityList v2. Click riga → /admin/users/:id.
 */
import { useState } from 'react';
import { useHistory } from 'react-router';
import type { UserAdminDto } from '@sisuite/shared';
import { Page } from '../../components/Page';
import { StatusPill } from '../../components/StatusPill';
import { EntityList, type ListColumn, type ListAction } from '../../ui/EntityList';
import { useEntityActions } from '../../ui/useEntityActions';
import { SlidersHorizontal, Columns3, Plus } from '../../ui/icons';
import { useApi } from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';

interface ListResp { items: UserAdminDto[]; total: number; limit: number; offset: number }

export function UsersPage() {
  const { user } = useAuth();
  const history = useHistory();
  const canManage = !!user?.permissions.includes('user:manage' as never);

  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [filterParam, setFilterParam] = useState<string | null>(null);
  const limit = 25;

  const params = new URLSearchParams({ limit: String(limit), offset: String(offset), sortBy: 'fullName', sortDir: 'asc' });
  if (q.trim()) params.set('q', q.trim());
  if (filterParam) params.set('filter', filterParam);
  const { data, loading, error, reload } = useApi<ListResp>(`/users?${params.toString()}`);

  const { onDelete } = useEntityActions<UserAdminDto>({ basePath: '/users', reload, noun: 'utente' });

  const columns: ListColumn<UserAdminDto>[] = [
    { key: 'name', header: 'Nome', sub: 'email', value: (r) => r.fullName, render: (r) => (
      <div className="two"><span className="a">{r.fullName}</span><span className="b">{r.email ?? '—'}</span></div>) },
    { key: 'roles', header: 'Ruoli', value: (r) => r.roles.map((x) => x.name).join(', '), render: (r) => (r.roles.length
      ? <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{r.roles.map((x) => <span key={x.id} className="chip">{x.name}</span>)}</span>
      : <span className="faint">—</span>) },
    { key: 'active', header: 'Stato', value: (r) => (r.active ? 'Attivo' : 'Disattivato'), render: (r) => <StatusPill label={r.active ? 'Attivo' : 'Disattivato'} token={r.active ? 'success' : 'neutral'} /> },
    { key: 'created', header: 'Creato', num: true, value: (r) => new Date(r.createdAt).toLocaleDateString('it-IT'), render: (r) => <span className="mono faint">{new Date(r.createdAt).toLocaleDateString('it-IT')}</span> },
  ];

  const exportFields = [
    { key: 'fullName', label: 'Nome', value: (r: UserAdminDto) => r.fullName },
    { key: 'email', label: 'Email', value: (r: UserAdminDto) => r.email ?? '' },
    { key: 'phone', label: 'Telefono', value: (r: UserAdminDto) => r.phone ?? '' },
    { key: 'roles', label: 'Ruoli', value: (r: UserAdminDto) => r.roles.map((x) => x.name).join(', ') },
    { key: 'active', label: 'Stato', value: (r: UserAdminDto) => (r.active ? 'Attivo' : 'Disattivato') },
    { key: 'locale', label: 'Lingua', value: (r: UserAdminDto) => r.locale ?? '' },
    { key: 'createdAt', label: 'Creato', value: (r: UserAdminDto) => new Date(r.createdAt).toLocaleDateString('it-IT') },
  ];

  const leftActions: ListAction[] = [
    { key: 'filters', icon: SlidersHorizontal, tip: 'Filtri', disabled: true },
    { key: 'cols', icon: Columns3, tip: 'Colonne', disabled: true },
  ];
  const rightActions: ListAction[] = canManage
    ? [{ key: 'new', icon: Plus, tip: 'Nuovo utente', variant: 'primary' as const, onClick: () => history.push('/admin/users/new') }]
    : [];

  return (
    <Page>
      <EntityList<UserAdminDto>
        title="Utenti" subtitle="Account del tenant e ruoli assegnati"
        search={q} onSearch={(v) => { setQ(v); setOffset(0); }} searchPlaceholder="Cerca per nome o email…"
        leftActions={leftActions} rightActions={rightActions}
        columns={columns} rows={data?.items ?? []} loading={loading} error={error}
        onRowClick={(r) => history.push(`/admin/users/${r.id}`)}
        onDelete={canManage ? onDelete : undefined}
        exportName="utenti" exportFields={exportFields}
        onFilterChange={(s) => { setFilterParam(s ? JSON.stringify(s) : null); setOffset(0); }}
        total={data?.total} limit={limit} offset={offset} onPage={setOffset}
        emptyText="Nessun utente."
      />
    </Page>
  );
}
