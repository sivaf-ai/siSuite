/**
 * ResourcePickerDialog — pop-up CENTRATO che riusa LA STESSA lista Risorse
 * (RisorsePage) in modalità SELEZIONE. Standard del gestionale: la lista + la
 * sua maschera CRUD si richiamano in popup da qualunque documento (es. risorsa
 * assegnata di una pick list, squadra di un ordine di lavoro). Dalla lista puoi:
 *   - selezionare una risorsa (radio in single, checkbox in multi);
 *   - "+ Nuovo": creare una risorsa al volo (CRUD in modale) senza uscire dal documento;
 *   - cliccare una riga: aprire la scheda risorsa, modificarla, poi selezionarla.
 * Ritorna i ResourceDto completi.
 */
import { useState } from 'react';
import type { ResourceDto } from '@sisuite/shared';
import { Modal } from './Modal';
import { RisorsePage } from '../pages/RisorsePage';

export function ResourcePickerDialog({ open, multi = false, onClose, onPick }: {
  open: boolean; multi?: boolean; onClose: () => void; onPick: (rs: ResourceDto[]) => void;
}) {
  const [sel, setSel] = useState<Record<string, ResourceDto>>({});
  if (!open) return null;

  const close = () => { setSel({}); onClose(); };
  const finalize = (rs: ResourceDto[]) => { onPick(rs); setSel({}); onClose(); };

  function toggle(r: ResourceDto) {
    if (!multi) { finalize([r]); return; }                       // single: seleziona e chiudi
    setSel((s) => { const n = { ...s }; if (n[r.id]) delete n[r.id]; else n[r.id] = r; return n; });
  }
  function onCreated(r: ResourceDto) {
    if (!multi) { finalize([r]); return; }                       // creata al volo → selezionata
    setSel((s) => ({ ...s, [r.id]: r }));
  }

  return (
    <Modal open size="xl" title="Seleziona risorsa" onClose={close}
      footer={multi ? (
        <>
          <button className="btn btn-ghost" onClick={close}>Annulla</button>
          <button className="btn btn-primary" disabled={!Object.keys(sel).length}
            onClick={() => finalize(Object.values(sel))}>
            Aggiungi {Object.keys(sel).length || ''} selezionate
          </button>
        </>
      ) : <button className="btn btn-ghost" onClick={close}>Annulla</button>}>
      <RisorsePage pickProps={{
        pick: multi ? 'multi' : 'single',
        selectedIds: Object.keys(sel),
        onToggleSelect: toggle,
        onCreated,
      }} />
    </Modal>
  );
}
