/**
 * fields.ts (backend) — accesso a field_definition: carica le definizioni per
 * (entità, verticale del tenant) e VALIDA gli `attributes` generando lo zod
 * dalle stesse righe che il frontend usa per disegnare il form. Unica fonte.
 */
import type { PoolClient } from './db/pool.js';
import { buildAttributesSchema, type FieldDefinitionDto, type FieldDataType } from '@sisuite/shared';

function mapRow(r: Record<string, unknown>): FieldDefinitionDto {
  return {
    id: r.id as string,
    entity: r.entity as string,
    key: r.key as string,
    label: (r.label as Record<string, string>) ?? {},
    help: (r.help as Record<string, string>) ?? null,
    dataType: r.data_type as FieldDataType,
    required: (r.required as boolean) ?? false,
    options: (r.options as FieldDefinitionDto['options']) ?? null,
    validation: (r.validation as FieldDefinitionDto['validation']) ?? null,
    unit: (r.unit as string) ?? null,
    placeholder: (r.placeholder as Record<string, string>) ?? null,
    groupKey: (r.group_key as string) ?? null,
    sequence: (r.sequence as number) ?? 0,
    country: (r.country as string) ?? null,
    variant: (r.variant as string) ?? null,
    isSystem: (r.is_system as boolean) ?? false,
    isCustomized: (r.is_customized as boolean) ?? false,
    active: (r.active as boolean) ?? true,
  };
}

// overlay dell'override per-tenant (COALESCE) su una riga di field_definition (alias fd)
const OVERLAY = `
  COALESCE(fo.label, fd.label) AS label, COALESCE(fo.help, fd.help) AS help,
  COALESCE(fo.required, fd.required) AS required, COALESCE(fo.unit, fd.unit) AS unit,
  COALESCE(fo.placeholder, fd.placeholder) AS placeholder, COALESCE(fo.sequence, fd.sequence) AS sequence,
  COALESCE(fo.active, fd.active) AS active, (fo.tenant_id IS NOT NULL) AS is_customized,
  fd.id, fd.entity, fd.key, fd.data_type, fd.options, fd.validation, fd.group_key, fd.country, fd.variant,
  fd.tenant_id IS NULL AS is_system`;
const OVERLAY_JOIN = `field_definition fd
  LEFT JOIN field_definition_override fo ON fo.field_definition_id = fd.id AND fo.tenant_id = app_current_tenant()`;

/** Tutte le definizioni (anche inattive) per il Field Builder admin. */
export async function loadAllFieldDefs(db: PoolClient, entity: string, vertical: string): Promise<FieldDefinitionDto[]> {
  const { rows } = await db.query(
    `SELECT ${OVERLAY} FROM ${OVERLAY_JOIN}
     WHERE fd.entity = $1 AND (fd.vertical IS NULL OR fd.vertical = $2)
     ORDER BY fd.group_key NULLS FIRST, COALESCE(fo.sequence, fd.sequence)`,
    [entity, vertical],
  );
  return rows.map(mapRow);
}

export async function tenantVertical(db: PoolClient, tenantId: string): Promise<string> {
  const r = await db.query(`SELECT vertical FROM tenant WHERE id = $1`, [tenantId]);
  return (r.rows[0]?.vertical as string) ?? 'software';
}

/** Definizioni attive per (entità, verticale). Se `country` è passato, restituisce
 *  universali (country IS NULL) + quelle del paese; altrimenti TUTTE (FE le filtra). */
export async function loadFieldDefs(db: PoolClient, entity: string, vertical: string, country?: string, variant?: string): Promise<FieldDefinitionDto[]> {
  const params: unknown[] = [entity, vertical];
  let countryClause = '';
  if (country) { params.push(country); countryClause = ` AND (fd.country IS NULL OR fd.country = $${params.length})`; }
  // variant NULL = universale (tutti i tipi); se passato, aggiunge i campi del tipo
  let variantClause = '';
  if (variant) { params.push(variant); variantClause = ` AND (fd.variant IS NULL OR fd.variant = $${params.length})`; }
  else variantClause = ` AND fd.variant IS NULL`;
  // active EFFETTIVO = override del tenant se presente, altrimenti quello di sistema
  const { rows } = await db.query(
    `SELECT ${OVERLAY} FROM ${OVERLAY_JOIN}
     WHERE COALESCE(fo.active, fd.active) AND fd.entity = $1 AND (fd.vertical IS NULL OR fd.vertical = $2)${countryClause}${variantClause}
     ORDER BY fd.group_key NULLS FIRST, COALESCE(fo.sequence, fd.sequence)`,
    params,
  );
  return rows.map(mapRow);
}

/** Valida `attributes` (coda lunga universale/verticale): esclude i campi
 *  country-scoped, che vivono altrove (fiscal_attributes / indirizzo). */
export async function validateAttributes(
  db: PoolClient,
  tenantId: string,
  entity: string,
  attributes: Record<string, unknown> | undefined,
  variant?: string,                  // Tipo del record (es. work_order_type code, asset.kind)
): Promise<Record<string, unknown>> {
  // anche con attributes vuoti dobbiamo validare gli OBBLIGATORI (universali + del Tipo)
  const vertical = await tenantVertical(db, tenantId);
  const defs = (await loadFieldDefs(db, entity, vertical, undefined, variant)).filter((d) => !d.country);
  if (defs.length === 0) return attributes ?? {};
  const schema = buildAttributesSchema(defs);
  return schema.parse(attributes ?? {}) as Record<string, unknown>;
}

/** Valida i campi FISCALI country-scoped (entity='company', country dato) →
 *  finiscono in company.fiscal_attributes. */
export async function validateFiscalAttributes(
  db: PoolClient,
  tenantId: string,
  entity: string,
  country: string,
  fiscalAttributes: Record<string, unknown> | undefined,
): Promise<Record<string, unknown>> {
  if (!fiscalAttributes || Object.keys(fiscalAttributes).length === 0) return {};
  const vertical = await tenantVertical(db, tenantId);
  const defs = (await loadFieldDefs(db, entity, vertical, country)).filter((d) => d.country === country);
  const schema = buildAttributesSchema(defs);
  return schema.parse(fiscalAttributes) as Record<string, unknown>;
}
