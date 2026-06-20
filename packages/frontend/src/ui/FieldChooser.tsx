/**
 * FieldChooser (PIANO motore §1.1) — IL selettore di campi riusabile, due aree
 * (replica 1:1 mockup 55):
 *   - "scelti" in alto: righe con numero priorità, drag + ▲▼, ✕, e — solo in mode
 *     'sort' — toggle ↑Crescente/↓Decrescente;
 *   - "tutti i campi" in basso: ricerca + elenco raggruppato per sezione, clic = aggiungi.
 * Stesso gesto per Ordina/Colonne/Export/Report (cambia solo cosa fa la riga).
 */
import { useState } from 'react';
import { GripVertical, ArrowUp, ArrowDown, ChevronUp, ChevronDown, X, Plus, Search, ListOrdered, PlusCircle, Columns3, Sigma, Layers } from 'lucide-react';

export interface ChooserField { key: string; label: string; group?: string; numeric?: boolean }
export type ChooserMode = 'sort' | 'columns' | 'export' | 'report-show' | 'report-sum' | 'report-group';
export interface ChosenItem { key: string; dir?: 'asc' | 'desc'; fn?: string }

/** funzioni di aggregazione per i Totali, in funzione del tipo di campo (numerico vs no). */
export const AGG_FNS: { fn: string; label: string; numericOnly?: boolean }[] = [
  { fn: 'sum', label: 'Somma', numericOnly: true },
  { fn: 'avg', label: 'Media', numericOnly: true },
  { fn: 'min', label: 'Minimo', numericOnly: true },
  { fn: 'max', label: 'Massimo', numericOnly: true },
  { fn: 'count', label: 'Conteggio' },
];
const aggsFor = (numeric?: boolean) => AGG_FNS.filter((a) => numeric || !a.numericOnly);

const MODE_META: Record<ChooserMode, { label: string; icon: typeof ListOrdered; numericOnly?: boolean }> = {
  sort: { label: 'Ordina per (trascina per la priorità — il primo conta di più)', icon: ListOrdered },
  columns: { label: 'Colonne mostrate (trascina per l’ordine)', icon: Columns3 },
  export: { label: 'Campi da esportare (trascina per l’ordine)', icon: Columns3 },
  'report-show': { label: 'Campi da mostrare (trascina per l’ordine)', icon: Columns3 },
  'report-sum': { label: 'Totali — scegli i campi e la funzione', icon: Sigma },
  'report-group': { label: 'Raggruppa per (più livelli, il primo è il taglio principale)', icon: Layers },
};

export function FieldChooser({ fields, mode, value, onChange }: {
  fields: ChooserField[];
  mode: ChooserMode;
  value: ChosenItem[];
  onChange: (v: ChosenItem[]) => void;
}) {
  const [q, setQ] = useState('');
  const [dragI, setDragI] = useState<number | null>(null);
  const [overI, setOverI] = useState<number | null>(null);
  const meta = MODE_META[mode];
  const showDir = mode === 'sort';
  const showAgg = mode === 'report-sum';
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const chosenKeys = new Set(value.map((c) => c.key));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length || from === to) return;
    const next = [...value]; const [it] = next.splice(from, 1); next.splice(to, 0, it!); onChange(next);
  };
  const add = (key: string) => {
    if (chosenKeys.has(key)) return;
    const f = byKey.get(key);
    onChange([...value, { key, dir: showDir ? 'asc' : undefined, fn: showAgg ? (f?.numeric ? 'sum' : 'count') : undefined }]);
  };
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));
  const toggleDir = (i: number) => onChange(value.map((c, j) => (j === i ? { ...c, dir: c.dir === 'asc' ? 'desc' : 'asc' } : c)));
  const setFn = (i: number, fn: string) => onChange(value.map((c, j) => (j === i ? { ...c, fn } : c)));

  // area "tutti i campi": raggruppata per sezione, filtrata per ricerca, e (report-sum) solo numerici
  const avail = fields.filter((f) => (!meta.numericOnly || f.numeric) && f.label.toLowerCase().includes(q.toLowerCase()));
  const groups = new Map<string, ChooserField[]>();
  for (const f of avail) { const g = f.group ?? 'Campi'; if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(f); }

  return (
    <div className="eng-fieldchooser">
      <div className="eng-seclbl"><meta.icon /> {meta.label}</div>
      <div className="eng-chosen">
        {value.length === 0 && <div className="eng-emptyc">Nessun campo scelto — aggiungine qui sotto.</div>}
        {value.map((c, i) => {
          const f = byKey.get(c.key);
          return (
            <div key={c.key} className={`eng-crow${dragI === i ? ' drag' : ''}${overI === i ? ' over' : ''}`} draggable
              onDragStart={() => setDragI(i)}
              onDragEnd={() => { setDragI(null); setOverI(null); }}
              onDragOver={(e) => { e.preventDefault(); setOverI(i); }}
              onDragLeave={() => setOverI((o) => (o === i ? null : o))}
              onDrop={(e) => { e.preventDefault(); if (dragI != null) move(dragI, i); setDragI(null); setOverI(null); }}>
              <span className="grip"><GripVertical size={15} /></span>
              <span className="pn">{i + 1}</span>
              <span className="nm">{f?.label ?? c.key}</span>
              {showDir && (
                <button className="dir" onClick={() => toggleDir(i)}>
                  {c.dir === 'desc' ? <><ArrowDown /> Decrescente</> : <><ArrowUp /> Crescente</>}
                </button>
              )}
              {showAgg && (
                <select className="dir" value={c.fn ?? (f?.numeric ? 'sum' : 'count')} onChange={(e) => setFn(i, e.target.value)} style={{ height: 28, padding: '0 8px' }}>
                  {aggsFor(f?.numeric).map((a) => <option key={a.fn} value={a.fn}>{a.label}</option>)}
                </select>
              )}
              <span className="updown">
                <button disabled={i === 0} onClick={() => move(i, i - 1)}><ChevronUp size={13} /></button>
                <button disabled={i === value.length - 1} onClick={() => move(i, i + 1)}><ChevronDown size={13} /></button>
              </span>
              <button className="rm" title="Togli" onClick={() => remove(i)}><X size={15} /></button>
            </div>
          );
        })}
      </div>

      <div className="eng-availbox">
        <div className="eng-seclbl"><PlusCircle /> Aggiungi un campo</div>
        <div className="eng-availsearch"><Search /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca tra tutti i campi…" /></div>
        <div className="eng-availlist">
          {[...groups.entries()].map(([g, fs]) => (
            <div key={g}>
              <div className="eng-agrp">{g}</div>
              {fs.map((f) => (
                <div key={f.key} className={`eng-arow${chosenKeys.has(f.key) ? ' dis' : ''}`} onClick={() => add(f.key)}>
                  <span className="ad"><Plus size={14} /></span>{f.label}
                </div>
              ))}
            </div>
          ))}
          {avail.length === 0 && <div className="eng-arow dis">Nessun campo</div>}
        </div>
      </div>
    </div>
  );
}
