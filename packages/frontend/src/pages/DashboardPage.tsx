import { Briefcase, CheckCheck, Building2, Users, type LucideIcon } from 'lucide-react';
import { Page, Loading, ErrorBox } from '../components/Page';
import { useApi } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';

interface Counts { engagements: number; activitiesOpen: number; companies: number; resources: number }

function Kpi({ n, label, Icon, fg, bg }: { n: number; label: string; Icon: LucideIcon; fg: string; bg: string }) {
  return (
    <div className="kpi">
      <div className="ic" style={{ background: bg, color: fg }}><Icon size={17} /></div>
      <div className="lab">{label}</div>
      <div className="val">{n}</div>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const { data, loading, error } = useApi<Counts>('/dashboard');
  return (
    <Page title="Dashboard">
      <div className="page-head">
        <div>
          <h1>Ciao {user?.fullName?.split(' ')[0]}</h1>
          <div className="sub">Il quadro di oggi su commesse, attività e anagrafiche.</div>
        </div>
      </div>
      {loading && <Loading />}
      {error && <ErrorBox message={error} />}
      {data && (
        <div className="kpis">
          <Kpi n={data.engagements} label="Commesse" Icon={Briefcase} fg="var(--brand)" bg="var(--brand-wash)" />
          <Kpi n={data.activitiesOpen} label="Attività aperte" Icon={CheckCheck} fg="var(--flow)" bg="var(--flow-wash)" />
          <Kpi n={data.companies} label="Clienti" Icon={Building2} fg="var(--info)" bg="var(--info-wash)" />
          <Kpi n={data.resources} label="Risorse" Icon={Users} fg="var(--success)" bg="var(--success-wash)" />
        </div>
      )}
    </Page>
  );
}
