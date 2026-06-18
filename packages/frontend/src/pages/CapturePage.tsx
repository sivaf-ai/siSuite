import { useState, type CSSProperties } from 'react';
import {
  IonButton, IonItem, IonSelect, IonSelectOption, IonTextarea,
  IonSpinner, IonText, IonNote, IonCheckbox,
} from '@ionic/react';
import {
  Sparkles, Mic, StopCircle, Clock, Package, Flag, CheckSquare, HelpCircle, type LucideIcon,
} from 'lucide-react';
import { OPERATION_LABEL, type CaptureDto, type ProposedOperation, type OperationType, type EngagementDto } from '@sisuite/shared';
import { Page, Empty } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { EntityList, type ListColumn, type ListView } from '../ui/EntityList';
import { useApi, mutate } from '../api/hooks';
import { apiFetch, apiUpload } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useVoiceCapture } from '../voice/useVoiceCapture';

const STATUS_LABEL: Record<string, { label: string; token: string }> = {
  pending: { label: 'In attesa', token: 'neutral' },
  proposed: { label: 'Proposta', token: 'info' },
  applied: { label: 'Applicata', token: 'success' },
  rejected: { label: 'Rifiutata', token: 'danger' },
};

function opDetail(op: ProposedOperation): string {
  switch (op.type) {
    case 'log_time': return `${op.minutes ?? '?'} min · ${op.typology ?? '?'}`;
    case 'log_material': return `${op.quantity ?? '?'} ${op.unit ?? ''} · ${op.materialName ?? '?'}`;
    case 'set_activity_status': return `→ ${op.statusCanonical ?? '?'}`;
    case 'check_checklist_item': return `“${op.checklistText ?? ''}” ${op.done ? '✓' : ''}`;
    case 'clarify': return op.rationale;
    default: return '';
  }
}

const OP_ICON: Record<OperationType, LucideIcon> = {
  log_time: Clock,
  log_material: Package,
  set_activity_status: Flag,
  check_checklist_item: CheckSquare,
  clarify: HelpCircle,
};

function OperationRow({ op, index, checked, onToggle }:
  { op: ProposedOperation; index: number; checked: boolean; onToggle: (i: number) => void }) {
  const selectable = op.valid && op.type !== 'clarify';
  const OpIcon = OP_ICON[op.type];
  return (
    <div className="prop-row">
      {selectable
        ? <IonCheckbox checked={checked} onIonChange={() => onToggle(index)} />
        : <div style={{ width: 22 }} />}
      <div className="prop-ico" style={op.type === 'clarify' ? { background: 'var(--warning-wash)', color: 'var(--warning)' } : undefined}>
        <OpIcon size={17} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="k">{OPERATION_LABEL[op.type]}{op.activityTitle ? ` · ${op.activityTitle}` : ''}</div>
        <div className="v">{opDetail(op)}</div>
        {!op.valid && op.type !== 'clarify' && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 2 }}>{op.reason}</div>}
        {op.applied && <span className="pill" style={{ color: 'var(--success)', background: 'var(--success-wash)', marginTop: 4 }}><span className="dot" />applicata</span>}
      </div>
      {op.type !== 'clarify' && (
        <div className={`conf${op.confidence < 0.85 ? ' low' : ''}`}>{(op.confidence * 100).toFixed(0)}%</div>
      )}
    </div>
  );
}

/** Pagina desktop (con header). Sul mobile si usa <CaptureContent/> nudo nella cornice. */
export function CapturePage() {
  return <Page title="Catture"><CaptureContent /></Page>;
}

