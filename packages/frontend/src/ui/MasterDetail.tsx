/**
 * MasterDetail (standard 7) — lista che RESTA + pannello persistente.
 * Cliccando una riga il pannello si aggiorna senza chiudersi; su mobile copre la lista.
 *
 *   <MasterDetail open={!!sel}
 *     list={<DataTable ... />}
 *     panel={<DetailPanel code="CLI-0184" title="…" onClose={…} footer={…}>…</DetailPanel>} />
 *
 * La GUARDIA sulle modifiche non salvate è responsabilità del chiamante (passa una
 * conferma in onRowClick): vedi useDirtyGuard sotto.
 */
import type { ReactNode } from 'react';
import { X, AlertTriangle } from 'lucide-react';

export function MasterDetail({ open, list, panel }: { open: boolean; list: ReactNode; panel?: ReactNode }) {
  return (
    <div className={`split${open ? ' open' : ''}`}>
      <div style={{ minWidth: 0 }}>{list}</div>
      {open && <aside className="detailpanel">{panel}</aside>}
    </div>
  );
}

export function DetailPanel({ code, title, sub, onClose, children, footer, dirty }: {
  code?: ReactNode; title: ReactNode; sub?: ReactNode; onClose: () => void;
  children: ReactNode; footer?: ReactNode; dirty?: boolean;
}) {
  return (
    <>
      <div className="dp-h">
        {code && <span className="code">{code}</span>}
        <button className="x" onClick={onClose} aria-label="Chiudi"><X size={16} /></button>
      </div>
      <div className="dp-b">
        <div className="dp-title">{title}</div>
        {sub && <div className="dp-sub">{sub}</div>}
        {children}
      </div>
      {dirty && <div className="dp-dirty"><AlertTriangle size={13} /> Modifiche non salvate</div>}
      {footer && <div className="dp-f">{footer}</div>}
    </>
  );
}
