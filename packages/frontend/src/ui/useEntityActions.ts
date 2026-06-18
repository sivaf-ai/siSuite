/**
 * useEntityActions — handler standard (elimina/duplica) per le liste EntityList,
 * così ogni pagina li abilita con poche righe. La Modifica è gestita da EntityList
 * (apre la riga). L'Esporta è gestito da EntityList (colonne con `value`).
 */
import { mutate } from '../api/hooks';
import { ApiError } from '../api/client';
import { useToast } from './Toast';

const errMsg = (e: unknown) => (e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message);

export function useEntityActions<T extends { id: string }>(opts: {
  basePath: string;                         // es. '/companies'
  reload: () => void;
  noun?: string;                            // es. 'soggetto'
  /** corpo per la POST di duplicazione (dalla riga). Se assente, niente Duplica. */
  duplicateBody?: (row: T) => Record<string, unknown>;
}) {
  const toast = useToast();
  const noun = opts.noun ?? 'elemento';

  async function onDelete(rows: T[]) {
    try {
      for (const r of rows) await mutate('DELETE', `${opts.basePath}/${r.id}`);
      toast(rows.length > 1 ? `${rows.length} ${noun} eliminati` : `${noun.charAt(0).toUpperCase() + noun.slice(1)} eliminato`);
      opts.reload();
    } catch (e) { toast(errMsg(e) || 'Errore durante l\'eliminazione', 'error'); }
  }

  async function onDuplicate(row: T) {
    if (!opts.duplicateBody) return;
    try {
      await mutate('POST', opts.basePath, opts.duplicateBody(row));
      toast(`${noun.charAt(0).toUpperCase() + noun.slice(1)} duplicato`);
      opts.reload();
    } catch (e) { toast(errMsg(e) || 'Errore durante la duplicazione', 'error'); }
  }

  return { onDelete, onDuplicate };
}
