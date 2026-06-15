/**
 * TimerWidget — cronometro compatto (§4.5) per la vista tecnico "Oggi".
 * Se c'è una sessione in corso mostra il tempo che scorre + "Ferma e registra";
 * altrimenti un avvio rapido sull'attività scelta tra quelle di oggi.
 */
import { useEffect, useState } from 'react';
import { Play, Square, Timer } from 'lucide-react';
import type { TimerSessionDto, ActivityDto } from '@sisuite/shared';
import { useApi, mutate } from '../api/hooks';
import { useToast } from '../ui/Toast';

function hhmmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h, m, sec].map((x) => String(x).padStart(2, '0')).join(':');
}

export function TimerWidget({ activities }: { activities: ActivityDto[] }) {
  const toast = useToast();
  const active = useApi<{ session: TimerSessionDto | null }>('/time-tracking/active');
  const session = active.data?.session ?? null;
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [actId, setActId] = useState('');

  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session]);

  async function start() {
    const a = activities.find((x) => x.id === actId);
    if (!a) { toast('Scegli un\'attività', 'error'); return; }
    setBusy(true);
    try {
      await mutate('POST', '/time-tracking/start', { activityId: a.id, engagementId: a.engagementId });
      setPicking(false); setActId(''); await active.reload();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function commit() {
    if (!session) return;
    setBusy(true);
    try {
      const r = await mutate<{ minutes: number }>('POST', `/time-tracking/${session.id}/commit`, { typology: 'ordinary' });
      toast(`Registrate ${r.minutes} min`, 'success'); await active.reload();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  if (active.loading) return null;

  if (session) {
    return (
      <div className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Timer size={22} style={{ color: 'var(--c-info, #2d7ef7)' }} />
        <div style={{ flex: 1 }}>
          <div className="mono" style={{ fontSize: 22, fontWeight: 800 }}>{hhmmss(now - new Date(session.startedAt).getTime())}</div>
          <div className="cellsub">cronometro in corso</div>
        </div>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={commit}><Square size={15} /> Ferma e registra</button>
      </div>
    );
  }

  if (!activities.length) return null;
  return (
    <div className="card" style={{ padding: 12, marginBottom: 12 }}>
      {!picking ? (
        <button className="btn btn-ghost btn-sm" onClick={() => setPicking(true)} style={{ width: '100%' }}><Play size={15} /> Avvia cronometro</button>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="txt" value={actId} onChange={(e) => setActId(e.target.value)} style={{ flex: 1 }}>
            <option value="">Attività…</option>
            {activities.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={start}><Play size={15} /> Via</button>
        </div>
      )}
    </div>
  );
}
