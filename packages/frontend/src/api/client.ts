/** client.ts — wrapper fetch verso il backend, con Bearer token. */
import { invalidatePath } from './cache';

const API_URL = (import.meta.env.VITE_API_URL as string) ?? 'http://localhost:3010';
const TOKEN_KEY = 'sisuite_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API ${status}`);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  // content-type JSON solo se c'è un body: Fastify rifiuta una richiesta con
  // content-type application/json e body vuoto (es. DELETE senza payload) con un 400.
  if (init.body != null) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, body);
  // mutazione andata a buon fine → invalida la risorsa: liste/maschere che la usano si ricaricano
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET') invalidatePath(path);
  return body as T;
}

/** Upload multipart (FormData): NON impostare content-type, lo fa il browser col boundary. */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set('authorization', `Bearer ${token}`);
  const res = await fetch(`${API_URL}${path}`, { method: 'POST', headers, body: form });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, body);
  invalidatePath(path);
  return body as T;
}
