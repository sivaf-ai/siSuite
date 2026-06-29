/**
 * TimeEntryDetailPage — scheda Registrazione ore su ObjectPage/ObjectBox v2.
 * - new: form di inserimento (POST /time-entries; le tariffe sono fotografate lato API).
 * - esistente: VISTA in sola lettura (non esiste endpoint di update singolo) +
 *   azione Elimina (DELETE /time-entries/:id; le righe bloccate sono protette dall'API).
 * Header sticky a filo via ObjectPage. Niente popup nativi: ConfirmDialog in-app.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useHistory } from 'react-router';
import { Clock, Lock as LockIcon, Trash2 } from 'lucide-react';
import type { TimeEntryDto, EngagementDto, ResourceDto, ActivityDto, LookupDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { ObjectPage, ObjectBox } from '../ui/ObjectPage';
import { PickerField } from '../ui/PickerField';
import { EngagementPickerDialog } from '../ui/EngagementPickerDialog';
import { ResourcePickerDialog } from '../ui/ResourcePickerDialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { useApi, mutate } from '../api/hooks';
import { apiFetch, ApiError } from '../api/client';
import { useLookups } from '../context/Lookups';
import { useAuth } from '../auth/AuthContext';
import { hhmm } from '../lib/time';

function dateIt(s: string): string {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('it-IT');
}
/** "h:mm" o minuti → minuti interi (per il campo durata in creazione). */
function parseDuration(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  if (s.includes(':')) {
    const [h, m] = s.split(':');
    const hh = Number(h), mm = Number(m);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    return hh * 60 + mm;
  }
  const n = Number(s);
  return Number.isNaN(n) ? null : Math.round(n);
}

