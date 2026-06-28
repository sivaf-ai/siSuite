/**
 * IconPicker — selettore icona per le CATEGORIE articolo.
 * Di default mostra la palette curata; con la ricerca testuale cerca tra TUTTE
 * le icone della libreria lucide (~1500) per nome (in inglese: "truck", "snow",
 * "drive"…). Salva il nome icona (kebab curato o PascalCase lucide).
 */
import { useMemo, useState } from 'react';
import { Ban, Search } from 'lucide-react';
import { CATEGORY_ICON_NAMES, ALL_ICON_NAMES, searchIcons, resolveCategoryIcon } from './categoryIcons';

export function IconPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const [q, setQ] = useState('');
  const names = useMemo(() => {
    if (q.trim()) return searchIcons(q.trim());
    // palette curata + l'icona corrente se è una lucide fuori palette (così resta evidenziata)
    const base = CATEGORY_ICON_NAMES.slice();
    if (value && !base.includes(value) && ALL_ICON_NAMES.includes(value)) base.unshift(value);
    return base;
  }, [q, value]);

  return (
    <>
      <style>{`
        .icpk-search{display:flex;align-items:center;gap:8px;height:34px;padding:0 11px;margin-bottom:8px;
          border:1.5px solid var(--line);border-radius:9px;background:var(--card);color:var(--ink-soft)}
        .icpk-search input{border:0;background:none;outline:none;font:inherit;font-size:13px;flex:1;color:var(--ink)}
        .icpk{display:grid;grid-template-columns:repeat(8,1fr);gap:6px;max-height:240px;overflow:auto}
        @media(max-width:560px){.icpk{grid-template-columns:repeat(6,1fr)}}
        .icpk-btn{display:grid;place-items:center;aspect-ratio:1;border:1.5px solid var(--line);
          border-radius:9px;background:var(--card);color:var(--ink-soft);cursor:pointer;transition:border .12s,background .12s,color .12s}
        .icpk-btn:hover{border-color:var(--brand);color:var(--brand)}
        .icpk-btn.on{border-color:var(--brand);background:var(--brand-wash);color:var(--brand)}
        .icpk-empty{grid-column:1/-1;color:var(--ink-faint);font-size:12.5px;padding:10px 2px}
      `}</style>
      <div className="icpk-search">
        <Search size={15} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca icona… (in inglese: truck, snow, drive, wifi…)" />
      </div>
      <div className="icpk">
        {!q.trim() && (
          <button type="button" className={`icpk-btn${!value ? ' on' : ''}`} title="Nessuna icona" onClick={() => onChange('')}>
            <Ban size={17} />
          </button>
        )}
        {names.map((name) => {
          const Ico = resolveCategoryIcon(name);
          return (
            <button type="button" key={name} className={`icpk-btn${value === name ? ' on' : ''}`} title={name} onClick={() => onChange(name)}>
              <Ico size={17} />
            </button>
          );
        })}
        {q.trim() && names.length === 0 && <div className="icpk-empty">Nessuna icona trovata per «{q}».</div>}
      </div>
    </>
  );
}
