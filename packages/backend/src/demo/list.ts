/**
 * demo/list.ts — elenca i tenant presenti e segnala quali sono pack demo.
 *   pnpm demo:list
 * Un tenant è "demo" se ha almeno una riga con attributes->>'_demo_pack'.
 */
import { openAdmin } from './lib.js';

async function main(): Promise<void> {
  const db = await openAdmin();
  const rows = (await db.query(`
    SELECT t.id, t.name, t.vertical,
           (SELECT count(*) FROM app_user u WHERE u.tenant_id = t.id) AS users,
           (SELECT count(*) FROM engagement e WHERE e.tenant_id = t.id) AS engagements,
           (SELECT max(c.attributes->>'_demo_pack') FROM company c WHERE c.tenant_id = t.id) AS demo_pack
    FROM tenant t ORDER BY t.name
  `)).rows;
  console.log('\nTenant presenti:');
  for (const r of rows) {
    const tag = r.demo_pack ? `DEMO pack='${r.demo_pack}'` : 'sistema/produzione';
    console.log(`  ${String(r.name).padEnd(24)} ${String(r.vertical).padEnd(10)} utenti=${r.users} commesse=${r.engagements}  [${tag}]`);
  }
  console.log('');
  await db.end();
}

main().catch((e) => { console.error('[demo] errore:', e); process.exit(1); });
