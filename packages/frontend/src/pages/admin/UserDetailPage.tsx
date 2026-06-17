/**
 * UserDetailPage — scheda Utente su ObjectPage v2 (<Page bleed>). Crea (provisiona
 * l'identità su GoTrue) + vedi + modifica. Ruoli a chip-toggle dal catalogo /roles.
 */
import { useEffect, useState } from 'react';
import { useParams, useHistory } from 'react-router';
import { UserCircle, ShieldCheck } from 'lucide-react';
import type { UserAdminDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../../components/Page';
import { StatusPill } from '../../components/StatusPill';
import { ObjectPage, ObjectBox } from '../../ui/ObjectPage';
import { useToast } from '../../ui/Toast';
import { useApi, mutate } from '../../api/hooks';
import { apiFetch, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

const LOCALES = [{ v: 'it-IT', l: 'Italiano' }, { v: 'en', l: 'Inglese' }, { v: 'es-AR', l: 'Spagnolo (AR)' }];

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const { user } = useAuth();
  const toast = useToast();
  const history = useHistory();
  const canManage = !!user?.permissions.includes('user:manage' as never);

  const detail = useApi<UserAdminDto>(isNew ? null : `/users/${id}`);
  const roles = useApi<{ items: { id: string; name: string }[] }>('/roles?limit=200');

  const [form, setForm] = useState({ fullName: '', email: '', password: '', phone: '', locale: 'it-IT', active: true });
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const d = detail.data;
  useEffect(() => {
    if (!d) return;
    setForm({ fullName: d.fullName, email: d.email ?? '', password: '', phone: d.phone ?? '', locale: d.locale ?? 'it-IT', active: d.active });
    setRoleIds(d.roles.map((r) => r.id));
  }, [d]);

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const toggleRole = (rid: string) => setRoleIds((s) => s.includes(rid) ? s.filter((x) => x !== rid) : [...s, rid]);

  async function save() {
    if (!form.fullName.trim()) { toast('Il nome è obbligatorio', 'error'); return; }
    if (isNew && (!form.email.trim() || form.password.length < 8)) { toast('Email valida e password (min 8) obbligatorie', 'error'); return; }
    setBusy(true);
    try {
      if (isNew) {
        const body = { fullName: form.fullName.trim(), email: form.email.trim(), password: form.password, phone: form.phone || null, locale: form.locale, roleIds };
        const c = await apiFetch<UserAdminDto>('/users', { method: 'POST', body: JSON.stringify(body) });
        toast('Utente creato'); history.replace(`/admin/users/${c.id}`);
      } else {
        const body = { fullName: form.fullName.trim(), phone: form.phone || null, active: form.active, locale: form.locale, roleIds };
        await mutate('PATCH', `/users/${id}`, body); toast('Modifiche salvate'); void detail.reload();
      }
    } catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  if (!isNew && detail.loading) return <Page title="Utente"><Loading /></Page>;
  if (!isNew && detail.error) return <Page title="Utente"><ErrorBox message={detail.error} /></Page>;

  const roleOpts = roles.data?.items ?? [];
  const title = isNew ? 'Nuovo utente' : (form.fullName || 'Utente');

  return (
    <Page title={title} bleed>
      <ObjectPage
        backLabel="Utenti" onBack={() => history.push('/admin/users')}
        title={title} code={!isNew ? form.email || undefined : undefined}
        status={!isNew ? <StatusPill label={form.active ? 'Attivo' : 'Disattivato'} token={form.active ? 'success' : 'neutral'} /> : undefined}
        onSave={canManage ? save : undefined} onCancel={() => history.push('/admin/users')} saving={busy}
      >
        <ObjectBox icon={UserCircle} title="Anagrafica utente">
          <div className="bgrid">
            <div className="bf c2"><span className="bl">Nome completo <span className="req">*</span></span>
              <input className="bi" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} /></div>
            {isNew ? (
              <>
                <div className="bf c2"><span className="bl">Email <span className="req">*</span></span>
                  <input className="bi" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
                <div className="bf c2"><span className="bl">Password iniziale <span className="req">*</span></span>
                  <input className="bi" type="text" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="min 8 caratteri" /></div>
              </>
            ) : (
              <div className="bf c2"><span className="bl">Email</span><div className="bi">{form.email || '—'}</div></div>
            )}
            <div className="bf"><span className="bl">Telefono</span>
              <input className="bi mono" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
            <div className="bf"><span className="bl">Lingua</span>
              <select className="bi" value={form.locale} onChange={(e) => set('locale', e.target.value)}>
                {LOCALES.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select></div>
            {!isNew && (
              <div className="bf"><span className="bl">Attivo</span>
                <label className="bi" style={{ justifyContent: 'space-between', cursor: 'pointer' }}>{form.active ? 'Sì' : 'No'}
                  <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} /></label></div>
            )}
          </div>
        </ObjectBox>

        <ObjectBox icon={ShieldCheck} title="Ruoli">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {roleOpts.map((r) => {
              const on = roleIds.includes(r.id);
              return <span key={r.id} className="chip" style={{ cursor: 'pointer', opacity: on ? 1 : 0.5, background: on ? 'var(--brand-wash)' : undefined }} onClick={() => toggleRole(r.id)}>{r.name}</span>;
            })}
            {roleOpts.length === 0 && <span className="faint">Nessun ruolo disponibile.</span>}
          </div>
        </ObjectBox>
      </ObjectPage>
    </Page>
  );
}
