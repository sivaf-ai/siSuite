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
  scheduleModeId: uuid.optional(), // §6: lookup schedule_mode (floating/fixed)
  pinnedDay: day.optional(),       // §6: trascina-e-inchioda al giorno
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
  scheduleModeId: string | null; pinnedDay: string | null; // §6
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
  typologyId: uuid.optional(),         // §4.1 natura via lookup_value (time_typology)
  minutes: z.number().int().positive(),
  occurredOn: day,
  notes: z.string().max(1000).optional(),
  billable: z.boolean().optional(),    // §4.2 default true lato DB
});
export interface TimeEntryDto {
  id: string; engagementId: string | null; activityId: string | null; resourceId: string | null;
  typology: string; typologyId: string | null; minutes: number; occurredOn: string; notes: string | null;
  // §4.2 tariffe fotografate
  costRate: number | null; billRate: number | null; currency: string | null; billable: boolean;
  // §4.3 approvazione + blocco
  approvalStatusId: string | null; isLocked: boolean; lockReason: string | null;
  createdAt: string;
}

/* ── Time entry: workflow approvazione/blocco (§4.3, azioni in blocco) ── */
export const timeEntryIdsSchema = z.object({ ids: z.array(uuid).min(1).max(500) });
export const rejectTimeEntriesSchema = z.object({ ids: z.array(uuid).min(1).max(500), reason: z.string().max(500).optional() });
export const lockTimeEntriesSchema = z.object({
  ids: z.array(uuid).min(1).max(500),
  reason: z.enum(['PAYROLL', 'INVOICED', 'PERIOD_CLOSE', 'MANUAL']).default('MANUAL'),
});

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

/* ── Budget / margine (§7) ─────────────────────────────────────────── */
export interface EngagementBudgetDto {
  engagementId: string; currency: string | null; billingMode: string | null;
  previsto: number | null; previstoSource: 'budget' | 'stima' | 'none';
  costoFatto: number; ricavoFatto: number; margine: number; rimane: number | null; allarme: boolean;
  laborCost: number; laborRevenue: number; materialCost: number; materialRevenue: number;
  phases: { phaseId: string | null; name: string | null; costoFatto: number; ricavoFatto: number }[];
}

/* ── Rapportino AI (§5) ────────────────────────────────────────────── */
export const createWorkReportSchema = z.object({
  engagementId: uuid,
  activityId: uuid.optional(),
  periodStart: day.optional(),
  periodEnd: day.optional(),
  audience: z.enum(['customer', 'internal']).default('customer'),
  rawText: z.string().max(5000).optional(),
  timeEntryIds: z.array(uuid).max(1000).optional(),
});
export const updateWorkReportSchema = z.object({
  finalText: z.string().max(20000).optional(),
  confirm: z.boolean().optional(),   // true = porta a 'confirmed'
});
export const signWorkReportSchema = z.object({
  signerName: z.string().min(1).max(160),
  signatureUrl: z.string().max(500).optional(),
});
export interface WorkReportDto {
  id: string; engagementId: string; activityId: string | null; periodStart: string | null; periodEnd: string | null;
  audience: string; statusId: string | null; rawText: string | null; aiText: string | null; finalText: string | null;
  signerName: string | null; signatureUrl: string | null; signedAt: string | null; generatedByAi: boolean; createdAt: string;
}

/* ── Assenze (§4.4) ────────────────────────────────────────────────── */
export const createAbsenceSchema = z.object({
  resourceId: uuid,
  typeId: uuid,                       // lookup_value category 'absence_type'
  startsOn: day,
  endsOn: day,
  hours: z.number().positive().optional(),   // assenze a ore; assente = giornate intere
  halfDay: z.boolean().optional(),
  note: z.string().max(1000).optional(),
  attachmentUrl: z.string().max(500).optional(),
});
export interface AbsenceDto {
  id: string; resourceId: string; typeId: string; startsOn: string; endsOn: string;
  hours: number | null; halfDay: boolean; note: string | null; attachmentUrl: string | null;
  approvalStatusId: string | null; createdAt: string;
}
export const upsertAbsenceBalanceSchema = z.object({
  resourceId: uuid, typeId: uuid, year: z.number().int().min(2000).max(2100),
  accrued: z.number(),
});
export interface AbsenceBalanceDto {
  resourceId: string; typeId: string; year: number; accrued: number; used: number; residual: number;
}

