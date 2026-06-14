/** StatusPill — badge dal color_token (semantico O chiave palette curata). */
import { colorVars } from '../theme/palette';

export function StatusPill({ label, token }: { label: string; token?: string | null }) {
  const c = colorVars(token);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px',
      borderRadius: 'var(--r-pill)', fontSize: 12.5, fontWeight: 600, color: c.fg, background: c.bg, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
      {label}
    </span>
  );
}
