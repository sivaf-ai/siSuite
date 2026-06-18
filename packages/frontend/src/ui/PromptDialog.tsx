/**
 * PromptDialog — richiesta di un valore (es. nome) con un POPUP STANDARD in-app,
 * centrato e formattato. Sostituisce window.prompt (mai usare i popup del browser).
 */
import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';

export function PromptDialog({
  open, title, message, label, placeholder, initial = '', confirmLabel = 'OK', required = true, onConfirm, onCancel,
}: {
  open: boolean; title: string; message?: string; label?: string; placeholder?: string;
  initial?: string; confirmLabel?: string; required?: boolean;
  onConfirm: (value: string) => void; onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setV(initial); setTimeout(() => ref.current?.focus(), 30); } }, [open, initial]);
  if (!open) return null;
  const ok = () => { if (required && !v.trim()) return; onConfirm(v.trim()); };
  return (
    <>
      <div className="drawer-backdrop" onClick={onCancel} style={{ zIndex: 1200 }} />
      <div role="dialog" aria-modal="true" style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1201,
        width: 'min(460px, 94vw)', background: 'var(--card)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-2)', padding: 22,
      }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, fontFamily: 'var(--font-display)' }}>{title}</h3>
        {message && <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, lineHeight: 1.5, margin: '6px 0 0' }}>{message}</p>}
        <div style={{ marginTop: 14 }}>
          {label && <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 5 }}>{label}</label>}
          <input ref={ref} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') onCancel(); }}
            style={{ width: '100%', height: 40, padding: '0 12px', fontSize: 14, fontFamily: 'inherit',
              border: '1.5px solid var(--line)', borderRadius: 10, outline: 'none', background: 'var(--card)', color: 'var(--ink)' }} />
        </div>
        <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn btn-ghost" style={{ fontSize: 13, height: 36 }} onClick={onCancel}><X size={15} /> Annulla</button>
          <button className="btn btn-primary" style={{ fontSize: 13, height: 36 }} onClick={ok} disabled={required && !v.trim()}><Check size={15} /> {confirmLabel}</button>
        </div>
      </div>
    </>
  );
}
