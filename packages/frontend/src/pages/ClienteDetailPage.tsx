import { useState } from 'react';
import { useParams } from 'react-router';
import { Mail, Phone, Star, Box, Plus, Pencil, Trash2 } from 'lucide-react';
import { fieldLabel, type CompanyDto, type ContactDto, type AssetDto, type FieldDefinitionDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox, Empty } from '../components/Page';
import { DetailLayout, type KV } from '../ui/DetailLayout';
import { Drawer } from '../ui/Drawer';
import { Field, type RenderableField } from '../ui/Field';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { useApi, mutate } from '../api/hooks';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

type CompanyDetail = CompanyDto & { contacts: ContactDto[] };
const ROLE_LABEL: Record<string, string> = { customer: 'Cliente', supplier: 'Fornitore', partner: 'Partner' };

const CONTACT_FIELDS: RenderableField[] = [
  { key: 'fullName', label: 'Nome completo', dataType: 'text', required: true },
  { key: 'roleTitle', label: 'Ruolo / Mansione', dataType: 'text' },
  { key: 'email', label: 'Email', dataType: 'email' },
  { key: 'phone', label: 'Telefono', dataType: 'text' },
  { key: 'isPrimary', label: 'Contatto principale', dataType: 'boolean' },
];

export function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useApi<CompanyDetail>(`/companies/${id}`);
  const assets = useApi<{ items: AssetDto[] }>(`/assets?companyId=${id}`);
  const defs = useApi<{ items: FieldDefinitionDto[] }>('/field-definitions?entity=company');

  const can = (p: string) => !!user?.permissions.includes(p as never);

  // drawer: undefined = chiuso, null = nuovo, contatto = modifica
  const [editing, setEditing] = useState<ContactDto | null | undefined>(undefined);
  const [confirm, setConfirm] = useState<ContactDto | null>(null);
  const [busy, setBusy] = useState(false);

  const attrs = (data?.attributes ?? {}) as Record<string, unknown>;
  const kv: KV[] = [
    { k: 'Tipo', v: data?.type === 'organization' ? 'Azienda' : 'Privato' },
    ...(data?.address ? [{ k: 'Indirizzo', v: data.address }] : []),
    ...(defs.data?.items ?? [])
      .filter((d) => attrs[d.key] != null && attrs[d.key] !== '')
      .map((d) => ({ k: fieldLabel(d.label, 'it-IT', d.key), v: String(attrs[d.key]) })),
  ];

  async function doDelete() {
    if (!confirm) return;
    setBusy(true);
    try {
      await mutate('DELETE', `/contacts/${confirm.id}`);
      toast('Contatto eliminato');
      setConfirm(null);
      void reload();
    } catch (e) {
      toast((e as Error).message || 'Impossibile eliminare', 'error');
      setConfirm(null);
    } finally { setBusy(false); }
  }

  const contactsTab = data && (
    <>
      {can('contact:create') && (
        <div className="toolbar">
          <span className="spacer" />
          <button className="btn btn-primary btn-sm" onClick={() => setEditing(null)}><Plus size={16} /> Aggiungi contatto</button>
        </div>
      )}
      {data.contacts.length === 0 ? <Empty text="Nessun contatto." /> : (
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
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="row-actions">
                    {can('contact:update') && <div className="act-icon" title="Modifica" onClick={() => setEditing(c)}><Pencil size={15} /></div>}
                    {can('contact:delete') && <div className="act-icon danger" title="Elimina" onClick={() => setConfirm(c)}><Trash2 size={15} /></div>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
    </>
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

      {editing !== undefined && (
        <ContactDrawer
          companyId={id}
          editing={editing}
          busy={busy} setBusy={setBusy}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); void reload(); }}
          toastError={(m) => toast(m, 'error')}
          toastOk={(m) => toast(m)}
        />
      )}

      <ConfirmDialog
        open={!!confirm} danger
        title="Eliminare il contatto?"
        message={`“${confirm?.fullName}” verrà rimosso da questo cliente.`}
        confirmLabel="Elimina" busy={busy}
        onConfirm={doDelete} onCancel={() => setConfirm(null)}
      />
    </Page>
  );
}

function ContactDrawer({ companyId, editing, busy, setBusy, onClose, onSaved, toastError, toastOk }: {
  companyId: string; editing: ContactDto | null; busy: boolean; setBusy: (b: boolean) => void;
  onClose: () => void; onSaved: () => void; toastError: (m: string) => void; toastOk: (m: string) => void;
}) {
  const [v, setV] = useState<Record<string, unknown>>(() => ({
    fullName: editing?.fullName ?? '',
    roleTitle: editing?.roleTitle ?? '',
    email: editing?.email ?? '',
    phone: editing?.phone ?? '',
    isPrimary: editing?.isPrimary ?? false,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    if (!String(v.fullName ?? '').trim()) { setErrors({ fullName: 'Campo obbligatorio' }); return; }
    setBusy(true);
    const body: Record<string, unknown> = {
      fullName: String(v.fullName).trim(),
      roleTitle: (v.roleTitle as string) || undefined,
      email: (v.email as string) || undefined,
      phone: (v.phone as string) || undefined,
      isPrimary: !!v.isPrimary,
    };
    try {
      if (editing) await mutate('PATCH', `/contacts/${editing.id}`, body);
      else await mutate('POST', '/contacts', { companyId, ...body });
      toastOk(editing ? 'Contatto aggiornato' : 'Contatto creato');
      onSaved();
    } catch (e) {
      const msg = e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message;
      toastError(msg);
    } finally { setBusy(false); }
  }

  return (
    <Drawer
      open title={editing ? 'Modifica contatto' : 'Nuovo contatto'} onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Annulla</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>{editing ? 'Salva modifiche' : 'Crea'}</button>
        </>
      }
    >
      <div className="form-group">
        {CONTACT_FIELDS.map((f) => (
          <Field key={f.key} field={f} value={v[f.key]} error={errors[f.key]}
            onChange={(val) => setV((s) => ({ ...s, [f.key]: val }))} />
        ))}
      </div>
    </Drawer>
  );
}
