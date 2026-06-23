/**
 * CommessaDetailPage — dettaglio commessa con i 4 TAB del mock 07
 * (Struttura · Risorse · Ore & materiali · Catture). Dentro "Struttura" un
 * sotto-selettore Albero (.xtree, mock 24) / Gantt / Lista (.tree, mock 07).
 * Le FASI si annidano via parent_phase_id; solo le ATTIVITÀ foglia portano lavoro.
 * Il "Racconto AI" è una CARD sotto la testata, non un tab.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useHistory, useLocation } from 'react-router';
import {
  IonButton, IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonContent,
  IonList, IonItem, IonInput, IonSelect, IonSelectOption, IonText, IonSpinner,
} from '@ionic/react';
import {
  ChevronDown, ChevronRight, Folder, Plus, Pencil, Trash2, Pin, ArrowRight, GanttChartSquare, List, ListTree, Sparkles, Users, Copy,
} from 'lucide-react';
import type {
  EngagementDto, PhaseDto, ActivityDto, LookupDto, DependencyEdgeDto, TimeEntryDto, ConsumptionDto, CaptureDto,
} from '@sisuite/shared';
import { Page, Loading, ErrorBox, Empty } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { ObjectPage, ObjectBox } from '../ui/ObjectPage';
import { Briefcase } from '../ui/icons';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { useApi, mutate } from '../api/hooks';
import { apiFetch } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLookups } from '../context/Lookups';
import { BudgetPanel } from '../components/BudgetPanel';
import { hhmm } from '../lib/time';

type MainTab = 'struttura' | 'risorse' | 'ore' | 'catture' | 'budget';
type StructView = 'tree' | 'gantt' | 'list';
interface ScheduleItem { id: string; title: string; fixed: boolean; start: string | null; end: string | null; conflict: string }
interface LkApi { labelOf: (id: string | null | undefined) => string; byId: (id: string | null | undefined) => LookupDto | undefined }

function fmtDt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function fmtDay(iso: string | null): string { return iso ? new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) : '—'; }
function hoursLabel(min: number | null, fixed: boolean): string {
  if (!min) return '—';
  const h = min % 60 === 0 ? `${min / 60}h` : `${(min / 60).toFixed(1)}h`;
  return fixed ? h : `~${h}`;
}

export function CommessaDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const { user } = useAuth();
  const lk = useLookups();
  const toast = useToast();
  const history = useHistory();

  const eng = useApi<EngagementDto>(isNew ? null : `/engagements/${id}`);
  const phases = useApi<{ items: PhaseDto[] }>(isNew ? null : `/engagements/${id}/phases`);
  const acts = useApi<{ items: ActivityDto[] }>(isNew ? null : `/activities?engagementId=${id}`);
  const sched = useApi<{ items: ScheduleItem[]; conflicts: ScheduleItem[] }>(isNew ? null : `/engagements/${id}/schedule`);
  const deps = useApi<{ items: DependencyEdgeDto[] }>(isNew ? null : `/engagements/${id}/dependencies`);
  const companies = useApi<{ items: { id: string; displayName: string }[] }>('/companies?limit=200');

  const can = (p: string) => !!user?.permissions.includes(p as never);

  const depBySuccessor = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of deps.data?.items ?? []) {
      const arr = m.get(d.successorId) ?? [];
      if (d.predecessorTitle) arr.push(d.predecessorTitle);
      m.set(d.successorId, arr);
    }
    return m;
  }, [deps.data]);

  const [mainTab, setMainTab] = useState<MainTab>('struttura');
  const [view, setView] = useState<StructView>('tree');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [narr, setNarr] = useState<{ available: boolean; text: string } | null>(null);
  const [narrLoading, setNarrLoading] = useState(false);
  const [phaseModal, setPhaseModal] = useState<{ editing: PhaseDto | null } | null>(null);
  const [actModal, setActModal] = useState<{ editing: ActivityDto | null; presetPhaseId?: string } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'phase' | 'activity'; id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Duplica (standard): "nuovo" precompilato da location.state.prefill.
  const location = useLocation();
  const prefill = isNew ? (location.state as { prefill?: Record<string, unknown> } | null)?.prefill : undefined;

  // Anagrafica editabile (header sticky Salva/Annulla) — testata commessa
  const [head, setHead] = useState({ title: '', companyId: '', type: 'build', statusId: '', startedOn: '', endedOn: '' });
  useEffect(() => {
    const e = eng.data;
    if (e) { setHead({ title: e.title, companyId: e.companyId, type: e.type, statusId: e.statusId ?? '', startedOn: e.startedOn ?? '', endedOn: e.endedOn ?? '' }); return; }
    if (isNew && prefill) setHead({ title: (prefill.title as string) ?? '', companyId: (prefill.companyId as string) ?? '', type: (prefill.type as string) ?? 'build', statusId: '', startedOn: '', endedOn: '' });
  }, [eng.data, isNew, prefill]);
  const setH = (k: keyof typeof head, v: string) => setHead((h) => ({ ...h, [k]: v }));

  async function saveHead() {
    if (!head.title.trim()) { toast('Il titolo è obbligatorio', 'error'); return; }
    if (isNew && !head.companyId) { toast('Seleziona il cliente', 'error'); return; }
    setBusy(true);
    try {
      if (isNew) {
        const body = { companyId: head.companyId, type: head.type, title: head.title.trim(), startedOn: head.startedOn || undefined };
        const c = await apiFetch<EngagementDto>('/engagements', { method: 'POST', body: JSON.stringify(body) });
        toast('Commessa creata'); history.replace(`/engagements/${c.id}`);
      } else {
        const body = { title: head.title.trim(), statusId: head.statusId || undefined, startedOn: head.startedOn || undefined, endedOn: head.endedOn || undefined };
        await mutate('PATCH', `/engagements/${id}`, body); toast('Modifiche salvate'); void eng.reload();
      }
    } catch (e) { toast((e as Error).message || 'Errore salvataggio', 'error'); } finally { setBusy(false); }
  }

  async function genNarrative() {
    setNarrLoading(true);
    try { setNarr(await apiFetch<{ available: boolean; text: string }>(`/engagements/${id}/narrative`)); }
    catch (e) { toast((e as Error).message || 'Racconto non disponibile', 'error'); }
    finally { setNarrLoading(false); }
  }

  const phaseList = phases.data?.items ?? [];
  const actList = acts.data?.items ?? [];
  const childPhases = (parentId: string | null) => phaseList.filter((p) => (p.parentPhaseId ?? null) === parentId).sort((a, b) => a.seq - b.seq);
  const phaseActs = (phaseId: string) => actList.filter((a) => a.phaseId === phaseId).sort((a, b) => a.title.localeCompare(b.title));
  const rootActs = actList.filter((a) => !a.phaseId);

  function descendantActs(phaseId: string): ActivityDto[] {
    let out = phaseActs(phaseId);
    for (const sub of childPhases(phaseId)) out = out.concat(descendantActs(sub.id));
    return out;
  }
  function rollup(phaseId: string): string {
    const a = descendantActs(phaseId);
    const done = a.filter((x) => x.statusCanonical === 'done').length;
    const min = a.reduce((s, x) => s + (x.estimatedMinutes ?? 0), 0);
    return `${done}/${a.length}${min ? ` · ${Math.round(min / 60)}h` : ''}`;
  }
  const totalDone = actList.filter((a) => a.statusCanonical === 'done').length;

  function reloadTree() { void phases.reload(); void acts.reload(); void sched.reload(); void deps.reload(); }
  function toggle(pid: string) { setCollapsed((s) => { const n = new Set(s); n.has(pid) ? n.delete(pid) : n.add(pid); return n; }); }

  async function doDelete() {
    if (!confirm) return;
    setBusy(true);
    try {
      await mutate('DELETE', confirm.kind === 'phase' ? `/phases/${confirm.id}` : `/activities/${confirm.id}`);
      toast(confirm.kind === 'phase' ? 'Fase eliminata' : 'Attività eliminata');
      setConfirm(null); reloadTree();
    } catch (e) { toast((e as Error).message || 'Impossibile eliminare', 'error'); setConfirm(null); }
    finally { setBusy(false); }
  }

  const pill = (statusId: string, canon: string | null) =>
    <StatusPill label={lk.labelOf(statusId) || (canon ?? '')} token={lk.byId(statusId)?.colorToken} />;
  const depTag = (aid: string) => {
    const pre = depBySuccessor.get(aid);
    return pre && pre.length ? <span className="tdep" title={pre.join(', ')}><ArrowRight size={13} />dopo {pre.length === 1 ? pre[0] : `${pre.length} attività`}</span> : null;
  };

  /* ── Albero espandibile (.xtree, mock 24): .ticon colorata per livello ── */
  const xtreeRows = useMemo(() => {
    const out: JSX.Element[] = [];
    const pad = (depth: number) => ({ paddingLeft: 16 + depth * 24 });
    const walkPhase = (p: PhaseDto, depth: number) => {
      const subs = childPhases(p.id), directActs = phaseActs(p.id);
      const hasChildren = subs.length + directActs.length > 0;
      const open = !collapsed.has(p.id);
      const iconBg = depth === 0 ? 'var(--brand-wash)' : 'var(--flow-wash)';
      const iconFg = depth === 0 ? 'var(--brand)' : 'var(--flow)';
      out.push(
        <div className="tnode" key={`p_${p.id}`} style={pad(depth)} onClick={() => hasChildren && toggle(p.id)}>
          <span className="tchev">{hasChildren ? (open ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : null}</span>
          <span className="ticon" style={{ background: iconBg, color: iconFg }}><Folder size={15} /></span>
          <span className="tname">{p.name}</span>
          <span className="tmeta" onClick={(e) => e.stopPropagation()}>
            <span className="troll">{rollup(p.id)}</span>
            {pill(p.statusId, p.statusCanonical)}
            <span className="tactions">
              {can('activity:create') && <button className="iaction" title="Aggiungi attività" onClick={() => setActModal({ editing: null, presetPhaseId: p.id })}><Plus size={16} /></button>}
              {can('phase:update') && <button className="iaction" title="Modifica fase" onClick={() => setPhaseModal({ editing: p })}><Pencil size={15} /></button>}
              {can('phase:delete') && <button className="iaction danger" title="Elimina fase" onClick={() => setConfirm({ kind: 'phase', id: p.id, name: p.name })}><Trash2 size={15} /></button>}
            </span>
          </span>
        </div>,
      );
      if (open) { for (const s of subs) walkPhase(s, depth + 1); for (const a of directActs) walkActivity(a, depth + 1); }
    };
    const walkActivity = (a: ActivityDto, depth: number) => {
      out.push(
        <div className="tnode leaf" key={`a_${a.id}`} style={pad(depth)} onClick={() => history.push(`/activities/${a.id}`)}>
          <span className="tchev empty" />
          <span className="ticon" style={{ background: 'transparent', color: 'var(--ink-faint)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', display: 'block' }} />
          </span>
          <span className="tname">{a.title}</span>
          <span className="tmeta" onClick={(e) => e.stopPropagation()}>
            {depTag(a.id)}
            {a.isFixed && <span className="tdep"><Pin size={13} />fissa</span>}
            <span className="troll">{hoursLabel(a.estimatedMinutes, a.isFixed)}</span>
            {pill(a.statusId, a.statusCanonical)}
            <span className="tactions">
              {can('activity:update') && <button className="iaction" title="Modifica" onClick={() => setActModal({ editing: a })}><Pencil size={15} /></button>}
              {can('activity:delete') && <button className="iaction danger" title="Elimina" onClick={() => setConfirm({ kind: 'activity', id: a.id, name: a.title })}><Trash2 size={15} /></button>}
            </span>
          </span>
        </div>,
      );
    };
    for (const p of childPhases(null)) walkPhase(p, 0);
    for (const a of rootActs) walkActivity(a, 0);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseList, actList, collapsed, lk, depBySuccessor]);

  /* ── Vista LISTA semplice (.tree, mock 07): phase-row + task-row ── */
  const simpleRows = useMemo(() => {
    const out: JSX.Element[] = [];
    const task = (a: ActivityDto) => (
      <div className="task-row" key={`t_${a.id}`} style={{ cursor: 'pointer' }} onClick={() => history.push(`/activities/${a.id}`)}>
        <span className="tt">{a.title}</span>
        {depTag(a.id)}
        <span className="dur">{hoursLabel(a.estimatedMinutes, a.isFixed)}</span>
        {pill(a.statusId, a.statusCanonical)}
      </div>
    );
    childPhases(null).forEach((p, i) => {
      out.push(<div className="phase-row" key={`ph_${p.id}`}><span className="seq">FASE {i + 1}</span> {p.name}</div>);
      for (const a of descendantActs(p.id)) out.push(task(a));
    });
    for (const a of rootActs) out.push(task(a));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseList, actList, lk, depBySuccessor]);

  const empty = phaseList.length + actList.length === 0;

  if (!isNew && eng.loading) return <Page title={t('terms.engagement')} bleed><Loading /></Page>;
  if (!isNew && eng.error) return <Page title={t('terms.engagement')} bleed><ErrorBox message={eng.error} /></Page>;

  const e = eng.data;
  const statusOpts = lk.byCategory('engagement_status');
  const companyOpts = companies.data?.items ?? [];
  const canEdit = isNew ? can('engagement:create') : can('engagement:update');

  return (
    <Page title={isNew ? `${t('terms.engagement')} — nuova` : (e ? e.code : t('terms.engagement'))} bleed>
      <ObjectPage
        backLabel={t('terms.engagement_plural')} onBack={() => history.push('/engagements')}
        title={isNew ? `${t('terms.engagement')} — nuova` : (head.title || e?.title || t('terms.engagement'))}
        code={!isNew && e ? e.code : undefined}
        status={!isNew && e ? pill(e.statusId, e.statusCanonical) : undefined}
        onSave={canEdit ? saveHead : undefined} onCancel={() => history.push('/engagements')} saving={busy}
      >
        <ObjectBox icon={Briefcase} title={`Anagrafica ${t('terms.engagement').toLowerCase()}`}>
          <div className="bgrid">
            <div className="bf c2"><span className="bl">Titolo <span className="req">*</span></span>
              <input className="bi" value={head.title} onChange={(ev) => setH('title', ev.target.value)} /></div>
            <div className="bf"><span className="bl">Tipo</span>
              {isNew
                ? <select className="bi" value={head.type} onChange={(ev) => setH('type', ev.target.value)}><option value="build">Realizzazione</option><option value="maintenance">Manutenzione</option></select>
                : <div className="bi">{head.type === 'build' ? 'Realizzazione' : 'Manutenzione'}</div>}</div>
            <div className="bf"><span className="bl">Cliente</span>
              {isNew
                ? <select className="bi" value={head.companyId} onChange={(ev) => setH('companyId', ev.target.value)}><option value="">— seleziona —</option>{companyOpts.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}</select>
                : <div className="bi">{e?.companyName ?? '—'}</div>}</div>
            {!isNew && (
              <div className="bf"><span className="bl">Stato</span>
                <select className="bi" value={head.statusId} onChange={(ev) => setH('statusId', ev.target.value)}>
                  {statusOpts.map((s) => <option key={s.id} value={s.id}>{s.label['it-IT'] ?? s.code}</option>)}
                </select></div>
            )}
            <div className="bf"><span className="bl">Inizio</span>
              <input className="bi" type="date" value={head.startedOn ? head.startedOn.slice(0, 10) : ''} onChange={(ev) => setH('startedOn', ev.target.value)} /></div>
            {!isNew && (
              <div className="bf"><span className="bl">Fine</span>
                <input className="bi" type="date" value={head.endedOn ? head.endedOn.slice(0, 10) : ''} onChange={(ev) => setH('endedOn', ev.target.value)} /></div>
            )}
          </div>
        </ObjectBox>

        {isNew && <div className="dsx-empty" style={{ marginTop: 4 }}>Salva la commessa per gestire struttura, risorse, ore e catture.</div>}

        {!isNew && e && (
        <>
          {can('engagement:create') && <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}><SaveAsTemplate engagementId={id} /></div>}

          {/* Racconto AI — CARD, non tab */}
          <div className="prop-card" style={{ marginBottom: 18 }}>
            <div className="prop-head">
              <div className="spark"><Sparkles size={16} /></div><b>Racconto AI</b>
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} disabled={narrLoading} onClick={genNarrative}>
                <Sparkles size={14} /> {narrLoading ? 'Genero…' : narr ? 'Rigenera' : 'Racconta com’è messa'}
              </button>
            </div>
            <div style={{ padding: '14px 16px' }}>
              {narr
                ? <><div style={{ fontSize: 14.5, lineHeight: 1.55 }}>{narr.text}</div>{!narr.available && <div className="faint" style={{ fontSize: 12, marginTop: 8, color: 'var(--ink-faint)' }}>Riepilogo automatico (AI non configurata).</div>}</>
                : <div className="faint" style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>Chiedi all'assistente un riepilogo dello stato della commessa.</div>}
            </div>
          </div>

          {/* 4 TAB (mock 07) */}
          <div className="tabs">
            <a className={mainTab === 'struttura' ? 'on' : ''} onClick={() => setMainTab('struttura')}>Struttura</a>
            <a className={mainTab === 'risorse' ? 'on' : ''} onClick={() => setMainTab('risorse')}>Risorse</a>
            <a className={mainTab === 'ore' ? 'on' : ''} onClick={() => setMainTab('ore')}>Ore &amp; materiali</a>
            <a className={mainTab === 'catture' ? 'on' : ''} onClick={() => setMainTab('catture')}>Catture</a>
            <a className={mainTab === 'budget' ? 'on' : ''} onClick={() => setMainTab('budget')}>Budget</a>
          </div>

          {mainTab === 'struttura' && (
            <>
              <div className="toolbar">
                <div className="seg">
                  <button className={view === 'tree' ? 'on' : ''} onClick={() => setView('tree')}><ListTree size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} />Albero</button>
                  <button className={view === 'gantt' ? 'on' : ''} onClick={() => setView('gantt')}><GanttChartSquare size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} />Gantt</button>
                  <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}><List size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} />Lista</button>
                </div>
                <span className="spacer" />
                {can('phase:create') && <button className="btn btn-primary btn-sm" onClick={() => setPhaseModal({ editing: null })}><Plus size={16} /> Aggiungi fase</button>}
              </div>
              {(phases.loading || acts.loading) ? <Loading /> : empty
                ? <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--ink-soft)' }}>Nessuna fase o attività. {can('phase:create') && 'Inizia con “Aggiungi fase”.'}</div>
                : view === 'tree' ? <div className="xtree">{xtreeRows}</div>
                  : view === 'list' ? <div className="tree">{simpleRows}</div>
                    : <GanttView items={sched.data?.items ?? []} loading={sched.loading} />}
            </>
          )}

          {mainTab === 'risorse' && <ResourcesTab engagementId={id} acts={actList} onOpen={(aid) => history.push(`/activities/${aid}`)} />}
          {mainTab === 'ore' && <HoursMaterialsTab engagementId={id} />}
          {mainTab === 'catture' && <CapturesTab />}
          {mainTab === 'budget' && <BudgetPanel engagementId={id} />}
        </>
        )}
      </ObjectPage>

      {phaseModal && (
        <PhaseModal open engagementId={id} editing={phaseModal.editing} phases={phaseList}
          nextSeq={childPhases(phaseModal.editing?.parentPhaseId ?? null).length + 1} statusOptions={lk.byCategory('phase_status')}
          onClose={() => setPhaseModal(null)} onSaved={() => { setPhaseModal(null); reloadTree(); }} />
      )}
      {actModal && (
        <ActivityModal open engagementId={id} editing={actModal.editing} presetPhaseId={actModal.presetPhaseId}
          phases={phaseList} statusOptions={lk.byCategory('activity_status')}
          onClose={() => setActModal(null)} onSaved={() => { setActModal(null); reloadTree(); }} />
      )}
      <ConfirmDialog open={!!confirm} danger
        title={confirm?.kind === 'phase' ? 'Eliminare la fase?' : 'Eliminare l\'attività?'}
        message={confirm?.kind === 'phase' ? `“${confirm?.name}” e le sue sotto-fasi verranno eliminate. Le attività restano (scollegate).` : `“${confirm?.name}” verrà eliminata.`}
        confirmLabel="Elimina" busy={busy} onConfirm={doDelete} onCancel={() => setConfirm(null)} />
    </Page>
  );
}

