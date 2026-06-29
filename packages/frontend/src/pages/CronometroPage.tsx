/**
 * CronometroPage — MODULO ORE §4.5: cronometro. Avvia una sessione su una
 * commessa/attività; al "Ferma e registra" crea una time_entry dal tempo
 * misurato (tariffe fotografate lato API). Una sessione in corso per utente.
 */
import { useEffect, useState } from 'react';
import { Play, Square, Clock } from 'lucide-react';
import type { TimerSessionDto, EngagementDto, ResourceDto, ActivityDto, LookupDto } from '@sisuite/shared';
import { Page, Loading } from '../components/Page';
import { useApi, mutate } from '../api/hooks';
import { useLookups } from '../context/Lookups';
import { useToast } from '../ui/Toast';
import { PickerField } from '../ui/PickerField';
import { EngagementPickerDialog } from '../ui/EngagementPickerDialog';
import { ResourcePickerDialog } from '../ui/ResourcePickerDialog';

function hhmmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h, m, sec].map((x) => String(x).padStart(2, '0')).join(':');
}

export function CronometroPage() {
  const lk = useLookups();
  const toast = useToast();
  const active = useApi<{ session: TimerSessionDto | null }>('/time-tracking/active');
  const engs = useApi<{ items: EngagementDto[] }>('/engagements');
  const ress = useApi<{ items: ResourceDto[] }>('/resources');
  const session = active.data?.session ?? null;

  const [eng, setEng] = useState('');
  const acts = useApi<{ items: ActivityDto[] }>(eng ? `/activities?engagementId=${eng}` : null);
  const [act, setAct] = useState('');
  const [res, setRes] = useState('');
  const [typ, setTyp] = useState('');
  const [busy, setBusy] = useState(false);
  const [pickEng, setPickEng] = useState(false);
  const [pickRes, setPickRes] = useState(false);
  const engName = (() => { const e = engs.data?.items.find((x) => x.id === eng); return e ? `${e.code ? e.code + ' · ' : ''}${e.title}` : (eng ? '…' : ''); })();
  const resName = ress.data?.items.find((r) => r.id === res)?.label ?? '';
  const [now, setNow] = useState(Date.now());

  // ticking ogni secondo quando c'è una sessione
  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session]);

  const typologies = lk.byCategory('time_typology').filter((t: LookupDto) => t.canonical === 'work');

  async function start() {
    if (!eng) { toast('Scegli una commessa', 'error'); return; }
    setBusy(true);
    try {
      await mutate('POST', '/time-tracking/start', { engagementId: eng, activityId: act || undefined, resourceId: res || undefined });
      toast('Cronometro avviato', 'success');
      setAct(''); await active.reload();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  async function commit() {
    if (!session) return;
    setBusy(true);
    try {
      const r = await mutate<{ minutes: number }>('POST', `/time-tracking/${session.id}/commit`, {
        typology: typ ? (lk.byId(typ)?.code ?? 'ordinary') : 'ordinary', typologyId: typ || undefined,
      });
      toast(`Registrate ${r.minutes} min`, 'success');
      await active.reload();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  async function cancel() {
    if (!session) return;
    setBusy(true);
    try { await mutate('POST', `/time-tracking/${session.id}/stop`); toast('Cronometro fermato', 'success'); await active.reload(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  if (active.loading) return <Page title="Cronometro"><Loading /></Page>;

  const engOf = (id: string | null) => engs.data?.items.find((e) => e.id === id);

  return (
    <Page title="Cronometro">
      {session ? (
        <div className="card" style={{ padding: 28, textAlign: 'center', maxWidth: 460, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="cellsub">In corso · {engOf(session.engagementId)?.code ?? 'commessa'}</div>
          <div className="mono" style={{ fontSize: 52, fontWeight: 800, letterSpacing: 1 }}>
            {hhmmss(now - new Date(session.startedAt).getTime())}
          </div>
          <div className="field" style={{ textAlign: 'left' }}>
            <label>Tipologia</label>
            <select className="txt" value={typ} onChange={(e) => setTyp(e.target.value)}>
              <option value="">Ordinarie</option>
              {typologies.map((t) => <option key={t.id} value={t.id}>{lk.labelOf(t.id)}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-ghost" disabled={busy} onClick={cancel}>Annulla</button>
            <button className="btn btn-primary" disabled={busy} onClick={commit}><Square size={16} /> Ferma e registra</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 24, maxWidth: 460, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ textAlign: 'center', marginBottom: 8 }}><Clock size={40} style={{ color: 'var(--ink-faint)' }} /></div>
          <div className="field"><label>Commessa</label>
            <PickerField value={engName || null} placeholder="Scegli la commessa…"
              onOpen={() => setPickEng(true)} onClear={() => { setEng(''); setAct(''); }} /></div>
          <div className="field"><label>Attività (opzionale)</label>
            <select className="txt" value={act} onChange={(e) => setAct(e.target.value)} disabled={!eng}>
              <option value="">—</option>
              {(acts.data?.items ?? []).map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select></div>
          <div className="field"><label>Risorsa (se non sei una risorsa)</label>
            <PickerField value={resName || null} placeholder="— automatica —"
              onOpen={() => setPickRes(true)} onClear={() => setRes('')} /></div>
          <button className="btn btn-primary" disabled={busy} onClick={start} style={{ marginTop: 8 }}><Play size={16} /> Avvia</button>
        </div>
      )}
      <EngagementPickerDialog open={pickEng} onClose={() => setPickEng(false)}
        onPick={(es) => { const e = es[0]; if (e) { setEng(e.id); setAct(''); } }} />
      <ResourcePickerDialog open={pickRes} onClose={() => setPickRes(false)}
        onPick={(rs) => { const r = rs[0]; if (r) setRes(r.id); }} />
    </Page>
  );
}
