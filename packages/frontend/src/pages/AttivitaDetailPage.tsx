import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import {
  IonList, IonItem, IonLabel, IonCheckbox, IonButton, IonSelect, IonSelectOption, IonInput,
  IonChip, IonNote, IonSpinner, IonText,
} from '@ionic/react';
import type { ActivityDto, ActivityResourceDto, TimeEntryDto, ConsumptionDto, MaterialDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox, Empty } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { useApi, mutate } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
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

          {/* Risorse assegnate */}
          {act.data.resources.length > 0 && (
            <>
              <h3 style={{ fontFamily: 'var(--font-display)', marginTop: 18 }}>Risorse</h3>
              <IonList>{act.data.resources.map((r) => (
                <IonItem key={r.id}><IonLabel>{r.resourceLabel}</IonLabel></IonItem>
              ))}</IonList>
            </>
          )}

          <RendicontazioneOre activityId={id} engagementId={act.data.engagementId} />
          <RendicontazioneMateriali activityId={id} />
        </>
      )}
    </Page>
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
        <IonNote key={t.id} style={{ display: 'block', padding: '4px 0' }}>{t.occurredOn} · {t.typology} · {t.minutes} min</IonNote>
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
