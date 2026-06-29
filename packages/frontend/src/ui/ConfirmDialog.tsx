import { AlertTriangle } from 'lucide-react';

/** Conferma azioni distruttive (elimina). Supporta un'azione EXTRA opzionale
 *  (es. eliminazione a più vie: «Riassegna» come conferma + «Elimina ramo» come extra). */
export function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel, danger, busy, onConfirm, onCancel, extraLabel, extraDanger, onExtra }:
  { open: boolean; title: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; busy?: boolean;
    onConfirm: () => void; onCancel: () => void; extraLabel?: string; extraDanger?: boolean; onExtra?: () => void }) {
  if (!open) return null;
  return (
    <>
      <div className="drawer-backdrop" onClick={onCancel} style={{ zIndex: 1100 }} />
      <div role="dialog" aria-modal="true" style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1101,
        width: 'min(460px, 94vw)', background: 'var(--card)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-2)', padding: 24,
      }}>
        <div style={{ display: 'flex', gap: 14 }}>
          {danger && <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--danger-wash)', color: 'var(--danger)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><AlertTriangle size={22} /></div>}
          <div>
            <h3 style={{ fontSize: 18, marginBottom: 6 }}>{title}</h3>
            <p style={{ color: 'var(--ink-soft)', fontSize: 14, lineHeight: 1.5 }}>{message}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>{cancelLabel ?? 'Annulla'}</button>
          {extraLabel && onExtra && (
            <button className={`btn ${extraDanger ? 'btn-danger' : 'btn-ghost'}`} onClick={onExtra} disabled={busy}>{extraLabel}</button>
          )}
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
            {confirmLabel ?? 'Conferma'}
          </button>
        </div>
      </div>
    </>
  );
}
