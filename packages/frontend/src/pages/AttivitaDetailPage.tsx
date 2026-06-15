import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import {
  IonList, IonItem, IonLabel, IonCheckbox, IonButton, IonSelect, IonSelectOption, IonInput,
  IonChip, IonNote, IonSpinner, IonText,
} from '@ionic/react';
import type { ActivityDto, ActivityResourceDto, TimeEntryDto, ConsumptionDto, MaterialDto, ResourceDto, DependencyEdgeDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox, Empty } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { useApi, mutate } from '../api/hooks';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { hhmm } from '../lib/time';
import { useLookups } from '../context/Lookups';

type ActivityDetail = ActivityDto & { resources: ActivityResourceDto[] };

export function AttivitaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const lk = useLookups();
  const act = useApi<ActivityDetail>(`/activities/${id}`);
  const [checklist, setChecklist] = useState<{ text: string; done: boolean }[]>([]);
  const [savingCk, setSavingCk] = useState(false);

  useEffect(() => { if (act.data) setChecklist(act.data.checklist); }, [act.data]);

  const canUpdate = !!user?.permissions.includes('activity:update');
  const statuses = lk.byCategory('activity_status');

  async function toggle(i: number) {
    const next = checklist.map((c, j) => (j === i ? { ...c, done: !c.done } : c));
    setChecklist(next);
    setSavingCk(true);
    try { await mutate('PATCH', `/activities/${id}/checklist`, { checklist: next }); } finally { setSavingCk(false); }
  }
  async function changeStatus(statusId: string) {
    await mutate('PATCH', `/activities/${id}`, { statusId });
    void act.reload();
  }

  return (
    <Page title="Attività" back="/today">
      {act.loading && <Loading />}
      {act.error && <ErrorBox message={act.error} />}
      {act.data && (
        <>
          <h1 style={{ fontFamily: 'var(--font-display)' }}>{act.data.title}</h1>
          <div style={{ marginBottom: 10 }}>
            <IonChip>{act.data.isFixed ? 'Fissa' : 'Dinamica'}</IonChip>
            {act.data.estimatedMinutes && <IonChip>{act.data.estimatedMinutes} min</IonChip>}
            <StatusPill label={lk.labelOf(act.data.statusId) || (act.data.statusCanonical ?? '')} token={lk.byId(act.data.statusId)?.colorToken} />
          </div>

          {canUpdate && statuses.length > 0 && (
            <IonItem>
              <IonSelect label="Stato" value={act.data.statusId} onIonChange={(e) => changeStatus(e.detail.value)}>
                {statuses.map((s) => <IonSelectOption key={s.id} value={s.id}>{lk.labelOf(s.id)}</IonSelectOption>)}
              </IonSelect>
            </IonItem>
          )}

          {/* Checklist */}
          <h3 style={{ fontFamily: 'var(--font-display)', marginTop: 18 }}>Checklist {savingCk && <IonSpinner name="dots" style={{ height: 14 }} />}</h3>
          {checklist.length === 0 ? <Empty text="Nessun passo." /> : (
            <IonList>
              {checklist.map((c, i) => (
                <IonItem key={i}>
                  <IonCheckbox slot="start" checked={c.done} disabled={!canUpdate} onIonChange={() => toggle(i)} />
                  <IonLabel style={{ textDecoration: c.done ? 'line-through' : 'none', color: c.done ? 'var(--ink-faint)' : 'inherit' }}>{c.text}</IonLabel>
                </IonItem>
              ))}
            </IonList>
          )}

          <RisorseAssegnate activityId={id} resources={act.data.resources} onChange={() => act.reload()} />

          <Dipendenze activityId={id} engagementId={act.data.engagementId} />

          <RendicontazioneOre activityId={id} engagementId={act.data.engagementId} />
          <RendicontazioneMateriali activityId={id} />
        </>
      )}
    </Page>
  );
}

