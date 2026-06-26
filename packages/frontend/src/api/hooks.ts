/** hooks.ts — piccoli hook per leggere/mutare via API. */
import { useCallback, useEffect, useState } from 'react';
import { useIonViewWillEnter } from '@ionic/react';
import { apiFetch } from './client';

/** Ricarica i dati ogni volta che la pagina torna in primo piano. Ionic tiene le
 *  pagine in cache (ion-page-hidden): senza questo, una lista resta ferma sui dati
 *  vecchi dopo aver creato/modificato un record in una scheda. Standard per le liste. */
export function useReloadOnEnter(reload: () => void): void {
  useIonViewWillEnter(() => { reload(); });
}

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!path) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch<T>(path));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => { void reload(); }, [reload]);
  return { data, loading, error, reload, setData };
}

export async function mutate<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method, body: body ? JSON.stringify(body) : undefined });
}
