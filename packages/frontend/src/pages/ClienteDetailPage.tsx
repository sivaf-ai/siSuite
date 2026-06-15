/**
 * ClienteDetailPage — pagina-form ricca (mock 33), il METRO delle entità complesse.
 * Crea (/companies/new) e modifica/dettaglio (/companies/:id) nella stessa maschera:
 * Anagrafica (campi tipizzati) + sezioni da field_definition (Indirizzo/Dati fiscali/Note)
 * + Contatti (sub-CRUD) + elimina con conferma. Layout pagina intera, barra azioni fissa.
 */
import { useState } from 'react';
import { useParams, useHistory } from 'react-router';
import { Building2, Contact, Star, Plus, Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import type { CompanyDto, ContactDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { FormPage, FormCard } from '../ui/FormPage';
import { EntityForm, type TypedGroup } from '../ui/EntityForm';
import { Drawer } from '../ui/Drawer';
import { Field, type RenderableField } from '../ui/Field';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { useApi, mutate } from '../api/hooks';
import { apiFetch, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

type CompanyDetail = CompanyDto & { contacts: ContactDto[] };
const ROLE_LABEL: Record<string, string> = { customer: 'Cliente', supplier: 'Fornitore', partner: 'Partner' };

const TYPED: TypedGroup[] = [{
  group: 'Anagrafica',
  icon: Building2,
  fields: [
    { key: 'displayName', label: 'Ragione sociale', dataType: 'text', required: true },
    { key: 'type', label: 'Tipo cliente', dataType: 'select', options: [
      { value: 'organization', label: { 'it-IT': 'Azienda' } },
      { value: 'private', label: { 'it-IT': 'Privato' } },
    ] },
    { key: 'roles', label: 'Ruoli', dataType: 'roles' },
  ],
}];

const CONTACT_FIELDS: RenderableField[] = [
  { key: 'fullName', label: 'Nome completo', dataType: 'text', required: true },
  { key: 'roleTitle', label: 'Ruolo / Mansione', dataType: 'text' },
  { key: 'email', label: 'Email', dataType: 'email' },
  { key: 'phone', label: 'Telefono', dataType: 'text' },
  { key: 'isPrimary', label: 'Contatto principale', dataType: 'boolean' },
];

const GROUP_LABEL = (k: string) => (k === 'registry' ? 'Indirizzo e recapiti' : undefined);

export function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const { user } = useAuth();
  const toast = useToast();
  const history = useHistory();
  const can = (p: string) => !!user?.permissions.includes(p as never);

  const { data, loading, error, reload } = useApi<CompanyDetail>(isNew ? '' : `/companies/${id}`);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ContactDto | null | undefined>(undefined); // undefined chiuso, null nuovo
  const [delContact, setDelContact] = useState<ContactDto | null>(null);
  const [delCompany, setDelCompany] = useState(false);

  async function saveCompany(values: Record<string, unknown>) {
    setBusy(true);
    const body = {
      displayName: values.displayName,
      type: (values.type as string) ?? 'organization',
      roles: ((values.roles as string[]) ?? []).map((role) => ({ role })),
      attributes: values.attributes,
    };
    try {
      if (isNew) {
        const created = await apiFetch<CompanyDto>('/companies', { method: 'POST', body: JSON.stringify(body) });
        toast('Cliente creato');
        history.replace(`/companies/${created.id}`);
      } else {
        await mutate('PATCH', `/companies/${id}`, body);
        toast('Modifiche salvate');
        void reload();
      }
    } catch (e) {
      toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message, 'error');
    } finally { setBusy(false); }
  }

  async function doDeleteContact() {
    if (!delContact) return;
    setBusy(true);
    try {
      await mutate('DELETE', `/contacts/${delContact.id}`);
      toast('Contatto eliminato'); setDelContact(null); void reload();
    } catch (e) { toast((e as Error).message || 'Impossibile eliminare', 'error'); setDelContact(null); }
    finally { setBusy(false); }
  }

  async function doDeleteCompany() {
    setBusy(true);
    try {
      await mutate('DELETE', `/companies/${id}`);
      toast('Cliente archiviato'); history.replace('/companies');
    } catch (e) {
      toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? 'Impossibile eliminare') : (e as Error).message, 'error');
      setDelCompany(false);
    } finally { setBusy(false); }
  }

  // sezione Contatti (mock 33) — solo in modifica (serve l'id azienda)
  const contactsCard = data && (
    <FormCard icon={<Contact />} title="Contatti">
      {data.contacts.length > 0 && (
        <div className="chead"><span>Nome</span><span>Ruolo</span><span>Email</span><span>Telefono</span><span /></div>
      )}
      {data.contacts.map((c) => (
        <div className="crow" key={c.id}>
          <div className="inp" style={{ display: 'flex', alignItems: 'center' }}>
            {c.fullName}{c.isPrimary && <Star className="star" size={14} style={{ marginLeft: 'auto' }} />}
          </div>
          <div className="inp">{c.roleTitle ?? '—'}</div>
          <div className="inp" style={{ fontSize: 12.5 }}>{c.email ?? '—'}</div>
          <div className="inp mono">{c.phone ?? '—'}</div>
          <div style={{ display: 'flex', gap: 2 }}>
            {can('contact:update') && <button className="xbtn" title="Modifica" onClick={() => setEditing(c)} style={{ color: 'var(--ink-soft)' }}><Pencil size={15} /></button>}
            {can('contact:delete') && <button className="xbtn" title="Elimina" onClick={() => setDelContact(c)}><Trash2 size={15} /></button>}
          </div>
        </div>
      ))}
      {data.contacts.length === 0 && <div className="fhint" style={{ marginBottom: 8 }}>Nessun contatto.</div>}
      {can('contact:create') && (
        <button className="addline" onClick={() => setEditing(null)}><Plus size={15} /> Aggiungi contatto</button>
      )}
    </FormCard>
  );

  const newContactHint = isNew && (
    <FormCard icon={<Contact />} title="Contatti">
      <div className="fhint">Salva prima il cliente per aggiungere i contatti.</div>
    </FormCard>
  );

  const title = isNew ? 'Nuovo cliente' : (data?.displayName ?? 'Cliente');
  const roles = data?.roles ?? [];

  return (
    <Page title={title} back="/companies">
      {!isNew && loading && <Loading />}
      {!isNew && error && <ErrorBox message={error} />}
      {(isNew || data) && (
        <FormPage
          back={() => history.push('/companies')} backLabel="Clienti"
          title={title}
          code={!isNew && data ? data.id.slice(0, 8).toUpperCase() : undefined}
          status={roles.map((r) => <span key={r} className="chip" style={{ marginLeft: 4 }}>{ROLE_LABEL[r] ?? r}</span>)}
        >
          <EntityForm
            entityKey="company"
            layout="page"
            typedGroups={TYPED}
            groupLabel={GROUP_LABEL}
            initial={isNew ? undefined : data ? { displayName: data.displayName, type: data.type, roles: data.roles, attributes: data.attributes } : undefined}
            busy={busy}
            submitLabel={isNew ? 'Crea cliente' : 'Salva cliente'}
            onSubmit={saveCompany}
            onCancel={() => history.push('/companies')}
            extraSections={<>{contactsCard}{newContactHint}</>}
            barLeft={!isNew && can('company:delete') ? (
              <button type="button" className="btn btn-ghost" onClick={() => setDelCompany(true)} style={{ color: 'var(--danger)' }}>
                <Trash2 size={15} /> Elimina
              </button>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={14} style={{ color: 'var(--success)' }} /> {isNew ? 'Compila e crea' : ''}</span>
            )}
          />
        </FormPage>
      )}

      {editing !== undefined && data && (
        <ContactDrawer
          companyId={data.id} editing={editing}
          busy={busy} setBusy={setBusy}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); void reload(); }}
          toastError={(m) => toast(m, 'error')} toastOk={(m) => toast(m)}
        />
      )}

      <ConfirmDialog
        open={!!delContact} danger
        title="Eliminare il contatto?"
        message={`“${delContact?.fullName}” verrà rimosso da questo cliente.`}
        confirmLabel="Elimina" busy={busy}
        onConfirm={doDeleteContact} onCancel={() => setDelContact(null)}
      />
      <ConfirmDialog
        open={delCompany} danger
        title="Archiviare il cliente?"
        message="Il cliente verrà archiviato. Le voci legate a storia fatturabile restano protette."
        confirmLabel="Archivia" busy={busy}
        onConfirm={doDeleteCompany} onCancel={() => setDelCompany(false)}
      />
    </Page>
  );
}

function ContactDrawer({ companyId, editing, busy, setBusy, onClose, onSaved, toastError, toastOk }: {
  companyId: string; editing: ContactDto | null; busy: boolean; setBusy: (b: boolean) => void;
  onClose: () => void; onSaved: () => void; toastError: (m: string) => void; toastOk: (m: string) => void;
}) {
  const [v, setV] = useState<Record<string, unknown>>(() => ({
    fullName: editing?.fullName ?? '', roleTitle: editing?.roleTitle ?? '',
    email: editing?.email ?? '', phone: editing?.phone ?? '', isPrimary: editing?.isPrimary ?? false,
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
