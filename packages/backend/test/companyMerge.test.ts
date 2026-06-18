/**
 * companyMerge.test.ts — test DB-backed della FUSIONE Soggetti (deduplica).
 *
 * Strategia (come rls.test.ts): seed con la connessione ADMIN (bypassa RLS),
 * esegue la merge con la connessione APP (ruolo sisuite_app, RLS ATTIVA) dentro
 * UNA transazione con la sessione RLS impostata via SET LOCAL — esattamente come
 * fa withRls in produzione. La merge gira tramite mergeCompanies() (lo stesso
 * codice dell'handler POST /companies/merge).
 *
 * Verifica: tutte le FK seminate verso B ora puntano ad A; B è archiviato; A è
 * intatto; ri-eseguire la merge è idempotente (nessun errore, stato invariato).
 *
 * In container: docker exec sisuite_backend sh -c "cd /app/packages/backend && npx vitest run test/companyMerge.test.ts"
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { mergeCompanies } from '../src/routes/companyDedup.js';
import type { PoolClient } from '../src/db/pool.js';

const adminPool = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
const appPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const ids = {
  tenant: '',
  survivorA: '', absorbedB: '',
  userActor: '',
  engB: '', roleB: '', assetB: '', woB: '',
  woStatus: '', engStatus: '',
};

async function oneId(sql: string, params: unknown[] = []): Promise<string> {
  const r = await adminPool.query(sql, params);
  return r.rows[0].id as string;
}

/** Esegue fn dentro una transazione con la sessione RLS impostata (come withRls). */
async function asAppTx<T>(fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const c = await appPool.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      `SELECT set_config('app.current_tenant',$1,true), set_config('app.current_user',$2,true),
              set_config('app.data_scope',$3,true), set_config('app.current_company',$4,true),
              set_config('app.is_platform_admin','false',true)`,
      [ids.tenant, ids.userActor, 'tenant', ''],
    );
    const out = await fn(c as unknown as PoolClient);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

beforeAll(async () => {
  ids.engStatus = await oneId(
    `SELECT id FROM lookup_value WHERE category='engagement_status' AND canonical='open' AND tenant_id IS NULL LIMIT 1`);
  ids.woStatus = await oneId(
    `SELECT id FROM lookup_value WHERE category='work_order_status' AND canonical='assigned' AND tenant_id IS NULL LIMIT 1`);

  ids.tenant = await oneId(`INSERT INTO tenant (name, vertical) VALUES ('MERGE-TEST','software') RETURNING id`);
  ids.userActor = await oneId(`INSERT INTO app_user (tenant_id, full_name) VALUES ($1,'Operatore Merge') RETURNING id`, [ids.tenant]);

  // A = superstite, B = assorbito (nomi equivalenti dopo normalizzazione)
  ids.survivorA = await oneId(`INSERT INTO company (tenant_id, display_name) VALUES ($1,'Alfa S.r.l.') RETURNING id`, [ids.tenant]);
  ids.absorbedB = await oneId(`INSERT INTO company (tenant_id, display_name) VALUES ($1,'ALFA srl') RETURNING id`, [ids.tenant]);

  // FK popolate verso B: engagement (RESTRICT), company_role (CASCADE+UNIQUE), asset (RESTRICT), work_order (SET NULL)
  ids.engB = await oneId(
    `INSERT INTO engagement (tenant_id, company_id, code, type, title, status_id)
     VALUES ($1,$2,'MERGE-E1','build','Commessa di B',$3) RETURNING id`,
    [ids.tenant, ids.absorbedB, ids.engStatus]);
  ids.roleB = await oneId(
    `INSERT INTO company_role (tenant_id, company_id, role) VALUES ($1,$2,'supplier') RETURNING id`,
    [ids.tenant, ids.absorbedB]);
  ids.assetB = await oneId(
    `INSERT INTO asset (tenant_id, company_id, kind, label) VALUES ($1,$2,'software_system','Sistema di B') RETURNING id`,
    [ids.tenant, ids.absorbedB]);
  ids.woB = await oneId(
    `INSERT INTO work_order (tenant_id, engagement_id, code, status_id, principal_company_id)
     VALUES ($1,$2,'MERGE-WO1',$3,$4) RETURNING id`,
    [ids.tenant, ids.engB, ids.woStatus, ids.absorbedB]);

  // CONFLITTO UNIQUE da gestire: A ha GIÀ il ruolo 'supplier' (come B) → la merge deve
  // togliere il duplicato di B e NON violare UNIQUE(company_id, role).
  await adminPool.query(
    `INSERT INTO company_role (tenant_id, company_id, role) VALUES ($1,$2,'supplier')`,
    [ids.tenant, ids.survivorA]);
});

