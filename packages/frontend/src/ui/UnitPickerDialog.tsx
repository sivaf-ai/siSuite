/**
 * UnitPickerDialog — pop-up CENTRATO che riusa LA STESSA lista Unità di misura
 * (UnitsPage) in modalità SELEZIONE. Standard del gestionale: lista + CRUD
 * richiamati in popup da qualunque maschera (es. UM di un articolo).
 * Dalla lista puoi:
 *   - selezionare un'unità (radio, single → seleziona e chiudi);
 *   - "+ Nuovo": creare un'unità al volo (CRUD nello stesso Modal);
 *   - cliccare una riga: aprire la scheda, modificarla, poi selezionarla.
 * Ritorna i UnitDto scelti. Mostra solo le unità ATTIVE (la lista esclude archiviate).
 */
import { useState } from 'react';
import type { UnitDto } from '@sisuite/shared';
import { Modal } from './Modal';
import { UnitsPage } from '../pages/UnitsPage';

export function UnitPickerDialog({ open, onClose, onPick }: {
  open: boolean; onClose: () => void; onPick: (units: UnitDto[]) => void;
}) {
  const [sel, setSel] = useState<Record<string, UnitDto>>({});
  if (!open) return null;

  const close = () => { setSel({}); onClose(); };
  const finalize = (units: UnitDto[]) => { onPick(units); setSel({}); onClose(); };

  function toggle(u: UnitDto) { finalize([u]); }          // single: seleziona e chiudi
  function onCreated(u: UnitDto) { finalize([u]); }        // creato al volo → selezionato

  return (
    <Modal open size="xl" title="Seleziona unità di misura" onClose={close}
      footer={<button className="btn btn-ghost" onClick={close}>Annulla</button>}>
      <UnitsPage pickProps={{
        pick: 'single',
        selectedIds: Object.keys(sel),
        onToggleSelect: toggle,
        onCreated,
      }} />
    </Modal>
  );
}
