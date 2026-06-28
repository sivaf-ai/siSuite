/**
 * CategoryPickerDialog — pop-up CENTRATO che riusa LO STESSO albero Categorie articolo
 * (CategoriePage) in modalità SELEZIONE. Il click su un nodo lo seleziona e chiude;
 * espandi/collassa e "+ Nuova categoria" restano disponibili (creazione al volo).
 * Ritorna la MaterialCategoryDto scelta (id, name, …).
 */
import type { MaterialCategoryDto } from '@sisuite/shared';
import { Modal } from './Modal';
import { CategoriePage } from '../pages/CategoriePage';

export function CategoryPickerDialog({ open, onClose, onPick }: {
  open: boolean; onClose: () => void; onPick: (c: MaterialCategoryDto) => void;
}) {
  if (!open) return null;
  return (
    <Modal open size="xl" title="Seleziona categoria" onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Annulla</button>}>
      <CategoriePage pickProps={{ onPick: (c) => { onPick(c); onClose(); } }} />
    </Modal>
  );
}
