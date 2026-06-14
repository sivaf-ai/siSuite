/** Pianificazione (mock 03): griglia RISORSE × GIORNI (per-risorsa, FASE 2) +
 *  rail con narrazione e PROPOSTE AI sui conflitti ("proponi, non forzare"). */
import { Fragment, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Pin, Sparkles, AlertTriangle, CalendarClock } from 'lucide-react';
import { Page, Loading, ErrorBox } from '../components/Page';
import { useApi } from '../api/hooks';
import { currentLocale } from '../i18n';

interface Block { activityId: string; title: string; kind: 'fixed' | 'flowing'; start: string; end: string; atRisk: boolean }
interface ResourcePlan { resourceId: string; label: string; resourceKind: string; blocks: Block[] }
interface Week {
  weekFrom: string; suggestedFrom: string; resources: ResourcePlan[];
  conflicts: { activityId: string; title: string; reason: string }[];
  totals: { activities: number; minutes: number; conflicts: number };
  narrative: { available: boolean; summary: string; proposals: string[] };
}

function mondayOf(d: Date): Date { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const wd = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - wd); return x; }
function hm(iso: string): string { const d = new Date(iso); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; }
const dowShort = (d: Date) => d.toLocaleDateString(currentLocale(), { weekday: 'short', timeZone: 'UTC' });

export function PianificazionePage() {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<Date>(() => mondayOf(new Date()));
  const fromStr = anchor.toISOString().slice(0, 10);
  const { data, loading, error } = useApi<Week>(`/schedule/week?from=${fromStr}`);

  // Apertura intelligente: se la settimana di default è vuota ma il piano ha attività
  // più avanti (forward-pass), salta UNA volta alla prima settimana piena (suggestedFrom).
  const didAutoSnap = useRef(false);
  useEffect(() => {
    if (didAutoSnap.current || !data) return;
    didAutoSnap.current = true;
    const empty = data.resources.every((r) => r.blocks.length === 0);
    if (empty && data.suggestedFrom && data.suggestedFrom !== fromStr) {
      setAnchor(new Date(`${data.suggestedFrom}T00:00:00.000Z`));
    }
  }, [data, fromStr]);

  const days = Array.from({ length: 5 }, (_, i) => new Date(anchor.getTime() + i * 86_400_000));
  const todayStr = new Date().toISOString().slice(0, 10);
  const rangeLbl = `${days[0]!.getUTCDate()}–${days[4]!.getUTCDate()} ${days[4]!.toLocaleDateString(currentLocale(), { month: 'long', timeZone: 'UTC' })}`;
  const shift = (w: number) => setAnchor(new Date(anchor.getTime() + w * 7 * 86_400_000));

  // blocchi della risorsa che intersecano un dato giorno (UTC)
  const dayBlocks = (blocks: Block[], day: Date) => {
    const s = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
    const e = s + 86_400_000;
    return blocks.filter((b) => new Date(b.start).getTime() < e && new Date(b.end).getTime() > s)
      .map((b) => ({ ...b, startsToday: new Date(b.start).getTime() >= s }));
  };

  // mini = stessi numeri della griglia: arrivano già ritagliati alla settimana dal backend (scopeWeek)
  const totMin = data?.totals.minutes ?? 0;
  const totAct = data?.totals.activities ?? 0;
  const nConf = data?.totals.conflicts ?? 0;

  return (
    <Page title={t('planning.title')}>
      <div className="page-head">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}><CalendarClock size={24} /> {t('planning.title')}</h1>
          <div className="sub">{t('planning.subtitle')}</div>
        </div>
        <div className="week-switch">
          <div className="nav" onClick={() => shift(-1)}><ChevronLeft size={18} /></div>
          <span className="lbl">{rangeLbl}</span>
          <div className="nav" onClick={() => shift(1)}><ChevronRight size={18} /></div>
        </div>
      </div>

      {loading && <Loading />}
      {error && <ErrorBox message={error} />}
      {data && (
        <div className="plan-layout">
          <div>
            {nConf > 0 && (
              <div className="alert">
                <AlertTriangle size={18} />
                <span><b>{nConf} {t('planning.deadlineAtRisk', { count: nConf })}.</b> {data.conflicts.map((c) => c.title).slice(0, 2).join(', ')}{nConf > 2 ? '…' : ''}</span>
                <Sparkles size={16} className="spark" />
              </div>
            )}
            <div className="agenda">
              <div className="ag-grid">
                <div className="ag-h" />
                {days.map((d) => {
                  const ds = d.toISOString().slice(0, 10);
                  return <div key={ds} className={`ag-h${ds === todayStr ? ' today' : ''}`}>{dowShort(d)}<span className="dn">{d.getUTCDate()}</span></div>;
                })}
                {data.resources.map((r) => (
                  <Fragment key={r.resourceId}>
                    <div className="ag-res"><span className={`rk${r.resourceKind !== 'person' ? ' veh' : ''}`} />{r.label}</div>
                    {days.map((d) => {
                      const ds = d.toISOString().slice(0, 10);
                      return (
                        <div key={ds} className={`ag-cell${ds === todayStr ? ' today' : ''}`}>
                          {dayBlocks(r.blocks, d).map((b) => (
                            <div key={b.activityId + ds} className={`block ${b.atRisk ? 'at-risk' : b.kind}`} title={b.title}>
                              {b.kind === 'fixed' && <span className="pin"><Pin size={12} /></span>}
                              <div className="bt" style={b.atRisk ? { color: 'var(--danger)' } : undefined}>{b.atRisk ? t('planning.atRisk') : b.startsToday ? hm(b.start) : t('planning.flow')}</div>
                              <div className="bn">{b.title}</div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
            {data.resources.length === 0 && <p className="faint" style={{ fontSize: 13, marginTop: 12, color: 'var(--ink-faint)' }}>{t('planning.noResources')}</p>}
          </div>

          <div className="rail">
            <div className="narr">
              <div className="h"><span className="spark"><Sparkles size={16} /></span> {t('planning.summaryTitle')}</div>
              <p>{data.narrative.summary}</p>
              {data.narrative.proposals.map((p, i) => (
                <div className="ln" key={i}><span className="d" style={{ background: 'var(--flow)' }} /><span>{p}</span></div>
              ))}
              {!data.narrative.available && data.narrative.proposals.length > 0 && (
                <div className="ln" style={{ opacity: .7 }}><span className="d" style={{ background: 'var(--ink-faint)' }} /><span>{t('planning.baseProposals')}</span></div>
              )}
            </div>
            <div className="mini">
              <div className="h">{t('planning.thisWeek')}</div>
              <div className="stat"><span>{t('planning.hoursPlanned')}</span><span className="v">{Math.round(totMin / 60)}h</span></div>
              <div className="stat"><span>{t('planning.activities')}</span><span className="v">{totAct}</span></div>
              <div className="stat"><span>{t('planning.conflicts')}</span><span className="v" style={nConf ? { color: 'var(--danger)' } : undefined}>{nConf}</span></div>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
