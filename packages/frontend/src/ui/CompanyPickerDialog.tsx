/**
 * CompanyPickerDialog — pop-up CENTRATO che riusa LA STESSA lista soggetti
 * (ClientiPage) in modalità SELEZIONE. Standard del gestionale: lista + CRUD
 * richiamati in popup da qualunque documento (es. fornitore di un ordine d'acquisto).
 * Dalla lista puoi:
 *   - selezionare un soggetto (radio in single, checkbox in multi);
 *   - "+ Nuovo": creare un soggetto al volo (CRUD in modale) senza uscire dal documento;
 *   - cliccare una riga: aprire la scheda, modificarla, poi selezionarla.
 * Se `role` è passato (es. 'supplier') imposta la vista iniziale, ma la lista mostra
 * comunque TUTTE le aziende (un fornitore potrebbe non avere ancora il ruolo).
 * Ritorna i CompanyDto completi.
 */
import { useState } from 'react';
import type { CompanyDto } from '@sisuite/shared';
import { Modal } from './Modal';
import { ClientiPage } from '../pages/ClientiPage';

export function CompanyPickerDialog({ open, multi = false, role, onClose, onPick }: {
  open: boolean; multi?: boolean; role?: string; onClose: () => void; onPick: (cs: CompanyDto[]) => void;
}) {
  const [sel, setSel] = useState<Record<string, CompanyDto>>({});
  if (!open) return null;

  const close = () => { setSel({}); onClose(); };
  const finalize = (cs: CompanyDto[]) => { onPick(cs); setSel({}); onClose(); };

  function toggle(c: CompanyDto) {
    if (!multi) { finalize([c]); return; }                       // single: seleziona e chiudi
    setSel((s) => { const n = { ...s }; if (n[c.id]) delete n[c.id]; else n[c.id] = c; return n; });
  }
  function onCreated(c: CompanyDto) {
    if (!multi) { finalize([c]); return; }                       // creato al volo → selezionato
    setSel((s) => ({ ...s, [c.id]: c }));
  }

  return (
    <Modal open size="xl" title="Seleziona soggetto" onClose={close}
      footer={multi ? (
        <>
          <button className="btn btn-ghost" onClick={close}>Annulla</button>
          <button className="btn btn-primary" disabled={!Object.keys(sel).length}
            onClick={() => finalize(Object.values(sel))}>
            Aggiungi {Object.keys(sel).length || ''} selezionati
          </button>
        </>
      ) : <button className="btn btn-ghost" onClick={close}>Annulla</button>}>
      <ClientiPage pickProps={{
        pick: multi ? 'multi' : 'single',
        selectedIds: Object.keys(sel),
        onToggleSelect: toggle,
        onCreated,
        role,
      }} />
    </Modal>
  );
}
