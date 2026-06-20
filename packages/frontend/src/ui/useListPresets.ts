/** useListPresets — storage del SavedHeader del motore liste (PIANO §1.2/§7).
 *  Preset per-utente per (entity, kind), via /list-presets. */
import { useApi, mutate } from '../api/hooks';

export interface ListPreset { id: string; name: string; payload: unknown }

export function useListPresets(entity: string | undefined, kind: 'filter' | 'sort' | 'columns' | 'export') {
  const path = entity ? `/list-presets?entity=${encodeURIComponent(entity)}&kind=${kind}` : null;
  const { data, reload } = useApi<{ items: ListPreset[] }>(path);
  const items = data?.items ?? [];
  const save = async (name: string, payload: unknown) => {
    if (!entity) return;
    await mutate('POST', '/list-presets', { entity, kind, name, payload });
    void reload();
  };
  const remove = async (id: string) => { await mutate('DELETE', `/list-presets/${id}`); void reload(); };
  return { items, save, remove };
}
