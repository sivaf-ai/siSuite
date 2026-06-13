/** Utenti del tenant (app_user + ruoli). La creazione provisiona l'identità su
 *  GoTrue (email + password); l'eliminazione disattiva (non distrugge). */
import { UserCircle } from 'lucide-react';
import type { UserAdminDto } from '@sisuite/shared';
import { CrudList, type FkData } from '../../ui/CrudList';

const userPerm = (a: 'create' | 'read' | 'update' | 'delete') => (a === 'read' ? 'user:read' : 'user:manage');

const LOCALE_OPTIONS = [
  { value: 'it-IT', label: { 'it-IT': 'Italiano' } },
  { value: 'en', label: { 'it-IT': 'Inglese' } },
  { value: 'es-AR', label: { 'it-IT': 'Spagnolo (AR)' } },
];

export function UsersPage() {
  return (
    <CrudList<UserAdminDto>
      title="Utenti" icon={UserCircle}
      endpoint="/users" entityKey="app_user" resource="user"
      permFor={userPerm}
      noun="utente" createLabel="Nuovo utente"
      searchPlaceholder="Cerca per nome o email…" defaultSort="fullName"
      fkSources={{ roles: { endpoint: '/roles?limit=200', toOption: (r) => ({ id: r.id as string, label: r.name as string }) } }}
      columns={[
        { key: 'fullName', header: 'Nome', sortable: true, render: (r) => (
          <div><div className="cellname">{r.fullName}</div><div className="cellsub">{r.email ?? '—'}</div></div>
        ) },
        { key: 'roles', header: 'Ruoli', render: (r) => r.roles.length
          ? r.roles.map((x) => <span key={x.id} className="chip" style={{ marginRight: 4 }}>{x.name}</span>)
          : <span style={{ color: 'var(--ink-faint)' }}>—</span> },
        { key: 'active', header: 'Stato', render: (r) => r.active
          ? <span className="pill" style={{ color: 'var(--success)', background: 'var(--success-wash)' }}><span className="dot" />Attivo</span>
          : <span className="pill" style={{ color: 'var(--ink-soft)', background: 'var(--neutral-wash)' }}>Disattivato</span> },
        { key: 'createdAt', header: 'Creato', sortable: true, render: (r) => new Date(r.createdAt).toLocaleDateString('it-IT') },
      ]}
      buildForm={(fk: FkData, isEdit) => {
        const roleOpts = (fk.roles ?? []).map((r) => ({ value: r.id, label: { 'it-IT': r.label } }));
        return [{ group: 'Utente', fields: [
          { key: 'fullName', label: 'Nome completo', dataType: 'text', required: true },
          ...(isEdit ? [] : [
            { key: 'email', label: 'Email', dataType: 'email' as const, required: true },
            { key: 'password', label: 'Password iniziale', dataType: 'text' as const, required: true,
              help: 'Minimo 8 caratteri. L\'utente potrà cambiarla.' },
          ]),
          { key: 'phone', label: 'Telefono', dataType: 'text' },
          { key: 'locale', label: 'Lingua', dataType: 'select', options: LOCALE_OPTIONS },
          ...(isEdit ? [{ key: 'active', label: 'Attivo', dataType: 'boolean' as const }] : []),
          { key: 'roleIds', label: 'Ruoli', dataType: 'multiselect', options: roleOpts },
        ] }];
      }}
      toFormInitial={(r) => ({
        fullName: r.fullName, phone: r.phone ?? '', active: r.active,
        locale: r.locale ?? 'it-IT', roleIds: r.roles.map((x) => x.id),
      })}
      toBody={(v, isEdit) => isEdit
        ? { fullName: v.fullName, phone: (v.phone as string) || null, active: v.active ?? true, locale: v.locale, roleIds: (v.roleIds as string[]) ?? [] }
        : { fullName: v.fullName, email: v.email, password: v.password, phone: (v.phone as string) || null, locale: v.locale, roleIds: (v.roleIds as string[]) ?? [] }}
    />
  );
}
