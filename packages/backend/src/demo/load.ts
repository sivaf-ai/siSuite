/**
 * demo/load.ts — LOADER dei Demo Data Pack (brief §6 / parte2 §1.3).
 *   pnpm demo:load <pack>     (es. fiber, pools, software)
 *
 * Crea UN tenant per pack, con utenti GoTrue reali (login), in UNA transazione,
 * con connessione ADMIN. Risolve gli stati di sistema, genera engagement.code dal
 * numeratore del tenant, inserisce nell'ordine FK. Non tocca MAI righe di sistema.
 */
import { openAdmin, readPack, withMarker, findDemoTenant, authBaseUrl, type DemoPack } from './lib.js';
import { ensureAuthUser } from '../auth/gotrueAdmin.js';
import type pg from 'pg';

function arg(): string {
  const a = process.argv[2];
  if (!a) { console.error('Uso: pnpm demo:load <pack>  (es. fiber)'); process.exit(1); }
  return a;
}

/** Genera il prossimo engagement.code dal number_series del tenant (scoped, admin). */
async function nextEngCode(db: pg.Client, tenantId: string, now = new Date()): Promise<string> {
  const { rows } = await db.query(
    `SELECT format, reset_period, current_period, last_number
     FROM number_series WHERE tenant_id = $1 AND key = 'engagement' FOR UPDATE`,
    [tenantId],
  );
  if (!rows.length) throw new Error('number_series engagement mancante per il tenant demo');
  const r = rows[0] as { format: string; reset_period: string; current_period: string; last_number: string | number };
  const y = now.getUTCFullYear().toString();
  const m = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const period = r.reset_period === 'yearly' ? y : r.reset_period === 'monthly' ? `${y}-${m}` : '';
  const next = (period !== r.current_period ? 0 : Number(r.last_number)) + 1;
  await db.query(`UPDATE number_series SET current_period = $1, last_number = $2 WHERE tenant_id = $3 AND key = 'engagement'`,
    [period, next, tenantId]);
  return r.format
    .replace(/\{YYYY\}/g, y).replace(/\{YY\}/g, y.slice(-2)).replace(/\{MM\}/g, m)
    .replace(/\{SEQ:(\d+)\}/g, (_x, n: string) => next.toString().padStart(Number(n), '0'));
}

