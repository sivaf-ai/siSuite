/** Dashboard (mock 05): kpis (4) + grid2 (Attività di oggi · Catture recenti). */
import { Briefcase, Clock, Sparkles, AlertTriangle } from 'lucide-react';
import { Page, Loading, ErrorBox, Empty } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { useApi } from '../api/hooks';
import { useLookups } from '../context/Lookups';

interface ActOggi { id: string; title: string; scheduledStart: string | null; statusId: string; statusCanonical: string | null; engagementTitle: string | null }
interface CapRecente { id: string; rawText: string; status: string; createdAt: string }
interface Dash {
  commesseAttive: number; oreSettimana: number; cattureDaRivedere: number; scadenzeARischio: number;
  attivitaOggi: ActOggi[]; cattureRecenti: CapRecente[]; totaleAttivitaOggi: number;
}
const CAP: Record<string, { label: string; token: string }> = {
  pending: { label: 'In attesa', token: 'neutral' }, proposed: { label: 'Da rivedere', token: 'warning' },
  applied: { label: 'Applicata', token: 'success' }, rejected: { label: 'Rifiutata', token: 'danger' },
};
const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'flusso');

export function DashboardPage() {
  const lk = useLookups();
  const { data, loading, error } = useApi<Dash>('/dashboard');
  return (
    <Page title="Dashboard">
      <div className="page-head">
        <div><h1>Dashboard</h1><div className="sub">Il polso dell'azienda, oggi.</div></div>
      </div>
      {loading && <Loading />}
      {error && <ErrorBox message={error} />}
      {data && (
        <>
          <div className="kpis">
            <div className="kpi">
              <div className="ic" style={{ background: 'var(--brand-wash)', color: 'var(--brand)' }}><Briefcase size={17} /></div>
              <div className="lab">Commesse attive</div><div className="val">{data.commesseAttive}</div>
            </div>
            <div className="kpi">
              <div className="ic" style={{ background: 'var(--flow-wash)', color: 'var(--flow)' }}><Clock size={17} /></div>
              <div className="lab">Ore, questa settimana</div><div className="val">{Math.round(data.oreSettimana / 60)}<small>h</small></div>
            </div>
            <div className="kpi">
              <div className="ic" style={{ background: 'var(--brand-wash)', color: 'var(--brand)' }}><Sparkles size={17} /></div>
              <div className="lab">Catture da rivedere</div><div className="val">{data.cattureDaRivedere}</div>
              <div className="trend">in attesa</div>
            </div>
            <div className="kpi">
              <div className="ic" style={{ background: 'var(--warning-wash)', color: 'var(--warning)' }}><AlertTriangle size={17} /></div>
              <div className="lab">Scadenze a rischio</div><div className="val" style={{ color: 'var(--danger)' }}>{data.scadenzeARischio}</div>
            </div>
          </div>

          <div className="grid2">
            <div className="panel">
              <div className="ph"><h3>Attività di oggi</h3><span className="chip">{data.totaleAttivitaOggi} totali</span></div>
              <div className="pb">
                {data.attivitaOggi.length === 0 ? <Empty text="Niente per oggi." /> : data.attivitaOggi.map((a) => (
                  <div className="row-li" key={a.id}>
                    <div style={{ flex: 1 }}><b>{a.title}</b>{a.engagementTitle ? ` — ${a.engagementTitle}` : ''}
                      <div className="cellsub">{fmtTime(a.scheduledStart)}</div></div>
                    <StatusPill label={lk.labelOf(a.statusId) || (a.statusCanonical ?? '')} token={lk.byId(a.statusId)?.colorToken} />
                  </div>
                ))}
              </div>
            </div>
            <div className="panel">
              <div className="ph"><h3>Catture recenti</h3></div>
              <div className="pb">
                {data.cattureRecenti.length === 0 ? <Empty text="Nessuna cattura." /> : data.cattureRecenti.map((c) => {
                  const s = CAP[c.status] ?? CAP.pending!;
                  return (
                    <div className="row-li" key={c.id}>
                      <div style={{ flex: 1 }}><span className="faint">«{c.rawText}»</span>
                        <div className="cellsub">{new Date(c.createdAt).toLocaleString('it-IT')}</div></div>
                      <StatusPill label={s.label} token={s.token} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}
