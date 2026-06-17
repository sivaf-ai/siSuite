/**
 * fields.ts — field_definition: il catalogo che trasforma `attributes jsonb`
 * in campi veri. UNICA FONTE FE+BE:
 *   - il backend genera lo zod di validazione (buildAttributesSchema)
 *   - il frontend genera il form (EntityForm) da queste stesse righe
 */
import { z } from 'zod';

export type FieldDataType =
  | 'text' | 'textarea' | 'number' | 'integer' | 'money' | 'date'
  | 'boolean' | 'email' | 'phone' | 'url' | 'select' | 'multiselect';

export interface FieldOption { value: string; label: Record<string, string> }

export interface FieldDefinitionDto {
  id: string;
  entity: string;
  key: string;
  label: Record<string, string>;
  help: Record<string, string> | null;
  dataType: FieldDataType;
  required: boolean;
  options: FieldOption[] | null;
  validation: { pattern?: string; min?: number; max?: number; maxLength?: number } | null;
  unit: string | null;
  placeholder: Record<string, string> | null;
  groupKey: string | null;
  sequence: number;
  /** true = riga di SISTEMA (tenant_id NULL): sola lettura per il tenant. */
  isSystem?: boolean;
  /** attivo nei form (il Field Builder può disattivare i campi del tenant). */
  active?: boolean;
}

/* ── Campi personalizzati: schemi create/update (admin tenant) ──────────── */
export const FIELD_DATA_TYPES: FieldDataType[] = [
  'text', 'textarea', 'number', 'integer', 'money', 'date', 'boolean', 'email', 'phone', 'url', 'select', 'multiselect',
];
const fieldDataTypeEnum = z.enum(FIELD_DATA_TYPES as [FieldDataType, ...FieldDataType[]]);
const i18nLabel = z.record(z.string());
const fieldOption = z.object({ value: z.string().min(1).max(60), label: i18nLabel });
export const createFieldDefinitionSchema = z.object({
  entity: z.string().min(1).max(60),
  key: z.string().min(1).max(60).regex(/^[a-z][a-z0-9_]*$/, 'minuscolo, lettere/numeri/underscore, inizia con lettera'),
  label: i18nLabel,
  dataType: fieldDataTypeEnum,
  required: z.boolean().optional(),
  options: z.array(fieldOption).nullable().optional(),
  unit: z.string().max(20).nullable().optional(),
  help: i18nLabel.nullable().optional(),
  placeholder: i18nLabel.nullable().optional(),
  groupKey: z.string().max(40).nullable().optional(),
  sequence: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});
// in modifica non si cambiano entity/key (chiave logica del campo)
export const updateFieldDefinitionSchema = createFieldDefinitionSchema.omit({ entity: true, key: true }).partial();
export type CreateFieldDefinitionInput = z.infer<typeof createFieldDefinitionSchema>;

/** Etichetta nella lingua dell'utente, con fallback it-IT → en → key. */
export function fieldLabel(l: Record<string, string> | null | undefined, locale = 'it-IT', fallback = ''): string {
  if (!l) return fallback;
  return l[locale] ?? l['it-IT'] ?? l.en ?? fallback;
}

/** zod per un singolo campo, secondo data_type + validation. Sempre opzionale a
 *  meno che required: gli attributi sono sparsi. */
function fieldSchema(def: FieldDefinitionDto): z.ZodTypeAny {
  const v = def.validation ?? {};
  let base: z.ZodTypeAny;
  switch (def.dataType) {
    case 'number':
    case 'money':
      base = z.coerce.number();
      if (typeof v.min === 'number') base = (base as z.ZodNumber).min(v.min);
      if (typeof v.max === 'number') base = (base as z.ZodNumber).max(v.max);
      break;
    case 'integer':
      base = z.coerce.number().int();
      if (typeof v.min === 'number') base = (base as z.ZodNumber).min(v.min);
      if (typeof v.max === 'number') base = (base as z.ZodNumber).max(v.max);
      break;
    case 'boolean':
      base = z.boolean();
      break;
    case 'email':
      base = z.string().email();
      break;
    case 'url':
      base = z.string().url();
      break;
    case 'multiselect': {
      const vals = (def.options ?? []).map((o) => o.value);
      base = z.array(vals.length ? z.enum(vals as [string, ...string[]]) : z.string());
      break;
    }
    case 'select': {
      const vals = (def.options ?? []).map((o) => o.value);
      base = vals.length ? z.enum(vals as [string, ...string[]]) : z.string();
      break;
    }
    default: {
      // text/textarea/phone/date
      let s = z.string();
      if (typeof v.maxLength === 'number') s = s.max(v.maxLength);
      if (v.pattern) s = s.regex(new RegExp(v.pattern));
      base = s;
    }
  }
  return def.required ? base : base.optional();
}

/** Schema zod dell'oggetto `attributes` per un'entità, dalle sue field_definition.
 *  passthrough: non scarta chiavi sconosciute (compat con attributi legacy). */
export function buildAttributesSchema(defs: FieldDefinitionDto[]): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const d of defs) shape[d.key] = fieldSchema(d);
  return z.object(shape).passthrough();
}

/** Raggruppa per group_key e ordina per sequence (per il rendering del form). */
export function groupFields(defs: FieldDefinitionDto[]): { group: string; fields: FieldDefinitionDto[] }[] {
  const byGroup = new Map<string, FieldDefinitionDto[]>();
  for (const d of [...defs].sort((a, b) => a.sequence - b.sequence)) {
    const g = d.groupKey ?? 'general';
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(d);
  }
  return [...byGroup.entries()].map(([group, fields]) => ({ group, fields }));
}

/** Etichette IT dei gruppi noti (estendibile). */
export const GROUP_LABEL_IT: Record<string, string> = {
  fiscal: 'Dati fiscali',
  registry: 'Anagrafica',
  technical: 'Dati tecnici',
  contract: 'Contratto',
  economics: 'Economia',
  skills: 'Competenze',
  vehicle: 'Veicolo',
  catalog: 'Catalogo',
  general: 'Generale',
  notes: 'Note',
};
