/** demo/list.ts — CLI: pnpm demo:list. Elenca i tenant e i pack demo. */
import { listTenants, listPacks } from './runner.js';

listTenants()
  .then((rows) => {
    console.log(`\nPack disponibili: ${listPacks().join(', ') || '(nessuno)'}`);
    console.log('Tenant presenti:');
    for (const r of rows) {
      const tag = r.demoPack ? `DEMO pack='${r.demoPack}'` : 'sistema/produzione';
      console.log(`  ${r.name.padEnd(24)} ${r.vertical.padEnd(10)} utenti=${r.users} commesse=${r.engagements}  [${tag}]`);
    }
    console.log('');
  })
  .catch((e) => { console.error('[demo] errore:', e); process.exit(1); });
