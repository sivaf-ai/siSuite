/** RisorsaDetailPage (mock 20) su ObjectPage v2 (<Page bleed>): Anagrafica editabile
 *  (tipo/nome/costo orario/attiva) + tab Disponibilità (orario per-risorsa
 *  resource.working_hours + indisponibilità resource_availability), Assegnazioni, Ore.
 *  Crea+vedi+modifica nella stessa pagina; header sticky con Salva/Annulla. */
import { useEffect, useState } from 'react';
import { useParams, useHistory } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Plus, CalendarClock, Clock, Briefcase, UserRound, CalendarOff, Trash, UserCog } from 'lucide-react';
import type { ResourceAvailabilityDto, ResourceDto, TenantSettingsDto, FieldDefinitionDto, UserAdminDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { ObjectPage, ObjectBox, RelatedTabs, type RelTab } from '../ui/ObjectPage';
import { AttrBoxes } from '../ui/AttrFields';
import { useApi, mutate } from '../api/hooks';
import { apiFetch, ApiError } from '../api/client';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';
import { WorkingHoursEditor, whHasErrors, type WH } from '../ui/WorkingHoursEditor';

const DAYS: { key: string; label: string }[] = [
  { key: 'mon', label: 'Lun' }, { key: 'tue', label: 'Mar' }, { key: 'wed', label: 'Mer' },
  { key: 'thu', label: 'Gio' }, { key: 'fri', label: 'Ven' }, { key: 'sat', label: 'Sab' }, { key: 'sun', label: 'Dom' },
];
const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const KIND_LABEL: Record<string, string> = { person: 'Persona', vehicle: 'Mezzo', equipment: 'Attrezzatura' };
const fmtHH = (iv: [string, string][] | undefined) => (iv && iv.length ? iv.map(([a, b]) => `${a}–${b}`).join(' · ') : '—');
const fmtRange = (a: string, b: string) => `${new Date(a).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })} → ${new Date(b).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}`;

export function RisorsaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const { user } = useAuth();
  const toast = useToast();
  const history = useHistory();
  const { t } = useTranslation();
  const canManage = !!user?.permissions.includes('resource:update' as never);
  const canCreate = !!user?.permissions.includes('resource:create' as never);

  const { data: res, loading, error, reload } = useApi<ResourceDto>(isNew ? null : `/resources/${id}`);
  const { data: settings } = useApi<TenantSettingsDto>('/settings');
  const { data: avail, reload: reloadAvail } = useApi<ResourceAvailabilityDto[]>(isNew ? null : `/resources/${id}/availability`);

  // Anagrafica editabile + attributi (field_definition: sigla/colore/icona/email/…)
  const fieldDefs = useApi<{ items: FieldDefinitionDto[] }>('/field-definitions?entity=resource');
  const [form, setForm] = useState({ kind: 'person', label: '', hourlyCost: '', active: true });
  const [attrs, setAttrs] = useState<Record<string, unknown>>({});
  const setAttr = (k: string, v: unknown) => setAttrs((a) => ({ ...a, [k]: v }));
  const [savingHead, setSavingHead] = useState(false);
  useEffect(() => {
    if (res) { setForm({ kind: res.kind, label: res.label, hourlyCost: String((res.attributes as Record<string, unknown>)?.hourly_cost ?? ''), active: res.active }); setAttrs(res.attributes ?? {}); }
  }, [res]);

  const [tab, setTab] = useState<'avail' | 'assign' | 'hours'>('avail');
  const [editing, setEditing] = useState(false);
  const [useCustom, setUseCustom] = useState(false);
  const [draft, setDraft] = useState<WH>({});
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newAv, setNewAv] = useState({ startsAt: '', endsAt: '', reason: '' });

  const tenantWH = (settings?.workingHours ?? {}) as WH;
  const effective: WH = (res?.workingHours ?? tenantWH) as WH;

  useEffect(() => {
    if (res) { setUseCustom(!!res.workingHours); setDraft((res.workingHours ?? settings?.workingHours ?? {}) as WH); }
  }, [res, settings]);

  async function saveHead() {
    if (!form.label.trim()) { toast('Il nome è obbligatorio', 'error'); return; }
    setSavingHead(true);
    const body = {
      ...(isNew ? { kind: form.kind } : {}),
      label: form.label.trim(), active: form.active,
      attributes: { ...attrs, hourly_cost: form.hourlyCost === '' ? null : Number(form.hourlyCost) },
    };
    try {
      if (isNew) { const c = await apiFetch<ResourceDto>('/resources', { method: 'POST', body: JSON.stringify({ kind: form.kind, ...body }) }); toast('Risorsa creata'); history.replace(`/resources/${c.id}`); }
      else { await mutate('PATCH', `/resources/${id}`, body); toast('Modifiche salvate'); void reload(); }
    } catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message, 'error'); }
    finally { setSavingHead(false); }
  }

  async function saveHours() {
    if (useCustom && whHasErrors(draft)) { toast('Correggi gli intervalli (fine dopo inizio, niente sovrapposizioni)', 'error'); return; }
    setBusy(true);
    try {
      const cleaned: WH = {};
      for (const k of WEEK) cleaned[k] = draft[k] ?? [];
      await mutate('PATCH', `/resources/${id}/working-hours`, { workingHours: useCustom ? cleaned : null });
      toast('Orario della risorsa salvato'); setEditing(false); void reload();
    } catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? 'Errore') : (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  async function addAvailability() {
    if (!newAv.startsAt || !newAv.endsAt) { toast('Indica inizio e fine', 'error'); return; }
    if (new Date(newAv.endsAt) <= new Date(newAv.startsAt)) { toast('La fine deve essere dopo l\'inizio', 'error'); return; }
    setBusy(true);
    try {
      await mutate('POST', `/resources/${id}/availability`, {
        startsAt: new Date(newAv.startsAt).toISOString(), endsAt: new Date(newAv.endsAt).toISOString(),
        reason: newAv.reason || null, kind: 'unavailable',
      });
      toast('Indisponibilità aggiunta'); setAddOpen(false); setNewAv({ startsAt: '', endsAt: '', reason: '' }); void reloadAvail();
    } catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? 'Errore') : (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  async function delAvailability(availId: string) {
    try { await mutate('DELETE', `/resources/${id}/availability/${availId}`); toast('Indisponibilità rimossa'); void reloadAvail(); }
    catch (e) { toast((e as Error).message, 'error'); }
  }

  if (!isNew && loading) return <Page title={t('terms.resource')}><Loading /></Page>;
  if (!isNew && error) return <Page title={t('terms.resource')}><ErrorBox message={error} /></Page>;

  const availContent = (
    <>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="ph">
          <h3>Orario settimanale</h3>
          {canManage && (editing
            ? <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setEditing(false); setUseCustom(!!res?.workingHours); setDraft((res?.workingHours ?? tenantWH)); }}>Annulla</button>
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={saveHours}>Salva orario</button>
              </div>
            : <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}><Clock size={16} />Modifica orario</button>)}
        </div>
        <div className="pb" style={{ paddingTop: 16 }}>
          {editing && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, marginBottom: 14, cursor: 'pointer' }}>
              <div className={`switch${useCustom ? ' on' : ''}`} role="switch" aria-checked={useCustom} onClick={() => setUseCustom((x) => !x)}>
                <span className="track"><span className="knob" /></span>
              </div>
              Orario personalizzato (override dell'azienda)
            </label>
          )}
          {editing && useCustom
            ? <WorkingHoursEditor value={draft} onChange={setDraft} />
            : (
              <div className="avail">
                {DAYS.map((d) => {
                  const iv = (editing ? tenantWH : effective)[d.key];
                  const off = !iv || iv.length === 0;
                  return (
                    <div key={d.key} className={`avday${off ? ' off' : ''}`}>
                      <div className="dn">{d.label}</div>
                      <div className="hh">{fmtHH(iv)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          <p className="faint" style={{ fontSize: 12.5, marginTop: 12, color: 'var(--ink-faint)' }}>
            {editing && !useCustom
              ? 'Usa l\'orario standard dell\'azienda (sopra). Attiva "Orario personalizzato" per sovrascriverlo.'
              : res?.workingHours ? 'Orario personalizzato per questa risorsa (override dell\'azienda).' : 'Usa l\'orario standard dell\'azienda.'}
            {' '}Le fasce, meno le indisponibilità, definiscono quando il motore può collocare le attività.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="ph">
          <h3>Indisponibilità</h3>
          {canManage && <button className="btn btn-ghost btn-sm" onClick={() => setAddOpen((x) => !x)}><Plus size={16} />Indisponibilità</button>}
        </div>
        <div className="pb">
          {addOpen && (
            <div className="row-li" style={{ gap: 10, flexWrap: 'wrap' }}>
              <input className="txt" type="datetime-local" step={900} style={{ height: 38, maxWidth: 200 }} value={newAv.startsAt} onChange={(e) => setNewAv((s) => ({ ...s, startsAt: e.target.value }))} />
              <input className="txt" type="datetime-local" step={900} style={{ height: 38, maxWidth: 200 }} value={newAv.endsAt} onChange={(e) => setNewAv((s) => ({ ...s, endsAt: e.target.value }))} />
              <input className="txt" placeholder="Motivo (es. ferie)" style={{ height: 38, flex: 1, minWidth: 140 }} value={newAv.reason} onChange={(e) => setNewAv((s) => ({ ...s, reason: e.target.value }))} />
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={addAvailability}>Aggiungi</button>
            </div>
          )}
          {(avail ?? []).length === 0 && !addOpen && <p className="faint" style={{ fontSize: 13, color: 'var(--ink-faint)', padding: '6px 0' }}>Nessuna indisponibilità registrata.</p>}
          {(avail ?? []).map((a) => (
            <div className="row-li" key={a.id}>
              <div style={{ flex: 1 }}><b>{a.reason || 'Indisponibile'}</b><div className="cellsub mono">{fmtRange(a.startsAt, a.endsAt)}</div></div>
              <span className="pill pill--neutral"><span className="dot" />{a.kind === 'unavailable' ? 'Non disponibile' : 'Disponibile'}</span>
              {canManage && <button className="act-icon danger" aria-label="Rimuovi" onClick={() => delAvailability(a.id)}><Trash size={16} /></button>}
            </div>
          ))}
        </div>
      </div>
    </>
  );

  const tabs: RelTab[] = [
    { key: 'avail', label: 'Disponibilità', icon: CalendarOff, content: availContent },
    { key: 'assign', label: 'Assegnazioni', icon: CalendarClock, content: res ? <AssignmentsTab resourceId={res.id} /> : null },
    { key: 'hours', label: 'Ore', icon: Briefcase, content: (
      <div className="panel"><div className="pb" style={{ paddingTop: 16 }}>
        <p className="faint" style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>
          <Briefcase size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Riepilogo ore rendicontate dalla risorsa — in arrivo (le ore si registrano dal dettaglio attività).
        </p>
      </div></div>
    ) },
  ];

  const title = isNew ? `Nuova ${t('terms.resource')}` : (form.label || t('terms.resource'));

  return (
    <Page title={title} bleed>
      <ObjectPage
        backLabel={t('terms.resource_plural')} onBack={() => history.push('/resources')}
        title={title} code={!isNew ? KIND_LABEL[form.kind]?.toUpperCase() : undefined}
        status={!isNew ? <StatusPill label={form.active ? 'Attiva' : 'Disattivata'} token={form.active ? 'success' : 'neutral'} /> : undefined}
        onSave={(isNew ? canCreate : canManage) ? saveHead : undefined}
        onCancel={() => history.push('/resources')} saving={savingHead}
      >
        <ObjectBox icon={UserRound} title="Anagrafica risorsa">
          <div className="bgrid">
            <div className="bf"><span className="bl">Tipo</span>
              {isNew
                ? <select className="bi" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
                    <option value="person">Persona</option><option value="vehicle">Mezzo</option><option value="equipment">Attrezzatura</option>
                  </select>
                : <div className="bi">{KIND_LABEL[form.kind]}</div>}</div>
            <div className="bf c2"><span className="bl">Nome / Etichetta <span className="req">*</span></span>
              <input className="bi" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} /></div>
            <div className="bf"><span className="bl">Costo orario (€/h)</span>
              <input className="bi mono" style={{ textAlign: 'right' }} type="number" value={form.hourlyCost} onChange={(e) => setForm((f) => ({ ...f, hourlyCost: e.target.value }))} /></div>
            <div className="bf"><span className="bl">Attiva</span>
              <label className="bi" style={{ justifyContent: 'space-between', cursor: 'pointer' }}>{form.active ? 'Sì' : 'No'}
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} /></label></div>
          </div>
        </ObjectBox>

        <AttrBoxes defs={fieldDefs.data?.items ?? []} attrs={attrs} setAttr={setAttr} exclude={['hourly_cost', 'bill_rate']} />

        {!isNew && res && (
          <LinkedUserBox userId={res.userId} userName={res.userName ?? null} onGo={(uid) => history.push(uid ? `/admin/users/${uid}` : '/admin/users/new')} />
        )}

        {isNew ? <div className="dsx-empty" style={{ marginTop: 4 }}>Salva la risorsa per gestire orario, indisponibilità e assegnazioni.</div>
          : <RelatedTabs tabs={tabs} active={tab} onChange={(k) => setTab(k as typeof tab)} />}
      </ObjectPage>
    </Page>
  );
}

/* Utente collegato a questa risorsa (SPEC D.4/H.4): se userId valorizzato mostra utente + ruoli
 * (sola lettura, fetch /users/:userId); altrimenti azione per creare/collegare un utente. */
function LinkedUserBox({ userId, userName, onGo }: { userId: string | null; userName: string | null; onGo: (uid: string | null) => void }) {
  const linked = useApi<UserAdminDto>(userId ? `/users/${userId}` : null);
  const u = linked.data;
  return (
    <ObjectBox icon={UserCog} title="Utente collegato">
      {userId ? (
        <div className="bgrid">
          <div className="bf c2"><span className="bl">Account</span>
            <div className="bi" style={{ justifyContent: 'space-between' }}>
              <span>{u?.fullName ?? userName ?? '—'}{u?.email ? <span className="faint" style={{ marginLeft: 6, fontSize: 12 }}>{u.email}</span> : null}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => onGo(userId)}>Apri scheda utente</button>
            </div></div>
          <div className="bf c2"><span className="bl">Ruoli</span>
            <div className="bi" style={{ flexWrap: 'wrap', gap: 6, height: 'auto', minHeight: 38, padding: 6 }}>
              {linked.loading && <span className="faint">Carico…</span>}
              {!linked.loading && (u?.roles ?? []).map((r) => <span key={r.id} className="chip">{r.name}</span>)}
              {!linked.loading && (u?.roles?.length ?? 0) === 0 && <span className="faint">Nessun ruolo.</span>}
            </div></div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="faint" style={{ fontSize: 13, color: 'var(--ink-soft)', flex: 1, minWidth: 200 }}>
            Nessun account collegato a questa risorsa. Crea o collega un utente per dargli accesso all'applicazione.
          </span>
          <button className="btn btn-primary" onClick={() => onGo(null)}><Plus size={16} /> Crea / collega utente</button>
        </div>
      )}
    </ObjectBox>
  );
}

/* Assegnazioni della risorsa per la settimana corrente, dal piano per-risorsa (riuso /schedule/week). */
interface WeekBlock { activityId: string; title: string; kind: string; start: string; end: string; atRisk: boolean }
interface WeekResp { resources: { resourceId: string; blocks: WeekBlock[] }[] }
function AssignmentsTab({ resourceId }: { resourceId: string }) {
  const monday = (() => { const d = new Date(); const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); })();
  const { data, loading } = useApi<WeekResp>(`/schedule/week?from=${monday}`);
  const blocks = data?.resources.find((r) => r.resourceId === resourceId)?.blocks ?? [];
  const hm = (iso: string) => { const d = new Date(iso); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
  return (
    <div className="panel">
      <div className="ph"><h3><CalendarClock size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />Prossime assegnazioni</h3></div>
      <div className="pb">
        {loading && <Loading />}
        {!loading && blocks.length === 0 && <p className="faint" style={{ fontSize: 13, color: 'var(--ink-faint)', padding: '6px 0' }}>Nessuna assegnazione pianificata questa settimana.</p>}
        {blocks.map((b) => (
          <div className="row-li" key={b.activityId}>
            <div style={{ flex: 1 }}>
              <b>{b.title}</b>
              <div className="cellsub mono">{new Date(b.start).toLocaleDateString('it-IT', { weekday: 'short', timeZone: 'UTC' })} {hm(b.start)}–{hm(b.end)}</div>
            </div>
            <span className={`pill ${b.atRisk ? 'pill--danger' : b.kind === 'fixed' ? 'pill--brand' : 'pill--info'}`}>
              <span className="dot" />{b.atRisk ? 'A rischio' : b.kind === 'fixed' ? 'Fissa' : 'In flusso'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
