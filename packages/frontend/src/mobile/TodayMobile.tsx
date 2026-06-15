/** TodayMobile — la schermata "Oggi" del tecnico, fedele al mock 01:
 *  intestazione, hero di cattura, riepilogo AI della giornata, e il "flow" con
 *  le attività di oggi (nodo che pulsa su quella in corso). */
import { Fragment, useEffect, useState } from 'react';
import { Sparkles, Mic } from 'lucide-react';
import type { ActivityDto } from '@sisuite/shared';
import { Loading, Empty } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { useApi } from '../api/hooks';
import { apiFetch } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLookups } from '../context/Lookups';
import { TimerWidget } from '../components/TimerWidget';
import { hhmm } from '../lib/time';

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

export function TodayMobile({ onCapture, onOpen }: { onCapture: () => void; onOpen?: (id: string) => void }) {
  const { user } = useAuth();
  const lk = useLookups();
  const { data, loading } = useApi<{ items: ActivityDto[] }>('/activities/today');
  const [day, setDay] = useState<{ available: boolean; text: string } | null>(null);
  useEffect(() => { void apiFetch<{ available: boolean; text: string }>('/me/today-narrative').then(setDay).catch(() => undefined); }, []);

  const items = data?.items ?? [];
  const totalMin = items.reduce((s, a) => s + (a.estimatedMinutes ?? 0), 0);
  const firstName = user?.fullName?.split(' ')[0] ?? '';
  const initials = (user?.fullName ?? '?').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <>
      <div className="m-head">
        <div>
          <div className="hi">Ciao, {firstName}</div>
          <div className="day">{new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
        <div className="avatar">{initials}</div>
      </div>

      <button className="capture-bar" onClick={onCapture}>
        <div className="txt"><b>Parla o scrivi cosa hai fatto</b><span>Ore, materiali, stato — al resto penso io</span></div>
        <div className="mic"><Mic size={22} /></div>
      </button>

      {day && (
        <div className="ai-day">
          <span className="spark"><Sparkles size={16} /></span>
          <span>{day.text}</span>
        </div>
      )}

      <TimerWidget activities={items} />

      <div className="section-label">
        <span className="eyebrow">Oggi</span>
        <span className="n">{items.length} attività · {hhmm(totalMin)}</span>
      </div>

      {loading ? <Loading /> : items.length === 0 ? <Empty text="Niente in agenda per oggi." /> : (
        <div className="flow">
          {items.map((a) => {
            const done = a.checklist.filter((c) => c.done).length;
            const now = a.statusCanonical === 'in_progress';
            const pct = a.checklist.length ? Math.round((done / a.checklist.length) * 100) : 0;
            return (
              <Fragment key={a.id}>
                <div className={`node${now ? ' now' : ''}`} />
                <div className="act card" style={{ padding: 14, cursor: onOpen ? 'pointer' : 'default' }} onClick={() => onOpen?.(a.id)}>
                  <div className="top">
                    <span className="time">{a.isFixed ? fmtTime(a.scheduledStart) : 'dinamica'}</span>
                    {a.estimatedMinutes != null && <span className="dur">{a.estimatedMinutes}m</span>}
                    <span style={{ marginLeft: 'auto' }}>
                      <StatusPill label={lk.labelOf(a.statusId) || (a.statusCanonical ?? '')} token={lk.byId(a.statusId)?.colorToken} />
                    </span>
                  </div>
                  <h3>{a.title}</h3>
                  {a.checklist.length > 0 && (
                    <div className="progress">
                      <div className="bar"><i style={{ width: `${pct}%` }} /></div>
                      <span className="lbl">{done}/{a.checklist.length}</span>
                    </div>
                  )}
                </div>
              </Fragment>
            );
          })}
        </div>
      )}
    </>
  );
}
