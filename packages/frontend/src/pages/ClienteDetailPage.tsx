import { useParams } from 'react-router';
import { Building2, Mail, Phone, Star, Box } from 'lucide-react';
import { fieldLabel, type CompanyDto, type ContactDto, type AssetDto, type FieldDefinitionDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox, Empty } from '../components/Page';
import { DetailLayout, type KV } from '../ui/DetailLayout';
import { useApi } from '../api/hooks';

type CompanyDetail = CompanyDto & { contacts: ContactDto[] };
const ROLE_LABEL: Record<string, string> = { customer: 'Cliente', supplier: 'Fornitore', partner: 'Partner' };

export function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error } = useApi<CompanyDetail>(`/companies/${id}`);
  const assets = useApi<{ items: AssetDto[] }>(`/assets?companyId=${id}`);
  const defs = useApi<{ items: FieldDefinitionDto[] }>('/field-definitions?entity=company');

  const attrs = (data?.attributes ?? {}) as Record<string, unknown>;
  const kv: KV[] = [
    { k: 'Tipo', v: data?.type === 'organization' ? 'Azienda' : 'Privato' },
    ...(data?.address ? [{ k: 'Indirizzo', v: data.address }] : []),
    ...(defs.data?.items ?? [])
      .filter((d) => attrs[d.key] != null && attrs[d.key] !== '')
      .map((d) => ({ k: fieldLabel(d.label, 'it-IT', d.key), v: String(attrs[d.key]) })),
  ];

  const contactsTab = (
    data && (data.contacts.length === 0 ? <Empty text="Nessun contatto." /> : (
      <div className="table-wrap">
        <table className="t"><tbody>
          {data.contacts.map((c) => (
            <tr key={c.id}>
              <td>
                <div className="cellname">{c.fullName} {c.isPrimary && <Star size={13} style={{ color: 'var(--warning)', verticalAlign: 'middle' }} />}</div>
                {c.roleTitle && <div className="cellsub">{c.roleTitle}</div>}
              </td>
              <td>{c.email && <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Mail size={14} />{c.email}</span>}</td>
              <td>{c.phone && <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Phone size={14} />{c.phone}</span>}</td>
            </tr>
          ))}
        </tbody></table>
      </div>
    ))
  );

  const assetsTab = (
    assets.loading ? <Loading /> : (assets.data?.items.length ? (
      <div className="table-wrap">
        <table className="t"><tbody>
          {assets.data.items.map((a) => (
            <tr key={a.id}>
              <td><span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Box size={16} /><span className="cellname">{a.label}</span></span></td>
              <td className="cellsub">{a.kind}</td>
            </tr>
          ))}
        </tbody></table>
      </div>
    ) : <Empty text="Nessun asset." />)
  );

  return (
    <Page title={data?.displayName ?? 'Cliente'} back="/companies">
      {loading && <Loading />}
      {error && <ErrorBox message={error} />}
      {data && (
        <DetailLayout
          title={data.displayName}
          status={data.roles.map((r) => <span key={r} className="chip" style={{ marginLeft: 4 }}>{ROLE_LABEL[r] ?? r}</span>)}
          kv={kv}
          tabs={[
            { key: 'contatti', label: `Contatti (${data.contacts.length})`, content: contactsTab },
            { key: 'asset', label: `Asset (${assets.data?.items.length ?? 0})`, content: assetsTab },
          ]}
        />
      )}
    </Page>
  );
}
