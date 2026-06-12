/** gotrue.ts — login password contro GoTrue (authN). Ritorna l'access token. */
const AUTH_URL = (import.meta.env.VITE_AUTH_URL as string) ?? 'http://localhost:9999';

export async function loginWithPassword(email: string, password: string): Promise<string> {
  const res = await fetch(`${AUTH_URL}/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (body && (body.error_description || body.msg || body.error)) || 'Credenziali non valide';
    throw new Error(msg);
  }
  if (!body?.access_token) throw new Error('Risposta di login senza access_token');
  return body.access_token as string;
}
