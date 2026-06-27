/**
 * usageGuard.ts — Controllo d'uso per il soft-delete (Carta: un record
 * referenziato non si cancella NÉ si archivia). Le FK con ON DELETE RESTRICT
 * bloccano solo la hard-delete; sull'UPDATE archived_at non scattano, quindi
 * prima di archiviare un'anagrafica contiamo i riferimenti e, se presenti,
 * blocchiamo con un messaggio che NOMINA le entità (e il conteggio).
 *
 * Il conteggio gira già sotto RLS (withRls) → è automaticamente tenant-scoped.
 */
import type { PoolClient } from 'pg';

export type UsageRef = {
  table: string;   // tabella che referenzia l'anagrafica
  col: string;     // colonna FK verso l'anagrafica
  label: string;   // nome leggibile (it-IT) per il messaggio
  extra?: string;  // condizione SQL aggiuntiva (es. "qty_on_hand <> 0")
};

/** Ritorna l'elenco "N etichetta" dei riferimenti trovati (vuoto = archiviabile). */
export async function findUsage(
  db: PoolClient, id: string, refs: readonly UsageRef[],
): Promise<string[]> {
  const selects = refs.map((r, i) =>
    `(SELECT count(*) FROM public.${r.table} WHERE ${r.col} = $1${r.extra ? ` AND ${r.extra}` : ''})::int AS c${i}`);
  const row = (await db.query(`SELECT ${selects.join(', ')}`, [id])).rows[0] as Record<string, number>;
  const used: string[] = [];
  refs.forEach((r, i) => { const n = row[`c${i}`] ?? 0; if (n > 0) used.push(`${n} ${r.label}`); });
  return used;
}

/** Costruisce il messaggio 409 standard "Impossibile eliminare «nome»: …". */
export function usageMessage(entityName: string, used: string[]): string {
  return `Impossibile eliminare «${entityName}»: è utilizzato in ${used.join(', ')}. Rimuovi prima i collegamenti, poi riprova.`;
}

// ── Mappe dei riferimenti per anagrafica (colonne verificate sullo schema) ──

export const MATERIAL_REFS: readonly UsageRef[] = [
  { table: 'stock_movement', col: 'material_id', label: 'movimenti di magazzino' },
  { table: 'stock_document_line', col: 'material_id', label: 'righe documento' },
  { table: 'material_consumption', col: 'material_id', label: 'consumi' },
  { table: 'work_order_item', col: 'material_id', label: 'apparati ordine' },
  { table: 'purchase_order_line', col: 'material_id', label: "righe ordine d'acquisto" },
  { table: 'pick_list_line', col: 'material_id', label: 'righe pick list' },
  { table: 'stock_count_line', col: 'material_id', label: 'righe conteggio' },
  { table: 'stock_serial_unit', col: 'material_id', label: 'unità seriali' },
  { table: 'stock_lot', col: 'material_id', label: 'lotti' },
  { table: 'stock_balance', col: 'material_id', label: 'giacenze', extra: 'qty_on_hand <> 0' },
];

export const COMPANY_REFS: readonly UsageRef[] = [
  { table: 'engagement', col: 'company_id', label: 'commesse', extra: 'archived_at IS NULL' },
  { table: 'asset', col: 'company_id', label: 'asset', extra: 'archived_at IS NULL' },
  { table: 'site', col: 'company_id', label: 'siti', extra: 'archived_at IS NULL' },
  { table: 'stock_document', col: 'company_id', label: 'documenti di magazzino' },
  { table: 'material_supplier', col: 'supplier_id', label: 'articoli (come fornitore)' },
  { table: 'subcontract_line', col: 'company_id', label: 'subappalti' },
  { table: 'work_order', col: 'principal_company_id', label: 'ordini di lavoro', extra: 'archived_at IS NULL' },
];

export const RESOURCE_REFS: readonly UsageRef[] = [
  { table: 'activity_resource', col: 'resource_id', label: 'assegnazioni attività' },
  { table: 'time_entry', col: 'resource_id', label: 'ore registrate' },
  { table: 'absence_entry', col: 'resource_id', label: 'assenze' },
  { table: 'equipment_usage', col: 'resource_id', label: 'utilizzi attrezzatura' },
  { table: 'work_line', col: 'resource_id', label: 'lavorazioni' },
  { table: 'rate_card', col: 'resource_id', label: 'tariffe' },
  { table: 'time_tracking_session', col: 'resource_id', label: 'sessioni cronometro' },
];

export const SITE_REFS: readonly UsageRef[] = [
  { table: 'asset', col: 'site_id', label: 'asset', extra: 'archived_at IS NULL' },
  { table: 'work_order', col: 'site_id', label: 'ordini di lavoro', extra: 'archived_at IS NULL' },
  { table: 'site', col: 'parent_id', label: 'sotto-siti', extra: 'archived_at IS NULL' },
];

export const ASSET_REFS: readonly UsageRef[] = [
  { table: 'engagement', col: 'asset_id', label: 'commesse', extra: 'archived_at IS NULL' },
];