afterAll(async () => {
  const t = [ids.tenant];
  await adminPool.query(`DELETE FROM work_order WHERE tenant_id = ANY($1)`, [t]);
  await adminPool.query(`DELETE FROM asset WHERE tenant_id = ANY($1)`, [t]);
  await adminPool.query(`DELETE FROM engagement WHERE tenant_id = ANY($1)`, [t]);
  await adminPool.query(`DELETE FROM company_role WHERE tenant_id = ANY($1)`, [t]);
  await adminPool.query(`DELETE FROM company WHERE tenant_id = ANY($1)`, [t]);
  await adminPool.query(`DELETE FROM app_user WHERE tenant_id = ANY($1)`, [t]);
  await adminPool.query(`DELETE FROM tenant WHERE id = ANY($1)`, [t]);
  await adminPool.end();
  await appPool.end();
});

/** quante righe puntano ancora alla company data (per-tabella) — letto come ADMIN. */
async function countPointingTo(companyId: string): Promise<Record<string, number>> {
  const q = async (sql: string) => Number((await adminPool.query(sql, [companyId])).rows[0].n);
  return {
    engagement: await q(`SELECT count(*)::int n FROM engagement WHERE company_id=$1`),
    company_role: await q(`SELECT count(*)::int n FROM company_role WHERE company_id=$1`),
    asset: await q(`SELECT count(*)::int n FROM asset WHERE company_id=$1`),
    work_order: await q(`SELECT count(*)::int n FROM work_order WHERE principal_company_id=$1`),
  };
}

describe('Fusione Soggetti (deduplica company)', () => {
  it('ri-punta tutte le FK ad A, archivia B, lascia A intatto', async () => {
    const res = await asAppTx((db) => mergeCompanies(db, ids.survivorA, [ids.absorbedB], ids.userActor));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.absorbed).toBe(1);

    // nessuna riga punta più a B
    const toB = await countPointingTo(ids.absorbedB);
    expect(toB).toEqual({ engagement: 0, company_role: 0, asset: 0, work_order: 0 });

    // tutte le FK ora puntano ad A: engagement+asset+work_order = 1 ciascuna;
    // company_role = 1 (il 'supplier' di A; il duplicato di B è stato rimosso, non scommato)
    const toA = await countPointingTo(ids.survivorA);
    expect(toA.engagement).toBe(1);
    expect(toA.asset).toBe(1);
    expect(toA.work_order).toBe(1);
    expect(toA.company_role).toBe(1);

    // B archiviato, A intatto
    const b = await adminPool.query(`SELECT archived_at FROM company WHERE id=$1`, [ids.absorbedB]);
    expect(b.rows[0].archived_at).not.toBeNull();
    const a = await adminPool.query(`SELECT archived_at, display_name FROM company WHERE id=$1`, [ids.survivorA]);
    expect(a.rows[0].archived_at).toBeNull();
    expect(a.rows[0].display_name).toBe('Alfa S.r.l.');
  });

  it('è idempotente: ri-eseguire la merge non rompe nulla e non cambia lo stato', async () => {
    const res = await asAppTx((db) => mergeCompanies(db, ids.survivorA, [ids.absorbedB], ids.userActor));
    expect(res.ok).toBe(true);
    // B è già archiviato e senza FK residue → 0 nuovi assorbiti, nessuna ri-puntatura
    if (res.ok) {
      expect(res.absorbed).toBe(0);
      expect(Object.keys(res.repointed)).toHaveLength(0);
    }
    // stato invariato
    const toA = await countPointingTo(ids.survivorA);
    expect(toA).toEqual({ engagement: 1, company_role: 1, asset: 1, work_order: 1 });
    const b = await adminPool.query(`SELECT archived_at FROM company WHERE id=$1`, [ids.absorbedB]);
    expect(b.rows[0].archived_at).not.toBeNull();
  });
});
