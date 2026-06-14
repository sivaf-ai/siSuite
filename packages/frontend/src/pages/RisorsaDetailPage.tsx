/** RisorsaDetailPage (mock 20) — dettaglio risorsa con la striscia .avail per
 *  EDITARE l'orario per-risorsa (resource.working_hours, override dell'azienda)
 *  e le INDISPONIBILITÀ (resource_availability). Entrambi alimentano il motore
 *  di pianificazione (scheduleResources). Completa la FASE 2. */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Plus, Trash2, CalendarClock, Clock, Briefcase } from 'lucide-react';
import type { ResourceAvailabilityDto, ResourceDto, TenantSettingsDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { useApi, mutate } from '../api/hooks';
import { ApiError } from '../api/client';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';

const DAYS: { key: string; label: string }[] = [
  { key: 'mon', label: 'Lun' }, { key: 'tue', label: 'Mar' }, { key: 'wed', label: 'Mer' },
  { key: 'thu', label: 'Gio' }, { key: 'fri', label: 'Ven' }, { key: 'sat', label: 'Sab' }, { key: 'sun', label: 'Dom' },
];
const KIND_LABEL: Record<string, string> = { person: 'Persona', vehicle: 'Mezzo', equipment: 'Attrezzatura' };
type WH = Record<string, [string, string][]>;
const toText = (iv: [string, string][] | undefined) => (iv ?? []).map(([a, b]) => `${a}-${b}`).join(', ');
const fmtHH = (iv: [string, string][] | undefined) => (iv && iv.length ? iv.map(([a, b]) => `${a}–${b}`).join(' · ') : '—');
function parseText(s: string): [string, string][] {
  return s.split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
    const [a, b] = x.split('-').map((t) => t.trim());
    return [a ?? '', b ?? ''] as [string, string];
  }).filter(([a, b]) => /^([01]\d|2[0-3]):[0-5]\d$/.test(a) && /^([01]\d|2[0-3]):[0-5]\d$/.test(b));
}
const dtLocal = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const fmtRange = (a: string, b: string) => `${new Date(a).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })} → ${new Date(b).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}`;

