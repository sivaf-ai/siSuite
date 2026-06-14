/** AgendaMobile — agenda settimanale del tecnico (riusa /schedule/week):
 *  blocchi raggruppati per giorno, oggi evidenziato. Vista di sola lettura. */
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useApi } from '../api/hooks';

interface Block { activityId: string; title: string; kind: string; start: string; end: string; atRisk: boolean }
interface Week { resources: { blocks: Block[] }[]; suggestedFrom?: string }

function mondayOf(d: Date): Date { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; }
const hm = (iso: string) => { const d = new Date(iso); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const dayKey = (iso: string) => iso.slice(0, 10);

export function AgendaMobile() {
  const [anchor, setAnchor] = useState<Date>(() => mondayOf(new Date()));
  const from = anchor.toISOString().slice(0, 10);
  const { data, loading } = useApi<Week>(`/schedule/week?from=${from}`);
  const todayKey = new Date().toISOString().slice(0, 10);

  // blocchi unici per attività, ordinati
  const seen = new Map<string, Block>();
  for (const r of data?.resources ?? []) for (const b of r.blocks) if (!seen.has(b.activityId)) seen.set(b.activityId, b);
  const blocks = [...seen.values()].sort((a, b) => a.start.localeCompare(b.start));
  const byDay = new Map<string, Block[]>();
  for (const b of blocks) { const k = dayKey(b.start); (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(b); }

  const days = Array.from({ length: 5 }, (_, i) => new Date(anchor.getTime() + i * 86_400_000));
  const shift = (w: number) => setAnchor(new Date(anchor.getTime() + w * 7 * 86_400_000));
  const lbl = `${days[0]!.getUTCDate()}–${days[4]!.getUTCDate()} ${days[4]!.toLocaleDateString('it-IT', { month: 'short', timeZone: 'UTC' })}`;

  return (
    <div style={{ padding: '8px 2px 30px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 2px 12px' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Agenda</h3>
        <div className="week-switch">
          <div className="nav" onClick={() => shift(-1)}><ChevronLeft size={16} /></div>
          <span className="lbl" style={{ fontSize: 13 }}>{lbl}</span>
          <div className="nav" onClick={() => shift(1)}><ChevronRight size={16} /></div>
        </div>
      </div>
      {loading && <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink-soft)' }}>Caricamento…</div>}
      {!loading && blocks.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink-soft)' }}>Nessuna attività pianificata questa settimana.</div>}
      {days.map((d) => {
        const k = d.toISOString().slice(0, 10);
        const list = byDay.get(k) ?? [];
        if (list.length === 0) return null;
        const isToday = k === todayKey;
        return (
          <div key={k} style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: isToday ? 'var(--brand)' : 'var(--ink-faint)', textTransform: 'capitalize', marginBottom: 8 }}>
              {d.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'short', timeZone: 'UTC' })}{isToday ? ' · oggi' : ''}
            </div>
            {list.map((b) => (
              <div key={b.activityId} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', marginBottom: 8, borderLeft: `3px solid ${b.atRisk ? 'var(--danger)' : b.kind === 'fixed' ? 'var(--brand)' : 'var(--flow)'}` }}>
                <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-soft)', minWidth: 44 }}>{hm(b.start)}</span>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 14.5 }}>{b.title}</span>
                {b.atRisk && <span className="pill pill--danger"><span className="dot" />a rischio</span>}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
