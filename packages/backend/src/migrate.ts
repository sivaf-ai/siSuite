/**
 * migrate.ts — servizio one-shot.
 *  1. applica db/migrations/*.sql in ordine (idempotente via schema_migrations)
 *  2. esegue il bootstrap TS (ruolo app, grants, seed tenant/Owner...)
 * Gira con la connessione ADMIN (privilegiata). depends_on: db healthy, auth started.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { bootstrap } from './bootstrap.js';

function migrationsDir(): string {
  // src/migrate.ts -> ../../../db/migrations ; dist/migrate.js idem (3 su = repo root /app)
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '..', '..', '..');
  return path.join(repoRoot, 'db', 'migrations');
}

async function applyMigrations(client: pg.Client): Promise<void> {
  // schema_migrations QUALIFICATO public: GoTrue crea auth.schema_migrations
  // e lo schema auth può essere nel search_path → evitiamo la collisione.
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.sisuite_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const dir = migrationsDir();
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied = new Set(
    (await client.query<{ filename: string }>(`SELECT filename FROM public.sisuite_migrations`)).rows.map((r) => r.filename),
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[migrate] salto ${file} (già applicata)`);
      continue;
    }
    const sql = readFileSync(path.join(dir, file), 'utf8');
    console.log(`[migrate] applico ${file} ...`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(`INSERT INTO public.sisuite_migrations (filename) VALUES ($1)`, [file]);
      await client.query('COMMIT');
      console.log(`[migrate] ${file} OK`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migrazione ${file} fallita: ${(err as Error).message}`);
    }
  }
}

async function main(): Promise<void> {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (!adminUrl) throw new Error('DATABASE_ADMIN_URL mancante');
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  // forziamo lo schema applicativo: niente ambiguità con lo schema `auth` di GoTrue
  await client.query('SET search_path TO public');
  try {
    await applyMigrations(client);
    await bootstrap(client);
    console.log('[migrate] tutto applicato. Esco con successo.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[migrate] ERRORE:', err.message);
  process.exit(1);
});
