import { useState, type CSSProperties } from 'react';
import {
  IonButton, IonItem, IonLabel, IonList, IonSelect, IonSelectOption, IonTextarea,
  IonSpinner, IonText, IonNote, IonCheckbox, IonChip, IonIcon,
} from '@ionic/react';
import {
  sparklesOutline, micOutline, stopCircleOutline, timeOutline, cubeOutline,
  flagOutline, checkboxOutline, helpCircleOutline,
} from 'ionicons/icons';
import { OPERATION_LABEL, type CaptureDto, type ProposedOperation, type OperationType, type EngagementDto } from '@sisuite/shared';
import { Page, Loading, Empty } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
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

const OP_ICON: Record<OperationType, string> = {
  log_time: timeOutline,
  log_material: cubeOutline,
  set_activity_status: flagOutline,
  check_checklist_item: checkboxOutline,
  clarify: helpCircleOutline,
};

function OperationRow({ op, index, checked, onToggle }:
  { op: ProposedOperation; index: number; checked: boolean; onToggle: (i: number) => void }) {
  const selectable = op.valid && op.type !== 'clarify';
  return (
    <div className="prop-row">
      {selectable
        ? <IonCheckbox checked={checked} onIonChange={() => onToggle(index)} />
        : <div style={{ width: 22 }} />}
      <div className="prop-ico" style={op.type === 'clarify' ? { background: 'var(--warning-wash)', color: 'var(--warning)' } : undefined}>
        <IonIcon icon={OP_ICON[op.type]} />
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

export function CapturePage() {
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
    setRawText(cap.rawText);
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
    <Page title="Catture">
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
          <IonButton style={{ flex: 1 }} disabled={busy || processing || !rawText.trim() || voice.recording} onClick={submit}>
            {busy ? <IonSpinner name="crescent" /> : <><IonIcon slot="start" icon={sparklesOutline} />Estrai</>}
          </IonButton>
          {voice.audioSupported && (
            <IonButton color={voice.recording ? 'danger' : 'secondary'} disabled={busy || processing} onClick={handleVoice}>
              <IonIcon slot="icon-only" icon={voice.recording ? stopCircleOutline : micOutline} />
            </IonButton>
          )}
        </div>
        {voice.recording && (
          <IonNote style={{ display: 'block', marginTop: 8 }}>
            🔴 Registrazione… {voice.sttSupported ? (voice.transcript || 'parla pure') : '(trascrizione non supportata dal browser; salvo l\'audio)'}
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
                  <div className="spark"><IonIcon icon={sparklesOutline} /></div>
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

      <h3 style={{ fontFamily: 'var(--font-display)', marginTop: 22 }}>Storico catture</h3>
      {inbox.loading ? <Loading /> : (inbox.data?.items.length ? (
        <IonList>
          {inbox.data.items.map((c) => {
            const s = STATUS_LABEL[c.status] ?? STATUS_LABEL.pending;
            return (
              <IonItem key={c.id} button onClick={() => openCapture(c.id)}>
                <IonLabel className="ion-text-wrap">
                  <h2 style={{ fontSize: 15 }}>{c.rawText}</h2>
                  <p><IonNote>{new Date(c.createdAt).toLocaleString('it-IT')}</IonNote></p>
                </IonLabel>
                <StatusPill label={s!.label} token={s!.token} />
              </IonItem>
            );
          })}
        </IonList>
      ) : <Empty text="Nessuna cattura ancora." />)}
    </Page>
  );
}
