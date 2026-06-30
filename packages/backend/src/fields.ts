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
    active: (r.active as boolean) ?? true,
  };
}

/** Tutte le definizioni (anche inattive) per il Field Builder admin. */
export async function loadAllFieldDefs(db: PoolClient, entity: string, vertical: string): Promise<FieldDefinitionDto[]> {
  const { rows } = await db.query(
    `SELECT id, entity, key, label, help, data_type, required, options, validation, unit, placeholder, group_key, sequence,
            country, variant, active, tenant_id IS NULL AS is_system
     FROM field_definition
     WHERE entity = $1 AND (vertical IS NULL OR vertical = $2)
     ORDER BY group_key NULLS FIRST, sequence`,
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
  if (country) { params.push(country); countryClause = ` AND (country IS NULL OR country = $${params.length})`; }
  // variant NULL = universale (tutti i tipi); se passato, aggiunge i campi del tipo
  let variantClause = '';
  if (variant) { params.push(variant); variantClause = ` AND (variant IS NULL OR variant = $${params.length})`; }
  else variantClause = ` AND variant IS NULL`;
  const { rows } = await db.query(
    `SELECT id, entity, key, label, help, data_type, required, options, validation, unit, placeholder, group_key, sequence,
            country, variant, tenant_id IS NULL AS is_system
     FROM field_definition
     WHERE active AND entity = $1 AND (vertical IS NULL OR vertical = $2)${countryClause}${variantClause}
     ORDER BY group_key NULLS FIRST, sequence`,
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
): Promise<Record<string, unknown>> {
  if (!attributes || Object.keys(attributes).length === 0) return {};
  const vertical = await tenantVertical(db, tenantId);
  const defs = (await loadFieldDefs(db, entity, vertical)).filter((d) => !d.country);
  const schema = buildAttributesSchema(defs);
  return schema.parse(attributes) as Record<string, unknown>;
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
