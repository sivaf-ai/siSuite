/**
 * UserDetailPage — scheda Utente su ObjectPage v2 (<Page bleed>). Crea (manuale con
 * password o invito) + vedi + modifica. Ruoli a chip-toggle dal catalogo /roles.
 * Box Risorsa collegata (PATCH resourceId) + Permessi effettivi (sola lettura).
 */
import { useEffect, useState } from 'react';
import { useParams, useHistory } from 'react-router';
import { UserCircle, ShieldCheck, Link2, KeyRound } from 'lucide-react';
import type { UserAdminDto, EffectivePermissionsDto, ResourceDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../../components/Page';
import { StatusPill } from '../../components/StatusPill';
import { ObjectPage, ObjectBox } from '../../ui/ObjectPage';
import { useToast } from '../../ui/Toast';
import { useApi, mutate } from '../../api/hooks';
import { apiFetch, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

const LOCALES = [{ v: 'it-IT', l: 'Italiano' }, { v: 'en', l: 'Inglese' }, { v: 'es-AR', l: 'Spagnolo (AR)' }];

const STATUS_PILL: Record<string, { label: string; token: string }> = {
  invited: { label: 'Invitato', token: 'warning' },
  active: { label: 'Attivo', token: 'success' },
  disabled: { label: 'Disattivato', token: 'neutral' },
};
const SCOPE_LABEL: Record<string, string> = { own: 'Solo le proprie', team: 'Del team', tenant: 'Tutto il tenant', customer: 'Cliente (portale)' };

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const { user } = useAuth();
  const toast = useToast();
  const history = useHistory();
  const canManage = !!user?.permissions.includes('user:manage' as never);

  const detail = useApi<UserAdminDto>(isNew ? null : `/users/${id}`);
  const roles = useApi<{ items: { id: string; name: string }[] }>('/roles?limit=200');
  const resources = useApi<{ items: ResourceDto[] }>('/resources?kind=person&limit=500');
  const effective = useApi<EffectivePermissionsDto>(isNew ? null : `/users/${id}/effective`);

  // In creazione: 'invite' (POST /users/invite, no password) | 'password' (POST /users).
  const [mode, setMode] = useState<'invite' | 'password'>('invite');
  const [form, setForm] = useState({ fullName: '', email: '', password: '', phone: '', locale: 'it-IT', active: true });
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [resourceId, setResourceId] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const d = detail.data;
  useEffect(() => {
    if (!d) return;
    setForm({ fullName: d.fullName, email: d.email ?? '', password: '', phone: d.phone ?? '', locale: d.locale ?? 'it-IT', active: d.active });
    setRoleIds(d.roles.map((r) => r.id));
    setResourceId(d.resourceId ?? '');
  }, [d]);

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const toggleRole = (rid: string) => setRoleIds((s) => s.includes(rid) ? s.filter((x) => x !== rid) : [...s, rid]);

  async function save() {
    if (!form.fullName.trim()) { toast('Il nome è obbligatorio', 'error'); return; }
    if (isNew && !form.email.trim()) { toast('L\'email è obbligatoria', 'error'); return; }
    if (isNew && mode === 'password' && form.password.length < 8) { toast('La password deve avere almeno 8 caratteri', 'error'); return; }
    setBusy(true);
    try {
      if (isNew) {
        if (mode === 'invite') {
          const body = { fullName: form.fullName.trim(), email: form.email.trim(), phone: form.phone || null, locale: form.locale, roleIds, resourceId: resourceId || null };
          const c = await apiFetch<UserAdminDto>('/users/invite', { method: 'POST', body: JSON.stringify(body) });
          toast('Invito inviato'); history.replace(`/admin/users/${c.id}`);
        } else {
          const body = { fullName: form.fullName.trim(), email: form.email.trim(), password: form.password, phone: form.phone || null, locale: form.locale, roleIds, resourceId: resourceId || null };
          const c = await apiFetch<UserAdminDto>('/users', { method: 'POST', body: JSON.stringify(body) });
          toast('Utente creato'); history.replace(`/admin/users/${c.id}`);
        }
      } else {
        const body = { fullName: form.fullName.trim(), phone: form.phone || null, active: form.active, locale: form.locale, roleIds, resourceId: resourceId || null };
        await mutate('PATCH', `/users/${id}`, body); toast('Modifiche salvate'); void detail.reload(); void effective.reload();
      }
    } catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  if (!isNew && detail.loading) return <Page title="Utente"><Loading /></Page>;
  if (!isNew && detail.error) return <Page title="Utente"><ErrorBox message={detail.error} /></Page>;

  const roleOpts = roles.data?.items ?? [];
  const resOpts = resources.data?.items ?? [];
  const title = isNew ? 'Nuovo utente' : (form.fullName || 'Utente');
  const statusKey = d?.status ?? (form.active ? 'active' : 'disabled');
  const sp = STATUS_PILL[statusKey] ?? { label: form.active ? 'Attivo' : 'Disattivato', token: form.active ? 'success' : 'neutral' };
  const eff = effective.data;

  return (
    <Page title={title} bleed>
      <ObjectPage
        backLabel="Utenti" onBack={() => history.push('/admin/users')}
        title={title} code={!isNew ? (d?.code ?? undefined) : undefined}
        status={!isNew ? <StatusPill label={sp.label} token={sp.token} /> : undefined}
        onSave={canManage ? save : undefined} onCancel={() => history.push('/admin/users')} saving={busy}
      >
        <ObjectBox icon={UserCircle} title="Anagrafica utente">
          <div className="bgrid">
            {isNew && (
              <div className="bf c4"><span className="bl">Modalità di creazione</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span className="chip" style={{ cursor: 'pointer', opacity: mode === 'invite' ? 1 : 0.5, background: mode === 'invite' ? 'var(--brand-wash)' : undefined }} onClick={() => setMode('invite')}>Invita via email</span>
                  <span className="chip" style={{ cursor: 'pointer', opacity: mode === 'password' ? 1 : 0.5, background: mode === 'password' ? 'var(--brand-wash)' : undefined }} onClick={() => setMode('password')}>Crea con password</span>
                </div></div>
            )}
            <div className="bf c2"><span className="bl">Nome completo <span className="req">*</span></span>
              <input className="bi" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} /></div>
            {isNew ? (
              <>
                <div className="bf c2"><span className="bl">Email <span className="req">*</span></span>
                  <input className="bi" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
                {mode === 'password' && (
                  <div className="bf c2"><span className="bl">Password iniziale <span className="req">*</span></span>
                    <input className="bi" type="text" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="min 8 caratteri" /></div>
                )}
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

        <ObjectBox icon={Link2} title="Risorsa collegata">
          <div className="bgrid">
            <div className="bf c3"><span className="bl">Risorsa (persona)</span>
              <select className="bi" value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
                <option value="">— Nessuna —</option>
                {resOpts.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                {/* mantieni l'etichetta corrente anche se non in lista (es. risorsa non-person) */}
                {resourceId && !resOpts.some((r) => r.id === resourceId) && d?.resourceLabel && <option value={resourceId}>{d.resourceLabel}</option>}
              </select></div>
            <div className="bf"><span className="bl">Collegata</span>
              <div className="bi">{resourceId ? (d?.resourceLabel ?? resOpts.find((r) => r.id === resourceId)?.label ?? '—') : <span className="faint">non collegata</span>}</div></div>
          </div>
          <p className="faint" style={{ fontSize: 12.5, marginTop: 8, color: 'var(--ink-faint)' }}>
            Collega questo account alla risorsa-persona corrispondente (per ore, pianificazione, costi). Lascia vuoto per scollegare.
          </p>
        </ObjectBox>

        {!isNew && (
          <ObjectBox icon={KeyRound} title={`Permessi effettivi${eff ? ` (${eff.permissions.length})` : ''}`}>
            {effective.loading && <div className="dsx-empty">Carico…</div>}
            {!effective.loading && eff && (
              <>
                <div className="bgrid" style={{ marginBottom: 10 }}>
                  <div className="bf"><span className="bl">Visibilità dati</span>
                    <div className="bi">{SCOPE_LABEL[eff.dataScope] ?? eff.dataScope}</div></div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {eff.permissions.map((p) => <span key={p} className="chip mono" style={{ fontSize: 11.5 }}>{p}</span>)}
                  {eff.permissions.length === 0 && <span className="faint">Nessun permesso (nessun ruolo assegnato).</span>}
                </div>
                <p className="faint" style={{ fontSize: 12.5, marginTop: 8, color: 'var(--ink-faint)' }}>
                  Derivati dai ruoli assegnati. Sola lettura.
                </p>
              </>
            )}
          </ObjectBox>
        )}
      </ObjectPage>
    </Page>
  );
}