/* ── Cronometro (§4.5) ─────────────────────────────────────────────── */
export const startTimerSchema = z.object({
  resourceId: uuid.optional(), activityId: uuid.optional(), engagementId: uuid.optional(),
});
export const commitTimerSchema = z.object({
  typology: z.string().min(1).max(60).default('ordinary'),
  typologyId: uuid.optional(),
  notes: z.string().max(1000).optional(),
});
export interface TimerSessionDto {
  id: string; resourceId: string; activityId: string | null; engagementId: string | null;
  startedAt: string; stoppedAt: string | null; committedTimeEntryId: string | null;
}

/* ── Magazzino minimo 6A (§8) ──────────────────────────────────────── */
export const createStockLocationSchema = z.object({
  name: z.string().min(1).max(120),
  parentId: uuid.optional(),
  kind: z.enum(['warehouse', 'sub_location', 'van']).default('warehouse'),
  resourceId: uuid.optional(),
  holdsStock: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});
export const updateStockLocationSchema = createStockLocationSchema.partial().extend({ active: z.boolean().optional() });
export interface StockLocationDto {
  id: string; parentId: string | null; name: string; kind: string; resourceId: string | null;
  holdsStock: boolean; isDefault: boolean; active: boolean;
}

// movimento singolo (scarico da lavoro, rettifica rapida). quantity = magnitudine
// positiva per in/out; per 'adjust' è il delta con segno. Il backend applica il segno.
export const createStockMovementSchema = z.object({
  typeCode: z.enum(['in', 'out', 'adjust']),
  materialId: uuid,
  locationId: uuid,
  quantity: z.number().refine((n) => n !== 0, 'quantità non può essere 0'),
  unit: z.string().min(1).max(40),
  unitCost: z.number().optional(),
  unitPrice: z.number().optional(),
  currency: z.string().max(8).optional(),
  engagementId: uuid.optional(),
  activityId: uuid.optional(),
  occurredOn: day.optional(),
  note: z.string().max(500).optional(),
});
export interface StockMovementDto {
  id: string; materialId: string; materialName: string | null; locationId: string; locationName: string | null;
  typeId: string; quantity: number; unit: string; unitCost: number | null; unitPrice: number | null;
  currency: string | null; occurredOn: string; engagementId: string | null; activityId: string | null;
  note: string | null; createdAt: string;
}
export interface StockBalanceDto {
  materialId: string; materialName: string | null; locationId: string; locationName: string | null;
  qtyOnHand: number; avgCost: number | null; valueOnHand: number; unit: string | null;
}

export const stockDocumentLineSchema = z.object({
  materialId: uuid,
  quantity: z.number().positive(),
  unit: z.string().min(1).max(40),
  unitCost: z.number().optional(),
  unitPrice: z.number().optional(),
  currency: z.string().max(8).optional(),
  note: z.string().max(500).optional(),
});
export const createStockDocumentSchema = z.object({
  typeCode: z.enum(['receipt', 'transfer', 'adjustment']),
  docDate: day.optional(),
  sourceLocationId: uuid.optional(),
  destLocationId: uuid.optional(),
  companyId: uuid.optional(),
  externalRef: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
  lines: z.array(stockDocumentLineSchema).min(1).max(500),
});
export interface StockDocumentDto {
  id: string; typeId: string; number: string | null; docDate: string; status: string;
  sourceLocationId: string | null; destLocationId: string | null; companyId: string | null;
  externalRef: string | null; note: string | null; createdAt: string;
}
