/**
 * cache.ts — invalidazione cross-componente (no logout/login per vedere i dati nuovi).
 *
 * Problema: Ionic tiene le pagine in cache (ion-page-hidden) e ogni `useApi` legge
 * una volta; dopo aver creato/modificato/cancellato un record in una scheda, le
 * liste e le maschere che usano quella entità restavano sui dati vecchi.
 *
 * Soluzione: ogni mutazione (POST/PATCH/PUT/DELETE) invalida la "risorsa" toccata
 * (il primo segmento del path, es. `units`, `materials`, `stock`); tutti gli
 * `useApi` montati su quella risorsa si ricaricano da soli. Hand-rolled, minimale.
 */
type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

/** ricava la "risorsa" dal path API: '/units?x' → 'units'; '/stock/documents/1' → 'stock'. */
export function resourceOf(path: string): string {
  const clean = path.replace(/^\//, '').split('?')[0] ?? '';
  return clean.split('/')[0] ?? '';
}

export function subscribe(resource: string, fn: Listener): () => void {
  let set = listeners.get(resource);
  if (!set) { set = new Set(); listeners.set(resource, set); }
  set.add(fn);
  return () => { set!.delete(fn); };
}

/** Notifica i sottoscrittori delle risorse indicate (ricaricano i loro dati). */
export function invalidate(resources: string[]): void {
  for (const r of resources) listeners.get(r)?.forEach((fn) => fn());
}

/** Invalida la risorsa di un path mutato. Chiamata automaticamente da apiFetch/apiUpload. */
export function invalidatePath(path: string): void {
  const r = resourceOf(path);
  if (r) invalidate([r]);
}
