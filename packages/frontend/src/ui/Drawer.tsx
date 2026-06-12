import type { ReactNode } from 'react';
import { X } from 'lucide-react';

/** Pannello slide-over per crea/modifica dalle liste. */
export function Drawer({ open, title, onClose, children, footer }:
  { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  if (!open) return null;
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true">
        <div className="drawer-head">
          <h2>{title}</h2>
          <div className="act-icon" onClick={onClose} aria-label="Chiudi"><X size={20} /></div>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </>
  );
}
