/**
 * Modal — finestra modale CENTRATA in pagina (overlay scuro + card centrale).
 * Usata per i pop-up di SELEZIONE (lista in modalità pick) e per le maschere
 * CRUD richiamate inline (es. "+ Nuovo" articolo dal DDT) senza lasciare la pagina.
 * Niente pannello laterale: standard del gestionale = popup al centro.
 */
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({ open, title, onClose, children, footer, size = 'lg' }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}) {
  if (!open) return null;
  const maxW = size === 'xl' ? 1100 : size === 'lg' ? 920 : 560;
  return (
    <div
      role="dialog" aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,.45)',
        display: 'grid', placeItems: 'center', padding: 24,
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: maxW, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          background: 'var(--card, #fff)', color: 'var(--ink)', borderRadius: 'var(--r-lg, 12px)',
          boxShadow: '0 20px 60px rgba(0,0,0,.30)', overflow: 'hidden', border: '1px solid var(--line)',
        }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '14px 18px', borderBottom: '1px solid var(--line)', flex: '0 0 auto',
        }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h2>
          <button className="act-icon" onClick={onClose} aria-label="Chiudi" style={{ cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ padding: 16, overflow: 'auto', flex: '1 1 auto' }}>{children}</div>
        {footer && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--line)', flex: '0 0 auto' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
