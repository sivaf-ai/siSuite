/**
 * demo/runner.ts — CORE riusabile dei Demo Data Pack: load / wipe / list.
 * Usato sia dalla CLI (load.ts/wipe.ts/list.ts) sia dagli endpoint SUPER ADMIN
 * (routes/platform.ts, guardati da is_platform_admin). Connessione ADMIN.
 */
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SignJWT } from 'jose';
import type pg from 'pg';
import { openAdmin, readPack, withMarker, findDemoTenant, authBaseUrl, type DemoPack } from './lib.js';
import { ensureAuthUser } from '../auth/gotrueAdmin.js';

export interface LoadSummary { tenantId: string; tenantName: string; vertical: string; users: number; engagements: number; activities: number; dependencies: number; logins: { role: string; email: string; password: string }[] }
export interface TenantInfo { id: string; name: string; vertical: string; users: number; engagements: number; demoPack: string | null }

/** Pack disponibili in db/demo-packs/ (file *.json). */
export function listPacks(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = path.resolve(here, '..', '..', '..', '..', 'db', 'demo-packs');
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
}

export async function listTenants(db?: pg.Client): Promise<TenantInfo[]> {
  const c = db ?? await openAdmin();
  try {
    const rows = (await c.query(`
      SELECT t.id, t.name, t.vertical,
             (SELECT count(*) FROM app_user u WHERE u.tenant_id = t.id) AS users,
             (SELECT count(*) FROM engagement e WHERE e.tenant_id = t.id) AS engagements,
             (SELECT max(co.attributes->>'_demo_pack') FROM company co WHERE co.tenant_id = t.id) AS demo_pack
      FROM tenant t ORDER BY t.name`)).rows;
    return rows.map((r) => ({ id: r.id, name: r.name, vertical: r.vertical, users: Number(r.users), engagements: Number(r.engagements), demoPack: r.demo_pack ?? null }));
  } finally { if (!db) await c.end(); }
}

async function nextEngCode(db: pg.Client, tenantId: string, now = new Date()): Promise<string> {
  const { rows } = await db.query(
    `SELECT format, reset_period, current_period, last_number FROM number_series WHERE tenant_id = $1 AND key = 'engagement' FOR UPDATE`, [tenantId]);
  if (!rows.length) throw new Error('number_series engagement mancante');
  const r = rows[0] as { format: string; reset_period: string; current_period: string; last_number: string | number };
  const y = now.getUTCFullYear().toString();
  const m = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const period = r.reset_period === 'yearly' ? y : r.reset_period === 'monthly' ? `${y}-${m}` : '';
  const next = (period !== r.current_period ? 0 : Number(r.last_number)) + 1;
  await db.query(`UPDATE number_series SET current_period = $1, last_number = $2 WHERE tenant_id = $3 AND key = 'engagement'`, [period, next, tenantId]);
  return r.format.replace(/\{YYYY\}/g, y).replace(/\{YY\}/g, y.slice(-2)).replace(/\{MM\}/g, m).replace(/\{SEQ:(\d+)\}/g, (_x, n: string) => next.toString().padStart(Number(n), '0'));
}

