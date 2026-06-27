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
import { openAdmin, readPack, rebaseDates, withMarker, findDemoTenant, authBaseUrl, type DemoPack } from './lib.js';
import { ensureAuthUser } from '../auth/gotrueAdmin.js';
import { encryptSecret } from '../crypto.js';

/** segreto seriale cifrato (come l'API): il chiaro non finisce mai nel DB. */
function secretJson(secret: string | undefined): string {
  return secret ? JSON.stringify({ password: encryptSecret(secret) }) : '{}';
}

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

async function nextWoCode(db: pg.Client, tenantId: string, now = new Date()): Promise<string> {
  const { rows } = await db.query(
    `SELECT format, reset_period, current_period, last_number FROM number_series WHERE tenant_id = $1 AND key = 'work_order' FOR UPDATE`, [tenantId]);
  if (!rows.length) throw new Error('number_series work_order mancante');
  const r = rows[0] as { format: string; reset_period: string; current_period: string; last_number: string | number };
  const y = now.getUTCFullYear().toString();
  const m = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const period = r.reset_period === 'yearly' ? y : r.reset_period === 'monthly' ? `${y}-${m}` : '';
  const next = (period !== r.current_period ? 0 : Number(r.last_number)) + 1;
  await db.query(`UPDATE number_series SET current_period = $1, last_number = $2 WHERE tenant_id = $3 AND key = 'work_order'`, [period, next, tenantId]);
  return r.format.replace(/\{YYYY\}/g, y).replace(/\{YY\}/g, y.slice(-2)).replace(/\{MM\}/g, m).replace(/\{SEQ:(\d+)\}/g, (_x, n: string) => next.toString().padStart(Number(n), '0'));
}

