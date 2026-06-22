/**
 * MaterialPickerDialog — pop-up CENTRATO che riusa LA STESSA lista Materiali
 * (MaterialiPage, quella di Anagrafiche → Materiali) in modalità SELEZIONE.
 * Standard del gestionale: la lista + la sua maschera CRUD si richiamano in
 * popup da qualunque documento (es. righe DDT). Dalla lista puoi:
 *   - selezionare un articolo (radio in single, checkbox in multi);
 *   - "+ Nuovo": creare un articolo al volo (CRUD in modale) senza uscire dal documento;
 *   - cliccare una riga: aprire la scheda articolo, modificarla, poi selezionarla.
 * Ritorna i MaterialDto completi.
 */
import { useState } from 'react';
import type { MaterialDto } from '@sisuite/shared';
import { Modal } from './Modal';
import { MaterialiPage } from '../pages/MaterialiPage';

export function MaterialPickerDialog({ open, multi = false, onClose, onPick }: {
  open: boolean; multi?: boolean; onClose: () => void; onPick: (mats: MaterialDto[]) => void;
}) {
  const [sel, setSel] = useState<Record<string, MaterialDto>>({});
  if (!open) return null;

  const close = () => { setSel({}); onClose(); };
  const finalize = (mats: MaterialDto[]) => { onPick(mats); setSel({}); onClose(); };

  function toggle(m: MaterialDto) {
    if (!multi) { finalize([m]); return; }                       // single: seleziona e chiudi
    setSel((s) => { const n = { ...s }; if (n[m.id]) delete n[m.id]; else n[m.id] = m; return n; });
  }
  function onCreated(m: MaterialDto) {
    if (!multi) { finalize([m]); return; }                       // creato al volo → selezionato
    setSel((s) => ({ ...s, [m.id]: m }));
  }

  return (
    <Modal open size="xl" title="Seleziona articolo" onClose={close}
      footer={multi ? (
        <>
          <button className="btn btn-ghost" onClick={close}>Annulla</button>
          <button className="btn btn-primary" disabled={!Object.keys(sel).length}
            onClick={() => finalize(Object.values(sel))}>
            Aggiungi {Object.keys(sel).length || ''} selezionati
          </button>
        </>
      ) : <button className="btn btn-ghost" onClick={close}>Annulla</button>}>
      <MaterialiPage pickProps={{
        pick: multi ? 'multi' : 'single',
        selectedIds: Object.keys(sel),
        onToggleSelect: toggle,
        onCreated,
      }} />
    </Modal>
  );
}
