/**
 * IconPicker — selettore icona a griglia per le CATEGORIE articolo.
 * Mostra la palette di CATEGORY_ICONS come bottoni; evidenzia la selezionata e salva
 * il kebabName. Prima opzione "nessuna" (value ''). Stile coi token, niente hard-code.
 */
import { Ban } from 'lucide-react';
import { CATEGORY_ICON_NAMES, resolveCategoryIcon } from './categoryIcons';

export function IconPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  return (
    <>
      <style>{`
        .icpk{display:grid;grid-template-columns:repeat(8,1fr);gap:6px}
        @media(max-width:560px){.icpk{grid-template-columns:repeat(6,1fr)}}
        .icpk-btn{display:grid;place-items:center;aspect-ratio:1;border:1.5px solid var(--line);
          border-radius:9px;background:var(--card);color:var(--ink-soft);cursor:pointer;transition:border .12s,background .12s,color .12s}
        .icpk-btn:hover{border-color:var(--brand);color:var(--brand)}
        .icpk-btn.on{border-color:var(--brand);background:var(--brand-wash);color:var(--brand)}
      `}</style>
      <div className="icpk">
        <button type="button" className={`icpk-btn${!value ? ' on' : ''}`} title="Nessuna icona" onClick={() => onChange('')}>
          <Ban size={17} />
        </button>
        {CATEGORY_ICON_NAMES.map((name) => {
          const Ico = resolveCategoryIcon(name);
          return (
            <button type="button" key={name} className={`icpk-btn${value === name ? ' on' : ''}`} title={name} onClick={() => onChange(name)}>
              <Ico size={17} />
            </button>
          );
        })}
      </div>
    </>
  );
}