/** Carica un pack (idempotente per tenant: rifiuta se già presente). */
export async function loadPack(packName: string): Promise<LoadSummary> {
  const pack: DemoPack = readPack(packName);
  const db = await openAdmin();
  const T = pack.tenant;
  try {
    if (await findDemoTenant(db, T.name)) throw new Error(`tenant "${T.name}" già presente: esegui prima il wipe`);
    const lv = await db.query(`SELECT id, category, canonical FROM lookup_value WHERE tenant_id IS NULL AND is_default`);
    const statusMap = new Map<string, string>();
    for (const r of lv.rows) statusMap.set(`${r.category}|${r.canonical}`, r.id as string);
    const status = (cat: string, canon: string): string => {
      const id = statusMap.get(`${cat}|${canon}`); if (!id) throw new Error(`stato di sistema mancante: ${cat}/${canon}`); return id;
    };
    const ins = (sql: string, p: unknown[]) => db.query(sql, p).then((r) => r.rows[0].id as string);

    await db.query('BEGIN');
    const tenantId = await ins(`INSERT INTO tenant (name, vertical, default_locale, timezone) VALUES ($1,$2,$3,$4) RETURNING id`,
      [T.name, T.vertical, T.default_locale ?? 'it-IT', T.timezone ?? 'Europe/Rome']);
    if (pack.subscription) {
      await db.query(`INSERT INTO subscription (tenant_id, plan_id, status, current_period_end)
        SELECT $1, p.id, 'active', now() + ($2 || ' days')::interval FROM plan p WHERE p.code = $3 LIMIT 1`,
        [tenantId, String(pack.subscription.days_valid ?? 365), pack.subscription.plan_code]);
    }
    await db.query(`INSERT INTO number_series (tenant_id, key, format, reset_period) VALUES ($1,'engagement','{YYYY}-{SEQ:4}','yearly')`, [tenantId]);

    const userId = new Map<string, string>();
    for (const u of pack.users ?? []) {
      const authUserId = await ensureAuthUser({ baseUrl: authBaseUrl(), email: u.email, password: u.password });
      const id = await ins(`INSERT INTO app_user (tenant_id, full_name, email, locale, auth_user_id, active) VALUES ($1,$2,$3,$4,$5,true) RETURNING id`,
        [tenantId, u.full_name, u.email, u.locale ?? T.default_locale ?? 'it-IT', authUserId]);
      await db.query(`INSERT INTO user_role (user_id, role_id) SELECT $1, r.id FROM role r WHERE r.name = $2 AND r.tenant_id IS NULL`, [id, u.role]);
      userId.set(u.key, id);
    }
    const companyId = new Map<string, string>();
    for (const c of pack.companies ?? []) {
      const id = await ins(`INSERT INTO company (tenant_id, display_name, type, address, attributes) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [tenantId, c.display_name, c.type ?? 'organization', c.address ?? null, withMarker(c.attributes, packName)]);
      companyId.set(c.key, id);
      for (const role of c.roles ?? []) await db.query(`INSERT INTO company_role (tenant_id, company_id, role, customer_nature) VALUES ($1,$2,$3,$4)`, [tenantId, id, role.role, role.customer_nature ?? null]);
      for (const ct of c.contacts ?? []) await db.query(`INSERT INTO company_contact (tenant_id, company_id, full_name, role_title, email, phone, is_primary) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [tenantId, id, ct.full_name, ct.role_title ?? null, ct.email ?? null, ct.phone ?? null, ct.is_primary ?? false]);
    }
    const assetId = new Map<string, string>();
    for (const a of pack.assets ?? []) {
      const cid = companyId.get(a.company); if (!cid) throw new Error(`asset ${a.key}: company '${a.company}' non trovata`);
      assetId.set(a.key, await ins(`INSERT INTO asset (tenant_id, company_id, kind, label, installed_at, attributes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [tenantId, cid, a.kind, a.label, a.installed_on ?? null, withMarker(a.attributes, packName)]));
    }
    const resourceId = new Map<string, string>();
    for (const r of pack.resources ?? []) {
      resourceId.set(r.key, await ins(`INSERT INTO resource (tenant_id, kind, label, user_id, attributes, active) VALUES ($1,$2,$3,$4,$5,true) RETURNING id`,
        [tenantId, r.kind, r.label, r.user ? userId.get(r.user) ?? null : null, withMarker(r.attributes, packName)]));
    }
    for (const av of pack.resource_availability ?? []) {
      const rid = resourceId.get(av.resource); if (!rid) throw new Error(`availability: risorsa '${av.resource}' non trovata`);
      await db.query(`INSERT INTO resource_availability (tenant_id, resource_id, kind, starts_at, ends_at, reason) VALUES ($1,$2,$3,$4,$5,$6)`,
        [tenantId, rid, av.kind ?? 'unavailable', av.starts_at, av.ends_at, av.reason ?? null]);
    }
    const materialId = new Map<string, string>();
    for (const m of pack.materials ?? []) materialId.set(m.key, await ins(`INSERT INTO material (tenant_id, name, unit, attributes) VALUES ($1,$2,$3,$4) RETURNING id`, [tenantId, m.name, m.unit, withMarker(m.attributes, packName)]));

    let nEng = 0, nAct = 0, nDep = 0;
    for (const e of pack.engagements ?? []) {
      const cid = companyId.get(e.company); if (!cid) throw new Error(`engagement ${e.key}: company '${e.company}' non trovata`);
      const code = await nextEngCode(db, tenantId);
      const engId = await ins(`INSERT INTO engagement (tenant_id, company_id, asset_id, code, manager_id, type, title, status_id, started_on, ended_on, attributes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [tenantId, cid, e.asset ? assetId.get(e.asset) ?? null : null, code, e.manager ? userId.get(e.manager) ?? null : null, e.type, e.title, status('engagement_status', e.status ?? 'active'), e.started_on ?? null, e.ended_on ?? null, withMarker(e.attributes, packName)]);
      nEng++;
      const phaseId = new Map<string, string>();
      for (const p of e.phases ?? []) phaseId.set(p.key, await ins(`INSERT INTO phase (tenant_id, engagement_id, parent_phase_id, name, seq, planned_start, planned_end, status_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [tenantId, engId, p.parent ? phaseId.get(p.parent) ?? null : null, p.name, p.seq ?? 0, p.planned_start ?? null, p.planned_end ?? null, status('phase_status', p.status ?? 'pending')]));
      const activityId = new Map<string, string>();
      for (const a of e.activities ?? []) {
        activityId.set(a.key, await ins(`INSERT INTO activity (tenant_id, engagement_id, phase_id, title, kind, status_id, estimated_minutes, scheduled_start, earliest_start, due_by, attributes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [tenantId, engId, a.phase ? phaseId.get(a.phase) ?? null : null, a.title, a.kind ?? null, status('activity_status', a.status ?? 'planned'), a.estimated_minutes ?? null, a.scheduled_start ?? null, a.earliest_start ?? null, a.due_by ?? null, withMarker(a.attributes, packName)]));
        nAct++;
      }
      for (const a of e.activities ?? []) {
        const succ = activityId.get(a.key)!;
        for (const dep of a.after ?? []) {
          const pred = activityId.get(dep.act); if (!pred) throw new Error(`dipendenza in ${a.key}: '${dep.act}' non trovato`);
          await db.query(`INSERT INTO activity_dependency (tenant_id, predecessor_id, successor_id, type, lag_minutes) VALUES ($1,$2,$3,'FS',$4)`, [tenantId, pred, succ, (dep.lag_days ?? 0) * 1440]); nDep++;
        }
        for (const rkey of a.resources ?? []) {
          const rid = resourceId.get(rkey); if (!rid) throw new Error(`assegnazione in ${a.key}: '${rkey}' non trovata`);
          await db.query(`INSERT INTO activity_resource (tenant_id, activity_id, resource_id) VALUES ($1,$2,$3)`, [tenantId, succ, rid]);
        }
      }
      for (const t of e.time_entries ?? []) await db.query(`INSERT INTO time_entry (tenant_id, engagement_id, activity_id, resource_id, typology, minutes, occurred_on) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [tenantId, engId, t.activity ? activityId.get(t.activity) ?? null : null, t.resource ? resourceId.get(t.resource) ?? null : null, t.typology, t.minutes, t.occurred_on]);
      for (const mc of e.material_consumption ?? []) {
        const mid = materialId.get(mc.material); if (!mid) throw new Error(`consumo in ${e.key}: '${mc.material}' non trovato`);
        await db.query(`INSERT INTO material_consumption (tenant_id, activity_id, material_id, quantity, unit, occurred_on) VALUES ($1,$2,$3,$4,$5,$6)`,
          [tenantId, mc.activity ? activityId.get(mc.activity) ?? null : null, mid, mc.quantity, mc.unit, mc.occurred_on]);
      }
      for (const cap of e.captures ?? []) await db.query(`INSERT INTO capture (tenant_id, user_id, channel, raw_text, status, processed_at) VALUES ($1,$2,$3,$4,$5,$6)`,
        [tenantId, cap.user ? userId.get(cap.user) ?? null : null, cap.channel ?? 'text', cap.raw_text, cap.status ?? 'pending', cap.status === 'applied' ? new Date() : null]);
    }
    await db.query('COMMIT');
    return {
      tenantId, tenantName: T.name, vertical: T.vertical, users: (pack.users ?? []).length,
      engagements: nEng, activities: nAct, dependencies: nDep,
      logins: (pack.users ?? []).map((u) => ({ role: u.role, email: u.email, password: u.password })),
    };
  } catch (err) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally { await db.end(); }
}

const WIPE_STEPS: { table: string; where: string }[] = [
  { table: 'time_entry', where: 'tenant_id = $1' }, { table: 'material_consumption', where: 'tenant_id = $1' },
  { table: 'capture', where: 'tenant_id = $1' }, { table: 'activity_resource', where: 'tenant_id = $1' },
  { table: 'activity_dependency', where: 'tenant_id = $1' }, { table: 'activity', where: 'tenant_id = $1' },
  { table: 'phase', where: 'tenant_id = $1' }, { table: 'engagement', where: 'tenant_id = $1' },
  { table: 'asset', where: 'tenant_id = $1' }, { table: 'material', where: 'tenant_id = $1' },
  { table: 'company_contact', where: 'tenant_id = $1' }, { table: 'company_role', where: 'tenant_id = $1' },
  { table: 'company', where: 'tenant_id = $1' }, { table: 'resource_availability', where: 'tenant_id = $1' },
  { table: 'resource', where: 'tenant_id = $1' }, { table: 'user_role', where: 'user_id IN (SELECT id FROM app_user WHERE tenant_id = $1)' },
  { table: 'field_definition', where: 'tenant_id = $1' }, { table: 'app_user', where: 'tenant_id = $1' },
  { table: 'number_series', where: 'tenant_id = $1' }, { table: 'subscription', where: 'tenant_id = $1' },
  { table: 'tenant', where: 'id = $1' },
];

async function removeGoTrue(authUserIds: string[]): Promise<number> {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret || !authUserIds.length) return 0;
  try {
    const token = await new SignJWT({ role: 'service_role' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(secret));
    let ok = 0;
    for (const id of authUserIds) { const r = await fetch(`${authBaseUrl()}/admin/users/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); if (r.ok) ok++; }
    return ok;
  } catch { return 0; }
}

/** Cancella il tenant di un pack (ordine FK inverso) + identità GoTrue. */
export async function wipePack(packName: string): Promise<{ found: boolean; rows: number; gotrue: number }> {
  const pack = readPack(packName);
  const db = await openAdmin();
  try {
    const tenantId = await findDemoTenant(db, pack.tenant.name);
    if (!tenantId) return { found: false, rows: 0, gotrue: 0 };
    const authIds = (await db.query(`SELECT auth_user_id FROM app_user WHERE tenant_id = $1 AND auth_user_id IS NOT NULL`, [tenantId])).rows.map((r) => r.auth_user_id as string);
    await db.query('BEGIN');
    let rows = 0;
    for (const s of WIPE_STEPS) { const r = await db.query(`DELETE FROM ${s.table} WHERE ${s.where}`, [tenantId]); rows += r.rowCount ?? 0; }
    await db.query('COMMIT');
    const gotrue = await removeGoTrue(authIds);
    return { found: true, rows, gotrue };
  } catch (err) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally { await db.end(); }
}
