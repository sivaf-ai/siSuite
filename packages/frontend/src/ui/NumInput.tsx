/**
 * NumInput — input numerico controllato con formattazione it-IT.
 * Fuori focus MOSTRA il numero formattato (migliaia '.', decimali ','); in focus
 * mostra il valore grezzo modificabile (punto decimale). Il parsing è robusto:
 * accetta sia '1.234,56' (it-IT) sia '1234.56' (grezzo). Va in una cella tabella
 * (.subt td.num) o ovunque serva un campo numerico "label nel bordo"-compatibile.
 */
import { useEffect, useState } from 'react';

export interface NumInputProps {
  value: number | null;
  onChange: (n: number | null) => void;
  disabled?: boolean;
  align?: 'right';
  placeholder?: string;
}

/** formatta un numero in it-IT (max 2 decimali, separatore migliaia). */
function fmt(n: number | null): string {
  if (n == null || Number.isNaN(n)) return '';
  return n.toLocaleString('it-IT', { maximumFractionDigits: 2 });
}

/** valore grezzo per l'editing (punto decimale, niente migliaia). */
function raw(n: number | null): string {
  if (n == null || Number.isNaN(n)) return '';
  return String(n);
}

/** parsing robusto: accetta '1.234,56' (it-IT) e '1234.56' (grezzo). */
function parse(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  let norm: string;
  if (t.includes(',')) {
    // formato it-IT: i punti sono migliaia, la virgola è decimale
    norm = t.replace(/\./g, '').replace(',', '.');
  } else {
    // niente virgola: il punto è il separatore decimale (grezzo)
    norm = t;
  }
  norm = norm.replace(/[^0-9.\-]/g, '');
  const n = Number(norm);
  return Number.isNaN(n) ? null : n;
}

export function NumInput({ value, onChange, disabled, align, placeholder }: NumInputProps) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState('');

  // quando NON è in focus, il testo segue il valore esterno (formattato).
  useEffect(() => {
    if (!focused) setText(fmt(value));
  }, [value, focused]);

  return (
    <input
      className="bi mono"
      style={align === 'right' ? { minHeight: 32, textAlign: 'right' } : { minHeight: 32 }}
      type="text"
      inputMode="decimal"
      disabled={disabled}
      placeholder={placeholder}
      value={focused ? text : fmt(value)}
      onFocus={() => { setFocused(true); setText(raw(value)); }}
      onChange={(e) => { setText(e.target.value); onChange(parse(e.target.value)); }}
      onBlur={() => { setFocused(false); setText(fmt(value)); }}
    />
  );
}
