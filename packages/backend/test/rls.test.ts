/**
 * rls.test.ts — i DUE test di sicurezza obbligatori del brief (§4).
 *  (a) un tenant NON vede i dati di un altro tenant
 *  (b) un Tecnico (data_scope=own) NON vede le attività di un collega
 *
 * Strategia: seed con la connessione ADMIN (bypassa RLS), verifica con la
 * connessione APP (ruolo sisuite_app, RLS ATTIVA) impostando la sessione con
 * SET LOCAL come fa il backend in produzione.
 *
 * Richiede che il bootstrap sia già girato (ruolo sisuite_app + seed di sistema).
 * In container: `docker compose run --rm backend pnpm test`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

const adminPool = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
const appPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

interface Ctx { tenant: string; user: string; scope: 'own' | 'team' | 'tenant' | 'customer'; company?: string }

async function asApp<T = Record<string, unknown>>(ctx: Ctx, sql: string, params: unknown[] = []): Promise<T[]> {
  const c = await appPool.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      `SELECT set_config('app.current_tenant',$1,true), set_config('app.current_user',$2,true),
              set_config('app.data_scope',$3,true), set_config('app.current_company',$4,true),
              set_config('app.is_platform_admin','false',true)`,
      [ctx.tenant, ctx.user, ctx.scope, ctx.company ?? ''],
    );
    const r = await c.query(sql, params);
    await c.query('COMMIT');
    return r.rows as T[];
  } finally {
    c.release();
  }
}

// ids creati per il test
const ids = {
  tenantA: '', tenantB: '',
  companyA: '', companyB: '',
  engA: '', engB: '',
  userTech: '', userOther: '',
  actTech: '', actOther: '',
};

async function oneId(sql: string, params: unknown[] = []): Promise<string> {
  const r = await adminPool.query(sql, params);
  return r.rows[0].id as string;
}

beforeAll(async () => {
  const engStatus = await oneId(
    `SELECT id FROM lookup_value WHERE category='engagement_status' AND canonical='open' AND tenant_id IS NULL LIMIT 1`,
  );
  const actStatus = await oneId(
    `SELECT id FROM lookup_value WHERE category='activity_status' AND canonical='planned' AND tenant_id IS NULL LIMIT 1`,
  );

  ids.tenantA = await oneId(`INSERT INTO tenant (name, vertical) VALUES ('RLS-TEST-A','software') RETURNING id`);
  ids.tenantB = await oneId(`INSERT INTO tenant (name, vertical) VALUES ('RLS-TEST-B','software') RETURNING id`);

  ids.companyA = await oneId(`INSERT INTO company (tenant_id, display_name) VALUES ($1,'ClienteA') RETURNING id`, [ids.tenantA]);
  ids.companyB = await oneId(`INSERT INTO company (tenant_id, display_name) VALUES ($1,'ClienteB') RETURNING id`, [ids.tenantB]);

  ids.userTech = await oneId(`INSERT INTO app_user (tenant_id, full_name) VALUES ($1,'Tecnico A') RETURNING id`, [ids.tenantA]);
  ids.userOther = await oneId(`INSERT INTO app_user (tenant_id, full_name) VALUES ($1,'Collega A') RETURNING id`, [ids.tenantA]);

  ids.engA = await oneId(
    `INSERT INTO engagement (tenant_id, company_id, code, type, title, status_id, created_by)
     VALUES ($1,$2,'A-0001','build','Commessa A',$3,$4) RETURNING id`,
    [ids.tenantA, ids.companyA, engStatus, ids.userTech],
  );
  ids.engB = await oneId(
    `INSERT INTO engagement (tenant_id, company_id, code, type, title, status_id, created_by)
     VALUES ($1,$2,'B-0001','build','Commessa B',$3,NULL) RETURNING id`,
    [ids.tenantB, ids.companyB, engStatus],
  );

  // due attività nel tenant A: una creata dal Tecnico, una da un collega
  ids.actTech = await oneId(
    `INSERT INTO activity (tenant_id, engagement_id, title, status_id, created_by)
     VALUES ($1,$2,'Mia attività',$3,$4) RETURNING id`,
    [ids.tenantA, ids.engA, actStatus, ids.userTech],
  );
  ids.actOther = await oneId(
    `INSERT INTO activity (tenant_id, engagement_id, title, status_id, created_by)
     VALUES ($1,$2,'Attività del collega',$3,$4) RETURNING id`,
    [ids.tenantA, ids.engA, actStatus, ids.userOther],
  );
});

afterAll(async () => {
  const t = [ids.tenantA, ids.tenantB];
  await adminPool.query(`DELETE FROM activity WHERE tenant_id = ANY($1)`, [t]);
  await adminPool.query(`DELETE FROM engagement WHERE tenant_id = ANY($1)`, [t]);
  await adminPool.query(`DELETE FROM company_role WHERE tenant_id = ANY($1)`, [t]);
  await adminPool.query(`DELETE FROM company WHERE tenant_id = ANY($1)`, [t]);
  await adminPool.query(`DELETE FROM app_user WHERE tenant_id = ANY($1)`, [t]);
  await adminPool.query(`DELETE FROM tenant WHERE id = ANY($1)`, [t]);
  await adminPool.end();
  await appPool.end();
});

describe('RLS — isolamento multi-tenant', () => {
  it('un tenant non vede le commesse di un altro tenant', async () => {
    const fromA = await asApp({ tenant: ids.tenantA, user: ids.userTech, scope: 'tenant' },
      `SELECT id, code FROM engagement ORDER BY code`);
    const codesA = fromA.map((r: any) => r.code);
    expect(codesA).toContain('A-0001');
    expect(codesA).not.toContain('B-0001');

    const fromB = await asApp({ tenant: ids.tenantB, user: ids.userTech, scope: 'tenant' },
      `SELECT id, code FROM engagement ORDER BY code`);
    const codesB = fromB.map((r: any) => r.code);
    expect(codesB).toContain('B-0001');
    expect(codesB).not.toContain('A-0001');
  });
});

describe('RLS — data_scope own del Tecnico', () => {
  it('con scope=own il Tecnico vede solo le PROPRIE attività', async () => {
    const own = await asApp({ tenant: ids.tenantA, user: ids.userTech, scope: 'own' },
      `SELECT id, title FROM activity ORDER BY title`);
    const ids_own = own.map((r: any) => r.id);
    expect(ids_own).toContain(ids.actTech);
    expect(ids_own).not.toContain(ids.actOther);
  });

  it('con scope=tenant lo stesso utente vede tutte le attività del tenant', async () => {
    const all = await asApp({ tenant: ids.tenantA, user: ids.userTech, scope: 'tenant' },
      `SELECT id FROM activity`);
    const allIds = all.map((r: any) => r.id);
    expect(allIds).toContain(ids.actTech);
    expect(allIds).toContain(ids.actOther);
  });
});
