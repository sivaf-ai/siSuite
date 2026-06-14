import { Users } from 'lucide-react';
import type { ResourceDto } from '@sisuite/shared';
import { CrudList } from '../ui/CrudList';

const KIND_LABEL: Record<string, string> = { person: 'Persona', vehicle: 'Mezzo', equipment: 'Attrezzatura' };

export function RisorsePage() {
  return (
    <CrudList<ResourceDto>
      title="Risorse" icon={Users}
      endpoint="/resources" entityKey="resource" resource="resource"
      noun="risorsa" createLabel="Nuova risorsa"
      searchPlaceholder="Cerca risorsa…" defaultSort="label"
      columns={[
        { key: 'label', header: 'Nome', sortable: true, render: (r) => (
          <div><div className="cellname">{r.label}</div><div className="cellsub">{KIND_LABEL[r.kind]}</div></div>
        ) },
        { key: 'kind', header: 'Tipo', sortable: true, render: (r) => <span className="chip">{KIND_LABEL[r.kind]}</span> },
        { key: 'active', header: 'Attiva', render: (r) => r.active
          ? <span className="pill" style={{ color: 'var(--success)', background: 'var(--success-wash)' }}><span className="dot" />Sì</span>
          : <span className="pill" style={{ color: 'var(--ink-soft)', background: 'var(--neutral-wash)' }}>No</span> },
      ]}
      buildForm={() => [{ group: 'Principale', fields: [
        { key: 'kind', label: 'Tipo', dataType: 'select', required: true, options: [
          { value: 'person', label: { 'it-IT': 'Persona' } },
          { value: 'vehicle', label: { 'it-IT': 'Mezzo' } },
          { value: 'equipment', label: { 'it-IT': 'Attrezzatura' } },
        ] },
        { key: 'label', label: 'Nome / Etichetta', dataType: 'text', required: true },
        { key: 'active', label: 'Attiva', dataType: 'boolean' },
      ] }]}
      toFormInitial={(r) => ({ kind: r.kind, label: r.label, active: r.active, attributes: r.attributes })}
      toBody={(v) => ({ kind: v.kind, label: v.label, active: v.active ?? true, attributes: v.attributes })}
      detailPath={(r) => `/resources/${r.id}`}
    />
  );
}