/** Carica un pack (idempotente per tenant: rifiuta se già presente). */
export async function loadPack(packName: string): Promise<LoadSummary> {
  const pack: DemoPack = rebaseDates(readPack(packName));
  const db = await openAdmin();
  const T = pack.tenant;
  try {
    if (await findDemoTenant(db, T.name)) throw new Error(`tenant "${T.name}" già presente: esegui prima il wipe`);
    // mappa di TUTTI gli stati di sistema (tenant NULL) per categoria|canonical —
    // serve anche per i canonical non-default (es. work_order_status/in_progress).
    const lv = await db.query(`SELECT id, category, canonical FROM lookup_value WHERE tenant_id IS NULL`);
    const statusMap = new Map<string, string>();
    for (const r of lv.rows) statusMap.set(`${r.category}|${r.canonical}`, r.id as string);
    const status = (cat: string, canon: string): string => {
      const id = statusMap.get(`${cat}|${canon}`); if (!id) throw new Error(`stato di sistema mancante: ${cat}/${canon}`); return id;
    };
    const ins = (sql: string, p: unknown[]) => db.query(sql, p).then((r) => r.rows[0].id as string);

    await db.query('BEGIN');
    const tenantId = await ins(`INSERT INTO tenant (name, vertical, default_locale, timezone) VALUES ($1,$2,$3,$4) RETURNING id`,
      [T.name, T.vertical, T.default_locale ?? 'it-IT', T.timezone ?? 'Europe/Rome']);
    // imposta il tenant corrente di sessione: serve a app_resolve_unit() (UM testo→FK)
    // per risolvere i codici UM tenant-specifici creati implicitamente dal seed.
    await db.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
    if (pack.subscription) {
      await db.query(`INSERT INTO subscription (tenant_id, plan_id, status, current_period_end)
        SELECT $1, p.id, 'active', now() + ($2 || ' days')::interval FROM plan p WHERE p.code = $3 LIMIT 1`,
        [tenantId, String(pack.subscription.days_valid ?? 365), pack.subscription.plan_code]);
    }
    await db.query(`INSERT INTO number_series (tenant_id, key, format, reset_period) VALUES ($1,'engagement','{YYYY}-{SEQ:4}','yearly')`, [tenantId]);
    // numerazione ordinativi per il tenant demo (i nuovi tenant la ricevono al provisioning; qui la creiamo a mano)
    await db.query(`INSERT INTO number_series (tenant_id, key, format, reset_period, current_period, last_number) VALUES ($1,'work_order','{YYYY}-{SEQ:4}','yearly','',0) ON CONFLICT DO NOTHING`, [tenantId]);

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
    // ── SITI/LOCALITÀ (gerarchia per soggetto) — parent prima dei figli ──
    const siteId = new Map<string, string>();
    for (const s of pack.sites ?? []) {
      const cid = companyId.get(s.company); if (!cid) throw new Error(`site ${s.key}: company '${s.company}' non trovata`);
      siteId.set(s.key, await ins(`INSERT INTO site (tenant_id, company_id, parent_id, name, kind, address, attributes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [tenantId, cid, s.parent ? siteId.get(s.parent) ?? null : null, s.name, s.kind ?? 'building', s.address ?? null, withMarker(s.attributes, packName)]));
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
    for (const m of pack.materials ?? []) materialId.set(m.key, await ins(
      `INSERT INTO material (tenant_id, name, unit_id, sku, track_stock, tracked_by_serial, default_cost, attributes)
       VALUES ($1,$2,public.app_resolve_unit(public.app_current_tenant(),$3),$4,$5,$6,$7,$8) RETURNING id`,
      [tenantId, m.name, m.unit, m.sku ?? null, m.track_stock ?? false, m.tracked_by_serial ?? false, m.default_cost ?? null, withMarker(m.attributes, packName)]));

    // ── LISTINI (price_list + voci) ── overrides applicati dopo gli engagement (servono i loro id)
    const priceListId = new Map<string, string>();
    const priceItemId = new Map<string, string>();
    for (const pl of pack.price_lists ?? []) {
      const plId = await ins(`INSERT INTO price_list (tenant_id, code, name, currency, is_default, valid_from, valid_to, active) VALUES ($1,$2,$3,$4,$5,$6,$7,true) RETURNING id`,
        [tenantId, pl.code, pl.name, pl.currency ?? 'EUR', pl.is_default ?? false, pl.valid_from ?? null, pl.valid_to ?? null]);
      priceListId.set(pl.key, plId);
      for (const it of pl.items ?? []) priceItemId.set(it.key, await ins(
        `INSERT INTO price_list_item (tenant_id, price_list_id, code, description, unit_id, category, cost_price, revenue_price, active) VALUES ($1,$2,$3,$4,public.app_resolve_unit(public.app_current_tenant(),$5),$6,$7,$8,true) RETURNING id`,
        [tenantId, plId, it.code, it.description, it.unit, it.category ?? null, it.cost_price ?? null, it.revenue_price ?? null]));
    }
    const applyOverride = async (o: Record<string, unknown>, engId: string | null) => {
      const baseId = priceItemId.get(o.base_item as string); if (!baseId) throw new Error(`override: voce '${o.base_item}' non trovata`);
      const scope = o.scope_type as string;
      await db.query(`INSERT INTO price_list_override (tenant_id, base_item_id, scope_type, company_id, engagement_id, cost_price, revenue_price, valid_from, valid_to) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [tenantId, baseId, scope, scope === 'company' ? (companyId.get(o.company as string) ?? null) : null, scope === 'engagement' ? engId : null,
         (o.cost_price as number) ?? null, (o.revenue_price as number) ?? null, (o.valid_from as string) ?? null, (o.valid_to as string) ?? null]);
    };
    // overrides di scope company subito; quelli di scope engagement dopo il loop
    const deferredOverrides: Record<string, unknown>[] = [];
    for (const pl of pack.price_lists ?? []) for (const o of pl.overrides ?? []) {
      if (o.scope_type === 'company') await applyOverride(o, null); else deferredOverrides.push(o);
    }

    let nEng = 0, nAct = 0, nDep = 0;
    const engagementId = new Map<string, string>();
    for (const e of pack.engagements ?? []) {
      const cid = companyId.get(e.company); if (!cid) throw new Error(`engagement ${e.key}: company '${e.company}' non trovata`);
      const code = await nextEngCode(db, tenantId);
      const engId = await ins(`INSERT INTO engagement (tenant_id, company_id, asset_id, code, manager_id, type, title, status_id, started_on, ended_on, attributes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [tenantId, cid, e.asset ? assetId.get(e.asset) ?? null : null, code, e.manager ? userId.get(e.manager) ?? null : null, e.type, e.title, status('engagement_status', e.status ?? 'active'), e.started_on ?? null, e.ended_on ?? null, withMarker(e.attributes, packName)]);
      engagementId.set(e.key, engId);
      nEng++;
      const phaseId = new Map<string, string>();
      for (const p of e.phases ?? []) phaseId.set(p.key, await ins(`INSERT INTO phase (tenant_id, engagement_id, parent_phase_id, name, wbs_code, seq, planned_start, planned_end, status_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [tenantId, engId, p.parent ? phaseId.get(p.parent) ?? null : null, p.name, p.wbs_code ?? null, p.seq ?? 0, p.planned_start ?? null, p.planned_end ?? null, status('phase_status', p.status ?? 'pending')]));
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
      const engTimeEntryIds: string[] = [];
      for (const t of e.time_entries ?? []) engTimeEntryIds.push(await ins(
        `INSERT INTO time_entry (tenant_id, engagement_id, activity_id, resource_id, typology, minutes, occurred_on, cost_rate, bill_rate, billable, currency, approval_status_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [tenantId, engId, t.activity ? activityId.get(t.activity) ?? null : null, t.resource ? resourceId.get(t.resource) ?? null : null,
         t.typology, t.minutes, t.occurred_on, t.cost_rate ?? null, t.bill_rate ?? null, t.billable ?? true, 'EUR',
         status('time_entry_status', t.approval ?? 'approved')]));
      for (const mc of e.material_consumption ?? []) {
        const mid = materialId.get(mc.material); if (!mid) throw new Error(`consumo in ${e.key}: '${mc.material}' non trovato`);
        await db.query(`INSERT INTO material_consumption (tenant_id, activity_id, material_id, quantity, unit_id, occurred_on) VALUES ($1,$2,$3,$4,public.app_resolve_unit(public.app_current_tenant(),$5),$6)`,
          [tenantId, mc.activity ? activityId.get(mc.activity) ?? null : null, mid, mc.quantity, mc.unit, mc.occurred_on]);
      }
      for (const cap of e.captures ?? []) await db.query(`INSERT INTO capture (tenant_id, user_id, channel, raw_text, status, processed_at) VALUES ($1,$2,$3,$4,$5,$6)`,
        [tenantId, cap.user ? userId.get(cap.user) ?? null : null, cap.channel ?? 'text', cap.raw_text, cap.status ?? 'pending', cap.status === 'applied' ? new Date() : null]);

      // ── LAVORAZIONI + libretto misure (contabilità produzione → pivot) ──
      for (const wl of e.work_lines ?? []) {
        const wlId = await ins(`INSERT INTO work_line (tenant_id, engagement_id, phase_id, price_list_item_id, description, quantity, unit_id, cost_price, revenue_price, occurred_on, resource_id) VALUES ($1,$2,$3,$4,$5,$6,public.app_resolve_unit(public.app_current_tenant(),$7),$8,$9,$10,$11) RETURNING id`,
          [tenantId, engId, wl.phase ? phaseId.get(wl.phase) ?? null : null, wl.item ? priceItemId.get(wl.item) ?? null : null, wl.description ?? null, wl.quantity, wl.unit, wl.cost_price ?? null, wl.revenue_price ?? null, wl.occurred_on, wl.resource ? resourceId.get(wl.resource) ?? null : null]);
        let seq = 0;
        for (const ms of wl.measures ?? []) await db.query(`INSERT INTO work_line_measure (tenant_id, work_line_id, label, formula, value, seq) VALUES ($1,$2,$3,$4,$5,$6)`,
          [tenantId, wlId, ms.label ?? null, ms.formula ?? null, ms.value, seq++]);
      }
      // ── ATTREZZATURE/MEZZI usati ──
      for (const eu of e.equipment_usage ?? []) await db.query(`INSERT INTO equipment_usage (tenant_id, engagement_id, phase_id, resource_id, occurred_on, quantity, unit_id, unit_cost, note) VALUES ($1,$2,$3,$4,$5,$6,public.app_resolve_unit(public.app_current_tenant(),$7),$8,$9)`,
        [tenantId, engId, eu.phase ? phaseId.get(eu.phase) ?? null : null, resourceId.get(eu.resource)!, eu.occurred_on, eu.quantity, eu.unit ?? 'h', eu.unit_cost ?? null, eu.note ?? null]);
      // ── SUBAPPALTI ──
      for (const sc of e.subcontracts ?? []) await db.query(`INSERT INTO subcontract_line (tenant_id, engagement_id, phase_id, company_id, description, amount, occurred_on, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [tenantId, engId, sc.phase ? phaseId.get(sc.phase) ?? null : null, companyId.get(sc.company)!, sc.description ?? null, sc.amount, sc.occurred_on, sc.note ?? null]);
      // ── RAPPORTINI (testata) + collegamento alle ore confermate ──
      for (const wr of e.work_reports ?? []) {
        const wrId = await ins(`INSERT INTO work_report (tenant_id, engagement_id, audience, status_id, raw_text, final_text, generated_by_ai) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [tenantId, engId, wr.audience ?? 'customer', status('work_report_status', wr.status ?? 'confirmed'), wr.raw_text ?? null, wr.final_text ?? null, wr.generated_by_ai ?? false]);
        if (wr.link_ore !== false) for (const teId of engTimeEntryIds)
          await db.query(`INSERT INTO work_report_time_entry (work_report_id, time_entry_id, tenant_id) VALUES ($1,$2,$3)`, [wrId, teId, tenantId]);
      }
    }

    // overrides di listino con scope engagement (ora gli id ci sono)
    for (const o of deferredOverrides) await applyOverride(o, engagementId.get(o.engagement as string) ?? null);

    // ── ORDINATIVI FTTH (work_order + intestatario PII + apparati + seriali) ──
    let nWo = 0;
    // scarichi di magazzino legati all'ordine (movimenti out con work_order_id): raccolti qui,
    // inseriti dopo la creazione delle ubicazioni (Blocco H — tab "Materiali scaricati").
    const woIssues: { woId: string; mid: string; qty: number; unit: string; on: string | null }[] = [];
    for (const w of pack.work_orders ?? []) {
      const engId = engagementId.get(w.engagement); if (!engId) throw new Error(`work_order ${w.code ?? ''}: engagement '${w.engagement}' non trovato`);
      const woCode = await nextWoCode(db, tenantId);
      const woId = await ins(`INSERT INTO work_order (tenant_id, engagement_id, code, principal_company_id, principal_order_ref, type_id, status_id, assigned_resource_id, address, scheduled_on, completed_on, attributes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [tenantId, engId, woCode, w.operator ? companyId.get(w.operator) ?? null : null, w.operator_order_id ?? null,
         status('work_order_type', w.type ?? 'activation'), status('work_order_status', w.status ?? 'assigned'),
         w.assigned ? resourceId.get(w.assigned) ?? null : null, w.address ?? null, w.scheduled_on ?? null, w.completed_on ?? null, withMarker(w.attributes, packName)]);
      nWo++;
      if (w.subject) await db.query(`INSERT INTO work_order_subject (tenant_id, work_order_id, full_name, phone, phone_alt, email, fiscal_code, address) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [tenantId, woId, w.subject.full_name ?? null, w.subject.phone ?? null, w.subject.phone_alt ?? null, w.subject.email ?? null, w.subject.fiscal_code ?? null, w.subject.address ?? null]);
      for (const it of w.items ?? []) {
        const mid = materialId.get(it.material); if (!mid) throw new Error(`work_order item: materiale '${it.material}' non trovato`);
        await db.query(`INSERT INTO work_order_item (tenant_id, work_order_id, material_id, planned_qty, note) VALUES ($1,$2,$3,$4,$5)`, [tenantId, woId, mid, it.planned_qty ?? 1, it.note ?? null]);
      }
      // seriali installati su questo ordinativo (parco installato)
      for (const s of w.serials ?? []) {
        const mid = materialId.get(s.material); if (!mid) throw new Error(`seriale ${s.serial}: materiale '${s.material}' non trovato`);
        await db.query(`INSERT INTO stock_serial_unit (tenant_id, material_id, serial, status, installed_company_id, installed_on, work_order_id, secrets, note) VALUES ($1,$2,$3,'installed',$4,$5,$6,$7,$8)`,
          [tenantId, mid, s.serial, w.operator ? companyId.get(w.operator) ?? null : null, s.installed_on ?? w.completed_on ?? w.scheduled_on ?? null, woId, secretJson(s.secret), s.note ?? null]);
      }
      // materiali scaricati sull'ordinativo (consumi → costo materiali nella pivot)
      for (const mc of w.consumed ?? []) {
        const mid = materialId.get(mc.material); if (!mid) throw new Error(`consumo WO: materiale '${mc.material}' non trovato`);
        const on = mc.occurred_on ?? w.completed_on ?? w.scheduled_on ?? null;
        await db.query(`INSERT INTO material_consumption (tenant_id, material_id, quantity, unit_id, occurred_on, work_order_id) VALUES ($1,$2,$3,public.app_resolve_unit(public.app_current_tenant(),$4),$5,$6)`,
          [tenantId, mid, mc.quantity, mc.unit, on, woId]);
        woIssues.push({ woId, mid, qty: mc.quantity, unit: mc.unit, on });
      }
    }

    // ── MAGAZZINO: ubicazioni, documenti (DDT) e movimenti (le giacenze si
    //    aggiornano da sole via trigger apply_stock_movement) ──
    const locationId = new Map<string, string>();
    for (const l of pack.stock?.locations ?? []) locationId.set(l.key, await ins(
      `INSERT INTO stock_location (tenant_id, name, kind, resource_id, holds_stock, is_default, active) VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id`,
      [tenantId, l.name, l.kind ?? 'warehouse', l.resource ? resourceId.get(l.resource) ?? null : null, l.holds_stock ?? true, l.is_default ?? false]));
    const moveType = (canon: string) => status('stock_movement_type', canon);
    for (const doc of pack.stock?.documents ?? []) {
      const dest = doc.dest_location ? locationId.get(doc.dest_location) ?? null : null;
      const src = doc.source_location ? locationId.get(doc.source_location) ?? null : null;
      const docId = await ins(`INSERT INTO stock_document (tenant_id, type_id, number, doc_date, source_location_id, dest_location_id, company_id, external_ref, status, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [tenantId, status('stock_document_type', doc.type ?? 'receipt'), doc.number ?? null, doc.doc_date, src, dest, doc.company ? companyId.get(doc.company) ?? null : null, doc.external_ref ?? null, doc.status ?? 'confirmed', doc.note ?? null]);
      for (const ln of doc.lines ?? []) {
        const mid = materialId.get(ln.material); if (!mid) throw new Error(`DDT ${doc.number}: materiale '${ln.material}' non trovato`);
        await db.query(`INSERT INTO stock_document_line (tenant_id, document_id, material_id, quantity, unit_id, unit_cost) VALUES ($1,$2,$3,$4,public.app_resolve_unit(public.app_current_tenant(),$5),$6)`,
          [tenantId, docId, mid, ln.quantity, ln.unit, ln.unit_cost ?? null]);
        // un DDT di carico genera il movimento 'in' sull'ubicazione di destinazione → giacenza
        if ((doc.type ?? 'receipt') === 'receipt' && dest)
          await db.query(`INSERT INTO stock_movement (tenant_id, material_id, location_id, type_id, quantity, unit_id, unit_cost, occurred_on, stock_document_id, document_ref) VALUES ($1,$2,$3,$4,$5,public.app_resolve_unit(public.app_current_tenant(),$6),$7,$8,$9,$10)`,
            [tenantId, mid, dest, moveType('in'), ln.quantity, ln.unit, ln.unit_cost ?? null, doc.doc_date, docId, doc.number ?? null]);
      }
    }
    for (const mv of pack.stock?.movements ?? []) {
      const mid = materialId.get(mv.material); if (!mid) throw new Error(`movimento: materiale '${mv.material}' non trovato`);
      const lid = locationId.get(mv.location); if (!lid) throw new Error(`movimento: ubicazione '${mv.location}' non trovata`);
      // il trigger apply_stock_movement usa il SEGNO della quantità: in=+, out/transfer=−, adjust=delta dato
      const t = mv.type ?? 'out';
      const qty = t === 'in' ? Math.abs(mv.quantity) : t === 'adjust' ? mv.quantity : -Math.abs(mv.quantity);
      await db.query(`INSERT INTO stock_movement (tenant_id, material_id, location_id, type_id, quantity, unit_id, unit_cost, occurred_on, note, engagement_id) VALUES ($1,$2,$3,$4,$5,public.app_resolve_unit(public.app_current_tenant(),$6),$7,$8,$9,$10)`,
        [tenantId, mid, lid, moveType(t), qty, mv.unit, mv.unit_cost ?? null, mv.occurred_on, mv.note ?? null, mv.engagement ? engagementId.get(mv.engagement) ?? null : null]);
    }
    // scarichi su ordine di lavoro: movimento 'out' (segno negativo) con work_order_id, sull'ubicazione predefinita
    const defLocKey = (pack.stock?.locations ?? []).find((l) => l.is_default)?.key ?? (pack.stock?.locations ?? [])[0]?.key;
    const defLoc = defLocKey ? locationId.get(defLocKey) : undefined;
    if (defLoc) {
      for (const is of woIssues) {
        await db.query(`INSERT INTO stock_movement (tenant_id, material_id, location_id, type_id, quantity, unit_id, occurred_on, work_order_id) VALUES ($1,$2,$3,$4,$5,public.app_resolve_unit(public.app_current_tenant(),$6),$7,$8)`,
          [tenantId, is.mid, defLoc, moveType('out'), -Math.abs(is.qty), is.unit, is.on, is.woId]);
      }
    }

    // ── ASSENZE ──
    for (const ab of pack.absences ?? []) {
      const rid = resourceId.get(ab.resource); if (!rid) throw new Error(`assenza: risorsa '${ab.resource}' non trovata`);
      await db.query(`INSERT INTO absence_entry (tenant_id, resource_id, type_id, starts_on, ends_on, hours, half_day, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [tenantId, rid, status('absence_type', ab.type ?? 'vacation'), ab.starts_on, ab.ends_on, ab.hours ?? null, ab.half_day ?? false, ab.note ?? null]);
    }
    // seriali "liberi" (a magazzino / assegnati al furgone) — non installati
    for (const s of pack.serials ?? []) {
      const mid = materialId.get(s.material); if (!mid) throw new Error(`seriale ${s.serial}: materiale '${s.material}' non trovato`);
      await db.query(`INSERT INTO stock_serial_unit (tenant_id, material_id, serial, status, holder_resource_id, secrets, note) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [tenantId, mid, s.serial, s.status ?? 'in_stock', s.holder ? resourceId.get(s.holder) ?? null : null, secretJson(s.secret), s.note ?? null]);
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
  // POWERCOM: nuovi moduli, eliminati per primi (dipendenze FK verso engagement/material/company)
  { table: 'work_report_time_entry', where: 'tenant_id = $1' }, { table: 'work_report', where: 'tenant_id = $1' },
  { table: 'work_line_measure', where: 'tenant_id = $1' }, { table: 'work_line', where: 'tenant_id = $1' },
  { table: 'equipment_usage', where: 'tenant_id = $1' }, { table: 'subcontract_line', where: 'tenant_id = $1' },
  { table: 'stock_serial_unit', where: 'tenant_id = $1' }, { table: 'work_order_item', where: 'tenant_id = $1' },
  { table: 'work_order_subject', where: 'tenant_id = $1' }, { table: 'work_order', where: 'tenant_id = $1' },
  { table: 'price_list_override', where: 'tenant_id = $1' }, { table: 'price_list_item', where: 'tenant_id = $1' },
  { table: 'price_list', where: 'tenant_id = $1' },
  // magazzino (prima di material/location): stock_movement è immutabile → la wipe disabilita i trigger
  { table: 'stock_balance', where: 'tenant_id = $1' }, { table: 'stock_movement', where: 'tenant_id = $1' },
  { table: 'stock_document_line', where: 'tenant_id = $1' }, { table: 'stock_document', where: 'tenant_id = $1' },
  { table: 'stock_location', where: 'tenant_id = $1' },
  { table: 'absence_entry', where: 'tenant_id = $1' }, { table: 'absence_balance', where: 'tenant_id = $1' },
  { table: 'time_entry', where: 'tenant_id = $1' }, { table: 'material_consumption', where: 'tenant_id = $1' },
  { table: 'capture', where: 'tenant_id = $1' }, { table: 'activity_resource', where: 'tenant_id = $1' },
  { table: 'activity_dependency', where: 'tenant_id = $1' }, { table: 'activity', where: 'tenant_id = $1' },
  { table: 'phase', where: 'tenant_id = $1' }, { table: 'engagement', where: 'tenant_id = $1' },
  { table: 'asset', where: 'tenant_id = $1' }, { table: 'material', where: 'tenant_id = $1' },
  { table: 'site', where: 'tenant_id = $1' },
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
    // disabilita i trigger per la durata della transazione: stock_movement è
    // immutabile via trigger, ma in un wipe demo dobbiamo poterlo svuotare.
    await db.query(`SET LOCAL session_replication_role = replica`);
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
