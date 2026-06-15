/** palette.ts — palette colori curata (parte 8 §2). lookup_value.color_token
 *  memorizza una CHIAVE (semantica o di palette); qui la risolviamo nei token CSS
 *  (var --c-<key> / --c-<key>-wash) con variante chiaro/scuro automatica. */

/** Colori liberi della palette (32), coerenti e a prova di tema scuro.
 *  Ogni chiave ha una variante chiaro/scuro AUTOMATICA (token `--c-<key>` /
 *  `--c-<key>-wash` definiti in variables.css per `:root` e `[data-theme=dark]`):
 *  l'utente sceglie UN solo colore, il tema applica la tonalità giusta. */
export const PALETTE: string[] = [
  'rose', 'pink', 'fuchsia', 'magenta', 'plum', 'purple', 'violet', 'indigo',
  'navy', 'blue', 'azure', 'sky', 'cyan', 'teal', 'jade', 'emerald',
  'forest', 'green', 'olive', 'lime', 'yellow', 'gold', 'amber', 'orange',
  'brown', 'red', 'maroon', 'slate', 'gray', 'zinc', 'stone', 'charcoal',
];

/** Token semantici di sistema (per gli stati logici): restano disponibili. */
export const SEMANTIC: string[] = ['success', 'warning', 'danger', 'info', 'brand', 'neutral'];

const SEMANTIC_VARS: Record<string, { fg: string; bg: string }> = {
  success: { fg: 'var(--success)', bg: 'var(--success-wash)' },
  warning: { fg: 'var(--warning)', bg: 'var(--warning-wash)' },
  danger: { fg: 'var(--danger)', bg: 'var(--danger-wash)' },
  info: { fg: 'var(--info)', bg: 'var(--info-wash)' },
  brand: { fg: 'var(--brand-ink)', bg: 'var(--brand-wash)' },
  neutral: { fg: 'var(--ink-soft)', bg: 'var(--neutral-wash)' },
};

/** {fg,bg} per un color_token (palette o semantico); fallback neutral. */
export function colorVars(token?: string | null): { fg: string; bg: string } {
  const t = token ?? 'neutral';
  if (PALETTE.includes(t)) return { fg: `var(--c-${t})`, bg: `var(--c-${t}-wash)` };
  return SEMANTIC_VARS[t] ?? SEMANTIC_VARS.neutral!;
}

/** Colore "pieno" (per il pallino swatch). */
export function swatchColor(token?: string | null): string { return colorVars(token).fg; }
