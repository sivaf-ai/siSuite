/**
 * AttivitaDetailPage — Scheda attività su ObjectPage (standard schede siSuite).
 * Header sticky a filo con Salva/Annulla; box "Attività" con label-nel-bordo;
 * box Checklist editabile; tab correlate (Risorse assegnate, Dipendenze, Ore,
 * Materiali). Le API restano identiche al precedente (GET/POST/PATCH /activities,
 * /activities/:id/resources, /dependencies, /time-entries, /consumptions).
 *  - Risorsa  → ResourcePickerDialog + PickerField
 *  - Materiale → MaterialPickerDialog + PickerField
 *  - Commessa (solo in creazione) → EngagementPickerDialog + PickerField
 *  - minuti/quantità → NumInput; stato/priorità = lookup → <select>.
 * Crea+vedi+modifica nella stessa pagina; /activities/new legge location.state.prefill
 * (Duplica). Niente IonList/IonModal/window.confirm: ConfirmDialog per le eliminazioni.
 */
import { useEffect, useState } from 'react';
import { useParams, useHistory, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  ClipboardList, ListChecks, Users, GitBranch, Clock, Boxes, Plus, Trash2,
} from 'lucide-react';
import type {
  ActivityDto, ActivityResourceDto, TimeEntryDto, ConsumptionDto,
  MaterialDto, ResourceDto, DependencyEdgeDto, PhaseDto, EngagementDto,
} from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { ObjectPage, ObjectBox, RelatedTabs, type RelTab } from '../ui/ObjectPage';
import { PickerField } from '../ui/PickerField';
import { ResourcePickerDialog } from '../ui/ResourcePickerDialog';
import { MaterialPickerDialog } from '../ui/MaterialPickerDialog';
import { EngagementPickerDialog } from '../ui/EngagementPickerDialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { NumInput } from '../ui/NumInput';
import { useApi, mutate } from '../api/hooks';
import { apiFetch, ApiError } from '../api/client';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';
import { useLookups } from '../context/Lookups';
import { hhmm } from '../lib/time';

type ActivityDetail = ActivityDto & { resources: ActivityResourceDto[] };
type CkItem = { text: string; done: boolean };

/** datetime-local <-> ISO */
const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
const errMsg = (e: unknown) => (e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message);

