/**
 * tree.test.ts — invarianti DB dello STANDARD entità ad albero (Definition of Done):
 *   (1) anti-ciclo: spostare un nodo sotto una propria discendente → trigger lo rifiuta;
 *       e CHECK no_self_parent impedisce parent_id = self.
 *   (2) unicità nome PER LIVELLO, archived-aware, su INSERT e UPDATE;
 *   (3) FK gerarchia RESTRICT: hard-delete di un genitore con figli → 23503.
 *
 * Caso pilota: material_category. Strategia come rls.test.ts: connessione ADMIN
 * (bypassa RLS), tenant reale di bootstrap, cleanup in afterAll. Nomi con prefisso
 * unico per non collidere coi dati esistenti.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

const admin = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
const P = `__treetest_${Date.now()}`;          // prefisso univoco per i nomi
let tenant = '';
const created: string[] = [];                  // material_category id da ripulire
const stockIds: string[] = [];                 // stock_location id da ripulire
const siteIds: string[] = [];                  // site id da ripulire

async function mkCat(name: string, parentId: string | null): Promise<string> {
  const r = await admin.query(
    `INSERT INTO material_category (tenant_id, parent_id, name) VALUES ($1,$2,$3) RETURNING id`,
    [tenant, parentId, name]);
  const id = r.rows[0].id as string;
  created.push(id);
  return id;
}
async function expectReject(fn: () => Promise<unknown>): Promise<string> {
  try { await fn(); } catch (e) { return (e as Error).message; }
  throw new Error('atteso un errore, ma la query è andata a buon fine');
}

beforeAll(async () => {
  tenant = (await admin.query(`SELECT id FROM tenant ORDER BY created_at LIMIT 1`)).rows[0].id as string;
});
afterAll(async () => {
  // elimina in ordine inverso (foglie prima) per rispettare la FK RESTRICT
  for (const id of created.reverse()) await admin.query(`DELETE FROM material_category WHERE id = $1`, [id]).catch(() => {});
  for (const id of siteIds.reverse()) await admin.query(`DELETE FROM site WHERE id = $1`, [id]).catch(() => {});
  for (const id of stockIds.reverse()) await admin.query(`DELETE FROM stock_location WHERE id = $1`, [id]).catch(() => {});
  await admin.end();
});

describe('material_category — anti-ciclo (§3)', () => {
  it('rifiuta lo spostamento di un nodo sotto una sua discendente', async () => {
    const a = await mkCat(`${P}_A`, null);
    const b = await mkCat(`${P}_B`, a);
    const c = await mkCat(`${P}_C`, b);            // A › B › C
    const msg = await expectReject(() => admin.query(`UPDATE material_category SET parent_id = $2 WHERE id = $1`, [a, c]));
    expect(msg).toMatch(/ciclo non ammesso/i);
  });

  it('rifiuta parent_id = self (CHECK no_self_parent)', async () => {
    const a = await mkCat(`${P}_self`, null);
    await expectReject(() => admin.query(`UPDATE material_category SET parent_id = $1 WHERE id = $1`, [a]));
  });
});

describe('material_category — unicità per livello, archived-aware (§2/B)', () => {
  it('rifiuta due radici con lo stesso nome (INSERT)', async () => {
    await mkCat(`${P}_dupRoot`, null);
    await expectReject(() => mkCat(`${P}_dupRoot`, null));
  });

  it('consente lo stesso nome sotto genitori diversi', async () => {
    const p1 = await mkCat(`${P}_p1`, null);
    const p2 = await mkCat(`${P}_p2`, null);
    await mkCat(`${P}_Fibra`, p1);
    const id = await mkCat(`${P}_Fibra`, p2);       // stesso nome, livello diverso → OK
    expect(id).toBeTruthy();
  });

  it('rifiuta il duplicato per livello anche su UPDATE', async () => {
    const p = await mkCat(`${P}_pU`, null);
    await mkCat(`${P}_x1`, p);
    const x2 = await mkCat(`${P}_x2`, p);
    await expectReject(() => admin.query(`UPDATE material_category SET name = $2 WHERE id = $1`, [x2, `${P}_x1`]));
  });

  it('riusa il nome dopo l’archiviazione (indice parziale WHERE archived_at IS NULL)', async () => {
    const n = `${P}_reuse`;
    const a1 = await mkCat(n, null);
    await admin.query(`UPDATE material_category SET archived_at = now() WHERE id = $1`, [a1]);
    const a2 = await mkCat(n, null);                // stesso nome, il primo è archiviato → OK
    expect(a2).toBeTruthy();
  });
});

describe('material_category — FK gerarchia RESTRICT (§2/A)', () => {
  it('impedisce l’hard-delete di un genitore con figli (23503)', async () => {
    const p = await mkCat(`${P}_parent`, null);
    await mkCat(`${P}_child`, p);
    const msg = await expectReject(() => admin.query(`DELETE FROM material_category WHERE id = $1`, [p]));
    expect(msg).toMatch(/violates foreign key|foreign key constraint/i);
  });
});

// Gli altri due alberi condividono lo stesso modello (trigger anti-ciclo + FK RESTRICT, migr 058).
async function mkLoc(name: string, parentId: string | null): Promise<string> {
  const r = await admin.query(`INSERT INTO stock_location (tenant_id, parent_id, name, kind) VALUES ($1,$2,$3,'sub_location') RETURNING id`, [tenant, parentId, name]);
  const id = r.rows[0].id as string; stockIds.push(id); return id;
}
async function mkSite(name: string, parentId: string | null): Promise<string> {
  const r = await admin.query(`INSERT INTO site (tenant_id, parent_id, name, kind) VALUES ($1,$2,$3,'building') RETURNING id`, [tenant, parentId, name]);
  const id = r.rows[0].id as string; siteIds.push(id); return id;
}

describe('site / stock_location — anti-ciclo + FK RESTRICT (migr 058)', () => {
  it('site: anti-ciclo su spostamento sotto una discendente', async () => {
    const a = await mkSite(`${P}_sA`, null); const b = await mkSite(`${P}_sB`, a); const c = await mkSite(`${P}_sC`, b);
    const msg = await expectReject(() => admin.query(`UPDATE site SET parent_id = $2 WHERE id = $1`, [a, c]));
    expect(msg).toMatch(/ciclo non ammesso/i);
  });
  it('site: FK RESTRICT blocca l’hard-delete del genitore (CASCADE→RESTRICT corretto)', async () => {
    const p = await mkSite(`${P}_sParent`, null); await mkSite(`${P}_sChild`, p);
    const msg = await expectReject(() => admin.query(`DELETE FROM site WHERE id = $1`, [p]));
    expect(msg).toMatch(/foreign key/i);
  });
  it('stock_location: anti-ciclo su spostamento sotto una discendente', async () => {
    const a = await mkLoc(`${P}_lA`, null); const b = await mkLoc(`${P}_lB`, a); const c = await mkLoc(`${P}_lC`, b);
    const msg = await expectReject(() => admin.query(`UPDATE stock_location SET parent_id = $2 WHERE id = $1`, [a, c]));
    expect(msg).toMatch(/ciclo|cycle/i);
  });
  it('stock_location: FK RESTRICT blocca l’hard-delete del genitore', async () => {
    const p = await mkLoc(`${P}_lParent`, null); await mkLoc(`${P}_lChild`, p);
    const msg = await expectReject(() => admin.query(`DELETE FROM stock_location WHERE id = $1`, [p]));
    expect(msg).toMatch(/foreign key/i);
  });
});
