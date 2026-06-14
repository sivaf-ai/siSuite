/**
 * entities.ts — schemi zod (validazione input) + DTO delle entità core Fase 1.
 * Identificatori in inglese; UI in italiano (i18n). UUID mai mostrati in UI:
 * si usano i `code`/etichette.
 */
import { z } from 'zod';

const uuid = z.string().uuid();
const ts = z.string().min(1); // timestamptz ISO; Postgres lo interpreta
const day = z.string().date();
const attrs = z.record(z.unknown());

/* ── Lookup (stati/etichette/priorità) ─────────────────────────────── */
export interface LookupDto {
  id: string;
  category: string;
  canonical: string;
  code: string;
  label: Record<string, string>;
  abbreviation: string | null;
  colorToken: string | null;
  sequence: number;
  isDefault: boolean;
  /** true = riga di sistema (tenant_id NULL): in sola lettura per il tenant. */
  isSystem?: boolean;
}

/* ── Company ───────────────────────────────────────────────────────── */
export const companyRoleEnum = z.enum(['customer', 'supplier', 'partner']);
export const createCompanySchema = z.object({
  displayName: z.string().min(1).max(200),
  type: z.enum(['private', 'organization']).default('organization'),
  address: z.string().max(400).optional(),
  attributes: attrs.optional(),
  roles: z.array(z.object({
    role: companyRoleEnum,
    customerNature: z.enum(['episodic', 'recurring']).optional(),
  })).optional(),
});
export const updateCompanySchema = createCompanySchema.partial();
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export interface CompanyDto {
  id: string;
  displayName: string;
  type: 'private' | 'organization';
  address: string | null;
  attributes: Record<string, unknown>;
  roles: string[];
  createdAt: string;
}

/* ── Company contact ───────────────────────────────────────────────── */
export const createContactSchema = z.object({
  companyId: uuid,
  fullName: z.string().min(1).max(200),
  roleTitle: z.string().max(120).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(60).optional(),
  isPrimary: z.boolean().optional(),
});
export const updateContactSchema = createContactSchema.omit({ companyId: true }).partial();
export interface ContactDto {
  id: string; companyId: string; fullName: string; roleTitle: string | null;
  email: string | null; phone: string | null; isPrimary: boolean;
}

/* ── Asset ─────────────────────────────────────────────────────────── */
export const createAssetSchema = z.object({
  companyId: uuid,
  kind: z.string().min(1).max(60),
  label: z.string().min(1).max(200),
  installedOn: day.optional(),
  attributes: attrs.optional(),
});
export const updateAssetSchema = createAssetSchema.partial();
export interface AssetDto {
  id: string; companyId: string; companyName: string | null; kind: string;
  label: string; installedOn: string | null; attributes: Record<string, unknown>; createdAt: string;
}

/* ── Resource ──────────────────────────────────────────────────────── */
export const resourceKindEnum = z.enum(['person', 'vehicle', 'equipment']);
export const createResourceSchema = z.object({
  kind: resourceKindEnum,
  label: z.string().min(1).max(200),
  userId: uuid.optional(),
  attributes: attrs.optional(),
  active: z.boolean().optional(),
});
export const updateResourceSchema = createResourceSchema.partial();
export interface ResourceDto {
  id: string; kind: 'person' | 'vehicle' | 'equipment'; label: string;
  userId: string | null; active: boolean; attributes: Record<string, unknown>;
  /** orario per-risorsa (override dell'azienda); null = usa l'orario del tenant. */
  workingHours?: Record<string, [string, string][]> | null;
  /** nome dell'utente collegato (solo nel dettaglio). */
  userName?: string | null;
}

/* ── Engagement template (modelli di commessa: instanziazione blueprint) ── */
export const saveTemplateSchema = z.object({ name: z.string().min(1).max(120) });
export const instantiateTemplateSchema = z.object({
  templateId: uuid,
  companyId: uuid,
  title: z.string().min(1).max(200).optional(),
  assetId: uuid.optional(),
  startedOn: z.string().optional(),
});
export interface EngagementTemplateDto {
  id: string; name: string; type: 'build' | 'maintenance';
  phaseCount: number; activityCount: number; createdAt: string;
}

/* ── Resource availability (indisponibilità per-risorsa: ferie, permessi…) ── */
export const createAvailabilitySchema = z.object({
  startsAt: z.string().min(1),  // ISO datetime
  endsAt: z.string().min(1),
  reason: z.string().max(200).nullable().optional(),
  kind: z.enum(['unavailable', 'available']).default('unavailable'),
});
export type CreateAvailabilityInput = z.infer<typeof createAvailabilitySchema>;
export interface ResourceAvailabilityDto {
  id: string; resourceId: string; kind: string; startsAt: string; endsAt: string; reason: string | null;
}

