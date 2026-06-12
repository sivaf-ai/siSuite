import { useState } from 'react';
import { useParams } from 'react-router';
import {
  IonButton, IonIcon, IonItem, IonLabel, IonList, IonModal, IonInput, IonSelect, IonSelectOption,
  IonHeader, IonToolbar, IonTitle, IonButtons, IonContent, IonText, IonSpinner, IonChip, IonNote,
} from '@ionic/react';
import { addOutline } from 'ionicons/icons';
import type { EngagementDto, PhaseDto, ActivityDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox, Empty } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { useApi, mutate } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { useLookups } from '../context/Lookups';

interface ScheduleItem { id: string; title: string; fixed: boolean; start: string | null; end: string | null; conflict: string }

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function CommessaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const lk = useLookups();
  const eng = useApi<EngagementDto>(`/engagements/${id}`);
  const phases = useApi<{ items: PhaseDto[] }>(`/engagements/${id}/phases`);
  const acts = useApi<{ items: ActivityDto[] }>(`/activities?engagementId=${id}`);
  const sched = useApi<{ items: ScheduleItem[]; conflicts: ScheduleItem[] }>(`/engagements/${id}/schedule`);
  const [openAct, setOpenAct] = useState(false);
  const [openPhase, setOpenPhase] = useState(false);

  const canActivity = !!user?.permissions.includes('activity:create');
  const canPhase = !!user?.permissions.includes('phase:create');

  function reloadAll() { void acts.reload(); void sched.reload(); }

  return (
    <Page title={eng.data ? eng.data.code : 'Commessa'} back="/engagements"
      action={canActivity && <IonButton onClick={() => setOpenAct(true)}><IonIcon slot="start" icon={addOutline} />Attività</IonButton>}>
      {eng.loading && <Loading />}
      {eng.error && <ErrorBox message={eng.error} />}
      {eng.data && (
        <>
          <div className="detail-head">
            <span className="code">{eng.data.code}</span>
            <h1>{eng.data.title}</h1>
            <div className="kv">
              <div>
                <div className="k">Tipo</div>
                <div className="v">{eng.data.type === 'build' ? 'Realizzazione' : 'Manutenzione'}</div>
              </div>
              {eng.data.companyName && (
                <div><div className="k">Cliente</div><div className="v">{eng.data.companyName}</div></div>
              )}
              <div>
                <div className="k">Stato</div>
                <div className="v"><StatusPill label={lk.labelOf(eng.data.statusId) || (eng.data.statusCanonical ?? '')} token={lk.byId(eng.data.statusId)?.colorToken} /></div>
              </div>
            </div>
          </div>

          {/* Fasi */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
            <h3 style={{ fontFamily: 'var(--font-display)' }}>Fasi</h3>
            {canPhase && <IonButton size="small" fill="clear" onClick={() => setOpenPhase(true)}>+ Fase</IonButton>}
          </div>
          {phases.data?.items.length ? (
            <IonList>{phases.data.items.map((p) => (
              <IonItem key={p.id}><IonLabel><h2>{p.seq}. {p.name}</h2></IonLabel>
                <StatusPill label={lk.labelOf(p.statusId) || (p.statusCanonical ?? '')} token={lk.byId(p.statusId)?.colorToken} /></IonItem>
            ))}</IonList>
          ) : <Empty text="Nessuna fase." />}

          {/* Attività */}
          <h3 style={{ fontFamily: 'var(--font-display)', marginTop: 18 }}>Attività</h3>
          {acts.loading ? <Loading /> : acts.data?.items.length ? (
            <IonList>{acts.data.items.map((a) => (
              <IonItem key={a.id} routerLink={`/activities/${a.id}`} detail>
                <IonLabel>
                  <h2>{a.title}</h2>
                  <p>{a.isFixed ? `Fissa · ${fmt(a.scheduledStart)}` : `Dinamica${a.estimatedMinutes ? ` · ${a.estimatedMinutes} min` : ''}`}</p>
                </IonLabel>
                <StatusPill label={lk.labelOf(a.statusId) || (a.statusCanonical ?? '')} token={lk.byId(a.statusId)?.colorToken} />
              </IonItem>
            ))}</IonList>
          ) : <Empty text="Nessuna attività." />}

          {/* Agenda calcolata (motore di flusso) */}
          <h3 style={{ fontFamily: 'var(--font-display)', marginTop: 18 }}>Agenda calcolata</h3>
          <IonNote>Le dinamiche fluiscono da oggi dentro l'orario di lavoro, attorno alle fisse.</IonNote>
          {sched.loading ? <Loading /> : sched.data?.items.length ? (
            <IonList>{sched.data.items.map((s) => (
              <IonItem key={s.id}>
                <IonLabel>
                  <h2>{s.title} {s.fixed && <IonChip color="medium" style={{ height: 18 }}>fissa</IonChip>}</h2>
                  <p>{s.start ? `${fmt(s.start)} → ${fmt(s.end)}` : 'Non collocabile'}</p>
                </IonLabel>
                {s.conflict !== 'none' && <StatusPill label={s.conflict === 'due_by_missed' ? 'scadenza' : 'no slot'} token="danger" />}
              </IonItem>
            ))}</IonList>
          ) : <Empty text="Nessuna attività da pianificare." />}
        </>
      )}

      <CreateActivityModal open={openAct} engagementId={id} phases={phases.data?.items ?? []}
        onClose={() => setOpenAct(false)} onCreated={() => { setOpenAct(false); reloadAll(); }} />
      <CreatePhaseModal open={openPhase} engagementId={id} nextSeq={(phases.data?.items.length ?? 0) + 1}
        onClose={() => setOpenPhase(false)} onCreated={() => { setOpenPhase(false); void phases.reload(); }} />
    </Page>
  );
}

