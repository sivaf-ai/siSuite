/**
 * CategoryPickerDialog — pick mode (§6.10): apre LO STESSO EntityTree delle Categorie
 * articolo in un modale, con TUTTA la toolbar e la creazione al volo. Differenza unica:
 * radio (selezione singola) + onPick(node) → ritorna l'id e chiude. Zero duplicazione:
 * stessa lista, stessa scheda, stesso codice, cambia solo mode.
 */
import type { MaterialCategoryDto } from '@sisuite/shared';
import { Modal } from './Modal';
import { EntityTree } from './EntityTree';
import { materialCategoryTreeConfig } from '../pages/CategoriePage';

export function CategoryPickerDialog({ open, onClose, onPick }: {
  open: boolean; onClose: () => void; onPick: (c: MaterialCategoryDto) => void;
}) {
  if (!open) return null;
  return (
    <Modal open size="xl" title="Seleziona categoria" onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Annulla</button>}>
      <EntityTree config={{ ...materialCategoryTreeConfig, mode: 'pick', onPick: (n) => { onPick(n); onClose(); } }} />
    </Modal>
  );
}
