/**
 * useEntityActions — handler standard (elimina/duplica) per le liste EntityList,
 * così ogni pagina li abilita con poche righe. La Modifica è gestita da EntityList
 * (apre la riga). L'Esporta è gestito da EntityList (colonne con `value`).
 *
 * DUPLICA (standard): NON crea subito una copia. Apre la maschera CRUD "nuovo"
 * PRE-COMPILATA con i dati della riga (esclusi i campi chiave, che si rigenerano),
 * passando i dati come `state.prefill` della navigazione. L'utente modifica e poi
 * fa Salva o Annulla. La scheda di dettaglio legge `location.state.prefill` quando
 * è in creazione. Agisce su UNA riga alla volta.
 */
import { useHistory } from 'react-router';
import { mutate } from '../api/hooks';
import { ApiError } from '../api/client';
import { useToast } from './Toast';

const errMsg = (e: unknown) => (e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message);

export function useEntityActions<T extends { id: string }>(opts: {
  basePath: string;                         // es. '/companies'
  reload: () => void;
  noun?: string;                            // es. 'soggetto'
  /** prefill per il CRUD "nuovo" (dalla riga, SENZA i campi chiave). Se assente, niente Duplica. */
  duplicateBody?: (row: T) => Record<string, unknown>;
  /** rotta del CRUD "nuovo" (default `${basePath}/new`). Override se la rotta UI ≠ basePath API. */
  newPath?: string;
}) {
  const toast = useToast();
  const history = useHistory();
  const noun = opts.noun ?? 'elemento';

  async function onDelete(rows: T[]) {
    try {
      for (const r of rows) await mutate('DELETE', `${opts.basePath}/${r.id}`);
      toast(rows.length > 1 ? `${rows.length} ${noun} eliminati` : `${noun.charAt(0).toUpperCase() + noun.slice(1)} eliminato`);
      opts.reload();
    } catch (e) { toast(errMsg(e) || 'Errore durante l\'eliminazione', 'error'); }
  }

  // Duplica = apri il CRUD nuovo precompilato (no POST immediata). Una riga alla volta.
  function onDuplicate(row: T) {
    if (!opts.duplicateBody) return;
    const prefill = opts.duplicateBody(row);
    history.push(opts.newPath ?? `${opts.basePath}/new`, { prefill });
  }

  return { onDelete, onDuplicate };
}
