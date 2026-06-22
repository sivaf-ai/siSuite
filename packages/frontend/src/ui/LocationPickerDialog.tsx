/**
 * LocationPickerDialog — pop-up CENTRATO che riusa LA STESSA lista magazzini/ubicazioni
 * (MagazzinoPage) in modalità SELEZIONE. Standard del gestionale: lista + CRUD
 * richiamati in popup da qualunque documento (es. origine/destinazione di un DDT).
 * Dalla lista puoi:
 *   - selezionare un'ubicazione (radio in single, checkbox in multi);
 *   - "+ Nuovo": creare un magazzino/ubicazione al volo (CRUD in modale);
 *   - cliccare una riga: aprire la scheda, modificarla, poi selezionarla.
 * Ritorna i StockLocationDto completi.
 */
import { useState } from 'react';
import type { StockLocationDto } from '@sisuite/shared';
import { Modal } from './Modal';
import { MagazzinoPage } from '../pages/MagazzinoPage';

export function LocationPickerDialog({ open, multi = false, onClose, onPick }: {
  open: boolean; multi?: boolean; onClose: () => void; onPick: (locs: StockLocationDto[]) => void;
}) {
  const [sel, setSel] = useState<Record<string, StockLocationDto>>({});
  if (!open) return null;

  const close = () => { setSel({}); onClose(); };
  const finalize = (locs: StockLocationDto[]) => { onPick(locs); setSel({}); onClose(); };

  function toggle(l: StockLocationDto) {
    if (!multi) { finalize([l]); return; }                       // single: seleziona e chiudi
    setSel((s) => { const n = { ...s }; if (n[l.id]) delete n[l.id]; else n[l.id] = l; return n; });
  }
  function onCreated(l: StockLocationDto) {
    if (!multi) { finalize([l]); return; }                       // creato al volo → selezionato
    setSel((s) => ({ ...s, [l.id]: l }));
  }

  return (
    <Modal open size="xl" title="Seleziona magazzino / ubicazione" onClose={close}
      footer={multi ? (
        <>
          <button className="btn btn-ghost" onClick={close}>Annulla</button>
          <button className="btn btn-primary" disabled={!Object.keys(sel).length}
            onClick={() => finalize(Object.values(sel))}>
            Aggiungi {Object.keys(sel).length || ''} selezionati
          </button>
        </>
      ) : <button className="btn btn-ghost" onClick={close}>Annulla</button>}>
      <MagazzinoPage pickProps={{
        pick: multi ? 'multi' : 'single',
        selectedIds: Object.keys(sel),
        onToggleSelect: toggle,
        onCreated,
      }} />
    </Modal>
  );
}