/* ── Material ──────────────────────────────────────────────────────── */
export const createMaterialSchema = z.object({
  name: z.string().min(1).max(200),
  unit: z.string().min(1).max(40),
  attributes: attrs.optional(),
});
export const updateMaterialSchema = createMaterialSchema.partial();
export interface MaterialDto {
  id: string; name: string; unit: string; attributes: Record<string, unknown>;
}

/* ── Phase ─────────────────────────────────────────────────────────── */
export const createPhaseSchema = z.object({
  engagementId: uuid,
  name: z.string().min(1).max(200),
  seq: z.number().int().min(0).default(0),
  parentPhaseId: uuid.optional(),
  plannedStart: day.optional(),
  plannedEnd: day.optional(),
  statusId: uuid.optional(),
});
export const updatePhaseSchema = createPhaseSchema.omit({ engagementId: true }).partial();
export interface PhaseDto {
  id: string; engagementId: string; name: string; seq: number;
  parentPhaseId: string | null; plannedStart: string | null; plannedEnd: string | null;
  statusId: string; statusCanonical: string | null;
}

/* ── Activity ──────────────────────────────────────────────────────── */
export const checklistSchema = z.array(z.object({
  text: z.string().min(1),
  done: z.boolean().default(false),
}));
export const createActivitySchema = z.object({
  engagementId: uuid,
  phaseId: uuid.optional(),
  assetId: uuid.optional(),
  title: z.string().min(1).max(300),
  kind: z.string().max(60).optional(),
  statusId: uuid.optional(),
  priorityId: uuid.optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  scheduledStart: ts.optional(), // valorizzato = attività FISSA (ancora)
  earliestStart: ts.optional(),
  dueBy: ts.optional(),
  checklist: checklistSchema.optional(),
});
export const updateActivitySchema = createActivitySchema.omit({ engagementId: true }).partial();
export type CreateActivityInput = z.infer<typeof createActivitySchema>;

export interface ActivityDto {
  id: string; engagementId: string; phaseId: string | null; assetId: string | null;
  title: string; kind: string | null;
  statusId: string; statusCanonical: string | null;
  priorityId: string | null; priorityCanonical: string | null;
  estimatedMinutes: number | null;
  scheduledStart: string | null; scheduledEnd: string | null;
  earliestStart: string | null; dueBy: string | null;
  isFixed: boolean; // scheduled_start valorizzato
  checklist: { text: string; done: boolean }[];
  createdAt: string;
}

export const updateChecklistSchema = z.object({ checklist: checklistSchema });

/* ── Dipendenza tra attività (grafo DAG) ───────────────────────────── */
export const createDependencySchema = z.object({
  predecessorId: uuid,                 // l'attività che blocca ("dopo X")
  successorId: uuid,                   // l'attività bloccata
  type: z.enum(['FS', 'SS', 'FF', 'SF']).default('FS'),
  lagMinutes: z.number().int().default(0),
});
export type CreateDependencyInput = z.infer<typeof createDependencySchema>;
export interface DependencyEdgeDto {
  id: string;
  predecessorId: string;
  successorId: string;
  predecessorTitle: string | null;
  successorTitle: string | null;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lagMinutes: number;
}

export const assignResourceSchema = z.object({
  resourceId: uuid,
  plannedFrom: ts.optional(),
  plannedTo: ts.optional(),
});
export interface ActivityResourceDto {
  id: string; activityId: string; resourceId: string; resourceLabel: string | null;
  plannedFrom: string | null; plannedTo: string | null;
}

/* ── Time entry (rendicontazione ore via form) ─────────────────────── */
export const createTimeEntrySchema = z.object({
  engagementId: uuid.optional(),
  activityId: uuid.optional(),
  resourceId: uuid.optional(),
  typology: z.string().min(1).max(60),
  minutes: z.number().int().positive(),
  occurredOn: day,
  notes: z.string().max(1000).optional(),
});
export interface TimeEntryDto {
  id: string; engagementId: string | null; activityId: string | null; resourceId: string | null;
  typology: string; minutes: number; occurredOn: string; notes: string | null; createdAt: string;
}

/* ── Material consumption (rendicontazione materiali via form) ─────── */
export const createConsumptionSchema = z.object({
  activityId: uuid.optional(),
  materialId: uuid,
  quantity: z.number().positive(),
  unit: z.string().min(1).max(40),
  occurredOn: day,
});
export interface ConsumptionDto {
  id: string; activityId: string | null; materialId: string; materialName: string | null;
  quantity: number; unit: string; occurredOn: string; createdAt: string;
}
