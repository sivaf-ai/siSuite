/**
 * ClienteDetailPage — scheda Soggetto (modello Party) su ObjectPage/ObjectBox v2.
 * Crea+vedi+modifica in una sola pagina (<Page bleed>, header sticky Salva/Annulla).
 * Anagrafica + box da field_definition (Dati fiscali/Indirizzo/Note) + tab Contatti
 * (sub-CRUD via drawer) e Località/Siti (SiteTree).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useHistory } from 'react-router';
import { Building2, Contact, Receipt, MapPin, StickyNote, Plus, Pencil, Trash2, Star } from 'lucide-react';
import type { CompanyDto, ContactDto, FieldDefinitionDto } from '@sisuite/shared';
import { GROUP_LABEL_IT } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { ObjectPage, ObjectBox, RelatedTabs, type RelTab } from '../ui/ObjectPage';
import { AttrBoxes, AttrField } from '../ui/AttrFields';
import { AddressField } from '../ui/AddressField';
import { Drawer } from '../ui/Drawer';
import { SiteTree } from '../ui/SiteTree';
import { Field, type RenderableField } from '../ui/Field';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { useApi, mutate } from '../api/hooks';
import { apiFetch, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

type CompanyDetail = CompanyDto & { contacts: ContactDto[] };
const ROLE_LABEL: Record<string, string> = { customer: 'Cliente', supplier: 'Fornitore', partner: 'Partner', operator: 'Gestore' };
const ALL_ROLES = ['customer', 'supplier', 'operator', 'partner'] as const;
const GROUP_ICON = { fiscal: Receipt, registry: MapPin, notes: StickyNote };
const COUNTRIES: { value: string; label: string }[] = [{ value: 'IT', label: 'Italia' }, { value: 'AR', label: 'Argentina' }];

/** campi top-level di contatto/anagrafica fiscale (oltre a displayName/type/roles). */
interface CompanyTop {
  country: string; taxId: string; taxIdKind: string;
  email: string; phone: string; website: string; iban: string; paymentTerms: string;
}
const emptyTop = (): CompanyTop => ({ country: 'IT', taxId: '', taxIdKind: '', email: '', phone: '', website: '', iban: '', paymentTerms: '' });

const CONTACT_FIELDS: RenderableField[] = [
  { key: 'fullName', label: 'Nome completo', dataType: 'text', required: true },
  { key: 'roleTitle', label: 'Ruolo / Mansione', dataType: 'text' },
  { key: 'department', label: 'Reparto', dataType: 'text' },
  { key: 'email', label: 'Email', dataType: 'email' },
  { key: 'phone', label: 'Telefono', dataType: 'text' },
  { key: 'mobile', label: 'Cellulare', dataType: 'text' },
  { key: 'note', label: 'Note', dataType: 'textarea' },
  { key: 'isPrimary', label: 'Contatto principale', dataType: 'boolean' },
];

