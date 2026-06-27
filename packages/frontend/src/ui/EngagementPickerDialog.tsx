/**
 * EngagementPickerDialog — pop-up CENTRATO che riusa LA STESSA lista Commesse
 * (EngagementsPage) in modalità SELEZIONE. Solo selezione: creare una commessa
 * inline è oneroso/atipico, quindi niente "+ Nuovo" né CRUD embeddata.
 * Ritorna i EngagementDto completi.
 */
import { useState } from 'react';
import type { EngagementDto } from '@sisuite/shared';
import { Modal } from './Modal';
import { EngagementsPage } from '../pages/EngagementsPage';

export function EngagementPickerDialog({ open, multi = false, onClose, onPick }: {
  open: boolean; multi?: boolean; onClose: () => void; onPick: (es: EngagementDto[]) => void;
}) {
  const [sel, setSel] = useState<Record<string, EngagementDto>>({});
  if (!open) return null;

  const close = () => { setSel({}); onClose(); };
  const finalize = (es: EngagementDto[]) => { onPick(es); setSel({}); onClose(); };

  function toggle(e: EngagementDto) {
    if (!multi) { finalize([e]); return; }                       // single: seleziona e chiudi
    setSel((s) => { const n = { ...s }; if (n[e.id]) delete n[e.id]; else n[e.id] = e; return n; });
  }

  return (
    <Modal open size="xl" title="Seleziona commessa" onClose={close}
      footer={multi ? (
        <>
          <button className="btn btn-ghost" onClick={close}>Annulla</button>
          <button className="btn btn-primary" disabled={!Object.keys(sel).length}
            onClick={() => finalize(Object.values(sel))}>
            Aggiungi {Object.keys(sel).length || ''} selezionate
          </button>
        </>
      ) : <button className="btn btn-ghost" onClick={close}>Annulla</button>}>
      <EngagementsPage pickProps={{
        pick: multi ? 'multi' : 'single',
        selectedIds: Object.keys(sel),
        onToggleSelect: toggle,
      }} />
    </Modal>
  );
}
