/**
 * wipeTestData.ts — "wipe demo": svuota i DATI operativi e anagrafici di PROVA
 * di un tenant, preservando la STRUTTURA (tenant, piani/abbonamenti, ruoli e
 * permessi, utenti, lookup, numeratori, field_definition, tax_rate di sistema).
 * Da usare prima delle demo per ripartire puliti. NON tocca lo schema.
 *
 * Uso (dentro il container backend):
 *   pnpm --filter @sisuite/backend wipe:testdata            # tenant di default (il più vecchio)
 *   pnpm --filter @sisuite/backend wipe:testdata <tenantId>
 *
 * Gira con la connessione ADMIN (owner) per poter disabilitare temporaneamente
 * il trigger di immutabilità su stock_movement.
 */
import pg from 'pg';

// ordine FK-safe: figli → genitori. Tutte filtrate per tenant_id.
const TABLES_IN_ORDER = [
  // magazzino — movimenti e documenti
  'stock_movement', 'stock_balance',
  'stock_count_line', 'stock_count',
  'purchase_order_line', 'purchase_order',
  'pick_list_line', 'pick_list',
  'stock_document_line', 'stock_document',
  'stock_serial_unit', 'stock_lot',
  // commessa / produzione / rendicontazione
  'work_line_measure', 'work_line',
  'equipment_usage', 'subcontract_line', 'material_consumption',
  'time_entry', 'work_report', 'absence_entry', 'absence_balance',
  'activity_resource', 'activity_dependency', 'activity', 'phase',
  'work_order_item', 'work_order_subject', 'work_order',
  'engagement',
  // catalogo articoli
  'material_image', 'material_supplier', 'material', 'material_category',
  // risorse
  'resource_skill', 'resource_certification', 'resource_availability', 'skill', 'resource',
  // anagrafiche
  'asset', 'site', 'company_contact', 'company_role', 'company',
  // catture
  'capture',
];

async function main(): Promise<void> {
  const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!adminUrl) throw new Error('DATABASE_ADMIN_URL/DATABASE_URL mancante');
  const arg = process.argv[2];
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  await client.query('SET search_path TO public');
  try {
    const tenantId = arg ?? (await client.query(`SELECT id FROM tenant ORDER BY created_at LIMIT 1`)).rows[0]?.id;
    if (!tenantId) throw new Error('Nessun tenant trovato');
    console.log(`[wipe] tenant ${tenantId}`);
    await client.query('BEGIN');
    // stock_movement è immutabile via trigger: lo disabilito per il wipe
    await client.query(`ALTER TABLE public.stock_movement DISABLE TRIGGER USER`);
    let totals = 0;
    for (const t of TABLES_IN_ORDER) {
      const r = await client.query(`DELETE FROM public.${t} WHERE tenant_id = $1`, [tenantId]);
      if (r.rowCount) { console.log(`[wipe] ${t}: ${r.rowCount}`); totals += r.rowCount; }
    }
    await client.query(`ALTER TABLE public.stock_movement ENABLE TRIGGER USER`);
    await client.query('COMMIT');
    console.log(`[wipe] completato — ${totals} righe rimosse. Struttura (tenant/ruoli/utenti/lookup/numeratori/field_definition) preservata.`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[wipe] ERRORE:', (e as Error).message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
