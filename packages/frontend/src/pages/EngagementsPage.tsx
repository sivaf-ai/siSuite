import { Briefcase } from 'lucide-react';
import type { EngagementDto, CompanyDto, AssetDto } from '@sisuite/shared';
import { CrudList } from '../ui/CrudList';
import { StatusPill } from '../components/StatusPill';
import { useLookups } from '../context/Lookups';

export function EngagementsPage() {
  const lk = useLookups();
  return (
    <CrudList<EngagementDto>
      title="Commesse" icon={Briefcase}
      endpoint="/engagements" entityKey="engagement" resource="engagement"
      noun="commessa" createLabel="Nuova commessa"
      searchPlaceholder="Cerca per codice o titolo…" defaultSort="createdAt"
      fkSources={{
        company: { endpoint: '/companies', toOption: (c) => ({ id: c.id as string, label: (c as unknown as CompanyDto).displayName }) },
        asset: { endpoint: '/assets', toOption: (a) => ({ id: a.id as string, label: (a as unknown as AssetDto).label }) },
      }}
      columns={[
        { key: 'code', header: 'Codice', sortable: true, render: (r) => <span className="mono" style={{ fontWeight: 600 }}>{r.code}</span> },
        { key: 'company', header: 'Cliente', render: (r) => <span className="cellname">{r.companyName ?? '—'}</span> },
        { key: 'title', header: 'Titolo', sortable: true, render: (r) => <span className="cellname">{r.title}</span> },
        {
          key: 'type', header: 'Tipo', render: (r) => r.type === 'build'
            ? <span className="pill pill--brand"><span className="dot" />Realizzazione</span>
            : <span className="pill pill--info"><span className="dot" />Manutenzione</span>,
        },
        { key: 'status', header: 'Stato', render: (r) => <StatusPill label={lk.labelOf(r.statusId) || (r.statusCanonical ?? '')} token={lk.byId(r.statusId)?.colorToken} /> },
        { key: 'createdAt', header: 'Aggiornata', sortable: true, render: (r) => <span className="cellsub mono">{new Date(r.createdAt).toLocaleDateString('it-IT')}</span> },
      ]}
      buildForm={(fk) => [{ group: 'Principale', fields: [
        { key: 'companyId', label: 'Cliente', dataType: 'fk', required: true, fkOptions: fk.company },
        { key: 'type', label: 'Tipo', dataType: 'select', required: true, options: [
          { value: 'build', label: { 'it-IT': 'Realizzazione' } },
          { value: 'maintenance', label: { 'it-IT': 'Manutenzione' } },
        ] },
        { key: 'title', label: 'Titolo', dataType: 'text', required: true },
        { key: 'assetId', label: 'Asset (opzionale)', dataType: 'fk', fkOptions: fk.asset },
        { key: 'startedOn', label: 'Inizio', dataType: 'date' },
      ] }]}
      toFormInitial={(r) => ({ companyId: r.companyId, type: r.type, title: r.title, startedOn: r.startedOn, attributes: {} })}
      toBody={(v, isEdit) => isEdit
        ? { title: v.title, assetId: v.assetId, startedOn: v.startedOn, attributes: v.attributes }
        : { companyId: v.companyId, type: v.type ?? 'build', title: v.title, assetId: v.assetId, startedOn: v.startedOn, attributes: v.attributes }}
      detailPath={(r) => `/engagements/${r.id}`}
    />
  );
}