export function AttivitaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const { user } = useAuth();
  const lk = useLookups();
  const toast = useToast();
  const history = useHistory();
  const location = useLocation();
  const { t } = useTranslation();

  const canCreate = !!user?.permissions.includes('activity:create');
  const canUpdate = !!user?.permissions.includes('activity:update');
  const canSave = isNew ? canCreate : canUpdate;

  const detail = useApi<ActivityDetail>(isNew ? null : `/activities/${id}`);
  const d = detail.data;

  // Duplica: /activities/new con location.state.prefill (engagementId, title, ...)
  const prefill = isNew ? (location.state as { prefill?: Record<string, unknown> } | null)?.prefill : undefined;

  const statuses = lk.byCategory('activity_status');
  const priorities = lk.byCategory('priority');

  const [form, setForm] = useState({
    engagementId: '', engagementTitle: '', title: '', kind: '',
    statusId: '', priorityId: '', phaseId: '',
    estimatedMinutes: null as number | null,
    scheduledStart: '', earliestStart: '', dueBy: '',
  });
  const [checklist, setChecklist] = useState<CkItem[]>([]);
  const [tab, setTab] = useState<'risorse' | 'dipendenze' | 'ore' | 'materiali'>('risorse');
  const [busy, setBusy] = useState(false);
  const [engPick, setEngPick] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (d) {
      setForm({
        engagementId: d.engagementId, engagementTitle: d.engagementTitle ?? '',
        title: d.title, kind: d.kind ?? '',
        statusId: d.statusId ?? '', priorityId: d.priorityId ?? '', phaseId: d.phaseId ?? '',
        estimatedMinutes: d.estimatedMinutes ?? null,
        scheduledStart: toLocalInput(d.scheduledStart),
        earliestStart: toLocalInput(d.earliestStart),
        dueBy: toLocalInput(d.dueBy),
      });
      setChecklist(d.checklist ?? []);
      return;
    }
    if (isNew && prefill) {
      setForm((f) => ({
        ...f,
        engagementId: (prefill.engagementId as string) ?? '',
        engagementTitle: (prefill.engagementTitle as string) ?? '',
        title: (prefill.title as string) ?? '',
        kind: (prefill.kind as string) ?? '',
        phaseId: (prefill.phaseId as string) ?? '',
        estimatedMinutes: (prefill.estimatedMinutes as number) ?? null,
      }));
      setChecklist((prefill.checklist as CkItem[]) ?? []);
    }
  }, [d, isNew, prefill]);

  const engagementId = form.engagementId;
  const phases = useApi<PhaseDto[]>(engagementId ? `/engagements/${engagementId}/phases` : null);

  async function save() {
    if (!form.title.trim()) { toast('Il titolo è obbligatorio', 'error'); return; }
    if (isNew && !engagementId) { toast('Scegli la commessa', 'error'); return; }
    setBusy(true);
    try {
      if (isNew) {
        const body = {
          engagementId,
          title: form.title.trim(),
          kind: form.kind || undefined,
          phaseId: form.phaseId || undefined,
          statusId: form.statusId || undefined,
          priorityId: form.priorityId || undefined,
          estimatedMinutes: form.estimatedMinutes ?? undefined,
          scheduledStart: fromLocalInput(form.scheduledStart) ?? undefined,
          earliestStart: fromLocalInput(form.earliestStart) ?? undefined,
          dueBy: fromLocalInput(form.dueBy) ?? undefined,
          checklist: checklist.filter((c) => c.text.trim()),
        };
        const c = await apiFetch<ActivityDto>('/activities', { method: 'POST', body: JSON.stringify(body) });
        toast('Attività creata');
        history.replace(`/activities/${c.id}`);
      } else {
        await mutate('PATCH', `/activities/${id}`, {
          title: form.title.trim(),
          kind: form.kind || null,
          phaseId: form.phaseId || null,
          statusId: form.statusId || null,
          priorityId: form.priorityId || null,
          estimatedMinutes: form.estimatedMinutes ?? null,
          scheduledStart: fromLocalInput(form.scheduledStart),
          earliestStart: fromLocalInput(form.earliestStart),
          dueBy: fromLocalInput(form.dueBy),
          checklist: checklist.filter((c) => c.text.trim()),
        });
        toast('Modifiche salvate');
        void detail.reload();
      }
    } catch (e) { toast(errMsg(e), 'error'); }
    finally { setBusy(false); }
  }

  if (!isNew && detail.loading) return <Page title={t('terms.activity')}><Loading /></Page>;
  if (!isNew && detail.error) return <Page title={t('terms.activity')}><ErrorBox message={detail.error} /></Page>;

  const goBack = () => history.push('/activities');
  const title = isNew ? `Nuova ${t('terms.activity')}` : (form.title || t('terms.activity'));
  const statusLabel = lk.labelOf(form.statusId) || (d?.statusCanonical ?? '');

  const tabs: RelTab[] = !isNew && d ? [
    { key: 'risorse', label: 'Risorse', icon: Users, count: d.resources.length,
      content: <RisorseAssegnate activityId={id} resources={d.resources} onChange={() => detail.reload()} /> },
    { key: 'dipendenze', label: 'Bloccata da', icon: GitBranch,
      content: <Dipendenze activityId={id} engagementId={engagementId} /> },
    { key: 'ore', label: 'Ore', icon: Clock,
      content: <RendicontazioneOre activityId={id} engagementId={engagementId} /> },
    { key: 'materiali', label: 'Materiali', icon: Boxes,
      content: <RendicontazioneMateriali activityId={id} /> },
  ] : [];

  const objectPage = (
    <ObjectPage
      backLabel={t('terms.activity_plural')} onBack={goBack}
      title={title}
      code={!isNew ? (d?.isFixed ? 'FISSA' : 'DINAMICA') : undefined}
      status={!isNew && statusLabel ? <StatusPill label={statusLabel} token={lk.byId(form.statusId)?.colorToken} /> : undefined}
      onSave={canSave ? save : undefined} onCancel={goBack} saving={busy}
    >
      <ObjectBox icon={ClipboardList} title="Attività">
        <div className="bgrid">
          <div className="bf c2"><span className="bl">Titolo <span className="req">*</span></span>
            <input className="bi" value={form.title} disabled={!canSave} onChange={(e) => set('title', e.target.value)} /></div>

          <div className="bf"><span className="bl">Commessa</span>
            {isNew
              ? <PickerField value={form.engagementTitle || null} placeholder="Scegli commessa…" disabled={!canSave}
                  onOpen={() => setEngPick(true)} />
              : <div className="bi">{d?.engagementCode ? `${d.engagementCode} · ${d.engagementTitle ?? ''}` : (d?.engagementTitle ?? '—')}</div>}
          </div>

          <div className="bf"><span className="bl">Fase / WBS</span>
            <select className="bi" value={form.phaseId} disabled={!canSave || !engagementId} onChange={(e) => set('phaseId', e.target.value)}>
              <option value="">—</option>
              {(phases.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></div>

          <div className="bf"><span className="bl">Stato</span>
            <select className="bi" value={form.statusId} disabled={!canSave} onChange={(e) => set('statusId', e.target.value)}>
              <option value="">—</option>
              {statuses.map((s) => <option key={s.id} value={s.id}>{lk.labelOf(s.id)}</option>)}
            </select></div>

          <div className="bf"><span className="bl">Priorità</span>
            <select className="bi" value={form.priorityId} disabled={!canSave} onChange={(e) => set('priorityId', e.target.value)}>
              <option value="">—</option>
              {priorities.map((p) => <option key={p.id} value={p.id}>{lk.labelOf(p.id)}</option>)}
            </select></div>

          <div className="bf"><span className="bl">Durata stimata (min)</span>
            <NumInput align="right" value={form.estimatedMinutes} disabled={!canSave} onChange={(n) => set('estimatedMinutes', n)} /></div>

          <div className="bf"><span className="bl">Tipo</span>
            <input className="bi" value={form.kind} disabled={!canSave} placeholder="es. sopralluogo" onChange={(e) => set('kind', e.target.value)} /></div>

          <div className="bf"><span className="bl">Inizio pianificato <span className="faint">(= fissa)</span></span>
            <input type="datetime-local" className="bi mono" value={form.scheduledStart} disabled={!canSave} onChange={(e) => set('scheduledStart', e.target.value)} /></div>

          <div className="bf"><span className="bl">Non prima di</span>
            <input type="datetime-local" className="bi mono" value={form.earliestStart} disabled={!canSave} onChange={(e) => set('earliestStart', e.target.value)} /></div>

          <div className="bf"><span className="bl">Scadenza (entro)</span>
            <input type="datetime-local" className="bi mono" value={form.dueBy} disabled={!canSave} onChange={(e) => set('dueBy', e.target.value)} /></div>
        </div>
      </ObjectBox>

      <ObjectBox icon={ListChecks} title="Checklist" subtitle={checklist.length ? `${checklist.filter((c) => c.done).length}/${checklist.length}` : undefined}>
        <ChecklistEditor items={checklist} canEdit={canSave} onChange={setChecklist} />
      </ObjectBox>

      {isNew
        ? <div className="dsx-empty" style={{ marginTop: 4 }}>Salva l'attività per gestire risorse, dipendenze, ore e materiali.</div>
        : <RelatedTabs tabs={tabs} active={tab} onChange={(k) => setTab(k as typeof tab)} />}

      <EngagementPickerDialog open={engPick} onClose={() => setEngPick(false)}
        onPick={(es: EngagementDto[]) => { const e = es[0]; if (e) setForm((f) => ({ ...f, engagementId: e.id, engagementTitle: e.title ?? e.code ?? e.id, phaseId: '' })); }} />
    </ObjectPage>
  );

  return <Page title={title} bleed>{objectPage}</Page>;
}

/* ── Checklist editabile (salvata con la testata) ──────────────────────── */
function ChecklistEditor({ items, canEdit, onChange }: { items: CkItem[]; canEdit: boolean; onChange: (v: CkItem[]) => void }) {
  const upd = (i: number, patch: Partial<CkItem>) => onChange(items.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <>
      {items.length === 0 && <p className="faint" style={{ fontSize: 13, color: 'var(--ink-faint)', padding: '4px 0' }}>Nessun passo.</p>}
      {items.map((c, i) => (
        <div className="row-li" key={i} style={{ gap: 10 }}>
          <input type="checkbox" checked={c.done} disabled={!canEdit} onChange={() => upd(i, { done: !c.done })} />
          <input className="bi" style={{ flex: 1, textDecoration: c.done ? 'line-through' : 'none', color: c.done ? 'var(--ink-faint)' : 'inherit' }}
            value={c.text} disabled={!canEdit} placeholder="Passo…" onChange={(e) => upd(i, { text: e.target.value })} />
          {canEdit && <button className="act-icon danger" aria-label="Rimuovi" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 size={16} /></button>}
        </div>
      ))}
      {canEdit && <div className="addline" onClick={() => onChange([...items, { text: '', done: false }])}><Plus size={15} /> Aggiungi passo</div>}
    </>
  );
}

/* ── Tab: Risorse assegnate (picker risorsa standard) ──────────────────── */
function RisorseAssegnate({ activityId, resources, onChange }:
  { activityId: string; resources: ActivityResourceDto[]; onChange: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const can = !!user?.permissions.includes('activity:assign');
  const [pick, setPick] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<ActivityResourceDto | null>(null);

  async function add(rs: ResourceDto[]) {
    const r = rs[0]; if (!r) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { resourceId: r.id };
      if (from) body.plannedFrom = new Date(from).toISOString();
      if (to) body.plannedTo = new Date(to).toISOString();
      await mutate('POST', `/activities/${activityId}/resources`, body);
      setFrom(''); setTo(''); onChange();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  }
  async function remove(arId: string) {
    setBusy(true);
    try { await mutate('DELETE', `/activities/${activityId}/resources/${arId}`); setDel(null); onChange(); }
    catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <div className="ph">
        <h3><Users size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />Risorse assegnate</h3>
        {can && <button className="btn btn-ghost btn-sm" onClick={() => setPick(true)} disabled={busy}><Plus size={16} />Assegna risorsa</button>}
      </div>
      <div className="pb">
        {can && (
          <div className="row-li" style={{ gap: 10, flexWrap: 'wrap' }}>
            <label className="faint" style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>Finestra (opz.)</label>
            <input className="txt" type="datetime-local" step={900} style={{ height: 38, maxWidth: 200 }} value={from} onChange={(e) => setFrom(e.target.value)} />
            <input className="txt" type="datetime-local" step={900} style={{ height: 38, maxWidth: 200 }} value={to} onChange={(e) => setTo(e.target.value)} />
            <span className="faint" style={{ fontSize: 12, color: 'var(--ink-faint)', flex: 1, minWidth: 160 }}>Con orario Da/A il sistema blocca la doppia prenotazione.</span>
          </div>
        )}
        {resources.length === 0 && <p className="faint" style={{ fontSize: 13, color: 'var(--ink-faint)', padding: '6px 0' }}>Nessuna risorsa assegnata.</p>}
        {resources.map((r) => (
          <div className="row-li" key={r.id}>
            <div style={{ flex: 1 }}>
              <b>{r.resourceLabel ?? '—'}</b>
              {r.plannedFrom && <div className="cellsub mono">
                {new Date(r.plannedFrom).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                {r.plannedTo && ` → ${new Date(r.plannedTo).toLocaleString('it-IT', { hour: '2-digit', minute: '2-digit' })}`}
              </div>}
            </div>
            {can && <button className="act-icon danger" aria-label="Rimuovi" onClick={() => setDel(r)} disabled={busy}><Trash2 size={16} /></button>}
          </div>
        ))}
      </div>
      <ResourcePickerDialog open={pick} onClose={() => setPick(false)} onPick={add} />
      <ConfirmDialog open={!!del} danger title="Rimuovere la risorsa?" confirmLabel="Rimuovi" busy={busy}
        message={`Vuoi rimuovere "${del?.resourceLabel ?? ''}" da questa attività?`}
        onConfirm={() => del && remove(del.id)} onCancel={() => setDel(null)} />
    </div>
  );
}

/* ── Tab: Dipendenze (FS intra-commessa) ───────────────────────────────── */
function Dipendenze({ activityId, engagementId }: { activityId: string; engagementId: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const can = !!user?.permissions.includes('dependency:manage');
  const acts = useApi<{ items: ActivityDto[] }>(engagementId ? `/activities?engagementId=${engagementId}` : null);
  const deps = useApi<{ items: DependencyEdgeDto[] }>(engagementId ? `/engagements/${engagementId}/dependencies` : null);
  const [predId, setPredId] = useState('');
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<DependencyEdgeDto | null>(null);

  const blockedBy = (deps.data?.items ?? []).filter((d) => d.successorId === activityId);
  const candidates = (acts.data?.items ?? []).filter((a) => a.id !== activityId && !blockedBy.some((d) => d.predecessorId === a.id));

  async function add() {
    const pid = predId || candidates[0]?.id;
    if (!pid) { toast('Nessuna attività candidata', 'error'); return; }
    setBusy(true);
    try { await mutate('POST', '/dependencies', { predecessorId: pid, successorId: activityId }); setPredId(''); void deps.reload(); }
    catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  }
  async function remove(depId: string) {
    setBusy(true);
    try { await mutate('DELETE', `/dependencies/${depId}`); setDel(null); void deps.reload(); }
    catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <div className="ph"><h3><GitBranch size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />Bloccata da</h3></div>
      <div className="pb">
        {blockedBy.length === 0 && <p className="faint" style={{ fontSize: 13, color: 'var(--ink-faint)', padding: '6px 0' }}>Nessuna dipendenza: parte appena possibile.</p>}
        {blockedBy.map((d) => (
          <div className="row-li" key={d.id}>
            <div style={{ flex: 1 }}><b>{d.predecessorTitle ?? '—'}</b><div className="cellsub">deve finire prima (FS)</div></div>
            {can && <button className="act-icon danger" aria-label="Rimuovi" onClick={() => setDel(d)} disabled={busy}><Trash2 size={16} /></button>}
          </div>
        ))}
        {can && candidates.length > 0 && (
          <div className="row-li" style={{ gap: 10, flexWrap: 'wrap' }}>
            <select className="txt" style={{ height: 38, flex: 1, minWidth: 220 }} value={predId || candidates[0]?.id} onChange={(e) => setPredId(e.target.value)}>
              {candidates.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={add}><Plus size={16} />Aggiungi vincolo</button>
          </div>
        )}
        <p className="faint" style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 8 }}>Vincolo Fine→Inizio nella stessa commessa; il sistema impedisce i cicli.</p>
      </div>
      <ConfirmDialog open={!!del} danger title="Rimuovere il vincolo?" confirmLabel="Rimuovi" busy={busy}
        message={`Vuoi rimuovere la dipendenza da "${del?.predecessorTitle ?? ''}"?`}
        onConfirm={() => del && remove(del.id)} onCancel={() => setDel(null)} />
    </div>
  );
}

/* ── Tab: Rendicontazione ore ──────────────────────────────────────────── */
function RendicontazioneOre({ activityId, engagementId }: { activityId: string; engagementId: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const can = !!user?.permissions.includes('time_entry:create');
  const list = useApi<{ items: TimeEntryDto[] }>(`/time-entries?activityId=${activityId}`);
  const [typology, setTypology] = useState('sviluppo');
  const [minutes, setMinutes] = useState<number | null>(60);
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  async function add() {
    if (!minutes || minutes <= 0) { toast('Indica i minuti', 'error'); return; }
    setBusy(true);
    try { await mutate('POST', '/time-entries', { engagementId, activityId, typology, minutes, occurredOn: today }); void list.reload(); }
    catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <div className="ph"><h3><Clock size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />Ore rendicontate</h3></div>
      <div className="pb">
        {(list.data?.items ?? []).length === 0 && <p className="faint" style={{ fontSize: 13, color: 'var(--ink-faint)', padding: '6px 0' }}>Nessuna ora registrata.</p>}
        {(list.data?.items ?? []).map((te) => (
          <div className="row-li" key={te.id}>
            <div style={{ flex: 1 }}><b>{te.typology}</b><div className="cellsub mono">{te.occurredOn}</div></div>
            <span className="mono">{hhmm(te.minutes)}</span>
          </div>
        ))}
        {can && (
          <div className="row-li" style={{ gap: 10, flexWrap: 'wrap' }}>
            <input className="txt" style={{ height: 38, minWidth: 160, flex: 1 }} placeholder="Tipologia" value={typology} onChange={(e) => setTypology(e.target.value)} />
            <div style={{ width: 120 }}><NumInput align="right" value={minutes} onChange={setMinutes} placeholder="minuti" /></div>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={add}><Plus size={16} />Registra ore</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Tab: Rendicontazione materiali (picker articolo standard) ─────────── */
function RendicontazioneMateriali({ activityId }: { activityId: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const can = !!user?.permissions.includes('material_consumption:create');
  const list = useApi<{ items: ConsumptionDto[] }>(`/consumptions?activityId=${activityId}`);
  const [mat, setMat] = useState<MaterialDto | null>(null);
  const [pick, setPick] = useState(false);
  const [quantity, setQuantity] = useState<number | null>(1);
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  async function add() {
    if (!mat) { toast('Scegli un articolo', 'error'); return; }
    if (!quantity || quantity <= 0) { toast('Indica la quantità', 'error'); return; }
    setBusy(true);
    try {
      await mutate('POST', '/consumptions', { activityId, materialId: mat.id, quantity, unit: mat.unit, occurredOn: today });
      setMat(null); setQuantity(1); void list.reload();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <div className="ph"><h3><Boxes size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />Materiali consumati</h3></div>
      <div className="pb">
        {(list.data?.items ?? []).length === 0 && <p className="faint" style={{ fontSize: 13, color: 'var(--ink-faint)', padding: '6px 0' }}>Nessun consumo registrato.</p>}
        {(list.data?.items ?? []).map((c) => (
          <div className="row-li" key={c.id}>
            <div style={{ flex: 1 }}><b>{c.materialName}</b><div className="cellsub mono">{c.occurredOn}</div></div>
            <span className="mono">{c.quantity} {c.unit}</span>
          </div>
        ))}
        {can && (
          <div className="row-li" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <PickerField value={mat ? `${mat.name}${mat.unit ? ` (${mat.unit})` : ''}` : null} placeholder="Scegli articolo…"
                onOpen={() => setPick(true)} onClear={() => setMat(null)} />
            </div>
            <div style={{ width: 120 }}><NumInput align="right" value={quantity} onChange={setQuantity} placeholder="quantità" /></div>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={add}><Plus size={16} />Registra</button>
          </div>
        )}
      </div>
      <MaterialPickerDialog open={pick} onClose={() => setPick(false)} onPick={(ms) => setMat(ms[0] ?? null)} />
    </div>
  );
}