/* ── Tab Risorse ──────────────────────────────────────────────────────── */
function ResourcesTab({ engagementId: _e, acts, onOpen }: { engagementId: string; acts: ActivityDto[]; onOpen: (id: string) => void }) {
  if (acts.length === 0) return <Empty text="Nessuna attività." />;
  return (
    <>
      <p className="faint" style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 12px' }}>
        Le assegnazioni si gestiscono nel dettaglio di ogni attività (apri un'attività → "Risorse assegnate").
      </p>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Attività</th><th>Durata</th><th>Stato</th><th /></tr></thead>
          <tbody>
            {acts.map((a) => (
              <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(a.id)}>
                <td className="cellname">{a.title}</td>
                <td><span className="mono">{hoursLabel(a.estimatedMinutes, a.isFixed)}</span></td>
                <td><StatusPill label={a.statusCanonical ?? ''} token={undefined} /></td>
                <td style={{ textAlign: 'right' }}><span className="dep"><Users size={13} /> assegna →</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── Tab Ore & materiali ──────────────────────────────────────────────── */
function HoursMaterialsTab({ engagementId }: { engagementId: string }) {
  const te = useApi<{ items: TimeEntryDto[] }>(`/time-entries?engagementId=${engagementId}`);
  const mc = useApi<{ items: ConsumptionDto[] }>(`/consumptions?engagementId=${engagementId}`);
  const totMin = (te.data?.items ?? []).reduce((s, t) => s + t.minutes, 0);
  return (
    <div className="grid2">
      <div className="panel">
        <div className="ph"><h3>Ore registrate</h3><span className="chip mono">{hhmm(totMin)}</span></div>
        <div className="pb">
          {te.loading ? <Loading /> : (te.data?.items.length ? te.data.items.map((t) => (
            <div className="row-li" key={t.id}><div style={{ flex: 1 }}><b>{t.typology}</b><div className="cellsub">{t.occurredOn}</div></div><span className="mono">{hhmm(t.minutes)}</span></div>
          )) : <Empty text="Nessuna ora registrata." />)}
        </div>
      </div>
      <div className="panel">
        <div className="ph"><h3>Materiali</h3></div>
        <div className="pb">
          {mc.loading ? <Loading /> : (mc.data?.items.length ? mc.data.items.map((c) => (
            <div className="row-li" key={c.id}><div style={{ flex: 1 }}><b>{c.materialName ?? 'Materiale'}</b><div className="cellsub">{c.occurredOn}</div></div><span className="mono">{c.quantity} {c.unit}</span></div>
          )) : <Empty text="Nessun consumo." />)}
        </div>
      </div>
    </div>
  );
}

/* ── Tab Catture ──────────────────────────────────────────────────────── */
const CAP_STATUS: Record<string, { label: string; token: string }> = {
  pending: { label: 'In attesa', token: 'neutral' }, proposed: { label: 'Da rivedere', token: 'warning' },
  applied: { label: 'Applicata', token: 'success' }, rejected: { label: 'Rifiutata', token: 'danger' },
};
function CapturesTab() {
  const inbox = useApi<{ items: CaptureDto[] }>('/captures');
  return (
    <div className="panel">
      <div className="ph"><h3>Catture recenti</h3></div>
      <div className="pb">
        {inbox.loading ? <Loading /> : (inbox.data?.items.length ? inbox.data.items.slice(0, 20).map((c) => {
          const s = CAP_STATUS[c.status] ?? CAP_STATUS.pending!;
          return <div className="row-li" key={c.id}><div style={{ flex: 1 }}><span className="faint">«{c.rawText}»</span><div className="cellsub">{new Date(c.createdAt).toLocaleString('it-IT')}</div></div><StatusPill label={s.label} token={s.token} /></div>;
        }) : <Empty text="Nessuna cattura." />)}
      </div>
    </div>
  );
}

/* ── Modale Fase (crea/modifica) ──────────────────────────────────────── */
function PhaseModal({ open, engagementId, editing, phases, nextSeq, statusOptions, onClose, onSaved }: {
  open: boolean; engagementId: string; editing: PhaseDto | null; phases: PhaseDto[];
  nextSeq: number; statusOptions: LookupDto[]; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [parentId, setParentId] = useState<string>(editing?.parentPhaseId ?? '');
  const [statusId, setStatusId] = useState<string>(editing?.statusId ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const parentChoices = phases.filter((p) => p.id !== editing?.id);

  async function submit() {
    if (!name.trim()) { setErr('Nome obbligatorio'); return; }
    setBusy(true); setErr(null);
    try {
      if (editing) {
        const body: Record<string, unknown> = { name: name.trim() };
        if (statusId) body.statusId = statusId;
        await mutate('PATCH', `/phases/${editing.id}`, body);
      } else {
        const body: Record<string, unknown> = { engagementId, name: name.trim(), seq: nextSeq };
        if (parentId) body.parentPhaseId = parentId;
        if (statusId) body.statusId = statusId;
        await mutate('POST', '/phases', body);
      }
      onSaved();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <IonModal isOpen={open} onDidDismiss={onClose}>
      <IonHeader><IonToolbar><IonTitle>{editing ? 'Modifica fase' : 'Nuova fase'}</IonTitle>
        <IonButtons slot="end"><IonButton onClick={onClose}>Chiudi</IonButton></IonButtons></IonToolbar></IonHeader>
      <IonContent className="ion-padding">
        <IonList>
          <IonItem><IonInput label="Nome fase" labelPlacement="stacked" value={name} onIonInput={(e) => setName(e.detail.value ?? '')} /></IonItem>
          {!editing && (
            <IonItem><IonSelect label="Fase superiore (opzionale)" labelPlacement="stacked" value={parentId} onIonChange={(e) => setParentId(e.detail.value)}>
              <IonSelectOption value="">— (fase radice)</IonSelectOption>
              {parentChoices.map((p) => <IonSelectOption key={p.id} value={p.id}>{p.name}</IonSelectOption>)}
            </IonSelect></IonItem>
          )}
          {statusOptions.length > 0 && (
            <IonItem><IonSelect label="Stato" labelPlacement="stacked" value={statusId} onIonChange={(e) => setStatusId(e.detail.value)}>
              <IonSelectOption value="">— (default)</IonSelectOption>
              {statusOptions.map((s) => <IonSelectOption key={s.id} value={s.id}>{s.label['it-IT'] ?? s.code}</IonSelectOption>)}
            </IonSelect></IonItem>
          )}
        </IonList>
        {err && <IonText color="danger"><p>{err}</p></IonText>}
        <IonButton expand="block" style={{ marginTop: 16 }} disabled={busy} onClick={submit}>{busy ? <IonSpinner name="crescent" /> : (editing ? 'Salva' : 'Crea fase')}</IonButton>
      </IonContent>
    </IonModal>
  );
}

/* ── Modale Attività (crea/modifica) ──────────────────────────────────── */
function ActivityModal({ open, engagementId, editing, presetPhaseId, phases, statusOptions, onClose, onSaved }: {
  open: boolean; engagementId: string; editing: ActivityDto | null; presetPhaseId?: string;
  phases: PhaseDto[]; statusOptions: LookupDto[]; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? '');
  const [phaseId, setPhaseId] = useState<string>(editing?.phaseId ?? presetPhaseId ?? '');
  const [statusId, setStatusId] = useState<string>(editing?.statusId ?? '');
  const [estimatedMinutes, setEst] = useState<string>(editing?.estimatedMinutes ? String(editing.estimatedMinutes) : '120');
  const [scheduledStart, setStart] = useState<string>(editing?.scheduledStart ? editing.scheduledStart.slice(0, 16) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) { setErr('Titolo obbligatorio'); return; }
    setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = { title: title.trim() };
      if (phaseId) body.phaseId = phaseId;
      if (statusId) body.statusId = statusId;
      if (estimatedMinutes) body.estimatedMinutes = Number(estimatedMinutes);
      if (scheduledStart) body.scheduledStart = new Date(scheduledStart).toISOString();
      if (editing) await mutate('PATCH', `/activities/${editing.id}`, body);
      else await mutate('POST', '/activities', { engagementId, ...body });
      onSaved();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <IonModal isOpen={open} onDidDismiss={onClose}>
      <IonHeader><IonToolbar><IonTitle>{editing ? 'Modifica attività' : 'Nuova attività'}</IonTitle>
        <IonButtons slot="end"><IonButton onClick={onClose}>Chiudi</IonButton></IonButtons></IonToolbar></IonHeader>
      <IonContent className="ion-padding">
        <IonList>
          <IonItem><IonInput label="Titolo" labelPlacement="stacked" value={title} onIonInput={(e) => setTitle(e.detail.value ?? '')} /></IonItem>
          <IonItem><IonSelect label="Fase (opzionale)" labelPlacement="stacked" value={phaseId} onIonChange={(e) => setPhaseId(e.detail.value)}>
            <IonSelectOption value="">—</IonSelectOption>
            {phases.map((p) => <IonSelectOption key={p.id} value={p.id}>{p.name}</IonSelectOption>)}
          </IonSelect></IonItem>
          {statusOptions.length > 0 && (
            <IonItem><IonSelect label="Stato" labelPlacement="stacked" value={statusId} onIonChange={(e) => setStatusId(e.detail.value)}>
              <IonSelectOption value="">— (default)</IonSelectOption>
              {statusOptions.map((s) => <IonSelectOption key={s.id} value={s.id}>{s.label['it-IT'] ?? s.code}</IonSelectOption>)}
            </IonSelect></IonItem>
          )}
          <IonItem><IonInput type="number" label="Durata stimata (min)" labelPlacement="stacked" value={estimatedMinutes} onIonInput={(e) => setEst(e.detail.value ?? '')} /></IonItem>
          <IonItem><IonInput type="datetime-local" label="Inizio fisso (vuoto = dinamica)" labelPlacement="stacked" value={scheduledStart} onIonInput={(e) => setStart(e.detail.value ?? '')} /></IonItem>
        </IonList>
        {err && <IonText color="danger"><p>{err}</p></IonText>}
        <IonButton expand="block" style={{ marginTop: 16 }} disabled={busy} onClick={submit}>{busy ? <IonSpinner name="crescent" /> : (editing ? 'Salva' : 'Crea attività')}</IonButton>
      </IonContent>
    </IonModal>
  );
}

/* ── Vista GANTT: barre proporzionali dall'agenda calcolata ───────────── */
function GanttView({ items, loading }: { items: ScheduleItem[]; loading: boolean }) {
  if (loading) return <Loading />;
  const placed = items.filter((s) => s.start && s.end);
  if (placed.length === 0) return <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--ink-soft)' }}>Nessuna attività collocata sul calendario.</div>;
  const min = Math.min(...placed.map((s) => new Date(s.start!).getTime()));
  const max = Math.max(...placed.map((s) => new Date(s.end!).getTime()));
  const span = Math.max(max - min, 1);
  const dayFmt = (t: number) => new Date(t).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div className="faint" style={{ fontSize: 12.5, color: 'var(--ink-faint)', marginBottom: 12 }}>Dal <b>{dayFmt(min)}</b> al <b>{dayFmt(max)}</b> · le dinamiche fluiscono attorno alle fisse.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((s) => {
          const has = s.start && s.end;
          const left = has ? ((new Date(s.start!).getTime() - min) / span) * 100 : 0;
          const width = has ? Math.max(((new Date(s.end!).getTime() - new Date(s.start!).getTime()) / span) * 100, 2) : 0;
          return (
            <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.title}>{s.title}</div>
              <div style={{ position: 'relative', height: 24, background: 'var(--line-2)', borderRadius: 6 }}>
                {has ? <div title={`${fmtDt(s.start)} → ${fmtDt(s.end)}`} style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, top: 3, bottom: 3, borderRadius: 5, background: s.fixed ? 'var(--brand)' : 'var(--flow)', border: s.conflict !== 'none' ? '2px solid var(--danger)' : 'none' }} />
                  : <span style={{ position: 'absolute', left: 8, top: 3, fontSize: 12, color: 'var(--danger)' }}>non collocabile</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 14, fontSize: 12, color: 'var(--ink-soft)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--brand)' }} /> fissa</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--flow)' }} /> dinamica</span>
      </div>
    </div>
  );
}

/** "Salva come modello" — cattura la struttura della commessa in un modello riusabile. */
function SaveAsTemplate({ engagementId }: { engagementId: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!name.trim()) { toast('Indica un nome', 'error'); return; }
    setBusy(true);
    try {
      await mutate('POST', `/engagements/${engagementId}/save-as-template`, { name: name.trim() });
      toast('Modello salvato — lo trovi in Impostazioni › Modelli commessa');
      setOpen(false); setName('');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  return (
    <>
      <button className="btn btn-ghost btn-sm" style={{ float: 'right' }} onClick={() => setOpen(true)}><Copy size={14} />Salva come modello</button>
      <IonModal isOpen={open} onDidDismiss={() => setOpen(false)}>
        <IonHeader><IonToolbar><IonTitle>Salva come modello</IonTitle>
          <IonButtons slot="end"><IonButton onClick={() => setOpen(false)}>Chiudi</IonButton></IonButtons></IonToolbar></IonHeader>
        <IonContent className="ion-padding">
          <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>Cattura fasi, attività e dipendenze di questa commessa in un modello riutilizzabile.</p>
          <IonInput label="Nome del modello" labelPlacement="stacked" value={name} onIonInput={(e) => setName(e.detail.value ?? '')} placeholder="es. Allaccio FTTH standard" />
          <IonButton expand="block" style={{ marginTop: 16 }} disabled={busy} onClick={save}>{busy ? <IonSpinner name="crescent" /> : 'Salva modello'}</IonButton>
        </IonContent>
      </IonModal>
    </>
  );
}
