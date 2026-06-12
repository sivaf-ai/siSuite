import { useEffect, useState } from 'react';
import { IonItem, IonLabel, IonList, IonSelect, IonSelectOption, IonChip, IonNote } from '@ionic/react';
import type { EngagementDto } from '@sisuite/shared';
import { Page, Loading, Empty } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { useApi } from '../api/hooks';
import { apiFetch } from '../api/client';

interface ScheduleItem { id: string; title: string; fixed: boolean; start: string | null; end: string | null; conflict: string }

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function PianificazionePage() {
  const engs = useApi<{ items: EngagementDto[] }>('/engagements');
  const [engId, setEngId] = useState<string>('');
  const [sched, setSched] = useState<{ items: ScheduleItem[]; conflicts: ScheduleItem[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const first = engs.data?.items[0]?.id;
    if (first && !engId) setEngId(first);
  }, [engs.data, engId]);

  useEffect(() => {
    if (!engId) return;
    setLoading(true);
    apiFetch<{ items: ScheduleItem[]; conflicts: ScheduleItem[] }>(`/engagements/${engId}/schedule`)
      .then(setSched)
      .finally(() => setLoading(false));
  }, [engId]);

  return (
    <Page title="Pianificazione">
      <IonNote>Agenda che si riempie da sola: le dinamiche fluiscono da oggi, attorno alle attività fisse.</IonNote>
      <IonItem>
        <IonSelect label="Commessa" value={engId} onIonChange={(e) => setEngId(e.detail.value)}>
          {(engs.data?.items ?? []).map((e) => <IonSelectOption key={e.id} value={e.id}>{e.code} · {e.title}</IonSelectOption>)}
        </IonSelect>
      </IonItem>

      {loading ? <Loading /> : sched ? (sched.items.length === 0 ? <Empty text="Nessuna attività da pianificare." /> : (
        <IonList>
          {sched.items.map((s) => (
            <IonItem key={s.id}>
              <IonLabel>
                <h2>{s.title} {s.fixed && <IonChip color="medium" style={{ height: 18 }}>fissa</IonChip>}</h2>
                <p>{s.start ? `${fmt(s.start)} → ${fmt(s.end)}` : 'Non collocabile'}</p>
              </IonLabel>
              {s.conflict !== 'none' && <StatusPill label={s.conflict === 'due_by_missed' ? 'scadenza' : 'no slot'} token="danger" />}
            </IonItem>
          ))}
        </IonList>
      )) : null}
    </Page>
  );
}
