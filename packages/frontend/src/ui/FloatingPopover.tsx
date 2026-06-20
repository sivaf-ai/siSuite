/**
 * FloatingPopover (PIANO motore §1.3) — il pop-up che "naviga sopra" la scheda/lista:
 * backdrop tenue + finestra modale centrata in alto, NON sposta né ridisegna ciò che sta
 * sotto. Chiusura su click esterno / X / Esc. Replica `.popup` dei mockup 55/56.
 */
import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { LucideIcon } from './icons';
import '../theme/engine.css';

export function FloatingPopover({ title, icon: Icon, wide, saver, footer, onClose, children }: {
  title: string;
  icon?: LucideIcon;
  wide?: boolean;
  /** striscia opzionale sotto la testata (es. SavedHeader). */
  saver?: ReactNode;
  /** barra azioni in fondo (Pulisci/Applica…). */
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="eng-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`eng-pop${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="eng-head">
          <span className="t">{Icon && <Icon />} {title}</span>
          <button className="x" title="Chiudi" onClick={onClose}><X size={17} /></button>
        </div>
        {saver}
        <div className="eng-body">{children}</div>
        {footer && <div className="eng-foot">{footer}</div>}
      </div>
    </div>
  );
}
