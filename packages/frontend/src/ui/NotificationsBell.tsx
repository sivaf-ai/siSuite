/** NotificationsBell — campanella con conteggio + drawer del feed notifiche
 *  (scadenze a rischio, catture da rivedere). Click su una voce → naviga. */
import { useState } from 'react';
import { useHistory } from 'react-router';
import { Bell } from 'lucide-react';
import { useApi } from '../api/hooks';
import { Drawer } from './Drawer';
import { colorVars } from '../theme/palette';

interface Notif { id: string; kind: string; severity: 'danger' | 'warning' | 'info'; title: string; detail: string; at: string | null; link: string }

export function NotificationsBell() {
  const { data, reload } = useApi<{ items: Notif[]; count: number }>('/notifications');
  const [open, setOpen] = useState(false);
  const history = useHistory();
  const items = data?.items ?? [];
  const count = data?.count ?? 0;

  return (
    <>
      <button className="ds-iconbtn" style={{ position: 'relative' }} onClick={() => { setOpen(true); void reload(); }} aria-label="Notifiche" title="Notifiche">
        <Bell size={18} />
        {count > 0 && <span className="notif-badge">{count > 9 ? '9+' : count}</span>}
      </button>
      {open && (
        <Drawer open title={`Notifiche${count ? ` (${count})` : ''}`} onClose={() => setOpen(false)}>
          {items.length === 0
            ? <p className="muted" style={{ fontSize: 14 }}>Nessuna notifica. Tutto sotto controllo.</p>
            : items.map((n) => (
              <div key={n.id} className="notif-row" onClick={() => { setOpen(false); history.push(n.link); }}>
                <span className="notif-dot" style={{ background: colorVars(n.severity).fg }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="notif-title">{n.title}</div>
                  <div className="cellsub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.detail}</div>
                </div>
              </div>
            ))}
        </Drawer>
      )}
    </>
  );
}
