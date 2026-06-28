/**
 * SitePickerDialog — pop-up CENTRATO che riusa LA STESSA lista siti (SitiPage) in
 * modalità SELEZIONE. Standard del gestionale: lista + CRUD richiamati in popup da
 * qualunque documento (es. il sito di un Asset). Dalla lista puoi:
 *   - selezionare un sito (radio in single, checkbox in multi);
 *   - "+ Nuovo": crearlo al volo (CRUD in modale annidato);
 *   - cliccare una riga: aprirla, modificarla, poi selezionarla.
 * `companyId` opzionale filtra i siti di un cliente (utile per l'Asset di quel cliente).
 * Ritorna i SiteDto completi.
 */
import { useState } from 'react';
import type { SiteDto } from '@sisuite/shared';
import { Modal } from './Modal';
import { SitiPage } from '../pages/SitiPage';

export function SitePickerDialog({ open, multi = false, companyId, onClose, onPick }: {
  open: boolean; multi?: boolean; companyId?: string; onClose: () => void; onPick: (sites: SiteDto[]) => void;
}) {
  const [sel, setSel] = useState<Record<string, SiteDto>>({});
  if (!open) return null;

  const close = () => { setSel({}); onClose(); };
  const finalize = (sites: SiteDto[]) => { onPick(sites); setSel({}); onClose(); };

  function toggle(s: SiteDto) {
    if (!multi) { finalize([s]); return; }                       // single: seleziona e chiudi
    setSel((m) => { const n = { ...m }; if (n[s.id]) delete n[s.id]; else n[s.id] = s; return n; });
  }
  function onCreated(s: SiteDto) {
    if (!multi) { finalize([s]); return; }                       // creato al volo → selezionato
    setSel((m) => ({ ...m, [s.id]: s }));
  }

  return (
    <Modal open size="xl" title="Seleziona sito / località" onClose={close}
      footer={multi ? (
        <>
          <button className="btn btn-ghost" onClick={close}>Annulla</button>
          <button className="btn btn-primary" disabled={!Object.keys(sel).length}
            onClick={() => finalize(Object.values(sel))}>
            Aggiungi {Object.keys(sel).length || ''} selezionati
          </button>
        </>
      ) : <button className="btn btn-ghost" onClick={close}>Annulla</button>}>
      <SitiPage pickProps={{
        pick: multi ? 'multi' : 'single',
        selectedIds: Object.keys(sel),
        onToggleSelect: toggle,
        onCreated,
        companyId,
      }} />
    </Modal>
  );
}
