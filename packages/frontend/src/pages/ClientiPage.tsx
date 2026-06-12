import { Building2 } from 'lucide-react';
import type { CompanyDto } from '@sisuite/shared';
import { CrudList } from '../ui/CrudList';

const ROLE_LABEL: Record<string, string> = { customer: 'Cliente', supplier: 'Fornitore', partner: 'Partner' };
const attr = (r: CompanyDto, k: string) => (r.attributes as Record<string, unknown>)[k] as string | undefined;

export function ClientiPage() {
  return (
    <CrudList<CompanyDto>
      title="Clienti"
      icon={Building2}
      endpoint="/companies"
      entityKey="company"
      resource="company"
      noun="cliente"
      createLabel="Nuovo cliente"
      searchPlaceholder="Cerca per nome, P.IVA, città…"
      defaultSort="displayName"
      columns={[
        {
          key: 'displayName', header: 'Nome', sortable: true,
          render: (r) => (
            <div>
              <div className="cellname">{r.displayName}</div>
              <div className="cellsub">{r.type === 'organization' ? 'Azienda' : 'Privato'}</div>
            </div>
          ),
        },
        {
          key: 'roles', header: 'Ruoli',
          render: (r) => r.roles.length
            ? r.roles.map((x) => <span key={x} className="chip" style={{ marginRight: 4 }}>{ROLE_LABEL[x] ?? x}</span>)
            : <span style={{ color: 'var(--ink-faint)' }}>—</span>,
        },
        { key: 'vat', header: 'P.IVA', render: (r) => <span className="mono">{attr(r, 'vat_number') ?? '—'}</span> },
        { key: 'city', header: 'Città', render: (r) => attr(r, 'city') ?? <span style={{ color: 'var(--ink-faint)' }}>—</span> },
        { key: 'createdAt', header: 'Creato', sortable: true, render: (r) => new Date(r.createdAt).toLocaleDateString('it-IT') },
      ]}
      buildForm={() => [{
        group: 'Anagrafica',
        fields: [
          { key: 'displayName', label: 'Nome', dataType: 'text', required: true },
          { key: 'type', label: 'Tipo', dataType: 'select', options: [
            { value: 'organization', label: { 'it-IT': 'Azienda' } },
            { value: 'private', label: { 'it-IT': 'Privato' } },
          ] },
          { key: 'roles', label: 'Ruoli', dataType: 'roles' },
        ],
      }]}
      toFormInitial={(r) => ({ displayName: r.displayName, type: r.type, roles: r.roles, attributes: r.attributes })}
      toBody={(v) => ({
        displayName: v.displayName,
        type: v.type ?? 'organization',
        roles: ((v.roles as string[]) ?? []).map((role) => ({ role })),
        attributes: v.attributes,
      })}
      detailPath={(r) => `/companies/${r.id}`}
    />
  );
}
