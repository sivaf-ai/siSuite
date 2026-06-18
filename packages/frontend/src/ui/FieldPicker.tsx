/**
 * FieldPicker — popup STANDARD per scegliere e RIORDINARE campi (drag delle righe).
 * Usato da: Esporta (con preset per-utente) e Colonne (mostra/nascondi colonne).
 * I bottoni (Salva · Annulla · OK) sono IN ALTO così non restano in fondo con molti campi.
 * Le etichette dei campi sono quelle visibili in tabella (label localizzata), non le costanti.
 */
import { useState, type ReactNode } from 'react';
import { GripVertical, Check, X } from 'lucide-react';

export interface FieldOpt { key: string; label: string }

export function FieldPicker({
  open, title, fields, value, onCancel, onConfirm, confirmLabel = 'OK', onSave, topExtra,
}: {
  open: boolean; title: string; fields: FieldOpt[]; value: string[];
  onCancel: () => void; onConfirm: (orderedSelectedKeys: string[]) => void;
  confirmLabel?: string; onSave?: (orderedSelectedKeys: string[]) => void; topExtra?: ReactNode;
}) {
  const labelOf = (k: string) => fields.find((f) => f.key === k)?.label ?? k;
  // ordine iniziale: prima i selezionati (nell'ordine `value`), poi i rimanenti
  const init = [...value, ...fields.map((f) => f.key).filter((k) => !value.includes(k))];
  const [order, setOrder] = useState<string[]>(init);
  const [sel, setSel] = useState<Set<string>>(new Set(value));
  const [drag, setDrag] = useState<string | null>(null);

  if (!open) return null;

  const selectedOrdered = () => order.filter((k) => sel.has(k));
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const move = (from: string, to: string) => setOrder((o) => {
    if (from === to) return o;
    const a = [...o]; const fi = a.indexOf(from); a.splice(fi, 1);
    const ti = a.indexOf(to); a.splice(ti, 0, from); return a;
  });
  const allOn = sel.size === fields.length;

  return (
    <div className="fp-back" onClick={onCancel}>
      <div className="fp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fp-head">
          <div className="fp-title">{title}</div>
          <div className="fp-acts">
            {onSave && <button className="fp-btn ghost" onClick={() => onSave(selectedOrdered())}><Check size={15} /> Salva</button>}
            <button className="fp-btn ghost" onClick={onCancel}><X size={15} /> Annulla</button>
            <button className="fp-btn primary" onClick={() => onConfirm(selectedOrdered())} disabled={sel.size === 0}><Check size={15} /> {confirmLabel}</button>
          </div>
        </div>
        {topExtra && <div className="fp-extra">{topExtra}</div>}
        <div className="fp-tools">
          <label className="fp-all"><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(fields.map((f) => f.key)))} /> Tutti</label>
          <span className="faint" style={{ fontSize: 11.5 }}>Trascina <GripVertical size={12} style={{ verticalAlign: '-2px' }} /> per riordinare</span>
        </div>
        <div className="fp-list">
          {order.map((k) => (
            <div key={k} className={`fp-row${drag === k ? ' dragging' : ''}`} draggable
              onDragStart={() => setDrag(k)} onDragEnd={() => setDrag(null)}
              onDragOver={(e) => { e.preventDefault(); if (drag && drag !== k) move(drag, k); }}>
              <span className="fp-grip"><GripVertical size={15} /></span>
              <label className="fp-lbl"><input type="checkbox" checked={sel.has(k)} onChange={() => toggle(k)} /> {labelOf(k)}</label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** stili del picker (montati una volta). */
export function FieldPickerStyles(): ReactNode {
  return (
    <style>{`
      .fp-back { position: fixed; inset: 0; background: rgba(20,18,40,.34); display: grid; place-items: center; z-index: 1000; padding: 20px; }
      .fp-modal { width: 600px; max-width: 96vw; max-height: 84vh; background: var(--card); border-radius: 16px; box-shadow: var(--shadow-pop); display: flex; flex-direction: column; overflow: hidden; }
      /* titolo su riga propria, pulsanti sotto a destra: niente testo che va a capo */
      .fp-head { display: flex; flex-direction: column; align-items: stretch; gap: 11px; padding: 16px 18px 12px; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: var(--card); }
      .fp-title { font-family: var(--font-display); font-weight: 700; font-size: 16px; line-height: 1.2; }
      .fp-acts { display: flex; gap: 8px; justify-content: flex-end; }
      .fp-btn { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid var(--line); background: var(--card); color: var(--ink); }
      .fp-btn svg { width: 15px; height: 15px; }
      .fp-btn.ghost:hover { background: var(--paper); }
      .fp-btn.primary { background: var(--brand); color: #fff; border-color: transparent; }
      .fp-btn.primary:hover { background: var(--brand-press); }
      .fp-btn:disabled { opacity: .5; cursor: not-allowed; }
      .fp-extra { padding: 12px 18px 0; }
      .fp-tools { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px 6px; font-size: 12.5px; }
      .fp-all { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 600; cursor: pointer; }
      .fp-list { overflow-y: auto; padding: 4px 12px 14px; }
      .fp-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; background: var(--card); }
      .fp-row:hover { background: var(--paper); }
      .fp-row.dragging { opacity: .5; }
      .fp-grip { color: var(--ink-faint); cursor: grab; display: inline-flex; }
      .fp-lbl { display: inline-flex; align-items: center; gap: 10px; font-size: 13.5px; cursor: pointer; flex: 1; }
      .fp-back input[type=checkbox], .fp-all input { width: 16px; height: 16px; accent-color: var(--brand); }
    `}</style>
  );
}