function CreateActivityModal({ open, engagementId, phases, onClose, onCreated }:
  { open: boolean; engagementId: string; phases: PhaseDto[]; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [phaseId, setPhaseId] = useState<string>('');
  const [estimatedMinutes, setEst] = useState<string>('120');
  const [scheduledStart, setStart] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) { setErr('Titolo obbligatorio'); return; }
    setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = { engagementId, title: title.trim() };
      if (phaseId) body.phaseId = phaseId;
      if (estimatedMinutes) body.estimatedMinutes = Number(estimatedMinutes);
      if (scheduledStart) body.scheduledStart = new Date(scheduledStart).toISOString();
      await mutate('POST', '/activities', body);
      setTitle(''); setStart('');
      onCreated();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <IonModal isOpen={open} onDidDismiss={onClose}>
      <IonHeader><IonToolbar><IonTitle>Nuova attività</IonTitle>
        <IonButtons slot="end"><IonButton onClick={onClose}>Chiudi</IonButton></IonButtons></IonToolbar></IonHeader>
      <IonContent className="ion-padding">
        <IonList>
          <IonItem><IonInput label="Titolo" labelPlacement="stacked" value={title} onIonInput={(e) => setTitle(e.detail.value ?? '')} /></IonItem>
          <IonItem><IonSelect label="Fase (opzionale)" labelPlacement="stacked" value={phaseId} onIonChange={(e) => setPhaseId(e.detail.value)}>
            <IonSelectOption value="">—</IonSelectOption>
            {phases.map((p) => <IonSelectOption key={p.id} value={p.id}>{p.name}</IonSelectOption>)}
          </IonSelect></IonItem>
          <IonItem><IonInput type="number" label="Durata stimata (min)" labelPlacement="stacked" value={estimatedMinutes} onIonInput={(e) => setEst(e.detail.value ?? '')} /></IonItem>
          <IonItem><IonInput type="datetime-local" label="Inizio fisso (vuoto = dinamica)" labelPlacement="stacked" value={scheduledStart} onIonInput={(e) => setStart(e.detail.value ?? '')} /></IonItem>
        </IonList>
        {err && <IonText color="danger"><p>{err}</p></IonText>}
        <IonButton expand="block" style={{ marginTop: 16 }} disabled={busy} onClick={submit}>{busy ? <IonSpinner name="crescent" /> : 'Crea attività'}</IonButton>
      </IonContent>
    </IonModal>
  );
}

function CreatePhaseModal({ open, engagementId, nextSeq, onClose, onCreated }:
  { open: boolean; engagementId: string; nextSeq: number; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit() {
    if (!name.trim()) { setErr('Nome obbligatorio'); return; }
    setBusy(true); setErr(null);
    try { await mutate('POST', '/phases', { engagementId, name: name.trim(), seq: nextSeq }); setName(''); onCreated(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <IonModal isOpen={open} onDidDismiss={onClose}>
      <IonHeader><IonToolbar><IonTitle>Nuova fase</IonTitle>
        <IonButtons slot="end"><IonButton onClick={onClose}>Chiudi</IonButton></IonButtons></IonToolbar></IonHeader>
      <IonContent className="ion-padding">
        <IonList><IonItem><IonInput label="Nome fase" labelPlacement="stacked" value={name} onIonInput={(e) => setName(e.detail.value ?? '')} /></IonItem></IonList>
        {err && <IonText color="danger"><p>{err}</p></IonText>}
        <IonButton expand="block" style={{ marginTop: 16 }} disabled={busy} onClick={submit}>{busy ? <IonSpinner name="crescent" /> : 'Crea fase'}</IonButton>
      </IonContent>
    </IonModal>
  );
}