async function main(): Promise<void> {
  const packName = arg();
  const pack: DemoPack = readPack(packName);
  const db = await openAdmin();
  const T = pack.tenant;

  // guardia: un solo tenant per pack
  if (await findDemoTenant(db, T.name)) {
    console.error(`[demo] tenant "${T.name}" esiste già. Esegui prima:  pnpm demo:wipe ${packName}`);
    await db.end();
    process.exit(1);
  }

  // mappa stati di sistema: "category|canonical" -> lookup_value.id
  const lv = await db.query(`SELECT id, category, canonical FROM lookup_value WHERE tenant_id IS NULL AND is_default`);
  const statusMap = new Map<string, string>();
  for (const r of lv.rows) statusMap.set(`${r.category}|${r.canonical}`, r.id as string);
  const status = (category: string, canonical: string): string => {
    const id = statusMap.get(`${category}|${canonical}`);
    if (!id) throw new Error(`stato di sistema mancante: ${category}/${canonical}`);
    return id;
  };

  const ins = (sql: string, params: unknown[]) => db.query(sql, params).then((r) => r.rows[0].id as string);

  try {
    await db.query('BEGIN');

    // 1) tenant
    const tenantId = await ins(
      `INSERT INTO tenant (name, vertical, default_locale, timezone) VALUES ($1,$2,$3,$4) RETURNING id`,
      [T.name, T.vertical, T.default_locale ?? 'it-IT', T.timezone ?? 'Europe/Rome'],
    );

    // 2) subscription
    if (pack.subscription) {
      const days = pack.subscription.days_valid ?? 365;
      await db.query(
        `INSERT INTO subscription (tenant_id, plan_id, status, current_period_end)
         SELECT $1, p.id, 'active', now() + ($2 || ' days')::interval
         FROM plan p WHERE p.code = $3 LIMIT 1`,
        [tenantId, String(days), pack.subscription.plan_code],
      );
    }

    // 3) number_series engagement
    await db.query(
      `INSERT INTO number_series (tenant_id, key, format, reset_period) VALUES ($1,'engagement','{YYYY}-{SEQ:4}','yearly')`,
      [tenantId],
    );

    // 4) utenti (GoTrue + app_user + user_role)
    const userId = new Map<string, string>();
    for (const u of pack.users ?? []) {
      const authUserId = await ensureAuthUser({ baseUrl: authBaseUrl(), email: u.email, password: u.password });
      const id = await ins(
        `INSERT INTO app_user (tenant_id, full_name, email, locale, auth_user_id, active)
         VALUES ($1,$2,$3,$4,$5,true) RETURNING id`,
        [tenantId, u.full_name, u.email, u.locale ?? T.default_locale ?? 'it-IT', authUserId],
      );
      await db.query(
        `INSERT INTO user_role (user_id, role_id)
         SELECT $1, r.id FROM role r WHERE r.name = $2 AND r.tenant_id IS NULL`,
        [id, u.role],
      );
      userId.set(u.key, id);
    }

    // 5) companies (+ role + contacts)
    const companyId = new Map<string, string>();
    for (const c of pack.companies ?? []) {
      const id = await ins(
        `INSERT INTO company (tenant_id, display_name, type, address, attributes) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [tenantId, c.display_name, c.type ?? 'organization', c.address ?? null, withMarker(c.attributes, packName)],
      );
      companyId.set(c.key, id);
      for (const role of c.roles ?? []) {
        await db.query(
          `INSERT INTO company_role (tenant_id, company_id, role, customer_nature) VALUES ($1,$2,$3,$4)`,
          [tenantId, id, role.role, role.customer_nature ?? null],
        );
      }
      for (const ct of c.contacts ?? []) {
        await db.query(
          `INSERT INTO company_contact (tenant_id, company_id, full_name, role_title, email, phone, is_primary)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [tenantId, id, ct.full_name, ct.role_title ?? null, ct.email ?? null, ct.phone ?? null, ct.is_primary ?? false],
        );
      }
    }

    // 6) assets
    const assetId = new Map<string, string>();
    for (const a of pack.assets ?? []) {
      const cid = companyId.get(a.company);
      if (!cid) throw new Error(`asset ${a.key}: company '${a.company}' non trovata`);
      const id = await ins(
        `INSERT INTO asset (tenant_id, company_id, kind, label, installed_at, attributes)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [tenantId, cid, a.kind, a.label, a.installed_on ?? null, withMarker(a.attributes, packName)],
      );
      assetId.set(a.key, id);
    }

    // 7) resources (+ availability)
    const resourceId = new Map<string, string>();
    for (const r of pack.resources ?? []) {
      const uid = r.user ? userId.get(r.user) ?? null : null;
      const id = await ins(
        `INSERT INTO resource (tenant_id, kind, label, user_id, attributes, active)
         VALUES ($1,$2,$3,$4,$5,true) RETURNING id`,
        [tenantId, r.kind, r.label, uid, withMarker(r.attributes, packName)],
      );
      resourceId.set(r.key, id);
    }
    for (const av of pack.resource_availability ?? []) {
      const rid = resourceId.get(av.resource);
      if (!rid) throw new Error(`resource_availability: risorsa '${av.resource}' non trovata`);
      await db.query(
        `INSERT INTO resource_availability (tenant_id, resource_id, kind, starts_at, ends_at, reason)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [tenantId, rid, av.kind ?? 'unavailable', av.starts_at, av.ends_at, av.reason ?? null],
      );
    }

    // 8) materials
    const materialId = new Map<string, string>();
    for (const m of pack.materials ?? []) {
      const id = await ins(
        `INSERT INTO material (tenant_id, name, unit, attributes) VALUES ($1,$2,$3,$4) RETURNING id`,
        [tenantId, m.name, m.unit, withMarker(m.attributes, packName)],
      );
      materialId.set(m.key, id);
    }

    // 9) engagements (+ phase, activity, dependency, resource, time_entry, consumption, capture)
    let nEng = 0, nAct = 0, nDep = 0;
    for (const e of pack.engagements ?? []) {
      const cid = companyId.get(e.company);
      if (!cid) throw new Error(`engagement ${e.key}: company '${e.company}' non trovata`);
      const code = await nextEngCode(db, tenantId);
      const engId = await ins(
        `INSERT INTO engagement (tenant_id, company_id, asset_id, code, manager_id, type, title, status_id, started_on, ended_on, attributes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [tenantId, cid, e.asset ? assetId.get(e.asset) ?? null : null, code,
         e.manager ? userId.get(e.manager) ?? null : null, e.type, e.title,
         status('engagement_status', e.status ?? 'active'), e.started_on ?? null, e.ended_on ?? null,
         withMarker(e.attributes, packName)],
      );
      nEng++;

      const phaseId = new Map<string, string>();
      for (const p of e.phases ?? []) {
        const id = await ins(
          `INSERT INTO phase (tenant_id, engagement_id, parent_phase_id, name, seq, planned_start, planned_end, status_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [tenantId, engId, p.parent ? phaseId.get(p.parent) ?? null : null, p.name, p.seq ?? 0,
           p.planned_start ?? null, p.planned_end ?? null, status('phase_status', p.status ?? 'pending')],
        );
        phaseId.set(p.key, id);
      }

      const activityId = new Map<string, string>();
      // primo giro: crea le attività (così le dipendenze possono riferirsi a chiavi già note)
      for (const a of e.activities ?? []) {
        const id = await ins(
          `INSERT INTO activity (tenant_id, engagement_id, phase_id, title, kind, status_id, estimated_minutes, scheduled_start, earliest_start, due_by, attributes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [tenantId, engId, a.phase ? phaseId.get(a.phase) ?? null : null, a.title, a.kind ?? null,
           status('activity_status', a.status ?? 'planned'), a.estimated_minutes ?? null,
           a.scheduled_start ?? null, a.earliest_start ?? null, a.due_by ?? null, withMarker(a.attributes, packName)],
        );
        activityId.set(a.key, id);
        nAct++;
      }
      // secondo giro: dipendenze (FS) + assegnazioni risorse
      for (const a of e.activities ?? []) {
        const succ = activityId.get(a.key)!;
        for (const dep of a.after ?? []) {
          const pred = activityId.get(dep.act);
          if (!pred) throw new Error(`dipendenza in ${a.key}: predecessore '${dep.act}' non trovato`);
          await db.query(
            `INSERT INTO activity_dependency (tenant_id, predecessor_id, successor_id, type, lag_minutes)
             VALUES ($1,$2,$3,'FS',$4)`,
            [tenantId, pred, succ, (dep.lag_days ?? 0) * 1440],
          );
          nDep++;
        }
        for (const rkey of a.resources ?? []) {
          const rid = resourceId.get(rkey);
          if (!rid) throw new Error(`assegnazione in ${a.key}: risorsa '${rkey}' non trovata`);
          await db.query(
            `INSERT INTO activity_resource (tenant_id, activity_id, resource_id) VALUES ($1,$2,$3)`,
            [tenantId, succ, rid],
          );
        }
      }

      for (const t of e.time_entries ?? []) {
        await db.query(
          `INSERT INTO time_entry (tenant_id, engagement_id, activity_id, resource_id, typology, minutes, occurred_on)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [tenantId, engId, t.activity ? activityId.get(t.activity) ?? null : null,
           t.resource ? resourceId.get(t.resource) ?? null : null, t.typology, t.minutes, t.occurred_on],
        );
      }
      for (const mc of e.material_consumption ?? []) {
        const mid = materialId.get(mc.material);
        if (!mid) throw new Error(`consumo in ${e.key}: materiale '${mc.material}' non trovato`);
        await db.query(
          `INSERT INTO material_consumption (tenant_id, activity_id, material_id, quantity, unit, occurred_on)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [tenantId, mc.activity ? activityId.get(mc.activity) ?? null : null, mid, mc.quantity, mc.unit, mc.occurred_on],
        );
      }
      for (const cap of e.captures ?? []) {
        await db.query(
          `INSERT INTO capture (tenant_id, user_id, channel, raw_text, status, processed_at)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [tenantId, cap.user ? userId.get(cap.user) ?? null : null, cap.channel ?? 'text', cap.raw_text,
           cap.status ?? 'pending', cap.status === 'applied' ? new Date() : null],
        );
      }
    }

    await db.query('COMMIT');
    console.log(`\n[demo] ✅ pack '${packName}' caricato.`);
    console.log(`  tenant "${T.name}" = ${tenantId} (vertical ${T.vertical})`);
    console.log(`  utenti: ${(pack.users ?? []).length} · commesse: ${nEng} · attività: ${nAct} · dipendenze: ${nDep}`);
    console.log('  login:');
    for (const u of pack.users ?? []) console.log(`    ${u.role.padEnd(8)} ${u.email}  /  ${u.password}`);
    console.log(`\n  per cancellare:  pnpm demo:wipe ${packName}\n`);
  } catch (err) {
    await db.query('ROLLBACK').catch(() => undefined);
    console.error(`[demo] ❌ load fallito: ${(err as Error).message}`);
    await db.end();
    process.exit(1);
  }
  await db.end();
}

main().catch((e) => { console.error('[demo] errore:', e); process.exit(1); });
