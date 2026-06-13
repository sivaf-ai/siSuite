/**
 * demo/lib.ts — utilità condivise dal loader/unloader dei Demo Data Pack.
 *
 * Principio (brief §6): un TENANT per pack (es. "Fibra Demo"); i dati di SISTEMA
 * (tenant_id IS NULL) non si toccano MAI; "cancella pack" = svuota solo quel tenant.
 * Tutto gira con la connessione ADMIN (bypassa la RLS): il tenant_id è SEMPRE esplicito.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

/** I JSON dei pack vivono in db/demo-packs/ (chiavi logiche, niente UUID). */
export function packPath(pack: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url)); // .../packages/backend/src/demo
  return path.resolve(here, '..', '..', '..', '..', 'db', 'demo-packs', `${pack}.json`);
}

export interface DemoPack {
  pack: string;
  tenant: { name: string; vertical: string; default_locale?: string; timezone?: string };
  subscription?: { plan_code: string; days_valid?: number };
  users?: PackUser[];
  companies?: any[];
  assets?: any[];
  resources?: any[];
  resource_availability?: any[];
  materials?: any[];
  engagements?: any[];
}
export interface PackUser { key: string; full_name: string; email: string; role: string; password: string; locale?: string }

export function readPack(pack: string): DemoPack {
  const p = packPath(pack);
  const raw = readFileSync(p, 'utf8');
  const json = JSON.parse(raw) as DemoPack;
  if (!json.tenant?.name) throw new Error(`Pack '${pack}' invalido: manca tenant.name`);
  if (json.pack && json.pack !== pack) {
    console.warn(`[demo] attenzione: pack.pack='${json.pack}' diverso dal nome file '${pack}'`);
  }
  return json;
}

/** Connessione ADMIN (privilegiata, bypassa RLS). search_path forzato a public (no schema auth). */
export async function openAdmin(): Promise<pg.Client> {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error('DATABASE_ADMIN_URL mancante (esegui dentro il container backend)');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('SET search_path TO public');
  return client;
}

/** Aggiunge il marcatore _demo_pack agli attributes (per audit/cleanup). */
export function withMarker(attrs: Record<string, unknown> | undefined, pack: string): string {
  return JSON.stringify({ ...(attrs ?? {}), _demo_pack: pack });
}

/** Trova il tenant demo per nome (NON di sistema). Ritorna id o null. */
export async function findDemoTenant(db: pg.Client, name: string): Promise<string | null> {
  const r = await db.query(`SELECT id FROM tenant WHERE name = $1 LIMIT 1`, [name]);
  return r.rows.length ? (r.rows[0].id as string) : null;
}

/** URL interno di GoTrue (per provisioning/rimozione identità). */
export function authBaseUrl(): string {
  return process.env.AUTH_INTERNAL_URL ?? 'http://auth:9999';
}
