/** ColorSwatchPicker — griglia di swatch della palette curata (parte 8 §2).
 *  Sostituisce il vecchio select "Colore": l'utente sceglie da una palette
 *  coerente (no hex libero). Memorizza la chiave palette/semantica. */
import { Check } from 'lucide-react';
import { PALETTE, SEMANTIC, colorVars } from '../theme/palette';

export function ColorSwatchPicker({ value, onChange, includeSemantic = false }:
  { value?: string | null; onChange: (key: string) => void; includeSemantic?: boolean }) {
  const keys = includeSemantic ? [...SEMANTIC, ...PALETTE] : PALETTE;
  return (
    <div className="swatch-grid">
      {keys.map((k) => {
        const c = colorVars(k);
        const on = value === k;
        return (
          <button key={k} type="button" title={k} aria-label={k} aria-pressed={on}
            className={`swatch-btn${on ? ' on' : ''}`}
            style={{ background: c.bg, color: c.fg, borderColor: on ? c.fg : 'transparent' }}
            onClick={() => onChange(k)}>
            <span className="dot" style={{ background: c.fg }} />
            {on && <Check size={13} className="chk" />}
          </button>
        );
      })}
    </div>
  );
}
