import { IonIcon } from '@ionic/react';
import { briefcaseOutline, checkmarkDoneOutline, businessOutline, peopleOutline } from 'ionicons/icons';
import { Page, Loading, ErrorBox } from '../components/Page';
import { useApi } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';

interface Counts { engagements: number; activitiesOpen: number; companies: number; resources: number }

function Kpi({ n, label, icon, fg, bg }: { n: number; label: string; icon: string; fg: string; bg: string }) {
  return (
    <div className="kpi">
      <div className="ic" style={{ background: bg, color: fg }}><IonIcon icon={icon} /></div>
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
          <Kpi n={data.engagements} label="Commesse" icon={briefcaseOutline} fg="var(--brand)" bg="var(--brand-wash)" />
          <Kpi n={data.activitiesOpen} label="Attività aperte" icon={checkmarkDoneOutline} fg="var(--flow)" bg="var(--flow-wash)" />
          <Kpi n={data.companies} label="Clienti" icon={businessOutline} fg="var(--info)" bg="var(--info-wash)" />
          <Kpi n={data.resources} label="Risorse" icon={peopleOutline} fg="var(--success)" bg="var(--success-wash)" />
        </div>
      )}
    </Page>
  );
}