export function TimeEntryDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const { user } = useAuth();
  const lk = useLookups();
  const toast = useToast();
  const history = useHistory();
  const can = (p: string) => !!user?.permissions.includes(p as never);

  const detail = useApi<TimeEntryDto>(isNew ? null : `/time-entries/${id}`);
  const engs = useApi<{ items: EngagementDto[] }>('/engagements');
  const ress = useApi<{ items: ResourceDto[] }>('/resources');
  const acts = useApi<{ items: ActivityDto[] }>('/activities');

  const engById = useMemo(() => new Map((engs.data?.items ?? []).map((e) => [e.id, e])), [engs.data]);
  const resById = useMemo(() => new Map((ress.data?.items ?? []).map((r) => [r.id, r])), [ress.data]);
  const actById = useMemo(() => new Map((acts.data?.items ?? []).map((a) => [a.id, a])), [acts.data]);
  const typologies = lk.byCategory('time_typology');

  const [form, setForm] = useState<{ engagementId: string; activityId: string; resourceId: string; typologyId: string; occurredOn: string; duration: string; notes: string }>(
    { engagementId: '', activityId: '', resourceId: '', typologyId: '', occurredOn: new Date().toISOString().slice(0, 10), duration: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [pickEng, setPickEng] = useState(false);
  const [pickRes, setPickRes] = useState(false);
  const newEngName = (() => { const e = engs.data?.items.find((x) => x.id === form.engagementId); return e ? `${e.code ? e.code + ' — ' : ''}${e.title}` : (form.engagementId ? '…' : ''); })();
  const newResName = ress.data?.items.find((r) => r.id === form.resourceId)?.label ?? (form.resourceId ? '…' : '');

  const d = detail.data;
  useEffect(() => {
    if (typologies.length && !form.typologyId) setForm((f) => ({ ...f, typologyId: typologies[0]!.id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lk.all]);

  async function save() {
    const minutes = parseDuration(form.duration);
    if (!minutes || minutes <= 0) { toast('Indica una durata valida (es. 1:30)', 'error'); return; }
    if (!form.typologyId) { toast('Seleziona la tipologia', 'error'); return; }
    const typ = typologies.find((x: LookupDto) => x.id === form.typologyId);
    setBusy(true);
    const body = {
      engagementId: form.engagementId || undefined,
      activityId: form.activityId || undefined,
      resourceId: form.resourceId || undefined,
      typologyId: form.typologyId,
      typology: typ?.canonical ?? typ?.code ?? 'work',
      minutes,
      occurredOn: form.occurredOn,
      notes: form.notes.trim() || undefined,
    };
    try {
      const c = await apiFetch<TimeEntryDto>('/time-entries', { method: 'POST', body: JSON.stringify(body) });
      toast('Registrazione ore creata'); history.replace(`/time-entries/${c.id}`);
    } catch (e) {
      toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message, 'error');
    } finally { setBusy(false); }
  }

  async function doDelete() {
    setBusy(true);
    try { await mutate('DELETE', `/time-entries/${id}`); toast('Registrazione ore eliminata'); history.replace('/time-entries'); }
    catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? 'Impossibile eliminare (riga bloccata?)') : (e as Error).message, 'error'); setDelOpen(false); }
    finally { setBusy(false); }
  }

  if (!isNew && detail.loading) return <Page title={t('terms.time_entry')}><Loading /></Page>;
  if (!isNew && detail.error) return <Page title={t('terms.time_entry')}><ErrorBox message={detail.error} /></Page>;

  const title = isNew ? `${t('terms.time_entry')} — nuova` : (d ? `${dateIt(d.occurredOn)} · ${hhmm(d.minutes)}` : t('terms.time_entry'));
  const statusLk = d ? lk.byId(d.approvalStatusId) : undefined;

  // valori per la vista in sola lettura
  const engName = d?.engagementId ? (engById.get(d.engagementId)?.code ?? '—') : '—';
  const actName = d?.activityId ? (actById.get(d.activityId)?.title ?? '—') : '—';
  const resName = d?.resourceId ? (resById.get(d.resourceId)?.label ?? '—') : '—';

  return (
    <Page title={title} bleed>
      <ObjectPage
        backLabel={t('terms.time_entry_plural')} onBack={() => history.push('/time-entries')}
        title={title} code={!isNew && d ? d.id.slice(0, 8).toUpperCase() : undefined}
        status={!isNew && statusLk ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <StatusPill label={lk.labelOf(d!.approvalStatusId)} token={statusLk.colorToken} />
            {d!.isLocked && <LockIcon size={14} style={{ color: 'var(--ink-faint)' }} aria-label={`bloccata (${d!.lockReason ?? ''})`} />}
          </span>
        ) : undefined}
        onSave={isNew && can('time_entry:create') ? save : undefined}
        onCancel={() => history.push('/time-entries')} saving={busy}
      >
        <ObjectBox icon={Clock} title="Registrazione ore">
          {isNew ? (
            <div className="bgrid">
              <div className="bf"><span className="bl">{t('terms.engagement')}</span>
                <PickerField value={newEngName || null} placeholder="Scegli la commessa…"
                  onOpen={() => setPickEng(true)} onClear={() => setForm((f) => ({ ...f, engagementId: '', activityId: '' }))} /></div>
              <div className="bf"><span className="bl">{t('terms.activity')}</span>
                <select className="bi" value={form.activityId} onChange={(e) => setForm((f) => ({ ...f, activityId: e.target.value }))}>
                  <option value="">—</option>
                  {(acts.data?.items ?? []).filter((a) => !form.engagementId || a.engagementId === form.engagementId).map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select></div>
              <div className="bf"><span className="bl">{t('terms.resource')}</span>
                <PickerField value={newResName || null} placeholder="Scegli la risorsa…"
                  onOpen={() => setPickRes(true)} onClear={() => setForm((f) => ({ ...f, resourceId: '' }))} /></div>
              <div className="bf"><span className="bl">Tipologia</span>
                <select className="bi" value={form.typologyId} onChange={(e) => setForm((f) => ({ ...f, typologyId: e.target.value }))}>
                  {typologies.map((tp: LookupDto) => <option key={tp.id} value={tp.id}>{lk.labelOf(tp.id)}</option>)}
                </select></div>
              <div className="bf"><span className="bl">Data <span className="req">*</span></span>
                <input className="bi" type="date" value={form.occurredOn} onChange={(e) => setForm((f) => ({ ...f, occurredOn: e.target.value }))} /></div>
              <div className="bf"><span className="bl">Durata (h:mm) <span className="req">*</span></span>
                <input className="bi" placeholder="es. 1:30" value={form.duration} onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))} /></div>
              <div className="bf c2"><span className="bl">Note</span>
                <input className="bi" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
            </div>
          ) : d ? (
            <div className="bgrid">
              <ReadField label={t('terms.engagement')} value={engName} />
              <ReadField label={t('terms.activity')} value={actName} />
              <ReadField label={t('terms.resource')} value={resName} />
              <ReadField label="Tipologia" value={lk.labelOf(d.typologyId) || d.typology} />
              <ReadField label="Data" value={dateIt(d.occurredOn)} mono />
              <ReadField label="Durata (h:mm)" value={hhmm(d.minutes)} mono num />
              <ReadField label="Tariffa (€/h)" value={d.billRate != null ? `€ ${d.billRate.toFixed(2)}` : '—'} mono num />
              <ReadField label="Fatturabile" value={d.billable ? 'Sì' : 'No'} />
              {d.lockReason && <ReadField label="Motivo blocco" value={d.lockReason} />}
              <div className="bf c2"><span className="bl">Note</span><div className="bi" style={{ height: 'auto', minHeight: 38, alignItems: 'flex-start', padding: '9px 10px' }}>{d.notes || '—'}</div></div>
            </div>
          ) : null}
        </ObjectBox>

        {!isNew && d && can('time_entry:delete') && !d.isLocked && (
          <div style={{ padding: '6px 2px 4px' }}>
            <button className="btn btn-ghost" onClick={() => setDelOpen(true)} style={{ color: 'var(--danger)' }}><Trash2 size={15} /> Elimina registrazione</button>
          </div>
        )}
      </ObjectPage>

      <ConfirmDialog open={delOpen} danger title="Eliminare la registrazione ore?"
        message={d
          ? `Stai per eliminare la registrazione del ${dateIt(d.occurredOn)} · ${hhmm(d.minutes)}${engName !== '—' ? ` — ${engName}` : ''}${actName !== '—' ? ` · ${actName}` : ''}. La riga verrà eliminata definitivamente (le righe bloccate sono protette dal sistema).`
          : 'La riga verrà eliminata definitivamente. Le righe bloccate sono protette dal sistema.'}
        confirmLabel="Elimina" busy={busy} onConfirm={doDelete} onCancel={() => setDelOpen(false)} />
      <EngagementPickerDialog open={pickEng} onClose={() => setPickEng(false)}
        onPick={(es) => { const e = es[0]; if (e) setForm((f) => ({ ...f, engagementId: e.id, activityId: '' })); }} />
      <ResourcePickerDialog open={pickRes} onClose={() => setPickRes(false)}
        onPick={(rs) => { const r = rs[0]; if (r) setForm((f) => ({ ...f, resourceId: r.id })); }} />
    </Page>
  );
}

function ReadField({ label, value, mono, num }: { label: string; value: string; mono?: boolean; num?: boolean }) {
  return (
    <div className="bf"><span className="bl">{label}</span>
      <div className={`bi${mono ? ' mono' : ''}`} style={{ alignItems: 'center', justifyContent: num ? 'flex-end' : 'flex-start' }}>{value}</div>
    </div>
  );
}