export function ClienteDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const { user } = useAuth();
  const toast = useToast();
  const history = useHistory();
  const can = (p: string) => !!user?.permissions.includes(p as never);

  const detail = useApi<CompanyDetail>(isNew ? null : `/companies/${id}`);
  const fieldDefs = useApi<{ items: FieldDefinitionDto[] }>('/field-definitions?entity=company');

  const [form, setForm] = useState<{ displayName: string; type: string; roles: string[] }>({ displayName: '', type: 'organization', roles: [] });
  const [top, setTop] = useState<CompanyTop>(emptyTop());
  const [attrs, setAttrs] = useState<Record<string, unknown>>({});
  const [fiscal, setFiscal] = useState<Record<string, unknown>>({});
  const [legalAddress, setLegalAddress] = useState<Record<string, unknown>>({});
  const [operationalAddress, setOperationalAddress] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('contacts');
  const [editing, setEditing] = useState<ContactDto | null | undefined>(undefined);
  const [delContact, setDelContact] = useState<ContactDto | null>(null);
  const [delCompany, setDelCompany] = useState(false);

  const d = detail.data;
  useEffect(() => {
    if (!d) return;
    setForm({ displayName: d.displayName, type: d.type, roles: d.roles });
    setTop({
      country: d.country || 'IT', taxId: d.taxId ?? '', taxIdKind: d.taxIdKind ?? '',
      email: d.email ?? '', phone: d.phone ?? '', website: d.website ?? '',
      iban: d.iban ?? '', paymentTerms: d.paymentTerms ?? '',
    });
    setAttrs(d.attributes ?? {});
    setFiscal(d.fiscalAttributes ?? {});
    setLegalAddress(d.legalAddress ?? {});
    setOperationalAddress(d.operationalAddress ?? {});
  }, [d]);

  const setAttr = (k: string, v: unknown) => setAttrs((a) => ({ ...a, [k]: v }));
  const setTopF = (k: keyof CompanyTop, v: string) => setTop((s) => ({ ...s, [k]: v }));
  const toggleRole = (r: string) => setForm((f) => ({ ...f, roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r] }));

  async function save() {
    if (!form.displayName.trim()) { toast('La ragione sociale è obbligatoria', 'error'); return; }
    setBusy(true);
    const t2 = (v: string) => (v.trim() === '' ? undefined : v.trim());
    const body = {
      displayName: form.displayName.trim(), type: form.type,
      country: top.country || 'IT',
      taxId: t2(top.taxId), taxIdKind: t2(top.taxIdKind),
      email: t2(top.email), phone: t2(top.phone), website: t2(top.website),
      iban: t2(top.iban), paymentTerms: t2(top.paymentTerms),
      legalAddress, operationalAddress, fiscalAttributes: fiscal,
      roles: form.roles.map((role) => ({ role })), attributes: attrs,
    };
    try {
      if (isNew) {
        const c = await apiFetch<CompanyDto>('/companies', { method: 'POST', body: JSON.stringify(body) });
        toast('Soggetto creato'); history.replace(`/companies/${c.id}`);
      } else {
        await mutate('PATCH', `/companies/${id}`, body); toast('Modifiche salvate'); void detail.reload();
      }
    } catch (e) {
      toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message, 'error');
    } finally { setBusy(false); }
  }

  async function doDeleteContact() {
    if (!delContact) return;
    setBusy(true);
    try { await mutate('DELETE', `/contacts/${delContact.id}`); toast('Contatto eliminato'); setDelContact(null); void detail.reload(); }
    catch (e) { toast((e as Error).message || 'Impossibile eliminare', 'error'); setDelContact(null); }
    finally { setBusy(false); }
  }
  async function doDeleteCompany() {
    setBusy(true);
    try { await mutate('DELETE', `/companies/${id}`); toast('Soggetto archiviato'); history.replace('/companies'); }
    catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? 'Impossibile eliminare') : (e as Error).message, 'error'); setDelCompany(false); }
    finally { setBusy(false); }
  }

  if (!isNew && detail.loading) return <Page title={t('terms.party')}><Loading /></Page>;
  if (!isNew && detail.error) return <Page title={t('terms.party')}><ErrorBox message={detail.error} /></Page>;

  const defs = fieldDefs.data?.items ?? [];
  // FISCALI = def con country valorizzato (filtrate per il country selezionato);
  // GENERICI = def con country null → vanno in `attributes` (AttrBoxes come oggi).
  const fiscalDefs = defs
    .filter((f) => f.country != null && f.country === top.country && f.active !== false)
    .sort((a, b) => a.sequence - b.sequence);
  const genericDefs = defs.filter((f) => f.country == null);
  const setFiscalF = (k: string, v: unknown) => setFiscal((s) => ({ ...s, [k]: v }));
  const contacts = d?.contacts ?? [];

  const contactsTable = (
    <table className="subt">
      <thead><tr><th>Nome</th><th>Ruolo / Mansione</th><th>Reparto</th><th>Email</th><th>Telefono</th><th>Cellulare</th><th /></tr></thead>
      <tbody>
        {contacts.map((c) => (
          <tr key={c.id}>
            <td>{c.fullName}{c.isPrimary && <Star size={13} style={{ marginLeft: 6, color: 'var(--warning)' }} />}</td>
            <td>{c.roleTitle ?? '—'}</td>
            <td>{c.department ?? '—'}</td>
            <td style={{ fontSize: 12.5 }}>{c.email ?? '—'}</td>
            <td className="mono">{c.phone ?? '—'}</td>
            <td className="mono">{c.mobile ?? '—'}</td>
            <td className="num" style={{ whiteSpace: 'nowrap' }}>
              {can('contact:update') && <button className="xbtn" title="Modifica" onClick={() => setEditing(c)}><Pencil size={15} /></button>}
              {can('contact:delete') && <button className="xbtn" title="Elimina" onClick={() => setDelContact(c)} style={{ color: 'var(--danger)' }}><Trash2 size={15} /></button>}
            </td>
          </tr>
        ))}
        {contacts.length === 0 && <tr><td colSpan={7}><div className="dsx-empty">Nessun contatto.</div></td></tr>}
      </tbody>
    </table>
  );

  const tabs: RelTab[] = [
    {
      key: 'contacts', label: 'Contatti', icon: Contact, count: contacts.length,
      content: (
        <div>
          {contactsTable}
          {can('contact:create') && <button className="addline" onClick={() => setEditing(null)} style={{ marginTop: 8 }}><Plus size={15} /> Aggiungi contatto</button>}
        </div>
      ),
    },
    {
      key: 'sites', label: 'Località e siti', icon: MapPin,
      content: id && !isNew ? <SiteTree companyId={id} canEdit={can('site:create')} /> : <div className="dsx-empty">Salva il soggetto per gestire i siti.</div>,
    },
  ];

  const title = isNew ? `${t('terms.party')} — nuovo` : (form.displayName || t('terms.party'));

  return (
    <Page title={title} bleed>
      <ObjectPage
        backLabel={t('terms.party_plural')} onBack={() => history.push('/companies')}
        title={title} code={!isNew && d ? d.id.slice(0, 8).toUpperCase() : undefined}
        status={!isNew ? <span style={{ display: 'flex', gap: 4 }}>{form.roles.map((r) => <StatusPill key={r} label={ROLE_LABEL[r] ?? r} token="brand" />)}</span> : undefined}
        onSave={(isNew ? can('company:create') : can('company:update')) ? save : undefined}
        onCancel={() => history.push('/companies')} saving={busy}
      >
        <ObjectBox icon={Building2} title="Anagrafica">
          <div className="bgrid">
            <div className="bf c2"><span className="bl">Ragione sociale <span className="req">*</span></span>
              <input className="bi" value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} /></div>
            <div className="bf"><span className="bl">Tipo</span>
              <select className="bi" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                <option value="organization">Organizzazione</option><option value="private">Privato</option>
              </select></div>
            <div className="bf"><span className="bl">Ruoli</span>
              <div className="bi" style={{ flexWrap: 'wrap', gap: 6, height: 'auto', minHeight: 38, padding: 6 }}>
                {ALL_ROLES.map((r) => {
                  const on = form.roles.includes(r);
                  return <span key={r} className="chip" style={{ cursor: 'pointer', opacity: on ? 1 : 0.5, background: on ? 'var(--brand-wash)' : undefined }} onClick={() => toggleRole(r)}>{ROLE_LABEL[r]}</span>;
                })}
              </div></div>
            <div className="bf"><span className="bl">Paese</span>
              <select className="bi" value={top.country} onChange={(e) => setTopF('country', e.target.value)}>
                {COUNTRIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select></div>
            <div className="bf"><span className="bl">Codice fiscale / P.IVA</span>
              <input className="bi" value={top.taxId} onChange={(e) => setTopF('taxId', e.target.value)} placeholder={top.country === 'AR' ? 'CUIT' : 'P.IVA'} /></div>
            <div className="bf"><span className="bl">Tipo identificativo</span>
              <select className="bi" value={top.taxIdKind} onChange={(e) => setTopF('taxIdKind', e.target.value)}>
                <option value="">—</option>
                {top.country === 'AR'
                  ? [<option key="cuit" value="cuit">CUIT</option>, <option key="cuil" value="cuil">CUIL</option>, <option key="dni" value="dni">DNI</option>]
                  : [<option key="vat" value="vat">P.IVA</option>, <option key="cf" value="cf">Codice fiscale</option>]}
              </select></div>
          </div>
        </ObjectBox>

        <ObjectBox icon={Contact} title="Recapiti e pagamenti">
          <div className="bgrid">
            <div className="bf"><span className="bl">Email</span>
              <input className="bi" type="email" value={top.email} onChange={(e) => setTopF('email', e.target.value)} /></div>
            <div className="bf"><span className="bl">Telefono</span>
              <input className="bi" value={top.phone} onChange={(e) => setTopF('phone', e.target.value)} /></div>
            <div className="bf c2"><span className="bl">Sito web</span>
              <input className="bi" value={top.website} onChange={(e) => setTopF('website', e.target.value)} placeholder="https://" /></div>
            <div className="bf"><span className="bl">IBAN</span>
              <input className="bi" value={top.iban} onChange={(e) => setTopF('iban', e.target.value)} /></div>
            <div className="bf"><span className="bl">Termini di pagamento</span>
              <input className="bi" value={top.paymentTerms} onChange={(e) => setTopF('paymentTerms', e.target.value)} placeholder="es. 30gg FM" /></div>
          </div>
        </ObjectBox>

        {fiscalDefs.length > 0 && (
          <ObjectBox icon={Receipt} title={`${GROUP_LABEL_IT.fiscal} (${top.country})`}>
            <div className="bgrid">
              {fiscalDefs.map((f) => (
                <AttrField key={f.key} f={f} value={fiscal[f.key]} onChange={(v) => setFiscalF(f.key, v)} />
              ))}
            </div>
          </ObjectBox>
        )}

        <AddressField label="Sede legale" country={top.country} value={legalAddress} onChange={setLegalAddress} />
        <AddressField label="Sede operativa" country={top.country} value={operationalAddress} onChange={setOperationalAddress} />

        <AttrBoxes defs={genericDefs} attrs={attrs} setAttr={setAttr} icons={GROUP_ICON} fullKeys={['street', 'website']} />

        {!isNew && <RelatedTabs tabs={tabs} active={tab} onChange={setTab} />}

        {!isNew && can('company:delete') && (
          <div style={{ padding: '6px 2px 4px' }}>
            <button className="btn btn-ghost" onClick={() => setDelCompany(true)} style={{ color: 'var(--danger)' }}><Trash2 size={15} /> Archivia soggetto</button>
          </div>
        )}
      </ObjectPage>

      {editing !== undefined && d && (
        <ContactDrawer companyId={d.id} editing={editing} busy={busy} setBusy={setBusy}
          onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); void detail.reload(); }}
          toastError={(m) => toast(m, 'error')} toastOk={(m) => toast(m)} />
      )}

      <ConfirmDialog open={!!delContact} danger title="Eliminare il contatto?"
        message={`“${delContact?.fullName}” verrà rimosso da questo soggetto.`}
        confirmLabel="Elimina" busy={busy} onConfirm={doDeleteContact} onCancel={() => setDelContact(null)} />
      <ConfirmDialog open={delCompany} danger title="Archiviare il soggetto?"
        message="Il soggetto verrà archiviato. Le voci legate a storia fatturabile restano protette."
        confirmLabel="Archivia" busy={busy} onConfirm={doDeleteCompany} onCancel={() => setDelCompany(false)} />
    </Page>
  );
}

