/**
 * CommessaDetailPage — albero della commessa (mock 24).
 * Le FASI si annidano (ramo → sotto-ramo) via parent_phase_id; solo le ATTIVITÀ
 * (foglie) portano ore/risorse/materiali. Rollup per fase (fatte/totali · ore),
 * espansione/collasso, azioni inline (aggiungi · modifica · elimina).
 */
import { useMemo, useState } from 'react';
import { useParams, useHistory } from 'react-router';
import {
  IonButton, IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonContent,
  IonList, IonItem, IonInput, IonSelect, IonSelectOption, IonText, IonSpinner,
} from '@ionic/react';
import {
  ChevronDown, ChevronRight, Folder, Plus, Pencil, Trash2, Pin, ArrowRight, GanttChartSquare, List, ListTree,
} from 'lucide-react';
import type { EngagementDto, PhaseDto, ActivityDto, LookupDto, DependencyEdgeDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { useApi, mutate } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { useLookups } from '../context/Lookups';

type View = 'tree' | 'gantt' | 'list';
interface ScheduleItem { id: string; title: string; fixed: boolean; start: string | null; end: string | null; conflict: string }

function fmtDt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function hoursLabel(min: number | null, fixed: boolean): string {
  if (!min) return '—';
  const h = min % 60 === 0 ? `${min / 60}h` : `${(min / 60).toFixed(1)}h`;
  return fixed ? h : `~${h}`;
}

export function CommessaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const lk = useLookups();
  const toast = useToast();
  const history = useHistory();

  const eng = useApi<EngagementDto>(`/engagements/${id}`);
  const phases = useApi<{ items: PhaseDto[] }>(`/engagements/${id}/phases`);
  const acts = useApi<{ items: ActivityDto[] }>(`/activities?engagementId=${id}`);
  const sched = useApi<{ items: ScheduleItem[]; conflicts: ScheduleItem[] }>(`/engagements/${id}/schedule`);
  const deps = useApi<{ items: DependencyEdgeDto[] }>(`/engagements/${id}/dependencies`);

  const can = (p: string) => !!user?.permissions.includes(p as never);

  /** mappa attività-successore → titoli predecessori (per i tag "dopo X"). */
  const depBySuccessor = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of deps.data?.items ?? []) {
      const arr = m.get(d.successorId) ?? [];
      if (d.predecessorTitle) arr.push(d.predecessorTitle);
      m.set(d.successorId, arr);
    }
    return m;
  }, [deps.data]);

  const [view, setView] = useState<View>('tree');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [phaseModal, setPhaseModal] = useState<{ editing: PhaseDto | null } | null>(null);
  const [actModal, setActModal] = useState<{ editing: ActivityDto | null; presetPhaseId?: string } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'phase' | 'activity'; id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const phaseList = phases.data?.items ?? [];
  const actList = acts.data?.items ?? [];

  const childPhases = (parentId: string | null) =>
    phaseList.filter((p) => (p.parentPhaseId ?? null) === parentId).sort((a, b) => a.seq - b.seq);
  const phaseActs = (phaseId: string) =>
    actList.filter((a) => a.phaseId === phaseId).sort((a, b) => a.title.localeCompare(b.title));
  const rootActs = actList.filter((a) => !a.phaseId);
  const phaseName = (pid: string | null) => (pid ? phaseList.find((p) => p.id === pid)?.name ?? null : null);

  /** tutte le attività discendenti (anche nelle sotto-fasi) — per il rollup. */
  function descendantActs(phaseId: string): ActivityDto[] {
    let out = phaseActs(phaseId);
    for (const sub of childPhases(phaseId)) out = out.concat(descendantActs(sub.id));
    return out;
  }
  function rollup(phaseId: string): string {
    const a = descendantActs(phaseId);
    const done = a.filter((x) => x.statusCanonical === 'done').length;
    const min = a.reduce((s, x) => s + (x.estimatedMinutes ?? 0), 0);
    const h = min ? ` · ${Math.round(min / 60)}h` : '';
    return `${done}/${a.length}${h}`;
  }

  const totalDone = actList.filter((a) => a.statusCanonical === 'done').length;

  function reloadTree() { void phases.reload(); void acts.reload(); void sched.reload(); }
  function toggle(pid: string) {
    setCollapsed((s) => { const n = new Set(s); n.has(pid) ? n.delete(pid) : n.add(pid); return n; });
  }

  async function doDelete() {
    if (!confirm) return;
    setBusy(true);
    try {
      await mutate('DELETE', confirm.kind === 'phase' ? `/phases/${confirm.id}` : `/activities/${confirm.id}`);
      toast(confirm.kind === 'phase' ? 'Fase eliminata' : 'Attività eliminata');
      setConfirm(null);
      reloadTree();
    } catch (e) {
      toast((e as Error).message || 'Impossibile eliminare', 'error');
      setConfirm(null);
    } finally { setBusy(false); }
  }

  /** righe dell'albero, appiattite con indentazione per profondità. */
  const rows = useMemo(() => {
    const out: JSX.Element[] = [];
    const pad = (depth: number) => ({ paddingLeft: 16 + depth * 24 });

    function walkPhase(p: PhaseDto, depth: number) {
      const subs = childPhases(p.id);
      const directActs = phaseActs(p.id);
      const hasChildren = subs.length + directActs.length > 0;
      const open = !collapsed.has(p.id);
      out.push(
        <div className="tnode" key={`p_${p.id}`}>
          <div className="trow" style={pad(depth)} onClick={() => hasChildren && toggle(p.id)}>
            <span className="chev">
              {hasChildren ? (open ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : null}
            </span>
            <span className="ticon" style={{ background: 'var(--brand-wash)', color: 'var(--brand)' }}><Folder size={15} /></span>
            <span className="ttl">{p.name}</span>
            <span className="tmeta" onClick={(e) => e.stopPropagation()}>
              <span className="roll">{rollup(p.id)}</span>
              <StatusPill label={lk.labelOf(p.statusId) || (p.statusCanonical ?? '')} token={lk.byId(p.statusId)?.colorToken} />
              <span className="tacts">
                {can('activity:create') && (
                  <button className="act-icon" title="Aggiungi attività" onClick={() => setActModal({ editing: null, presetPhaseId: p.id })}><Plus size={16} /></button>
                )}
                {can('phase:update') && (
                  <button className="act-icon" title="Modifica fase" onClick={() => setPhaseModal({ editing: p })}><Pencil size={15} /></button>
                )}
                {can('phase:delete') && (
                  <button className="act-icon danger" title="Elimina fase" onClick={() => setConfirm({ kind: 'phase', id: p.id, name: p.name })}><Trash2 size={15} /></button>
                )}
              </span>
            </span>
          </div>
        </div>,
      );
      if (open) {
        for (const s of subs) walkPhase(s, depth + 1);
        for (const a of directActs) walkActivity(a, depth + 1);
      }
    }

    function walkActivity(a: ActivityDto, depth: number) {
      out.push(
        <div className="tnode" key={`a_${a.id}`}>
          <div className="trow leaf" style={pad(depth)} onClick={() => history.push(`/activities/${a.id}`)}>
            <span className="chev" />
            <span className="ticon" style={{ background: 'transparent', color: 'var(--ink-faint)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', display: 'block' }} />
            </span>
            <span className="ttl">{a.title}</span>
            <span className="tmeta" onClick={(e) => e.stopPropagation()}>
              {(() => { const pre = depBySuccessor.get(a.id); return pre && pre.length
                ? <span className="tdep" title={pre.join(', ')}><ArrowRight size={13} />dopo {pre.length === 1 ? pre[0] : `${pre.length} attività`}</span>
                : null; })()}
              {a.isFixed && <span className="tdep"><Pin size={13} />fissa</span>}
              <span className="roll">{hoursLabel(a.estimatedMinutes, a.isFixed)}</span>
              <StatusPill label={lk.labelOf(a.statusId) || (a.statusCanonical ?? '')} token={lk.byId(a.statusId)?.colorToken} />
              <span className="tacts">
                {can('activity:update') && (
                  <button className="act-icon" title="Modifica attività" onClick={() => setActModal({ editing: a })}><Pencil size={15} /></button>
                )}
                {can('activity:delete') && (
                  <button className="act-icon danger" title="Elimina attività" onClick={() => setConfirm({ kind: 'activity', id: a.id, name: a.title })}><Trash2 size={15} /></button>
                )}
              </span>
            </span>
          </div>
        </div>,
      );
    }

    for (const p of childPhases(null)) walkPhase(p, 0);
    for (const a of rootActs) walkActivity(a, 0);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseList, actList, collapsed, lk, depBySuccessor]);

  return (
    <Page title={eng.data ? eng.data.code : 'Commessa'} back="/engagements">
      {eng.loading && <Loading />}
      {eng.error && <ErrorBox message={eng.error} />}
      {eng.data && (
        <>
          <div className="detail-head">
            <span className="code">{eng.data.code}</span>{' '}
            <span className="pill" style={{ color: 'var(--brand-ink)', background: 'var(--brand-wash)' }}>
              <span className="dot" />{eng.data.type === 'build' ? 'Realizzazione' : 'Manutenzione'}
            </span>
            <h1>{eng.data.title}</h1>
            <div className="sub" style={{ color: 'var(--ink-soft)', fontSize: 14 }}>Struttura del progetto · fasi, sotto-fasi e attività</div>
            <div className="kv">
              {eng.data.companyName && <div><div className="k">Cliente</div><div className="v">{eng.data.companyName}</div></div>}
              <div><div className="k">Stato</div><div className="v"><StatusPill label={lk.labelOf(eng.data.statusId) || (eng.data.statusCanonical ?? '')} token={lk.byId(eng.data.statusId)?.colorToken} /></div></div>
              <div><div className="k">Avanzamento</div><div className="v mono">{totalDone} / {actList.length} attività</div></div>
            </div>
          </div>

          <div className="toolbar">
            <div className="seg">
              <button className={view === 'tree' ? 'on' : ''} onClick={() => setView('tree')}><ListTree size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} />Albero</button>
              <button className={view === 'gantt' ? 'on' : ''} onClick={() => setView('gantt')}><GanttChartSquare size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} />Gantt</button>
              <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}><List size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} />Lista</button>
            </div>
            <span className="spacer" />
            {can('phase:create') && (
              <button className="btn btn-primary btn-sm" onClick={() => setPhaseModal({ editing: null })}>
                <Plus size={16} /> Aggiungi fase
              </button>
            )}
          </div>

          {(phases.loading || acts.loading) ? <Loading /> : (
            phaseList.length + actList.length === 0
              ? <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--ink-soft)' }}>
                  Nessuna fase o attività. {can('phase:create') && 'Inizia con “Aggiungi fase”.'}
                </div>
              : view === 'tree' ? (
                <>
                  <div className="treeview">{rows}</div>
                  <p className="faint" style={{ fontSize: 13, marginTop: 12, color: 'var(--ink-faint)' }}>
                    Le <b>fasi</b> si annidano (ramo → sotto-ramo); solo le <b>attività</b> (foglie) portano ore, risorse e materiali. In hover su ogni nodo: aggiungi · modifica · elimina.
                  </p>
                </>
              ) : view === 'list' ? (
                <ListView acts={actList} phaseName={phaseName} lk={lk} onOpen={(aid) => history.push(`/activities/${aid}`)} />
              ) : (
                <GanttView items={sched.data?.items ?? []} loading={sched.loading} />
              )
          )}
        </>
      )}

      {phaseModal && (
        <PhaseModal
          open engagementId={id} editing={phaseModal.editing}
          phases={phaseList} nextSeq={childPhases(phaseModal.editing?.parentPhaseId ?? null).length + 1}
          statusOptions={lk.byCategory('phase_status')}
          onClose={() => setPhaseModal(null)}
          onSaved={() => { setPhaseModal(null); reloadTree(); }}
        />
      )}
      {actModal && (
        <ActivityModal
          open engagementId={id} editing={actModal.editing} presetPhaseId={actModal.presetPhaseId}
          phases={phaseList} statusOptions={lk.byCategory('activity_status')}
          onClose={() => setActModal(null)}
          onSaved={() => { setActModal(null); reloadTree(); }}
        />
      )}

      <ConfirmDialog
        open={!!confirm} danger
        title={confirm?.kind === 'phase' ? 'Eliminare la fase?' : 'Eliminare l\'attività?'}
        message={confirm?.kind === 'phase'
          ? `“${confirm?.name}” e le sue sotto-fasi verranno eliminate. Le attività collegate restano (scollegate dalla fase).`
          : `“${confirm?.name}” verrà eliminata.`}
        confirmLabel="Elimina" busy={busy}
        onConfirm={doDelete} onCancel={() => setConfirm(null)}
      />
    </Page>
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

  // niente sotto-albero di sé stessa come genitore (evita cicli)
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
        <IonButton expand="block" style={{ marginTop: 16 }} disabled={busy} onClick={submit}>
          {busy ? <IonSpinner name="crescent" /> : (editing ? 'Salva' : 'Crea fase')}
        </IonButton>
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
        <IonButton expand="block" style={{ marginTop: 16 }} disabled={busy} onClick={submit}>
          {busy ? <IonSpinner name="crescent" /> : (editing ? 'Salva' : 'Crea attività')}
        </IonButton>
      </IonContent>
    </IonModal>
  );
}

