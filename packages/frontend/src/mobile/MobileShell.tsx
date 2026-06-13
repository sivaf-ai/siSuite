/** MobileShell — shell standalone della vista TECNICO (rotta /m), incorniciata
 *  come un telefono per il demo su PC (brief §4). Tab interne (Oggi/Agenda/Cerca/
 *  Catture) + FAB di cattura. Riusa il flusso di cattura esistente (CaptureContent).
 *  È fuori dalla shell desktop (niente sidebar): si apre in una seconda finestra. */
import { useState } from 'react';
import { ListTodo, CalendarDays, Search, Layers, Mic, LogOut } from 'lucide-react';
import { PhoneFrame } from './PhoneFrame';
import { TodayMobile } from './TodayMobile';
import { CaptureContent } from '../pages/CapturePage';
import { useAuth } from '../auth/AuthContext';

type Tab = 'today' | 'agenda' | 'search' | 'captures';

function Placeholder({ title }: { title: string }) {
  return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-soft)' }}>{title} — in arrivo.</div>;
}

export function MobileShell() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('today');

  const content =
    tab === 'today' ? <TodayMobile onCapture={() => setTab('captures')} />
      : tab === 'captures' ? <CaptureContent />
        : tab === 'agenda' ? <Placeholder title="Agenda" />
          : <Placeholder title="Cerca" />;

  const tabbar = (
    <div className="tabbar">
      <button className={`tab${tab === 'today' ? ' active' : ''}`} onClick={() => setTab('today')}><ListTodo size={23} />Oggi</button>
      <button className={`tab${tab === 'agenda' ? ' active' : ''}`} onClick={() => setTab('agenda')}><CalendarDays size={23} />Agenda</button>
      <button className="fab" onClick={() => setTab('captures')} aria-label="Cattura"><Mic size={26} /></button>
      <button className={`tab${tab === 'search' ? ' active' : ''}`} onClick={() => setTab('search')}><Search size={23} />Cerca</button>
      <button className={`tab${tab === 'captures' ? ' active' : ''}`} onClick={() => setTab('captures')}><Layers size={23} />Catture</button>
    </div>
  );

  const caption = (
    <div className="phone-caption">
      <div className="t">Vista tecnico · {user?.fullName}</div>
      <div className="d" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        Telefono del tecnico (demo su PC)
        <button className="btn btn-ghost btn-sm" onClick={logout}><LogOut size={14} /> Esci</button>
      </div>
    </div>
  );

  return <PhoneFrame tabbar={tabbar} caption={caption}>{content}</PhoneFrame>;
}
