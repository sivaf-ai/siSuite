/** hooks.ts — piccoli hook per leggere/mutare via API. */
import { useCallback, useEffect, useState } from 'react';
import { useIonViewWillEnter } from '@ionic/react';
import { apiFetch } from './client';
import { resourceOf, subscribe } from './cache';

/** Ricarica i dati ogni volta che la pagina torna in primo piano. Ionic tiene le
 *  pagine in cache (ion-page-hidden): senza questo, una lista resta ferma sui dati
 *  vecchi dopo aver creato/modificato un record in una scheda. Standard per le liste. */
export function useReloadOnEnter(reload: () => void): void {
  useIonViewWillEnter(() => { reload(); });
}

/** Stato PERSISTITO in sessionStorage: sopravvive al round-trip lista→CRUD→lista
 *  (es. il toggle "Mostra archiviati") così tornando dalla scheda si rientra nella
 *  STESSA vista da cui si era partiti. Chiave per-entità. */
export function useStickyState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => {
    try { const raw = sessionStorage.getItem(key); return raw != null ? (JSON.parse(raw) as T) : initial; }
    catch { return initial; }
  });
  const set = useCallback((v: T) => {
    setVal(v);
    try { sessionStorage.setItem(key, JSON.stringify(v)); } catch { /* storage non disponibile */ }
  }, [key]);
  return [val, set];
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

  // auto-refresh: se un'altra parte dell'app muta questa risorsa, ricarico (no logout/login).
  useEffect(() => {
    if (!path) return;
    return subscribe(resourceOf(path), () => { void reload(); });
  }, [path, reload]);

  return { data, loading, error, reload, setData };
}

export async function mutate<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method, body: body ? JSON.stringify(body) : undefined });
}
