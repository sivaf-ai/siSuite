/** Dashboard (mock 05) — KPI + GRAFICI (recharts) + liste, CONFIGURABILE per
 *  utente (parte 8 §4): catalogo widget, mostra/nascondi e ordine salvati in
 *  localStorage. Default sensato: KPI + Ore/giorno + Attività oggi + Avanzamento. */
import { useEffect, useMemo, useState } from 'react';
import { Briefcase, Clock, Sparkles, AlertTriangle, SlidersHorizontal, Eye, EyeOff, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';
import { Page, Loading, ErrorBox, Empty } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { useApi } from '../api/hooks';
import { useLookups } from '../context/Lookups';
import { colorVars } from '../theme/palette';

interface ActOggi { id: string; title: string; scheduledStart: string | null; statusId: string; statusCanonical: string | null; engagementTitle: string | null }
interface CapRecente { id: string; rawText: string; status: string; createdAt: string }
interface Dash {
  commesseAttive: number; oreSettimana: number; cattureDaRivedere: number; scadenzeARischio: number;
  attivitaOggi: ActOggi[]; cattureRecenti: CapRecente[]; totaleAttivitaOggi: number;
  orePerGiorno: { date: string; minutes: number }[];
  commessePerStato: { canonical: string; label: string; colorToken: string; count: number }[];
  avanzamentoCommesse: { id: string; title: string; total: number; done: number; pct: number }[];
  marginalitaCommesse: { id: string; title: string; budget: number; costo: number; margine: number; pct: number }[];
}
const CAP: Record<string, { label: string; token: string }> = {
  pending: { label: 'In attesa', token: 'neutral' }, proposed: { label: 'Da rivedere', token: 'warning' },
  applied: { label: 'Applicata', token: 'success' }, rejected: { label: 'Rifiutata', token: 'danger' },
};
const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'flusso');
const dow = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('it-IT', { weekday: 'short', timeZone: 'UTC' });

const ALL_WIDGETS = ['kpis', 'ore_per_giorno', 'commesse_per_stato', 'avanzamento', 'marginalita', 'attivita_oggi', 'catture_recenti'] as const;
type WidgetKey = (typeof ALL_WIDGETS)[number];
const TITLE: Record<WidgetKey, string> = {
  kpis: 'Indicatori', ore_per_giorno: 'Ore per giorno', commesse_per_stato: 'Commesse per stato',
  avanzamento: 'Avanzamento commesse', marginalita: 'Marginalità commesse', attivita_oggi: 'Attività di oggi', catture_recenti: 'Catture recenti',
};
const DEFAULT_CFG = { order: [...ALL_WIDGETS] as string[], hidden: [] as string[] };
const CFG_KEY = 'sisuite.dashboard';
function loadCfg(): { order: string[]; hidden: string[] } {
  try { const c = JSON.parse(localStorage.getItem(CFG_KEY) ?? ''); if (c && Array.isArray(c.order)) return c; } catch { /* default */ }
  return DEFAULT_CFG;
}

