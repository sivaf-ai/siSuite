/** StatusPill — badge dal color_token (success/warning/danger/info/neutral). */
const COLORS: Record<string, { fg: string; bg: string }> = {
  success: { fg: 'var(--success)', bg: 'var(--success-wash)' },
  warning: { fg: 'var(--warning)', bg: 'var(--warning-wash)' },
  danger: { fg: 'var(--danger)', bg: 'var(--danger-wash)' },
  info: { fg: 'var(--info)', bg: 'var(--info-wash)' },
  brand: { fg: 'var(--brand-ink)', bg: 'var(--brand-wash)' },
  neutral: { fg: 'var(--ink-soft)', bg: 'var(--neutral-wash)' },
};

export function StatusPill({ label, token }: { label: string; token?: string | null }) {
  const c = COLORS[token ?? 'neutral'] ?? COLORS.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px',
      borderRadius: 'var(--r-pill)', fontSize: 12.5, fontWeight: 600, color: c!.fg, background: c!.bg, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
      {label}
    </span>
  );
}
