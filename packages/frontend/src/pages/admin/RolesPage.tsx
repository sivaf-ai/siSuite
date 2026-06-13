/** Ruoli RBAC (role + role_permission). I ruoli di SISTEMA (Owner, Planner…)
 *  sono in sola lettura; si creano ruoli custom componendo i permessi del
 *  catalogo. La visibilità dei dati (data_scope) è imposta dalla RLS. */
import { ShieldCheck } from 'lucide-react';
import { PERMISSION_OPTIONS, type RoleDto } from '@sisuite/shared';
import { CrudList } from '../../ui/CrudList';

const SCOPE_LABEL: Record<string, string> = { own: 'Proprie', team: 'Team', tenant: 'Tutto il tenant', customer: 'Cliente' };
const rolePerm = (a: 'create' | 'read' | 'update' | 'delete') => (a === 'read' ? 'role:read' : 'role:manage');

const PERMISSION_FIELD_OPTIONS = PERMISSION_OPTIONS.map((o) => ({ value: o.value, label: { 'it-IT': o.label } }));

export function RolesPage() {
  return (
    <CrudList<RoleDto>
      title="Ruoli" icon={ShieldCheck}
      endpoint="/roles" entityKey="role" resource="role"
      permFor={rolePerm}
      rowLocked={(r) => r.isSystem}
      noun="ruolo" createLabel="Nuovo ruolo"
      searchPlaceholder="Cerca ruolo…" defaultSort="name"
      columns={[
        { key: 'name', header: 'Nome', sortable: true, render: (r) => (
          <div><div className="cellname">{r.name}</div>{r.description && <div className="cellsub">{r.description}</div>}</div>
        ) },
        { key: 'dataScope', header: 'Visibilità', sortable: true, render: (r) => <span className="chip">{SCOPE_LABEL[r.dataScope] ?? r.dataScope}</span> },
        { key: 'permissions', header: 'Permessi', render: (r) => <span className="mono">{r.permissions.length}</span> },
        { key: 'isSystem', header: '', render: (r) => r.isSystem
          ? <span className="pill" style={{ color: 'var(--ink-soft)', background: 'var(--neutral-wash)' }}>Sistema</span> : null },
      ]}
      buildForm={() => [{ group: 'Ruolo', fields: [
        { key: 'name', label: 'Nome', dataType: 'text', required: true },
        { key: 'description', label: 'Descrizione', dataType: 'textarea' },
        { key: 'dataScope', label: 'Visibilità dati', dataType: 'select', required: true, options: [
          { value: 'own', label: { 'it-IT': 'Solo le proprie' } },
          { value: 'team', label: { 'it-IT': 'Del team' } },
          { value: 'tenant', label: { 'it-IT': 'Tutto il tenant' } },
          { value: 'customer', label: { 'it-IT': 'Cliente (portale)' } },
        ] },
        { key: 'permissions', label: 'Permessi', dataType: 'multiselect', options: PERMISSION_FIELD_OPTIONS },
      ] }]}
      toFormInitial={(r) => ({ name: r.name, description: r.description ?? '', dataScope: r.dataScope, permissions: r.permissions })}
      toBody={(v) => ({
        name: v.name, description: (v.description as string) || null,
        dataScope: v.dataScope, permissions: (v.permissions as string[]) ?? [],
      })}
    />
  );
}