function RisorseAssegnate({ activityId, resources, onChange }:
  { activityId: string; resources: ActivityResourceDto[]; onChange: () => void }) {
  const { user } = useAuth();
  const can = !!user?.permissions.includes('activity:assign');
  const all = useApi<{ items: ResourceDto[] }>('/resources');
  const [resourceId, setResourceId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    const rid = resourceId || all.data?.items[0]?.id;
    if (!rid) { setErr('Nessuna risorsa a catalogo'); return; }
    setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = { resourceId: rid };
      if (from) body.plannedFrom = new Date(from).toISOString();
      if (to) body.plannedTo = new Date(to).toISOString();
      await mutate('POST', `/activities/${activityId}/resources`, body);
      setFrom(''); setTo('');
      onChange();
    } catch (e) {
      // 409 = doppia prenotazione: il backend rileva il blocco dal vincolo EXCLUDE
      const msg = e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message;
      setErr(msg);
    } finally { setBusy(false); }
  }
  async function remove(arId: string) {
    setBusy(true); setErr(null);
    try { await mutate('DELETE', `/activities/${activityId}/resources/${arId}`); onChange(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <h3 style={{ fontFamily: 'var(--font-display)', marginTop: 18 }}>Risorse assegnate</h3>
      {resources.length === 0 ? <Empty text="Nessuna risorsa assegnata." /> : (
        <IonList>{resources.map((r) => (
          <IonItem key={r.id}>
            <IonLabel>
              {r.resourceLabel}
              {r.plannedFrom && <IonNote style={{ display: 'block', fontSize: 12 }}>
                {new Date(r.plannedFrom).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                {r.plannedTo && ` → ${new Date(r.plannedTo).toLocaleString('it-IT', { hour: '2-digit', minute: '2-digit' })}`}
              </IonNote>}
            </IonLabel>
            {can && <IonButton fill="clear" color="danger" size="small" onClick={() => remove(r.id)} disabled={busy}>Rimuovi</IonButton>}
          </IonItem>
        ))}</IonList>
      )}
      {can && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', marginTop: 8, flexWrap: 'wrap' }}>
          <IonSelect style={{ minWidth: 160 }} label="Risorsa" labelPlacement="stacked" value={resourceId || all.data?.items[0]?.id} onIonChange={(e) => setResourceId(e.detail.value)}>
            {(all.data?.items ?? []).map((r) => <IonSelectOption key={r.id} value={r.id}>{r.label}</IonSelectOption>)}
          </IonSelect>
          <IonInput style={{ minWidth: 170 }} type="datetime-local" label="Da (opz.)" labelPlacement="stacked" value={from} onIonInput={(e) => setFrom(e.detail.value ?? '')} />
          <IonInput style={{ minWidth: 170 }} type="datetime-local" label="A (opz.)" labelPlacement="stacked" value={to} onIonInput={(e) => setTo(e.detail.value ?? '')} />
          <IonButton size="default" disabled={busy} onClick={add}>{busy ? <IonSpinner name="crescent" /> : 'Assegna'}</IonButton>
        </div>
      )}
      <IonNote style={{ display: 'block', marginTop: 6, fontSize: 12 }}>Con orario Da/A il sistema blocca la doppia prenotazione della stessa risorsa.</IonNote>
      {err && <IonText color="danger"><p>{err}</p></IonText>}
    </>
  );
}

function Dipendenze({ activityId, engagementId }: { activityId: string; engagementId: string }) {
  const { user } = useAuth();
  const can = !!user?.permissions.includes('dependency:manage');
  const acts = useApi<{ items: ActivityDto[] }>(`/activities?engagementId=${engagementId}`);
  const deps = useApi<{ items: DependencyEdgeDto[] }>(`/engagements/${engagementId}/dependencies`);
  const [predId, setPredId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const blockedBy = (deps.data?.items ?? []).filter((d) => d.successorId === activityId);
  const candidates = (acts.data?.items ?? []).filter((a) => a.id !== activityId && !blockedBy.some((d) => d.predecessorId === a.id));

  async function add() {
    const pid = predId || candidates[0]?.id;
    if (!pid) { setErr('Nessuna attività candidata'); return; }
    setBusy(true); setErr(null);
    try {
      await mutate('POST', '/dependencies', { predecessorId: pid, successorId: activityId });
      setPredId(''); void deps.reload();
    } catch (e) {
      setErr(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message);
    } finally { setBusy(false); }
  }
  async function remove(depId: string) {
    setBusy(true); setErr(null);
    try { await mutate('DELETE', `/dependencies/${depId}`); void deps.reload(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <h3 style={{ fontFamily: 'var(--font-display)', marginTop: 18 }}>Bloccata da</h3>
      {blockedBy.length === 0 ? <Empty text="Nessuna dipendenza: parte appena possibile." /> : (
        <IonList>{blockedBy.map((d) => (
          <IonItem key={d.id}>
            <IonLabel>{d.predecessorTitle}<IonNote style={{ display: 'block', fontSize: 12 }}>deve finire prima (FS)</IonNote></IonLabel>
            {can && <IonButton fill="clear" color="danger" size="small" onClick={() => remove(d.id)} disabled={busy}>Rimuovi</IonButton>}
          </IonItem>
        ))}</IonList>
      )}
      {can && candidates.length > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', marginTop: 8, flexWrap: 'wrap' }}>
          <IonSelect style={{ minWidth: 220 }} label="Aggiungi vincolo" labelPlacement="stacked"
            value={predId || candidates[0]?.id} onIonChange={(e) => setPredId(e.detail.value)}>
            {candidates.map((a) => <IonSelectOption key={a.id} value={a.id}>{a.title}</IonSelectOption>)}
          </IonSelect>
          <IonButton size="default" disabled={busy} onClick={add}>{busy ? <IonSpinner name="crescent" /> : 'Blocca'}</IonButton>
        </div>
      )}
      <IonNote style={{ display: 'block', marginTop: 6, fontSize: 12 }}>Vincolo Fine→Inizio nella stessa commessa; il sistema impedisce i cicli.</IonNote>
      {err && <IonText color="danger"><p>{err}</p></IonText>}
    </>
  );
}

function RendicontazioneOre({ activityId, engagementId }: { activityId: string; engagementId: string }) {
  const { user } = useAuth();
  const can = !!user?.permissions.includes('time_entry:create');
  const list = useApi<{ items: TimeEntryDto[] }>(`/time-entries?activityId=${activityId}`);
  const [typology, setTypology] = useState('sviluppo');
  const [minutes, setMinutes] = useState('60');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  async function add() {
    setBusy(true); setErr(null);
    try {
      await mutate('POST', '/time-entries', { engagementId, activityId, typology, minutes: Number(minutes), occurredOn: today });
      void list.reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <h3 style={{ fontFamily: 'var(--font-display)', marginTop: 18 }}>Ore</h3>
      {(list.data?.items ?? []).map((t) => (
        <IonNote key={t.id} style={{ display: 'block', padding: '4px 0' }}>{t.occurredOn} · {t.typology} · {hhmm(t.minutes)}</IonNote>
      ))}
      {can && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', marginTop: 8, flexWrap: 'wrap' }}>
          <IonInput style={{ minWidth: 140 }} label="Tipologia" labelPlacement="stacked" value={typology} onIonInput={(e) => setTypology(e.detail.value ?? '')} />
          <IonInput style={{ maxWidth: 110 }} type="number" label="Minuti" labelPlacement="stacked" value={minutes} onIonInput={(e) => setMinutes(e.detail.value ?? '')} />
          <IonButton size="default" disabled={busy} onClick={add}>{busy ? <IonSpinner name="crescent" /> : 'Registra ore'}</IonButton>
        </div>
      )}
      {err && <IonText color="danger"><p>{err}</p></IonText>}
    </>
  );
}

function RendicontazioneMateriali({ activityId }: { activityId: string }) {
  const { user } = useAuth();
  const can = !!user?.permissions.includes('material_consumption:create');
  const list = useApi<{ items: ConsumptionDto[] }>(`/consumptions?activityId=${activityId}`);
  const materials = useApi<{ items: MaterialDto[] }>('/materials');
  const [materialId, setMaterialId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  async function add() {
    const m = materials.data?.items.find((x) => x.id === materialId) ?? materials.data?.items[0];
    if (!m) { setErr('Nessun materiale a catalogo'); return; }
    setBusy(true); setErr(null);
    try {
      await mutate('POST', '/consumptions', { activityId, materialId: m.id, quantity: Number(quantity), unit: m.unit, occurredOn: today });
      void list.reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <h3 style={{ fontFamily: 'var(--font-display)', marginTop: 18 }}>Materiali</h3>
      {(list.data?.items ?? []).map((c) => (
        <IonNote key={c.id} style={{ display: 'block', padding: '4px 0' }}>{c.occurredOn} · {c.materialName} · {c.quantity} {c.unit}</IonNote>
      ))}
      {can && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', marginTop: 8, flexWrap: 'wrap' }}>
          <IonSelect style={{ minWidth: 160 }} label="Materiale" labelPlacement="stacked" value={materialId || materials.data?.items[0]?.id} onIonChange={(e) => setMaterialId(e.detail.value)}>
            {(materials.data?.items ?? []).map((m) => <IonSelectOption key={m.id} value={m.id}>{m.name}</IonSelectOption>)}
          </IonSelect>
          <IonInput style={{ maxWidth: 110 }} type="number" label="Quantità" labelPlacement="stacked" value={quantity} onIonInput={(e) => setQuantity(e.detail.value ?? '')} />
          <IonButton size="default" disabled={busy} onClick={add}>{busy ? <IonSpinner name="crescent" /> : 'Registra'}</IonButton>
        </div>
      )}
      {err && <IonText color="danger"><p>{err}</p></IonText>}
    </>
  );
}
