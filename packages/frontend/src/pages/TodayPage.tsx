import { useHistory } from 'react-router';
import { IonIcon } from '@ionic/react';
import { sparklesOutline, chevronForwardOutline } from 'ionicons/icons';
import type { ActivityDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox, Empty } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { useApi } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { useLookups } from '../context/Lookups';

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

export function TodayPage() {
  const { user } = useAuth();
  const lk = useLookups();
  const history = useHistory();
  const { data, loading, error } = useApi<{ items: ActivityDto[] }>('/activities/today');
  const firstName = user?.fullName?.split(' ')[0] ?? '';

  return (
    <Page title="Oggi">
      <div className="page-head">
        <div>
          <h1>Ciao {firstName}</h1>
          <div className="sub">{new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
      </div>

      <div className="capture-bar" style={{ marginBottom: 18, cursor: 'pointer' }} onClick={() => history.push('/captures')}>
        <div style={{ width: 26, height: 26, display: 'grid', placeItems: 'center' }}><IonIcon icon={sparklesOutline} style={{ color: 'var(--brand)', fontSize: 20 }} /></div>
        <div className="txt">
          <b>Racconta cosa hai fatto</b>
          <span>Voce o testo — l'AI registra ore, materiali e checklist</span>
        </div>
        <div className="mic">🎤</div>
      </div>

      {loading && <Loading />}
      {error && <ErrorBox message={error} />}
      {data && (data.items.length === 0 ? <Empty text="Niente in agenda per oggi." /> : (
        <>
          <div className="eyebrow" style={{ margin: '6px 2px 12px' }}>La tua giornata</div>
          <div className="flow">
            {data.items.map((a) => {
              const done = a.checklist.filter((c) => c.done).length;
              return (
                <div key={a.id} className="flow-act card" style={{ padding: 14, cursor: 'pointer' }}
                  onClick={() => history.push(`/activities/${a.id}`)}>
                  <div className="node" />
                  <div className="top">
                    <span className="time">{a.isFixed ? fmtTime(a.scheduledStart) : 'dinamica'}</span>
                    {a.estimatedMinutes && <span className="dur">· {a.estimatedMinutes} min</span>}
                    <StatusPill label={lk.labelOf(a.statusId) || (a.statusCanonical ?? '')} token={lk.byId(a.statusId)?.colorToken} />
                    <IonIcon icon={chevronForwardOutline} style={{ marginLeft: 'auto', color: 'var(--ink-faint)' }} />
                  </div>
                  <h3 style={{ fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 600 }}>{a.title}</h3>
                  {a.checklist.length > 0 && (
                    <div className="mono" style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>checklist {done}/{a.checklist.length}</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ))}
    </Page>
  );
}
