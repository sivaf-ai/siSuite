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
  };
}

export async function tenantVertical(db: PoolClient, tenantId: string): Promise<string> {
  const r = await db.query(`SELECT vertical FROM tenant WHERE id = $1`, [tenantId]);
  return (r.rows[0]?.vertical as string) ?? 'software';
}

export async function loadFieldDefs(db: PoolClient, entity: string, vertical: string): Promise<FieldDefinitionDto[]> {
  const { rows } = await db.query(
    `SELECT id, entity, key, label, help, data_type, required, options, validation, unit, placeholder, group_key, sequence
     FROM field_definition
     WHERE active AND entity = $1 AND (vertical IS NULL OR vertical = $2)
     ORDER BY group_key NULLS FIRST, sequence`,
    [entity, vertical],
  );
  return rows.map(mapRow);
}

/** Valida `attributes` contro le field_definition dell'entità; lancia ZodError (→400). */
export async function validateAttributes(
  db: PoolClient,
  tenantId: string,
  entity: string,
  attributes: Record<string, unknown> | undefined,
): Promise<Record<string, unknown>> {
  if (!attributes || Object.keys(attributes).length === 0) return {};
  const vertical = await tenantVertical(db, tenantId);
  const defs = await loadFieldDefs(db, entity, vertical);
  const schema = buildAttributesSchema(defs);
  return schema.parse(attributes) as Record<string, unknown>;
}
