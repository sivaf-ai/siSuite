/**
 * bootstrap.ts — inizializzazione idempotente del sistema, eseguita DOPO le
 * migrazioni, con la connessione ADMIN (privilegiata, bypassa RLS).
 *
 * Fa, in quest'ordine:
 *   1. ruolo DB `sisuite_app` (NOSUPERUSER, NOBYPASSRLS) + grants + EXECUTE
 *      sulla funzione resolver
 *   2. role_permission dei ruoli di SISTEMA da buildRolePermissionRows()
 *   3. primo tenant
 *   4. number_series 'engagement'
 *   5. subscription trial (plan 'trial')
 *   6. company demo (cliente) — così l'engagement E2E ha un company_id valido
 *   7. utente Owner su GoTrue + app_user collegato (auth_user_id) + user_role Owner
 *
 * Re-eseguibile: ogni passo è guardato (IF NOT EXISTS / ON CONFLICT / SELECT-or-INSERT).
 */
import type pg from 'pg';
import { buildRolePermissionRows } from '@sisuite/shared';
import { ensureAuthUser } from './auth/gotrueAdmin.js';

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v == null || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Bootstrap: variabile d'ambiente mancante: ${name}`);
  }
  return v;
}

export async function bootstrap(client: pg.Client): Promise<void> {
  const log = (m: string) => console.log(`[bootstrap] ${m}`);

  // ── 1. ruolo applicativo sisuite_app ──────────────────────────────
  const appPwd = env('SISUITE_APP_PASSWORD');
  await client.query(`SELECT set_config('sisuite.bootstrap_pwd', $1, false)`, [appPwd]);
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sisuite_app') THEN
        EXECUTE format('CREATE ROLE sisuite_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD %L',
                       current_setting('sisuite.bootstrap_pwd'));
      ELSE
        EXECUTE format('ALTER ROLE sisuite_app WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD %L',
                       current_setting('sisuite.bootstrap_pwd'));
      END IF;
    END $$;
  `);
  await client.query(`GRANT USAGE ON SCHEMA public TO sisuite_app`);
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sisuite_app`);
  await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sisuite_app`);
  await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO sisuite_app`);
  // search_path pulito: il backend non deve mai risolvere su schema `auth` (GoTrue)
  await client.query(`ALTER ROLE sisuite_app SET search_path TO public`);
  log('ruolo sisuite_app + grants ok');

  // ── 2. role_permission dei ruoli di sistema ───────────────────────
  const rows = buildRolePermissionRows();
  const params: string[] = [];
  const tuples: string[] = [];
  rows.forEach((r, i) => {
    params.push(r.roleName, r.permissionKey);
    tuples.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
  });
  await client.query(
    `INSERT INTO role_permission (role_id, permission_key)
     SELECT r.id, v.permission_key
     FROM (VALUES ${tuples.join(',')}) AS v(role_name, permission_key)
     JOIN role r ON r.name = v.role_name AND r.tenant_id IS NULL
     ON CONFLICT (role_id, permission_key) DO NOTHING`,
    params,
  );
  log(`role_permission: ${rows.length} righe garantite`);

  // ── 3. primo tenant ───────────────────────────────────────────────
  const tenantName = env('TENANT_NAME');
  const tenantVertical = env('TENANT_VERTICAL', 'software');
  const tenantLocale = env('TENANT_LOCALE', 'it-IT');
  const tenantTz = env('TENANT_TIMEZONE', 'Europe/Rome');
  let tenantId: string;
  {
    const found = await client.query(`SELECT id FROM tenant WHERE name = $1 LIMIT 1`, [tenantName]);
    if (found.rows.length > 0) {
      tenantId = found.rows[0].id;
    } else {
      const ins = await client.query(
        `INSERT INTO tenant (name, vertical, default_locale, timezone)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [tenantName, tenantVertical, tenantLocale, tenantTz],
      );
      tenantId = ins.rows[0].id;
    }
  }
  log(`tenant '${tenantName}' = ${tenantId}`);

  // ── 4. number_series 'engagement' ─────────────────────────────────
  await client.query(
    `INSERT INTO number_series (tenant_id, key, format, reset_period)
     VALUES ($1, 'engagement', '{YYYY}-{SEQ:4}', 'yearly')
     ON CONFLICT (tenant_id, key) DO NOTHING`,
    [tenantId],
  );
  log('number_series engagement ok');

  // ── 5. subscription trial ─────────────────────────────────────────
  {
    const exists = await client.query(`SELECT 1 FROM subscription WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
    if (exists.rows.length === 0) {
      await client.query(
        `INSERT INTO subscription (tenant_id, plan_id, status, trial_ends_at)
         SELECT $1, p.id, 'trial', now() + interval '14 days'
         FROM plan p WHERE p.code = 'trial' LIMIT 1`,
        [tenantId],
      );
      log('subscription trial creata');
    }
  }

  // ── 6. company demo (cliente) ─────────────────────────────────────
  let companyId: string;
  {
    const found = await client.query(
      `SELECT id FROM company WHERE tenant_id = $1 AND display_name = $2 LIMIT 1`,
      [tenantId, 'Cliente Demo'],
    );
    if (found.rows.length > 0) {
      companyId = found.rows[0].id;
    } else {
      const ins = await client.query(
        `INSERT INTO company (tenant_id, display_name, type) VALUES ($1, 'Cliente Demo', 'organization') RETURNING id`,
        [tenantId],
      );
      companyId = ins.rows[0].id;
      await client.query(
        `INSERT INTO company_role (tenant_id, company_id, role, customer_nature)
         VALUES ($1, $2, 'customer', 'recurring')
         ON CONFLICT (company_id, role) DO NOTHING`,
        [tenantId, companyId],
      );
    }
  }
  log(`company demo = ${companyId}`);

  // ── 7. Owner: GoTrue + app_user + user_role ───────────────────────
  const authBase = env('AUTH_INTERNAL_URL', 'http://auth:9999');
  const ownerEmail = env('OWNER_EMAIL');
  const ownerPwd = env('OWNER_PASSWORD');
  const ownerName = env('OWNER_NAME', 'Titolare');

  const authUserId = await ensureAuthUser({ baseUrl: authBase, email: ownerEmail, password: ownerPwd });
  log(`Owner su GoTrue, sub = ${authUserId}`);

  let ownerUserId: string;
  {
    const found = await client.query(`SELECT id FROM app_user WHERE auth_user_id = $1 LIMIT 1`, [authUserId]);
    if (found.rows.length > 0) {
      ownerUserId = found.rows[0].id;
      await client.query(
        `UPDATE app_user SET full_name = $2, email = $3, tenant_id = $4, active = true WHERE id = $1`,
        [ownerUserId, ownerName, ownerEmail, tenantId],
      );
    } else {
      const ins = await client.query(
        `INSERT INTO app_user (tenant_id, full_name, email, locale, auth_user_id, active)
         VALUES ($1,$2,$3,$4,$5,true) RETURNING id`,
        [tenantId, ownerName, ownerEmail, tenantLocale, authUserId],
      );
      ownerUserId = ins.rows[0].id;
    }
  }
  await client.query(
    `INSERT INTO user_role (user_id, role_id)
     SELECT $1, r.id FROM role r WHERE r.name = 'Owner' AND r.tenant_id IS NULL
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [ownerUserId],
  );
  log(`app_user Owner = ${ownerUserId} (ruolo Owner assegnato)`);

  log('completato.');
}