export function RisorsaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const canManage = !!user?.permissions.includes('resource:update' as never);
  const { data: res, loading, error, reload } = useApi<ResourceDto>(`/resources/${id}`);
  const { data: settings } = useApi<TenantSettingsDto>('/settings');
  const { data: avail, reload: reloadAvail } = useApi<ResourceAvailabilityDto[]>(`/resources/${id}/availability`);

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

  async function saveHours() {
    setBusy(true);
    try {
      const cleaned: WH = {};
      for (const d of DAYS) cleaned[d.key] = draft[d.key] ?? [];
      await mutate('PATCH', `/resources/${id}/working-hours`, { workingHours: useCustom ? cleaned : null });
      toast('Orario della risorsa salvato');
      setEditing(false);
      void reload();
    } catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? 'Errore') : (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  async function addAvailability() {
    if (!newAv.startsAt || !newAv.endsAt) { toast('Indica inizio e fine', 'error'); return; }
    setBusy(true);
    try {
      await mutate('POST', `/resources/${id}/availability`, {
        startsAt: new Date(newAv.startsAt).toISOString(), endsAt: new Date(newAv.endsAt).toISOString(),
        reason: newAv.reason || null, kind: 'unavailable',
      });
      toast('Indisponibilità aggiunta');
      setAddOpen(false); setNewAv({ startsAt: '', endsAt: '', reason: '' });
      void reloadAvail();
    } catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? 'Errore') : (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  async function delAvailability(availId: string) {
    try { await mutate('DELETE', `/resources/${id}/availability/${availId}`); toast('Indisponibilità rimossa'); void reloadAvail(); }
    catch (e) { toast((e as Error).message, 'error'); }
  }

  const shownWH = editing ? draft : effective;

  return (
    <Page title={res?.label ?? 'Risorsa'} back="/resources">
      {loading && <Loading />}
      {error && <ErrorBox message={error} />}
      {res && (
        <>
          <div className="detail-head">
            <span className="code">RISORSA</span>
            <h1>{res.label}</h1>
            <div className="sub">{KIND_LABEL[res.kind]}{res.userName ? ` · ${res.userName}` : ''}</div>
            <div className="kv">
              <div><div className="k">Tipo</div><div className="v">{KIND_LABEL[res.kind]}</div></div>
              <div><div className="k">Orario</div><div className="v">{res.workingHours ? 'Personalizzato' : 'Orario azienda'}</div></div>
              <div><div className="k">Indisponibilità</div><div className="v mono">{avail?.length ?? 0}</div></div>
              <div><div className="k">Stato</div><div className="v">{res.active ? 'Attiva' : 'Disattivata'}</div></div>
            </div>
          </div>

          <div className="tabs">
            <a className={tab === 'avail' ? 'on' : ''} onClick={() => setTab('avail')}>Disponibilità</a>
            <a className={tab === 'assign' ? 'on' : ''} onClick={() => setTab('assign')}>Assegnazioni</a>
            <a className={tab === 'hours' ? 'on' : ''} onClick={() => setTab('hours')}>Ore</a>
          </div>

          {tab === 'avail' && (
            <>
              <div className="panel" style={{ marginBottom: 16 }}>
                <div className="ph">
                  <h3>Orario settimanale</h3>
                  {canManage && (editing
                    ? <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setEditing(false); setUseCustom(!!res.workingHours); setDraft((res.workingHours ?? tenantWH)); }}>Annulla</button>
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
                  <div className="avail">
                    {DAYS.map((d) => {
                      const iv = shownWH[d.key];
                      const off = !iv || iv.length === 0;
                      return (
                        <div key={d.key} className={`avday${off && !(editing && useCustom) ? ' off' : ''}`}>
                          <div className="dn">{d.label}</div>
                          {editing && useCustom
                            ? <input className="txt" defaultValue={toText(iv)} placeholder="—"
                                onBlur={(e) => setDraft((s) => ({ ...s, [d.key]: parseText(e.target.value) }))} />
                            : <div className="hh">{fmtHH(iv)}</div>}
                        </div>
                      );
                    })}
                  </div>
                  <p className="faint" style={{ fontSize: 12.5, marginTop: 12, color: 'var(--ink-faint)' }}>
                    {res.workingHours
                      ? 'Orario personalizzato per questa risorsa (override dell\'azienda). '
                      : 'Usa l\'orario standard dell\'azienda. '}
                    Le fasce, meno le indisponibilità, definiscono quando il motore può collocare le attività. Formato: <span className="mono">08:00-13:00, 14:00-18:00</span> (vuoto = chiuso).
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
                      <input className="txt" type="datetime-local" style={{ height: 38, maxWidth: 200 }} value={newAv.startsAt} onChange={(e) => setNewAv((s) => ({ ...s, startsAt: e.target.value }))} />
                      <input className="txt" type="datetime-local" style={{ height: 38, maxWidth: 200 }} value={newAv.endsAt} onChange={(e) => setNewAv((s) => ({ ...s, endsAt: e.target.value }))} />
                      <input className="txt" placeholder="Motivo (es. ferie)" style={{ height: 38, flex: 1, minWidth: 140 }} value={newAv.reason} onChange={(e) => setNewAv((s) => ({ ...s, reason: e.target.value }))} />
                      <button className="btn btn-primary btn-sm" disabled={busy} onClick={addAvailability}>Aggiungi</button>
                    </div>
                  )}
                  {(avail ?? []).length === 0 && !addOpen && <p className="faint" style={{ fontSize: 13, color: 'var(--ink-faint)', padding: '6px 0' }}>Nessuna indisponibilità registrata.</p>}
                  {(avail ?? []).map((a) => (
                    <div className="row-li" key={a.id}>
                      <div style={{ flex: 1 }}>
                        <b>{a.reason || 'Indisponibile'}</b>
                        <div className="cellsub mono">{fmtRange(a.startsAt, a.endsAt)}</div>
                      </div>
                      <span className="pill pill--neutral"><span className="dot" />{a.kind === 'unavailable' ? 'Non disponibile' : 'Disponibile'}</span>
                      {canManage && <button className="act-icon danger" aria-label="Rimuovi" onClick={() => delAvailability(a.id)}><Trash2 size={16} /></button>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === 'assign' && <AssignmentsTab resourceId={res.id} />}

          {tab === 'hours' && (
            <div className="panel"><div className="pb" style={{ paddingTop: 16 }}>
              <p className="faint" style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>
                <Briefcase size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                Riepilogo ore rendicontate dalla risorsa — in arrivo (le ore si registrano dal dettaglio attività).
              </p>
            </div></div>
          )}
        </>
      )}
    </Page>
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
