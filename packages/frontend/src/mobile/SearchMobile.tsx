/** SearchMobile — ricerca rapida del tecnico su commesse e clienti (q param).
 *  Risultati di sola lettura (la vista telefono è autonoma). */
import { useState } from 'react';
import { Search, Briefcase, Building2 } from 'lucide-react';
import type { CompanyDto, EngagementDto } from '@sisuite/shared';
import { useApi } from '../api/hooks';

export function SearchMobile() {
  const [q, setQ] = useState('');
  const active = q.trim().length >= 2 ? encodeURIComponent(q.trim()) : null;
  const eng = useApi<{ items: EngagementDto[] }>(active ? `/engagements?q=${active}&limit=10` : null);
  const co = useApi<{ items: CompanyDto[] }>(active ? `/companies?q=${active}&limit=10` : null);

  const engItems = eng.data?.items ?? [];
  const coItems = co.data?.items ?? [];
  const empty = active && !eng.loading && !co.loading && engItems.length === 0 && coItems.length === 0;

  return (
    <div style={{ padding: '8px 2px 30px' }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '4px 2px 12px' }}>Cerca</h3>
      <div className="search" style={{ width: '100%' }}>
        <Search size={18} />
        <input autoFocus placeholder="Commessa o cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {!active && <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-faint)', fontSize: 13.5 }}>Scrivi almeno 2 caratteri.</div>}
      {empty && <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-soft)' }}>Nessun risultato per “{q}”.</div>}

      {coItems.length > 0 && <div className="m-sec">Clienti</div>}
      {coItems.map((c) => (
        <div className="m-sr" key={c.id}>
          <span className="ic"><Building2 size={18} /></span>
          <div className="srt"><b>{c.displayName}</b><span>{c.type === 'organization' ? 'Azienda' : 'Privato'}</span></div>
        </div>
      ))}

      {engItems.length > 0 && <div className="m-sec">Commesse</div>}
      {engItems.map((e) => (
        <div className="m-sr" key={e.id}>
          <span className="ic"><Briefcase size={18} /></span>
          <div className="srt"><b>{e.title}</b><span className="mono">{e.code}{e.companyName ? ` · ${e.companyName}` : ''}</span></div>
        </div>
      ))}
    </div>
  );
}
