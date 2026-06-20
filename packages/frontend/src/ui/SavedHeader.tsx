/**
 * SavedHeader (PIANO motore §1.2) — la striscia "salva / carica / elimina" identica
 * in cima a Filtro, Ordina, Colonne, Export, Report. Replica `.saver` del mockup 55.
 * Presentazionale: lo storage lo decide chi la usa (filter_preset/export_preset/saved_view/saved_report).
 */
import { useState } from 'react';
import { Trash2, Save } from 'lucide-react';
import { PromptDialog } from './PromptDialog';

export interface SavedItem { id: string; name: string }

export function SavedHeader({ items, placeholder, value, onLoad, onSave, onDelete }: {
  items: SavedItem[];
  placeholder: string;
  value?: string | null;
  onLoad: (id: string) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [promptOpen, setPromptOpen] = useState(false);
  const selected = value ?? '';
  return (
    <div className="eng-saver">
      <select value={selected} onChange={(e) => { if (e.target.value) onLoad(e.target.value); }}>
        <option value="">{placeholder}</option>
        {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
      </select>
      <button className="ib danger" title="Elimina il salvataggio selezionato" disabled={!selected} onClick={() => selected && onDelete(selected)}>
        <Trash2 size={15} />
      </button>
      <button className="ib pri" title="Salva con un nome" onClick={() => setPromptOpen(true)}>
        <Save size={15} />
      </button>
      <PromptDialog open={promptOpen} title="Salva" message="Dai un nome al salvataggio: potrai ricaricarlo quando vuoi."
        label="Nome" placeholder="Es. Per nazione e nome" confirmLabel="Salva"
        onConfirm={(name) => { setPromptOpen(false); if (name.trim()) onSave(name.trim()); }} onCancel={() => setPromptOpen(false)} />
    </div>
  );
}
