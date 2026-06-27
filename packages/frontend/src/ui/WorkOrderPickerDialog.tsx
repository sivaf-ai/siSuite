/**
 * WorkOrderPickerDialog — pop-up CENTRATO che riusa LA STESSA lista Ordini di
 * lavoro (OrdinativiPage) in modalità SELEZIONE. Solo selezione: niente azioni
 * bulk/assign/import/nuovo. Ritorna i WorkOrderDto completi.
 */
import { useState } from 'react';
import type { WorkOrderDto } from '@sisuite/shared';
import { Modal } from './Modal';
import { OrdinativiPage } from '../pages/OrdinativiPage';

export function WorkOrderPickerDialog({ open, multi = false, onClose, onPick }: {
  open: boolean; multi?: boolean; onClose: () => void; onPick: (ws: WorkOrderDto[]) => void;
}) {
  const [sel, setSel] = useState<Record<string, WorkOrderDto>>({});
  if (!open) return null;

  const close = () => { setSel({}); onClose(); };
  const finalize = (ws: WorkOrderDto[]) => { onPick(ws); setSel({}); onClose(); };

  function toggle(w: WorkOrderDto) {
    if (!multi) { finalize([w]); return; }                       // single: seleziona e chiudi
    setSel((s) => { const n = { ...s }; if (n[w.id]) delete n[w.id]; else n[w.id] = w; return n; });
  }

  return (
    <Modal open size="xl" title="Seleziona ordine di lavoro" onClose={close}
      footer={multi ? (
        <>
          <button className="btn btn-ghost" onClick={close}>Annulla</button>
          <button className="btn btn-primary" disabled={!Object.keys(sel).length}
            onClick={() => finalize(Object.values(sel))}>
            Aggiungi {Object.keys(sel).length || ''} selezionati
          </button>
        </>
      ) : <button className="btn btn-ghost" onClick={close}>Annulla</button>}>
      <OrdinativiPage pickProps={{
        pick: multi ? 'multi' : 'single',
        selectedIds: Object.keys(sel),
        onToggleSelect: toggle,
      }} />
    </Modal>
  );
}
