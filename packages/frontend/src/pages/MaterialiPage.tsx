import { Package } from 'lucide-react';
import type { MaterialDto } from '@sisuite/shared';
import { CrudList } from '../ui/CrudList';

export function MaterialiPage() {
  return (
    <CrudList<MaterialDto>
      title="Materiali" icon={Package}
      endpoint="/materials" entityKey="material" resource="material"
      noun="materiale" createLabel="Nuovo materiale"
      searchPlaceholder="Cerca materiale…" defaultSort="name"
      columns={[
        { key: 'name', header: 'Nome', sortable: true, render: (r) => <span className="cellname">{r.name}</span> },
        { key: 'unit', header: 'Unità', sortable: true, render: (r) => <span className="chip">{r.unit}</span> },
        { key: 'brand', header: 'Marca', render: (r) => (r.attributes as Record<string, unknown>).brand as string ?? <span style={{ color: 'var(--ink-faint)' }}>—</span> },
      ]}
      buildForm={() => [{ group: 'Principale', fields: [
        { key: 'name', label: 'Nome', dataType: 'text', required: true },
        { key: 'unit', label: 'Unità (pezzo, sacco, m³, ora…)', dataType: 'text', required: true },
      ] }]}
      toFormInitial={(r) => ({ name: r.name, unit: r.unit, attributes: r.attributes })}
      toBody={(v) => ({ name: v.name, unit: v.unit, attributes: v.attributes })}
    />
  );
}