export function DashboardPage() {
  const lk = useLookups();
  const { data, loading, error } = useApi<Dash>('/dashboard');
  const [cfg, setCfg] = useState(() => loadCfg());
  const [customize, setCustomize] = useState(false);
  useEffect(() => { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }, [cfg]);

  // ordine effettivo: rispetta cfg.order, accoda eventuali widget nuovi
  const order = useMemo(() => {
    const inOrder = cfg.order.filter((k) => (ALL_WIDGETS as readonly string[]).includes(k));
    return [...inOrder, ...ALL_WIDGETS.filter((k) => !inOrder.includes(k))];
  }, [cfg.order]);
  const visible = order.filter((k) => !cfg.hidden.includes(k));

  const move = (k: string, dir: -1 | 1) => setCfg((c) => {
    const o = [...order]; const i = o.indexOf(k); const j = i + dir;
    if (j < 0 || j >= o.length) return c;
    [o[i], o[j]] = [o[j]!, o[i]!];
    return { ...c, order: o };
  });
  const toggle = (k: string) => setCfg((c) => ({ ...c, hidden: c.hidden.includes(k) ? c.hidden.filter((x) => x !== k) : [...c.hidden, k] }));

  return (
    <Page title="Dashboard">
      <div className="page-head">
        <div><h1>Dashboard</h1><div className="sub">Il polso dell'azienda, oggi.</div></div>
        <button className="btn btn-ghost btn-sm" onClick={() => setCustomize((x) => !x)}><SlidersHorizontal size={16} />Personalizza</button>
      </div>

      {customize && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="ph"><h3>Personalizza la dashboard</h3><button className="btn btn-ghost btn-sm" onClick={() => setCfg(DEFAULT_CFG)}><RotateCcw size={15} />Ripristina</button></div>
          <div className="pb" style={{ paddingTop: 8 }}>
            {order.map((k) => {
              const hidden = cfg.hidden.includes(k);
              return (
                <div className="row-li" key={k}>
                  <div className="li-main"><div className="li-title">{TITLE[k as WidgetKey] ?? k}</div></div>
                  <button className="act-icon" title="Su" onClick={() => move(k, -1)}><ChevronUp size={16} /></button>
                  <button className="act-icon" title="Giù" onClick={() => move(k, 1)}><ChevronDown size={16} /></button>
                  <button className={`act-icon${hidden ? '' : ' on'}`} title={hidden ? 'Mostra' : 'Nascondi'} onClick={() => toggle(k)} style={hidden ? undefined : { color: 'var(--brand)' }}>{hidden ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading && <Loading />}
      {error && <ErrorBox message={error} />}
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {visible.map((k) => <Widget key={k} k={k as WidgetKey} data={data} lk={lk} />)}
        </div>
      )}
    </Page>
  );
}

function Widget({ k, data, lk }: { k: WidgetKey; data: Dash; lk: ReturnType<typeof useLookups> }) {
  if (k === 'kpis') return (
    <div className="kpis" style={{ marginBottom: 0 }}>
      <div className="kpi"><div className="ic" style={{ background: 'var(--brand-wash)', color: 'var(--brand)' }}><Briefcase size={17} /></div><div className="lab">Commesse attive</div><div className="val">{data.commesseAttive}</div></div>
      <div className="kpi"><div className="ic" style={{ background: 'var(--flow-wash)', color: 'var(--flow)' }}><Clock size={17} /></div><div className="lab">Ore, questa settimana</div><div className="val">{Math.round(data.oreSettimana / 60)}<small>h</small></div></div>
      <div className="kpi"><div className="ic" style={{ background: 'var(--brand-wash)', color: 'var(--brand)' }}><Sparkles size={17} /></div><div className="lab">Catture da rivedere</div><div className="val">{data.cattureDaRivedere}</div></div>
      <div className="kpi"><div className="ic" style={{ background: 'var(--warning-wash)', color: 'var(--warning)' }}><AlertTriangle size={17} /></div><div className="lab">Scadenze a rischio</div><div className="val" style={{ color: 'var(--danger)' }}>{data.scadenzeARischio}</div></div>
    </div>
  );

  if (k === 'ore_per_giorno') {
    const d = data.orePerGiorno.map((x) => ({ g: dow(x.date), ore: Math.round((x.minutes / 60) * 10) / 10 }));
    return (
      <div className="panel"><div className="ph"><h3>Ore per giorno</h3><span className="chip">settimana</span></div>
        <div className="pb" style={{ paddingTop: 14, height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <XAxis dataKey="g" tick={{ fontSize: 12, fill: 'var(--ink-faint)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--ink-faint)' }} axisLine={false} tickLine={false} width={36} />
              <Tooltip cursor={{ fill: 'var(--neutral-wash)' }} formatter={(v) => [`${v} h`, 'Ore']} />
              <Bar dataKey="ore" fill="var(--brand)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  if (k === 'commesse_per_stato') {
    const d = data.commessePerStato.map((x) => ({ name: x.label, value: x.count, fill: colorVars(x.colorToken).fg }));
    const tot = d.reduce((s, x) => s + x.value, 0);
    return (
      <div className="panel"><div className="ph"><h3>Commesse per stato</h3><span className="chip">{tot} totali</span></div>
        <div className="pb" style={{ paddingTop: 8, height: 240 }}>
          {tot === 0 ? <Empty text="Nessuna commessa." /> : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={d} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {d.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    );
  }

  if (k === 'avanzamento') return (
    <div className="panel"><div className="ph"><h3>Avanzamento commesse</h3></div>
      <div className="pb" style={{ paddingTop: 12 }}>
        {data.avanzamentoCommesse.length === 0 ? <Empty text="Nessuna commessa attiva." /> : data.avanzamentoCommesse.map((e) => (
          <div key={e.id} className="quota" style={{ marginBottom: 12 }}>
            <div className="qh"><b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{e.title}</b><span className="mono">{e.done}/{e.total} · {e.pct}%</span></div>
            <div className="qbar"><span style={{ width: `${e.pct}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  );

  if (k === 'marginalita') {
    const eur = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
    return (
      <div className="panel"><div className="ph"><h3>Marginalità commesse</h3><span className="chip">budget − costi</span></div>
        <div className="pb">
          {data.marginalitaCommesse.length === 0
            ? <Empty text="Imposta un budget sulle commesse e i costi (orario risorsa, costo materiale) per vedere il margine." />
            : data.marginalitaCommesse.map((m) => (
              <div className="row-li" key={m.id}>
                <div className="li-main"><div className="li-title">{m.title}</div><div className="cellsub mono">budget {eur(m.budget)} · costi {eur(m.costo)}</div></div>
                <span className={`pill ${m.margine >= 0 ? 'pill--success' : 'pill--danger'}`}><span className="dot" />{eur(m.margine)} · {m.pct}%</span>
              </div>
            ))}
        </div>
      </div>
    );
  }

  if (k === 'attivita_oggi') return (
    <div className="panel"><div className="ph"><h3>Attività di oggi</h3><span className="chip">{data.totaleAttivitaOggi} totali</span></div>
      <div className="pb">
        {data.attivitaOggi.length === 0 ? <Empty text="Niente per oggi." /> : data.attivitaOggi.map((a) => (
          <div className="row-li" key={a.id}>
            <div className="li-main"><div className="li-title">{a.title}{a.engagementTitle ? ` — ${a.engagementTitle}` : ''}</div><div className="cellsub">{fmtTime(a.scheduledStart)}</div></div>
            <StatusPill label={lk.labelOf(a.statusId) || (a.statusCanonical ?? '')} token={lk.byId(a.statusId)?.colorToken} />
          </div>
        ))}
      </div>
    </div>
  );

  if (k === 'catture_recenti') return (
    <div className="panel"><div className="ph"><h3>Catture recenti</h3></div>
      <div className="pb">
        {data.cattureRecenti.length === 0 ? <Empty text="Nessuna cattura." /> : data.cattureRecenti.map((c) => {
          const s = CAP[c.status] ?? CAP.pending!;
          return (
            <div className="row-li" key={c.id}>
              <div className="li-main"><div className="li-title faint">«{c.rawText}»</div><div className="cellsub">{new Date(c.createdAt).toLocaleString('it-IT')}</div></div>
              <StatusPill label={s.label} token={s.token} />
            </div>
          );
        })}
      </div>
    </div>
  );
  return null;
}