/* ── Vista LISTA: tabella piatta delle attività ───────────────────────── */
interface LkApi { labelOf: (id: string | null | undefined) => string; byId: (id: string | null | undefined) => LookupDto | undefined }
function ListView({ acts, phaseName, lk, onOpen }: {
  acts: ActivityDto[]; phaseName: (pid: string | null) => string | null; lk: LkApi; onOpen: (id: string) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="t">
        <thead><tr><th>Attività</th><th>Fase</th><th>Durata</th><th>Pianificazione</th><th>Stato</th></tr></thead>
        <tbody>
          {acts.map((a) => (
            <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(a.id)}>
              <td className="cellname">{a.title}</td>
              <td className="cellsub">{phaseName(a.phaseId) ?? '—'}</td>
              <td><span className="mono">{hoursLabel(a.estimatedMinutes, a.isFixed)}</span></td>
              <td>{a.isFixed ? <span className="tdep"><Pin size={13} />{fmtDt(a.scheduledStart)}</span> : <span className="chip">dinamica</span>}</td>
              <td><StatusPill label={lk.labelOf(a.statusId) || (a.statusCanonical ?? '')} token={lk.byId(a.statusId)?.colorToken} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
      <div className="faint" style={{ fontSize: 12.5, color: 'var(--ink-faint)', marginBottom: 12 }}>
        Dal <b>{dayFmt(min)}</b> al <b>{dayFmt(max)}</b> · le dinamiche fluiscono attorno alle fisse.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((s) => {
          const has = s.start && s.end;
          const left = has ? ((new Date(s.start!).getTime() - min) / span) * 100 : 0;
          const width = has ? Math.max(((new Date(s.end!).getTime() - new Date(s.start!).getTime()) / span) * 100, 2) : 0;
          return (
            <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.title}>{s.title}</div>
              <div style={{ position: 'relative', height: 24, background: 'var(--line-2)', borderRadius: 6 }}>
                {has ? (
                  <div title={`${fmtDt(s.start)} → ${fmtDt(s.end)}`} style={{
                    position: 'absolute', left: `${left}%`, width: `${width}%`, top: 3, bottom: 3,
                    borderRadius: 5, background: s.fixed ? 'var(--brand)' : 'var(--flow)',
                    border: s.conflict !== 'none' ? '2px solid var(--danger)' : 'none',
                  }} />
                ) : (
                  <span style={{ position: 'absolute', left: 8, top: 3, fontSize: 12, color: 'var(--danger)' }}>non collocabile</span>
                )}
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
