/**
 * demo/wipe.ts — UNLOADER dei Demo Data Pack (brief §6 / parte2 §1.4).
 *   pnpm demo:wipe <pack>
 *
 * Cancella SOLO il tenant del pack, in ordine FK inverso (alcune FK sono RESTRICT:
 * engagement.company_id, asset.company_id, material_consumption.material_id).
 * NON tocca MAI righe di sistema (tenant_id IS NULL). Le identità GoTrue si rimuovono
 * best-effort (se falliscono restano orfane ma innocue: riusate al prossimo load).
 */
import { SignJWT } from 'jose';
import { openAdmin, readPack, findDemoTenant, authBaseUrl } from './lib.js';

function arg(): string {
  const a = process.argv[2];
  if (!a) { console.error('Uso: pnpm demo:wipe <pack>'); process.exit(1); }
  return a;
}

/** Ordine INVERSO di cancellazione, tutto scoped al tenant demo. */
const STEPS: { table: string; where: string }[] = [
  { table: 'time_entry', where: 'tenant_id = $1' },
  { table: 'material_consumption', where: 'tenant_id = $1' },
  { table: 'capture', where: 'tenant_id = $1' },
  { table: 'activity_resource', where: 'tenant_id = $1' },
  { table: 'activity_dependency', where: 'tenant_id = $1' },
  { table: 'activity', where: 'tenant_id = $1' },
  { table: 'phase', where: 'tenant_id = $1' },
  { table: 'engagement', where: 'tenant_id = $1' },
  { table: 'asset', where: 'tenant_id = $1' },
  { table: 'material', where: 'tenant_id = $1' },
  { table: 'company_contact', where: 'tenant_id = $1' },
  { table: 'company_role', where: 'tenant_id = $1' },
  { table: 'company', where: 'tenant_id = $1' },
  { table: 'resource_availability', where: 'tenant_id = $1' },
  { table: 'resource', where: 'tenant_id = $1' },
  { table: 'user_role', where: 'user_id IN (SELECT id FROM app_user WHERE tenant_id = $1)' },
  // field_definition del tenant (eventuali campi personalizzati creati nel demo)
  { table: 'field_definition', where: 'tenant_id = $1' },
  { table: 'app_user', where: 'tenant_id = $1' },
  { table: 'number_series', where: 'tenant_id = $1' },
  { table: 'subscription', where: 'tenant_id = $1' },
  { table: 'tenant', where: 'id = $1' },
];

/** Rimozione best-effort delle identità GoTrue (richiede AUTH_JWT_SECRET HS256). */
async function removeGoTrue(authUserIds: string[]): Promise<void> {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret || authUserIds.length === 0) {
    if (authUserIds.length) console.warn(`[demo] ${authUserIds.length} identità GoTrue NON rimosse (AUTH_JWT_SECRET assente). Innocue: riusate al prossimo load.`);
    return;
  }
  try {
    const token = await new SignJWT({ role: 'service_role' })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('5m')
      .sign(new TextEncoder().encode(secret));
    let ok = 0;
    for (const id of authUserIds) {
      const res = await fetch(`${authBaseUrl()}/admin/users/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) ok++;
    }
    console.log(`[demo] identità GoTrue rimosse: ${ok}/${authUserIds.length}`);
  } catch (e) {
    console.warn(`[demo] rimozione GoTrue best-effort fallita (${(e as Error).message}). Identità lasciate (innocue).`);
  }
}

async function main(): Promise<void> {
  const packName = arg();
  const pack = readPack(packName);
  const db = await openAdmin();
  const tenantId = await findDemoTenant(db, pack.tenant.name);
  if (!tenantId) {
    console.log(`[demo] nessun tenant "${pack.tenant.name}": niente da cancellare.`);
    await db.end();
    return;
  }

  // raccogli le identità GoTrue prima di cancellare app_user
  const authIds = (await db.query(`SELECT auth_user_id FROM app_user WHERE tenant_id = $1 AND auth_user_id IS NOT NULL`, [tenantId]))
    .rows.map((r) => r.auth_user_id as string);

  try {
    await db.query('BEGIN');
    let total = 0;
    for (const s of STEPS) {
      const r = await db.query(`DELETE FROM ${s.table} WHERE ${s.where}`, [tenantId]);
      if (r.rowCount) { total += r.rowCount; }
    }
    await db.query('COMMIT');
    console.log(`[demo] ✅ pack '${packName}' (tenant "${pack.tenant.name}") cancellato. Righe rimosse: ${total}.`);
  } catch (err) {
    await db.query('ROLLBACK').catch(() => undefined);
    console.error(`[demo] ❌ wipe fallito: ${(err as Error).message}`);
    await db.end();
    process.exit(1);
  }

  await removeGoTrue(authIds);
  await db.end();
}

main().catch((e) => { console.error('[demo] errore:', e); process.exit(1); });