function ContactDrawer({ companyId, editing, busy, setBusy, onClose, onSaved, toastError, toastOk }: {
  companyId: string; editing: ContactDto | null; busy: boolean; setBusy: (b: boolean) => void;
  onClose: () => void; onSaved: () => void; toastError: (m: string) => void; toastOk: (m: string) => void;
}) {
  const [v, setV] = useState<Record<string, unknown>>(() => ({
    fullName: editing?.fullName ?? '', roleTitle: editing?.roleTitle ?? '', department: editing?.department ?? '',
    email: editing?.email ?? '', phone: editing?.phone ?? '', mobile: editing?.mobile ?? '',
    note: editing?.note ?? '', isPrimary: editing?.isPrimary ?? false,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    if (!String(v.fullName ?? '').trim()) { setErrors({ fullName: 'Campo obbligatorio' }); return; }
    setBusy(true);
    const body: Record<string, unknown> = {
      fullName: String(v.fullName).trim(), roleTitle: (v.roleTitle as string) || undefined,
      department: (v.department as string) || null, email: (v.email as string) || undefined,
      phone: (v.phone as string) || undefined, mobile: (v.mobile as string) || null,
      note: (v.note as string) || null, isPrimary: !!v.isPrimary,
    };
    try {
      if (editing) await mutate('PATCH', `/contacts/${editing.id}`, body);
      else await mutate('POST', '/contacts', { companyId, ...body });
      toastOk(editing ? 'Contatto aggiornato' : 'Contatto creato'); onSaved();
    } catch (e) {
      toastError(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <Drawer open title={editing ? 'Modifica contatto' : 'Nuovo contatto'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Annulla</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{editing ? 'Salva modifiche' : 'Crea'}</button>
      </>}>
      <div className="form-group">
        {CONTACT_FIELDS.map((f) => (
          <Field key={f.key} field={f} value={v[f.key]} error={errors[f.key]} onChange={(val) => setV((s) => ({ ...s, [f.key]: val }))} />
        ))}
      </div>
    </Drawer>
  );
}
