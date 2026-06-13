/** demo/load.ts — CLI: pnpm demo:load <pack>. Logica in runner.loadPack. */
import { loadPack } from './runner.js';

const pack = process.argv[2];
if (!pack) { console.error('Uso: pnpm demo:load <pack>  (es. fiber)'); process.exit(1); }

loadPack(pack)
  .then((s) => {
    console.log(`\n[demo] ✅ pack '${pack}' caricato.`);
    console.log(`  tenant "${s.tenantName}" = ${s.tenantId} (vertical ${s.vertical})`);
    console.log(`  utenti: ${s.users} · commesse: ${s.engagements} · attività: ${s.activities} · dipendenze: ${s.dependencies}`);
    console.log('  login:');
    for (const l of s.logins) console.log(`    ${l.role.padEnd(8)} ${l.email}  /  ${l.password}`);
    console.log(`\n  per cancellare:  pnpm demo:wipe ${pack}\n`);
  })
  .catch((e) => { console.error(`[demo] ❌ load fallito: ${(e as Error).message}`); process.exit(1); });
