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

const STATUS_PILL: Record<string, { label: string; token: string }> = {
  invited: { label: 'Invitato', token: 'warning' },
  active: { label: 'Attivo', token: 'success' },
  disabled: { label: 'Disattivato', token: 'neutral' },
};

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

  const { onDelete, onDuplicate } = useEntityActions<UserAdminDto>({
    basePath: '/users', reload, noun: 'utente', newPath: '/admin/users/new',
    // Duplica (standard): "nuovo" precompilato (no email/password: chiavi/credenziali).
    duplicateBody: (u) => ({ fullName: u.fullName, phone: u.phone, locale: u.locale, roleIds: u.roles.map((r) => r.id) }),
  });

  const columns: ListColumn<UserAdminDto>[] = [
    { key: 'code', header: 'Codice', value: (r) => r.code ?? '', render: (r) => <span className="mono faint">{r.code ?? '—'}</span> },
    { key: 'name', header: 'Nome', sub: 'email', value: (r) => r.fullName, render: (r) => (
      <div className="two"><span className="a">{r.fullName}</span><span className="b">{r.email ?? '—'}</span></div>) },
    { key: 'resource', header: 'Risorsa', value: (r) => r.resourceLabel ?? '', render: (r) => (r.resourceLabel
      ? <span className="chip">{r.resourceLabel}</span> : <span className="faint">—</span>) },
    { key: 'roles', header: 'Ruoli', value: (r) => r.roles.map((x) => x.name).join(', '), render: (r) => (r.roles.length
      ? <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{r.roles.map((x) => <span key={x.id} className="chip">{x.name}</span>)}</span>
      : <span className="faint">—</span>) },
    { key: 'status', header: 'Stato', value: (r) => STATUS_PILL[r.status]?.label ?? (r.active ? 'Attivo' : 'Disattivato'), render: (r) => {
      const s = STATUS_PILL[r.status] ?? { label: r.active ? 'Attivo' : 'Disattivato', token: r.active ? 'success' : 'neutral' };
      return <StatusPill label={s.label} token={s.token} />;
    } },
    { key: 'created', header: 'Creato', num: true, value: (r) => new Date(r.createdAt).toLocaleDateString('it-IT'), render: (r) => <span className="mono faint">{new Date(r.createdAt).toLocaleDateString('it-IT')}</span> },
  ];

  const exportFields = [
    { key: 'code', label: 'Codice', value: (r: UserAdminDto) => r.code ?? '' },
    { key: 'fullName', label: 'Nome', value: (r: UserAdminDto) => r.fullName },
    { key: 'email', label: 'Email', value: (r: UserAdminDto) => r.email ?? '' },
    { key: 'phone', label: 'Telefono', value: (r: UserAdminDto) => r.phone ?? '' },
    { key: 'resource', label: 'Risorsa', value: (r: UserAdminDto) => r.resourceLabel ?? '' },
    { key: 'roles', label: 'Ruoli', value: (r: UserAdminDto) => r.roles.map((x) => x.name).join(', ') },
    { key: 'status', label: 'Stato', value: (r: UserAdminDto) => STATUS_PILL[r.status]?.label ?? (r.active ? 'Attivo' : 'Disattivato') },
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
        onDuplicate={canManage ? onDuplicate : undefined}
        exportName="utenti" exportFields={exportFields}
        onFilterChange={(s) => { setFilterParam(s ? JSON.stringify(s) : null); setOffset(0); }}
        total={data?.total} limit={limit} offset={offset} onPage={setOffset}
        emptyText="Nessun utente."
      />
    </Page>
  );
}
