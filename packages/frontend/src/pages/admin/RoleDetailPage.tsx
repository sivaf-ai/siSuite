/**
 * RoleDetailPage — scheda Ruolo su ObjectPage v2 (<Page bleed>). Crea+vedi+modifica.
 * Matrice permessi raggruppata per risorsa dal PERMISSION_CATALOG. I ruoli di
 * sistema sono in sola lettura (Salva disabilitato).
 */
import { useEffect, useState } from 'react';
import { useParams, useHistory, useLocation } from 'react-router';
import { ShieldCheck, KeyRound, Copy } from 'lucide-react';
import { PERMISSION_CATALOG, type RoleDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../../components/Page';
import { StatusPill } from '../../components/StatusPill';
import { ObjectPage, ObjectBox } from '../../ui/ObjectPage';
import { useToast } from '../../ui/Toast';
import { useApi, mutate } from '../../api/hooks';
import { apiFetch, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

const SCOPES = [
  { v: 'own', l: 'Solo le proprie' }, { v: 'team', l: 'Del team' },
  { v: 'tenant', l: 'Tutto il tenant' }, { v: 'customer', l: 'Cliente (portale)' },
];
const CATALOG = Object.entries(PERMISSION_CATALOG) as [string, { label: string; actions: Record<string, string> }][];

export function RoleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const { user } = useAuth();
  const toast = useToast();
  const history = useHistory();
  const canManage = !!user?.permissions.includes('role:manage' as never);

  const detail = useApi<RoleDto>(isNew ? null : `/roles/${id}`);

  const [form, setForm] = useState({ name: '', description: '', dataScope: 'team' });
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Duplica (standard): "nuovo" precompilato da location.state.prefill.
  const location = useLocation();
  const prefill = isNew ? (location.state as { prefill?: Record<string, unknown> } | null)?.prefill : undefined;

  const d = detail.data;
  useEffect(() => {
    if (!d) {
      if (isNew && prefill) {
        setForm({
          name: (prefill.name as string) ?? '',
          description: (prefill.description as string) ?? '',
          dataScope: (prefill.dataScope as string) ?? 'team',
        });
        if (Array.isArray(prefill.permissions)) setPerms(new Set(prefill.permissions as string[]));
      }
      return;
    }
    setForm({ name: d.name, description: d.description ?? '', dataScope: d.dataScope });
    setPerms(new Set(d.permissions));
  }, [d, isNew, prefill]);

  const isSystem = !isNew && !!d?.isSystem;
  const readOnly = isSystem || !canManage;
  const togglePerm = (k: string) => setPerms((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleResource = (res: string, actions: string[]) => setPerms((s) => {
    const n = new Set(s);
    const allOn = actions.every((a) => n.has(`${res}:${a}`));
    actions.forEach((a) => { allOn ? n.delete(`${res}:${a}`) : n.add(`${res}:${a}`); });
    return n;
  });

  async function save() {
    if (!form.name.trim()) { toast('Il nome è obbligatorio', 'error'); return; }
    setBusy(true);
    const body = { name: form.name.trim(), description: form.description || null, dataScope: form.dataScope, permissions: [...perms] };
    try {
      if (isNew) { const c = await apiFetch<RoleDto>('/roles', { method: 'POST', body: JSON.stringify(body) }); toast('Ruolo creato'); history.replace(`/admin/roles/${c.id}`); }
      else { await mutate('PATCH', `/roles/${id}`, body); toast('Modifiche salvate'); void detail.reload(); }
    } catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  async function clone() {
    setBusy(true);
    try {
      const c = await apiFetch<RoleDto>(`/roles/${id}/clone`, { method: 'POST' });
      toast('Ruolo duplicato — ora modificabile'); history.replace(`/admin/roles/${c.id}`);
    } catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  if (!isNew && detail.loading) return <Page title="Ruolo"><Loading /></Page>;
  if (!isNew && detail.error) return <Page title="Ruolo"><ErrorBox message={detail.error} /></Page>;

  const title = isNew ? 'Nuovo ruolo' : (form.name || 'Ruolo');

  return (
    <Page title={title} bleed>
      <ObjectPage
        backLabel="Ruoli" onBack={() => history.push('/admin/roles')}
        title={title}
        status={!isNew ? <StatusPill label={isSystem ? 'Sistema (sola lettura)' : 'Personalizzato'} token={isSystem ? 'neutral' : 'brand'} /> : undefined}
        onSave={!readOnly ? save : undefined} onCancel={() => history.push('/admin/roles')} saving={busy}
      >
        {isSystem && canManage && (
          <ObjectBox icon={Copy} title="Ruolo di sistema">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span className="faint" style={{ fontSize: 13, color: 'var(--ink-soft)', flex: 1, minWidth: 200 }}>
                Questo ruolo è di sistema (sola lettura). Duplicalo per ottenere una copia personalizzabile.
              </span>
              <button className="btn btn-primary" disabled={busy} onClick={clone}><Copy size={16} /> Duplica per modificare</button>
            </div>
          </ObjectBox>
        )}

        <ObjectBox icon={ShieldCheck} title="Ruolo">
          <div className="bgrid">
            <div className="bf c2"><span className="bl">Nome <span className="req">*</span></span>
              <input className="bi" value={form.name} disabled={readOnly} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div className="bf c2"><span className="bl">Visibilità dati</span>
              <select className="bi" value={form.dataScope} disabled={readOnly} onChange={(e) => setForm((f) => ({ ...f, dataScope: e.target.value }))}>
                {SCOPES.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select></div>
            <div className="bf c4"><span className="bl">Descrizione</span>
              <input className="bi" value={form.description} disabled={readOnly} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
          </div>
        </ObjectBox>

        <ObjectBox icon={KeyRound} title={`Permessi (${perms.size})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CATALOG.map(([res, def]) => {
              const actions = Object.keys(def.actions);
              const allOn = actions.every((a) => perms.has(`${res}:${a}`));
              return (
                <div key={res} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, cursor: readOnly ? 'default' : 'pointer', color: allOn ? 'var(--brand)' : 'var(--ink)' }}
                    onClick={() => !readOnly && toggleResource(res, actions)}>{def.label}</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {actions.map((a) => {
                      const k = `${res}:${a}`; const on = perms.has(k);
                      return <span key={a} className="chip" style={{ cursor: readOnly ? 'default' : 'pointer', opacity: on ? 1 : 0.45, background: on ? 'var(--brand-wash)' : undefined }}
                        onClick={() => !readOnly && togglePerm(k)}>{def.actions[a]}</span>;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </ObjectBox>
      </ObjectPage>
    </Page>
  );
}