export function CaptureContent() {
  const { user } = useAuth();
  const canApply = !!user?.permissions.includes('capture:apply');
  const engagements = useApi<{ items: EngagementDto[] }>('/engagements');
  const inbox = useApi<{ items: CaptureDto[] }>('/captures');

  const [rawText, setRawText] = useState('');
  const [engagementId, setEngagementId] = useState('');
  const [current, setCurrent] = useState<CaptureDto | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [histView, setHistView] = useState<string>('all');
  const [histQ, setHistQ] = useState('');
  const voice = useVoiceCapture();

  function loadProposal(cap: CaptureDto) {
    setCurrent(cap);
    setSelected(new Set(cap.operations.map((o, i) => (o.autoApplicable ? i : -1)).filter((i) => i >= 0)));
  }

  async function submit() {
    if (!rawText.trim()) return;
    setBusy(true); setErr(null); setCurrent(null);
    try {
      const body: Record<string, unknown> = { rawText: rawText.trim(), channel: 'text' };
      if (engagementId) body.engagementId = engagementId;
      const cap = await mutate<CaptureDto>('POST', '/captures', body);
      loadProposal(cap);
      void inbox.reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  function toggle(i: number) {
    setSelected((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }

  async function apply() {
    if (!current) return;
    setBusy(true); setErr(null);
    try {
      const res = await mutate<CaptureDto>('POST', `/captures/${current.id}/apply`, { operationIndexes: [...selected] });
      setCurrent(res);
      void inbox.reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function openCapture(id: string) {
    const cap = await apiFetch<CaptureDto>(`/captures/${id}`);
    setRawText(cap.rawText ?? '');
    loadProposal(cap);
  }

  // attende che il worker async abbia elaborato la cattura vocale
  async function pollCapture(id: string) {
    setProcessing(true);
    try {
      for (let i = 0; i < 20; i++) {
        const cap = await apiFetch<CaptureDto>(`/captures/${id}`);
        if (cap.status !== 'pending' || cap.operations.length > 0) { loadProposal(cap); return; }
        await new Promise((r) => setTimeout(r, 1500));
      }
      loadProposal(await apiFetch<CaptureDto>(`/captures/${id}`));
    } finally { setProcessing(false); }
  }

  async function handleVoice() {
    setErr(null);
    if (voice.recording) {
      try {
        const { blob, transcript } = await voice.stop();
        setRawText(transcript);
        const form = new FormData();
        form.append('audio', blob, 'capture.webm');
        form.append('transcript', transcript);
        if (engagementId) form.append('engagementId', engagementId);
        const cap = await apiUpload<CaptureDto>('/captures/voice', form);
        setCurrent(null);
        void inbox.reload();
        await pollCapture(cap.id);
      } catch (e) { setErr((e as Error).message); }
    } else {
      try { await voice.start(); } catch { setErr('Microfono non disponibile o permesso negato.'); }
    }
  }

  const proposable = current?.operations.filter((o) => o.valid && o.type !== 'clarify').length ?? 0;

  return (
    <>
      <IonNote>Racconta in linguaggio naturale: l'AI propone le operazioni, tu confermi.</IonNote>

      <div className="card" style={{ padding: 14, borderRadius: 'var(--r-lg)', marginTop: 10 }}>
        <IonTextarea
          label="Cosa hai fatto?" labelPlacement="stacked" autoGrow rows={3}
          placeholder="Es: ho lavorato 2 ore sulla raccolta requisiti e usato una licenza server"
          value={rawText} onIonInput={(e) => setRawText(e.detail.value ?? '')}
        />
        <IonItem lines="none" style={{ '--padding-start': '0' } as CSSProperties}>
          <IonSelect label="Commessa (opzionale)" labelPlacement="stacked" value={engagementId} onIonChange={(e) => setEngagementId(e.detail.value)}>
            <IonSelectOption value="">Tutte</IonSelectOption>
            {(engagements.data?.items ?? []).map((e) => <IonSelectOption key={e.id} value={e.id}>{e.code} · {e.title}</IonSelectOption>)}
          </IonSelect>
        </IonItem>
        <div style={{ display: 'flex', gap: 8 }}>
          <IonButton style={{ flex: 1 }} disabled={busy || processing || !(rawText ?? '').trim() || voice.recording} onClick={submit}>
            {busy ? <IonSpinner name="crescent" /> : <><Sparkles size={17} style={{ marginRight: 6 }} />Estrai</>}
          </IonButton>
          {voice.audioSupported && (
            <IonButton color={voice.recording ? 'danger' : 'secondary'} disabled={busy || processing} onClick={handleVoice}>
              {voice.recording ? <StopCircle size={20} /> : <Mic size={20} />}
            </IonButton>
          )}
        </div>
        {voice.recording && (
          <IonNote style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', display: 'inline-block' }} />
            Registrazione… {voice.sttSupported ? (voice.transcript || 'parla pure') : '(trascrizione non supportata dal browser; salvo l\'audio)'}
          </IonNote>
        )}
        {processing && <IonNote style={{ display: 'block', marginTop: 8 }}><IonSpinner name="dots" style={{ height: 14, verticalAlign: 'middle' }} /> elaborazione della voce in corso…</IonNote>}
        {err && <IonText color="danger"><p>{err}</p></IonText>}
      </div>

      {current && (
        <div style={{ marginTop: 18 }}>
          {current.note && <IonText color="medium"><p>{current.note}</p></IonText>}
          {current.operations.length > 0 ? (
            <>
              <div className="prop-card">
                <div className="prop-head">
                  <div className="spark"><Sparkles size={16} /></div>
                  <b>Proposta AI</b>
                </div>
                {current.operations.map((op, i) => (
                  <OperationRow key={i} op={op} index={i} checked={selected.has(i)} onToggle={toggle} />
                ))}
              </div>
              {canApply && proposable > 0 && current.status !== 'applied' && (
                <IonButton expand="block" disabled={busy || selected.size === 0} onClick={apply}>
                  {busy ? <IonSpinner name="crescent" /> : `Applica ${selected.size} operazion${selected.size === 1 ? 'e' : 'i'}`}
                </IonButton>
              )}
              {!canApply && <IonNote>Per applicare serve il permesso capture:apply.</IonNote>}
              {current.status === 'applied' && <IonText color="success"><p>Cattura applicata.</p></IonText>}
            </>
          ) : !current.note && <Empty text="Nessuna operazione estratta." />}
        </div>
      )}

      <div style={{ marginTop: 22 }}>
        <CaptureHistory items={inbox.data?.items ?? []} loading={inbox.loading} error={inbox.error}
          view={histView} onView={setHistView} q={histQ} onQ={setHistQ} onOpen={openCapture} />
      </div>
    </>
  );
}

/** Storico catture su EntityList v2: viste per stato (filtro client-side), righe
 *  pulite senza icone-azione, click riga → riapre la proposta. */
function CaptureHistory({ items, loading, error, view, onView, q, onQ, onOpen }: {
  items: CaptureDto[]; loading: boolean; error: string | null;
  view: string; onView: (k: string) => void; q: string; onQ: (v: string) => void; onOpen: (id: string) => void;
}) {
  const counts = items.reduce((m, c) => { m.all = (m.all ?? 0) + 1; m[c.status] = (m[c.status] ?? 0) + 1; return m; }, {} as Record<string, number>);
  const VIEWS: { key: string; label: string }[] = [
    { key: 'all', label: 'Tutte' }, { key: 'pending', label: 'In attesa' }, { key: 'proposed', label: 'Proposte' },
    { key: 'applied', label: 'Applicate' }, { key: 'rejected', label: 'Rifiutate' },
  ];
  const views: ListView[] = VIEWS.map((v) => ({ key: v.key, label: v.label, count: counts[v.key] ?? 0 }));
  const ql = q.trim().toLowerCase();
  const rows = items.filter((c) => (view === 'all' || c.status === view) && (!ql || (c.rawText ?? '').toLowerCase().includes(ql)));

  const columns: ListColumn<CaptureDto>[] = [
    { key: 'text', header: 'Cattura', sub: 'testo', render: (c) => (
      <div className="two"><span className="a" style={{ whiteSpace: 'normal' }}>{c.rawText || '—'}</span><span className="b">{c.operations?.length ? `${c.operations.length} operazioni proposte` : ''}</span></div>) },
    { key: 'when', header: 'Quando', num: true, render: (c) => <span className="mono faint">{new Date(c.createdAt).toLocaleString('it-IT')}</span> },
    { key: 'status', header: 'Stato', render: (c) => { const s = STATUS_LABEL[c.status] ?? STATUS_LABEL.pending!; return <StatusPill label={s.label} token={s.token} />; } },
  ];

  return (
    <EntityList<CaptureDto>
      selectable={false}
      title="Storico catture" subtitle="Catture in linguaggio naturale e loro stato"
      views={views} activeView={view} onView={onView}
      search={q} onSearch={onQ} searchPlaceholder="Cerca nel testo della cattura…"
      columns={columns} rows={rows} loading={loading} error={error}
      onRowClick={(c) => onOpen(c.id)}
      emptyText="Nessuna cattura in questa vista."
    />
  );
}
