/** demo/wipe.ts — CLI: pnpm demo:wipe <pack>. Logica in runner.wipePack. */
import { readPack } from './lib.js';
import { wipePack } from './runner.js';

const pack = process.argv[2];
if (!pack) { console.error('Uso: pnpm demo:wipe <pack>'); process.exit(1); }

wipePack(pack)
  .then((r) => {
    if (!r.found) { console.log(`[demo] nessun tenant "${readPack(pack).tenant.name}": niente da cancellare.`); return; }
    console.log(`[demo] ✅ pack '${pack}' cancellato. Righe rimosse: ${r.rows}. Identità GoTrue rimosse: ${r.gotrue}.`);
  })
  .catch((e) => { console.error(`[demo] ❌ wipe fallito: ${(e as Error).message}`); process.exit(1); });
