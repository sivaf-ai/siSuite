/** NotificationsBell — campanella con conteggio + pannello popover del feed
 *  (scadenze a rischio, catture da rivedere). Il pannello è renderizzato via
 *  PORTAL su document.body e posizionato sopra la campana: così `position:fixed`
 *  è relativo alla viewport (la sidebar Ionic ha un transform che altrimenti
 *  ancorerebbe male il pannello). Click su una voce → naviga. */
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHistory } from 'react-router';
import { Bell, X } from 'lucide-react';
import { useApi } from '../api/hooks';
import { colorVars } from '../theme/palette';

interface Notif { id: string; kind: string; severity: 'danger' | 'warning' | 'info'; title: string; detail: string; at: string | null; link: string }

function whenLabel(at: string | null): string {
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}

export function NotificationsBell() {
  const { data, reload } = useApi<{ items: Notif[]; count: number }>('/notifications');
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; bottom: number }>({ left: 16, bottom: 72 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const history = useHistory();
  const items = data?.items ?? [];
  const count = data?.count ?? 0;

  function openPanel() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.max(8, r.left), bottom: Math.max(8, window.innerHeight - r.top + 8) });
    setOpen(true); void reload();
  }

  return (
    <>
      <button ref={btnRef} className="ds-iconbtn" style={{ position: 'relative' }} onClick={openPanel} aria-label="Notifiche" title="Notifiche">
        <Bell size={18} />
        {count > 0 && <span className="notif-badge">{count > 9 ? '9+' : count}</span>}
      </button>

      {open && createPortal(
        <>
          <div className="notif-backdrop" onClick={() => setOpen(false)} />
          <div className="notif-panel" style={{ left: pos.left, bottom: pos.bottom }} role="dialog" aria-label="Notifiche">
            <div className="notif-panel-head">
              <strong>Notifiche{count ? ` · ${count}` : ''}</strong>
              <button className="act-icon" onClick={() => setOpen(false)} aria-label="Chiudi"><X size={16} /></button>
            </div>
            <div className="notif-panel-body">
              {items.length === 0
                ? <div className="notif-empty">Nessuna notifica. Tutto sotto controllo.</div>
                : items.map((n) => (
                  <div key={n.id} className="notif-row" onClick={() => { setOpen(false); history.push(n.link); }}>
                    <span className="notif-dot" style={{ background: colorVars(n.severity).fg }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="notif-title">{n.title}</div>
                      <div className="notif-detail">{n.detail}</div>
                    </div>
                    {n.at && <span className="notif-when">{whenLabel(n.at)}</span>}
                  </div>
                ))}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
