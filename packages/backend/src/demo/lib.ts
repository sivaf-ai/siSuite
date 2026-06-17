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
  /** Data (YYYY-MM-DD) rispetto a cui sono scritte le date assolute del pack.
   *  Al load il pack viene "ribasato" su oggi (vedi rebaseDates) → calendario sempre attuale. */
  reference_date?: string;
  tenant: { name: string; vertical: string; default_locale?: string; timezone?: string };
  subscription?: { plan_code: string; days_valid?: number };
  users?: PackUser[];
  companies?: any[];
  assets?: any[];
  resources?: any[];
  resource_availability?: any[];
  materials?: any[];
  engagements?: any[];
  // POWERCOM (brief v2.2): entità dei nuovi moduli
  price_lists?: any[];
  serials?: any[];
  work_orders?: any[];
  stock?: { locations?: any[]; documents?: any[]; movements?: any[] };
  absences?: any[];
  sites?: any[];
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

// ── Ribasamento date su "oggi" ──────────────────────────────────────────
// Le date del pack sono scritte in assoluto rispetto a `reference_date`. Al load
// le spostiamo di (oggi − reference) giorni, così ogni demo:load produce un
// calendario ATTUALE (la griglia Pianificazione si apre piena). Lo spostamento è
// a giorni interi e preserva l'ora locale + offset (niente matematica DST).
const DATE_KEYS = new Set(['started_on', 'ended_on', 'occurred_on', 'installed_on', 'planned_start', 'planned_end']);
const DATETIME_KEYS = new Set(['scheduled_start', 'earliest_start', 'due_by', 'starts_at', 'ends_at']);

function shiftDateOnly(s: string, days: number): string {
  const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) + days * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function shiftDateTime(s: string, days: number): string {
  const ti = s.indexOf('T');
  return ti < 0 ? shiftDateOnly(s, days) : shiftDateOnly(s.slice(0, ti), days) + s.slice(ti);
}
function walkShift(node: unknown, days: number): void {
  if (Array.isArray(node)) { for (const x of node) walkShift(x, days); return; }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (typeof v === 'string') {
        if (DATE_KEYS.has(k)) (node as Record<string, unknown>)[k] = shiftDateOnly(v, days);
        else if (DATETIME_KEYS.has(k)) (node as Record<string, unknown>)[k] = shiftDateTime(v, days);
      } else walkShift(v, days);
    }
  }
}

/** Sposta tutte le date del pack di (today − reference_date) giorni. No-op senza reference_date. */
export function rebaseDates(pack: DemoPack, today = new Date()): DemoPack {
  const ref = pack.reference_date;
  if (!ref) return pack;
  const todayMid = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const refMid = Date.UTC(+ref.slice(0, 4), +ref.slice(5, 7) - 1, +ref.slice(8, 10));
  const days = Math.round((todayMid - refMid) / 86_400_000);
  if (days !== 0) walkShift(pack, days);
  return pack;
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
