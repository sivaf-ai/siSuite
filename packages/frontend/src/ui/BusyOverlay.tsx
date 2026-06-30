/**
 * BusyOverlay — overlay BLOCCANTE con spinner per le operazioni che durano qualche
 * secondo (eliminazioni massive, generazioni, import…). STANDARD: ogni operazione
 * non istantanea mostra questo overlay finché non finisce, senza refresh a video
 * intermedi (niente sfarfallio). Portale su <body>, copre tutto.
 */
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';

export function BusyOverlay({ open, message, progress }: {
  open: boolean;
  message?: string;
  /** opzionale {done,total} per una barra di avanzamento. */
  progress?: { done: number; total: number } | null;
}) {
  if (!open) return null;
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;
  return createPortal(
    <div role="alert" aria-busy="true" style={{
      position: 'fixed', inset: 0, zIndex: 1600, background: 'rgba(15,23,42,.55)',
      display: 'grid', placeItems: 'center', padding: 24, backdropFilter: 'blur(1.5px)',
    }}>
      <div style={{
        minWidth: 240, maxWidth: 360, background: 'var(--card)', color: 'var(--ink)', borderRadius: 'var(--r-lg)',
        border: '1px solid var(--line)', boxShadow: '0 20px 60px rgba(0,0,0,.30)', padding: '22px 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center',
      }}>
        <style>{`@keyframes bo-spin{to{transform:rotate(360deg)}}`}</style>
        <Loader2 size={30} style={{ color: 'var(--brand)', animation: 'bo-spin 0.8s linear infinite' }} />
        <div style={{ fontSize: 14, fontWeight: 600 }}>{message ?? 'Operazione in corso…'}</div>
        {pct != null && (
          <div style={{ width: '100%' }}>
            <div style={{ height: 7, borderRadius: 999, background: 'var(--neutral-wash)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--brand)', transition: 'width .15s' }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 6 }}>{progress!.done} / {progress!.total}</div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
