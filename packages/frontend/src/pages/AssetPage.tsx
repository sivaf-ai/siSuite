import { Box } from 'lucide-react';
import type { AssetDto, CompanyDto } from '@sisuite/shared';
import { CrudList } from '../ui/CrudList';

export function AssetPage() {
  return (
    <CrudList<AssetDto>
      title="Asset" icon={Box}
      endpoint="/assets" entityKey="asset" resource="asset"
      noun="asset" createLabel="Nuovo asset"
      searchPlaceholder="Cerca asset…" defaultSort="label"
      fkSources={{ company: { endpoint: '/companies', toOption: (c) => ({ id: c.id as string, label: (c as unknown as CompanyDto).displayName }) } }}
      columns={[
        { key: 'label', header: 'Asset', sortable: true, render: (r) => (
          <div><div className="cellname">{r.label}</div><div className="cellsub">{r.kind}</div></div>
        ) },
        { key: 'companyName', header: 'Cliente', render: (r) => r.companyName ?? <span style={{ color: 'var(--ink-faint)' }}>—</span> },
        { key: 'installedOn', header: 'Installato', render: (r) => r.installedOn ? new Date(r.installedOn).toLocaleDateString('it-IT') : '—' },
      ]}
      buildForm={(fk) => [{ group: 'Principale', fields: [
        { key: 'companyId', label: 'Cliente', dataType: 'fk', required: true, fkOptions: fk.company },
        { key: 'kind', label: 'Tipo (software_system, pool, pv_plant…)', dataType: 'text', required: true },
        { key: 'label', label: 'Etichetta', dataType: 'text', required: true },
        { key: 'installedOn', label: 'Installato il', dataType: 'date' },
      ] }]}
      toFormInitial={(r) => ({ companyId: r.companyId, kind: r.kind, label: r.label, installedOn: r.installedOn, attributes: r.attributes })}
      toBody={(v) => ({ companyId: v.companyId, kind: v.kind, label: v.label, installedOn: v.installedOn, attributes: v.attributes })}
    />
  );
}
