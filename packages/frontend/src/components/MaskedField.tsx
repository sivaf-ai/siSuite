/**
 * MaskedField / PiiGate — campo con valore sensibile mascherato (brief §3.4, §5).
 *
 * Contratto:
 *  - Il SERVER decide se l'utente puo' vedere il valore in chiaro (permesso
 *    pii:read / serial:secret_read) e invia `unmasked`. Il valore in chiaro NON
 *    arriva mai al client senza permesso.
 *  - Anche con permesso, il valore parte NASCOSTO: lo si rivela con "Mostra"
 *    (azione esplicita e tracciabile lato server in fase 2). Mai loggato.
 *  - Senza permesso: bottone "lucchetto", nessuna rivelazione possibile.
 */
import { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

function clientMask(value: string | null, kind: 'name' | 'phone' | 'generic'): string {
  if (!value) return '—';
  if (kind === 'name') return value.trim().split(/\s+/).map((w) => (w ? `${w[0]}••••` : '')).join(' ');
  if (kind === 'phone') {
    const tail = value.replace(/\D/g, '').slice(-2);
    return tail ? `••• ••• •• ${tail}` : '••••••';
  }
  return '•'.repeat(Math.min(8, Math.max(4, value.length)));
}

export function MaskedField({
  value, unmasked, kind = 'generic', emptyText = '—',
}: {
  /** valore così come arriva dal server: in chiaro se unmasked, gia' mascherato altrimenti. */
  value: string | null;
  /** true = il server ha autorizzato il valore in chiaro (utente con permesso). */
  unmasked: boolean;
  kind?: 'name' | 'phone' | 'generic';
  emptyText?: string;
}) {
  const [shown, setShown] = useState(false);
  if (value == null || value === '') return <span className="faint">{emptyText}</span>;

  // Senza permesso: il server ha gia' mascherato; mostriamo + lucchetto inerte.
  if (!unmasked) {
    return (
      <span className="maskline">
        <Lock className="lockicon" />
        <span className="mk">{value}</span>
        <span className="reveal locked" data-tip="Serve il permesso pii.read"><Lock /> Bloccato</span>
      </span>
    );
  }

  // Con permesso: parte nascosto, "Mostra" rivela il chiaro.
  return (
    <span className="maskline">
      <Lock className="lockicon" />
      <span className="mk">{shown ? value : clientMask(value, kind)}</span>
      <button type="button" className="reveal" onClick={() => setShown((s) => !s)}>
        {shown ? <><EyeOff /> Nascondi</> : <><Eye /> Mostra</>}
      </button>
    </span>
  );
}
