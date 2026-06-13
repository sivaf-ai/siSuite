import { useEffect, useState } from 'react';
import { Pin, Network, CalendarClock, AlertTriangle } from 'lucide-react';
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

  const conflicts = sched?.items.filter((s) => s.conflict !== 'none').length ?? 0;

  return (
    <Page title="Pianificazione">
      <div className="page-head">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}><CalendarClock size={24} /> Pianificazione</h1>
          <div className="sub">Agenda che si riempie da sola: le dinamiche fluiscono da oggi, attorno alle attività fisse.</div>
        </div>
      </div>

      <div className="toolbar">
        <select className="txt" style={{ maxWidth: 420 }} value={engId} onChange={(e) => setEngId(e.target.value)}>
          {(engs.data?.items ?? []).map((e) => <option key={e.id} value={e.id}>{e.code} · {e.title}</option>)}
        </select>
        <span className="spacer" />
        {conflicts > 0 && (
          <span className="pill" style={{ color: 'var(--danger)', background: 'var(--danger-wash)' }}>
            <AlertTriangle size={13} /> {conflicts} conflitt{conflicts === 1 ? 'o' : 'i'}
          </span>
        )}
      </div>

      {loading ? <Loading /> : sched ? (sched.items.length === 0 ? <Empty text="Nessuna attività da pianificare." /> : (
        <div className="treeview">
          {sched.items.map((s) => (
            <div className="tnode" key={s.id}>
              <div className="trow" style={{ cursor: 'default' }}>
                <span className="ticon" style={{ background: s.fixed ? 'var(--brand-wash)' : 'var(--flow-wash)', color: s.fixed ? 'var(--brand)' : 'var(--flow)' }}>
                  {s.fixed ? <Pin size={14} /> : <Network size={14} />}
                </span>
                <span className="ttl">{s.title}{s.fixed && <span className="chip" style={{ marginLeft: 8 }}>fissa</span>}</span>
                <span className="tmeta">
                  <span className="roll">{s.start ? `${fmt(s.start)} → ${fmt(s.end)}` : 'Non collocabile'}</span>
                  {s.conflict !== 'none' && <StatusPill label={s.conflict === 'due_by_missed' ? 'scadenza' : 'no slot'} token="danger" />}
                </span>
              </div>
            </div>
          ))}
        </div>
      )) : null}
    </Page>
  );
}
