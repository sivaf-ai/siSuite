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
  /** true = riga di sistema (tenant_id NULL). Personalizzabile via override (non eliminabile). */
  isSystem?: boolean;
  /** true = la voce di sistema ha un override del tenant attivo (nome/sigla/colore/ordine). */
  isCustomized?: boolean;
}

/* ── Company ───────────────────────────────────────────────────────── */
// modello Party (ADR-0005): un soggetto può avere più ruoli, incluso 'operator' (Gestore FTTH)
export const companyRoleEnum = z.enum(['customer', 'supplier', 'partner', 'operator']);
// indirizzo strutturato jsonb country-driven (forma canonica con chiave country interna)
const addressJson = z.record(z.string(), z.unknown());
export const createCompanySchema = z.object({
  displayName: z.string().min(1).max(200),
  type: z.enum(['private', 'organization']).default('organization'),
  country: z.string().length(2).optional(),       // ISO 3166-1 alpha-2: pilota set fiscale + form indirizzo
  taxId: z.string().max(40).optional(),           // P.IVA (IT) / CUIT (AR) / VAT (EU)
  taxIdKind: z.string().max(20).optional(),       // vat|cuit|cuil|dni|nif
  email: z.string().email().optional(),
  phone: z.string().max(60).optional(),
  website: z.string().max(200).optional(),
  iban: z.string().max(40).optional(),
  paymentTerms: z.string().max(40).optional(),
  defaultPriceListId: uuid.nullable().optional(),
  legalAddress: addressJson.optional(),
  operationalAddress: addressJson.optional(),
  fiscalAttributes: attrs.optional(),             // campi fiscali country-driven (validati su field_definition country)
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
  code: string | null;
  displayName: string;
  type: 'private' | 'organization';
  country: string;
  taxId: string | null;
  taxIdKind: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  iban: string | null;
  paymentTerms: string | null;
  defaultPriceListId: string | null;
  legalAddress: Record<string, unknown>;
  operationalAddress: Record<string, unknown>;
  fiscalAttributes: Record<string, unknown>;
  attributes: Record<string, unknown>;
  roles: string[];
  createdAt: string;
}

/* ── Deduplica Soggetti (merge company) ────────────────────────────────
 * Proposta DETERMINISTICA (normalizzazione nome, nessuna AI) + fusione
 * transazionale che ri-punta le FK e ARCHIVIA (mai cancella) gli assorbiti. */
export interface DedupCandidateDto {
  id: string;
  displayName: string;
  createdAt: string;
  /** quanti record collegati (ruoli + relazioni) → euristica per scegliere il superstite */
  relations: number;
}
export interface DedupGroupDto {
  /** chiave normalizzata condivisa dal gruppo (lowercase, no punteggiatura, no suffissi societari) */
  normalizedKey: string;
  /** superstite suggerito (deterministico): più relazioni, a parità il più vecchio */
  suggestedSurvivorId: string;
  /** membri assorbibili (tutti tranne il superstite suggerito) */
  absorbedIds: string[];
  /** tutti i membri del gruppo (incluso il superstite) */
  members: DedupCandidateDto[];
  /** motivazione testuale della proposta (no PII oltre al nome già visibile in lista) */
  reason: string;
}
export const mergeCompaniesSchema = z.object({
  survivorId: uuid,
  absorbedIds: z.array(uuid).min(1).max(100),
});
export type MergeCompaniesInput = z.infer<typeof mergeCompaniesSchema>;
export interface MergeResultDto {
  survivorId: string;
  /** quanti soggetti sono stati archiviati (assorbiti effettivamente fusi in questa esecuzione) */
  absorbed: number;
  /** righe ri-puntate per tabella (le colonne FK verso company) */
  repointed: Record<string, number>;
}

/* ── Company contact ───────────────────────────────────────────────── */
export const createContactSchema = z.object({
  companyId: uuid,
  fullName: z.string().min(1).max(200),
  roleTitle: z.string().max(120).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(60).optional(),
  mobile: z.string().max(60).nullable().optional(),
  department: z.string().max(120).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  isPrimary: z.boolean().optional(),
});
export const updateContactSchema = createContactSchema.omit({ companyId: true }).partial();
export interface ContactDto {
  id: string; companyId: string; fullName: string; roleTitle: string | null;
  email: string | null; phone: string | null; mobile: string | null;
  department: string | null; note: string | null; isPrimary: boolean;
}

/* ── Asset ─────────────────────────────────────────────────────────── */
const assetFields = z.object({
  companyId: uuid.nullable().optional(),                 // E.2: non più obbligatorio (àncora a luogo/intestatario)
  workOrderSubjectId: uuid.nullable().optional(),        // end-user FTTH (PII isolata)
  kind: z.string().min(1).max(60),
  label: z.string().min(1).max(200),
  siteId: uuid.nullable().optional(),
  parentAssetId: uuid.nullable().optional(),
  model: z.string().max(120).nullable().optional(),
  manufacturer: z.string().max(120).nullable().optional(),
  warrantyUntil: day.nullable().optional(),
  status: z.string().max(40).nullable().optional(),
  installedOn: day.optional(),
  attributes: attrs.optional(),
});
export const createAssetSchema = assetFields.refine((a) => a.companyId || a.siteId || a.workOrderSubjectId, {
  message: 'asset: serve almeno un àncora (companyId, siteId o workOrderSubjectId)',
});
export const updateAssetSchema = assetFields.partial();
export interface AssetDto {
  id: string; companyId: string | null; companyName: string | null; kind: string;
  label: string; siteId: string | null; siteName: string | null;
  workOrderSubjectId: string | null; parentAssetId: string | null;
  model: string | null; manufacturer: string | null; warrantyUntil: string | null; status: string | null;
  installedOn: string | null; attributes: Record<string, unknown>; createdAt: string;
}

/* ── Resource ──────────────────────────────────────────────────────── */
export const resourceKindEnum = z.enum(['person', 'vehicle', 'equipment']);
export const createResourceSchema = z.object({
  kind: resourceKindEnum,
  label: z.string().min(1).max(200),
  userId: uuid.optional(),
  code: z.string().max(40).nullable().optional(),
  color: z.string().max(40).nullable().optional(),
  avatarUrl: z.string().max(500).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(60).nullable().optional(),
  attributes: attrs.optional(),
  active: z.boolean().optional(),
});
export const updateResourceSchema = createResourceSchema.partial();
export interface ResourceDto {
  id: string; kind: 'person' | 'vehicle' | 'equipment'; label: string;
  userId: string | null; active: boolean; attributes: Record<string, unknown>;
  code: string | null; color: string | null; avatarUrl: string | null; email: string | null; phone: string | null;
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

/* ── Material (Articoli & seriali, brief Blocco C) ──────────────────── */
const num = z.coerce.number().nullable().optional();
export const createMaterialSchema = z.object({
  name: z.string().min(1).max(200),
  unit: z.string().min(1).max(40),
  itemType: z.enum(['article', 'service', 'kit']).optional(),
  sku: z.string().max(60).nullable().optional(),
  barcode: z.string().max(60).nullable().optional(),
  categoryId: uuid.nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  brand: z.string().max(120).nullable().optional(),
  manufacturer: z.string().max(120).nullable().optional(),
  mpn: z.string().max(120).nullable().optional(),
  trackStock: z.boolean().optional(),
  trackedBySerial: z.boolean().optional(),
  trackedByLot: z.boolean().optional(),
  costingMethod: z.enum(['avg', 'fifo', 'standard']).optional(),
  defaultCost: num,
  defaultSalePrice: num,
  taxRateId: uuid.nullable().optional(),
  reorderPoint: num,
  safetyStock: num,
  minQty: num,
  maxQty: num,
  leadTimeDays: z.coerce.number().int().nullable().optional(),
  preferredVendorId: uuid.nullable().optional(),
  weight: num,
  weightUnit: z.string().max(10).nullable().optional(),
  dimensions: z.record(z.string(), z.unknown()).nullable().optional(),
  isReturnable: z.boolean().optional(),
  shelfLifeDays: z.coerce.number().int().nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  attributes: attrs.optional(),
});
export const updateMaterialSchema = createMaterialSchema.partial();
export interface MaterialDto {
  id: string; code: string | null; name: string; unit: string;
  itemType: string;
  sku: string | null; barcode: string | null;
  categoryId: string | null; categoryName: string | null;
  description: string | null; brand: string | null; manufacturer: string | null; mpn: string | null;
  trackStock: boolean; trackedBySerial: boolean; trackedByLot: boolean;
  costingMethod: string; defaultCost: number | null; defaultSalePrice: number | null;
  taxRateId: string | null;
  reorderPoint: number | null; safetyStock: number | null; minQty: number | null; maxQty: number | null;
  leadTimeDays: number | null; preferredVendorId: string | null;
  weight: number | null; weightUnit: string | null; dimensions: Record<string, unknown> | null;
  isReturnable: boolean; shelfLifeDays: number | null; primaryImageUrl: string | null; note: string | null;
  /** calcolati: giacenza totale e costo medio (da stock_balance). */
  qtyOnHand: number; avgCost: number | null;
  /** scorta sotto la minima (reorder_point). */
  lowStock: boolean;
  attributes: Record<string, unknown>;
}

/* ── Unità seriale (stock_serial_unit) — ciclo di vita + parco installato ── */
export const SERIAL_STATUSES = ['in_stock', 'assigned', 'installed', 'faulty', 'returned', 'retired'] as const;
export type SerialStatus = typeof SERIAL_STATUSES[number];

export const createSerialSchema = z.object({
  materialId: uuid,
  serial: z.string().min(1).max(120),
  locationId: uuid.nullable().optional(),
  note: z.string().max(300).nullable().optional(),
});
/** Transizione di stato: l'UNICA via ai cambi (audit, validazione transizioni). */
export const serialTransitionSchema = z.object({
  to: z.enum(SERIAL_STATUSES),
  locationId: uuid.nullable().optional(),
  holderResourceId: uuid.nullable().optional(),
  workOrderId: uuid.nullable().optional(),
  installedCompanyId: uuid.nullable().optional(),
  installedOn: day.nullable().optional(),
  note: z.string().max(300).nullable().optional(),
});
export const serialSecretSchema = z.object({ password: z.string().min(1).max(200) });

export interface SerialUnitDto {
  id: string; materialId: string; materialName: string | null;
  serial: string; status: SerialStatus;
  /** descrizione di "dove si trova / installato presso" (luogo o cliente+indirizzo). */
  whereLabel: string | null;
  workOrderCode: string | null;
  installedOn: string | null;
  updatedAt: string;
  hasSecret: boolean;
}

/* ── Listino voci di capitolato (brief Blocco D · mock 46) ──────────── */
export interface PriceListDto { id: string; code: string; name: string; currency: string; isDefault: boolean }

export const createPriceListItemSchema = z.object({
  priceListId: uuid,
  code: z.string().min(1).max(60),
  description: z.string().min(1).max(300),
  unit: z.string().min(1).max(40),
  category: z.string().max(80).nullable().optional(),
  costPrice: z.coerce.number().nonnegative().nullable().optional(),
  revenuePrice: z.coerce.number().nonnegative().nullable().optional(),
  active: z.boolean().optional(),
  attributes: attrs.optional(),
});
export const updatePriceListItemSchema = createPriceListItemSchema.omit({ priceListId: true }).partial();
export interface PriceListItemDto {
  id: string; priceListId: string; code: string; description: string; unit: string;
  category: string | null; costPrice: number | null; revenuePrice: number | null;
  marginPct: number | null; overrideCount: number; active: boolean;
  attributes: Record<string, unknown>;
}

export const createPriceOverrideSchema = z.object({
  baseItemId: uuid,
  scopeType: z.enum(['company', 'engagement']),
  companyId: uuid.nullable().optional(),
  engagementId: uuid.nullable().optional(),
  costPrice: z.coerce.number().nonnegative().nullable().optional(),
  revenuePrice: z.coerce.number().nonnegative().nullable().optional(),
  validFrom: day.nullable().optional(),
  validTo: day.nullable().optional(),
}).refine((o) => (o.scopeType === 'company' ? !!o.companyId : !!o.engagementId), { message: 'scope e id incoerenti' });
export interface PriceOverrideDto {
  id: string; baseItemId: string; scopeType: 'company' | 'engagement';
  companyId: string | null; companyName: string | null;
  engagementId: string | null; engagementTitle: string | null;
  costPrice: number | null; revenuePrice: number | null;
  validFrom: string | null; validTo: string | null;
}

/* ── Lavorazioni + libretto misure (brief Blocco E · mock 49) ───────── */
export const workLineMeasureSchema = z.object({
  label: z.string().max(200).nullable().optional(),
  formula: z.string().max(120).nullable().optional(),
  value: z.coerce.number(),
});
export const createWorkLineSchema = z.object({
  engagementId: uuid,
  phaseId: uuid.nullable().optional(),
  workOrderId: uuid.nullable().optional(),
  priceListItemId: uuid.nullable().optional(),
  description: z.string().max(300).nullable().optional(),
  unit: z.string().min(1).max(40),
  quantity: z.coerce.number().positive().optional(),     // se ci sono misure, la calcola il server
  occurredOn: day.optional(),
  resourceId: uuid.nullable().optional(),
  attributes: attrs.optional(),
  measures: z.array(workLineMeasureSchema).optional(),
});
export const updateWorkLineSchema = createWorkLineSchema.omit({ engagementId: true }).partial();
export interface WorkLineMeasureDto { id: string; label: string | null; formula: string | null; value: number; seq: number }
export interface WorkLineDto {
  id: string; engagementId: string;
  phaseId: string | null; phaseName: string | null; wbsCode: string | null;
  priceListItemId: string | null; itemCode: string | null; itemDescription: string | null;
  description: string | null; quantity: number; unit: string;
  costPrice: number | null; revenuePrice: number | null; revenue: number;
  occurredOn: string | null; origin: 'voce' | 'manuale'; fromCapture: boolean;
  measureCount: number; hasLibretto: boolean;
  attributes: Record<string, unknown>;
  measures?: WorkLineMeasureDto[];   // solo nel dettaglio
}

/* ── Site (Siti/Località, brief Blocco C-bis · ADR-0005) ────────────── */
export const SITE_KINDS = ['plant', 'building', 'floor', 'room', 'cabinet', 'pop', 'area', 'other'] as const;
export const createSiteSchema = z.object({
  companyId: uuid,
  parentId: uuid.nullable().optional(),
  name: z.string().min(1).max(200),
  kind: z.string().min(1).max(40).default('building'),
  address: z.record(z.string(), z.unknown()).nullable().optional(),  // jsonb country-driven (A.5)
  attributes: attrs.optional(),
});
export const updateSiteSchema = createSiteSchema.omit({ companyId: true }).partial();
export interface SiteDto {
  id: string; companyId: string | null; parentId: string | null;
  name: string; kind: string; address: Record<string, unknown>;
  attributes: Record<string, unknown>;
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
  /** contesto commessa (popolato nelle viste lista globali). */
  engagementCode?: string | null;
  engagementTitle?: string | null;
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
  code: z.string().max(40).nullable().optional(),         // sigla magazzino (K)
  note: z.string().max(2000).nullable().optional(),
  managerUserId: uuid.nullable().optional(),
  holdsStock: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});
export const updateStockLocationSchema = createStockLocationSchema.partial().extend({ active: z.boolean().optional() });
export interface StockLocationDto {
  id: string; parentId: string | null; name: string; kind: string; resourceId: string | null;
  code: string | null; note: string | null; managerUserId: string | null;
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
  workOrderId?: string | null; documentRef?: string | null;
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
/** Modifica bozza DDT (testata + sostituzione righe). Solo status='draft'. */
export const updateStockDocumentSchema = z.object({
  docDate: day.optional(),
  sourceLocationId: uuid.nullable().optional(),
  destLocationId: uuid.nullable().optional(),
  companyId: uuid.nullable().optional(),
  externalRef: z.string().max(120).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  lines: z.array(stockDocumentLineSchema).max(500).optional(),
});
export interface StockDocumentLineDto {
  id: string; materialId: string; materialName: string | null;
  quantity: number; unit: string; unitCost: number | null; unitPrice: number | null;
  currency: string | null; note: string | null;
}
export interface StockDocumentDto {
  id: string; typeId: string; typeCanonical: string | null; number: string | null; docDate: string; status: string;
  sourceLocationId: string | null; sourceLocationName: string | null;
  destLocationId: string | null; destLocationName: string | null;
  companyId: string | null; companyName: string | null;
  externalRef: string | null; note: string | null; createdAt: string;
  lines?: StockDocumentLineDto[];
}

/* ── Work Order (Ordinativo FTTH) — POWERCOM brief §6.1 ─────────────────
 * Oggetto di prima classe. La PII dell'intestatario (work_order_subject) e'
 * 1:1 e SEMPRE mascherata di default; va in chiaro solo con permesso pii:read.
 * `code` lo assegna number_series (key 'work_order') lato server. */

/** Dati personali intestatario (PII): tabella separata, mascherata di default. */
export const workOrderSubjectSchema = z.object({
  fullName: z.string().max(200).nullable().optional(),
  phone: z.string().max(60).nullable().optional(),
  phoneAlt: z.string().max(60).nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal('')),
  fiscalCode: z.string().max(32).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
});
export type WorkOrderSubjectInput = z.infer<typeof workOrderSubjectSchema>;

/** Apparato pianificato su un ordinativo (work_order_item). */
export const workOrderItemSchema = z.object({
  materialId: uuid,
  plannedQty: z.coerce.number().positive().default(1),
  note: z.string().max(300).nullable().optional(),
});
export type WorkOrderItemInput = z.infer<typeof workOrderItemSchema>;

export const createWorkOrderSchema = z.object({
  engagementId: uuid,
  principalCompanyId: uuid.nullable().optional(),
  principalOrderRef: z.string().max(120).nullable().optional(),
  typeId: uuid.nullable().optional(),        // lookup work_order_type (default canonical 'activation')
  statusId: uuid.optional(),                 // default: canonical 'assigned'
  assignedResourceId: uuid.nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  scheduledOn: day.nullable().optional(),
  subject: workOrderSubjectSchema.optional(),
  attributes: attrs.optional(),
});
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;

export const updateWorkOrderSchema = z.object({
  principalCompanyId: uuid.nullable().optional(),
  principalOrderRef: z.string().max(120).nullable().optional(),
  typeId: uuid.nullable().optional(),
  statusId: uuid.optional(),
  assignedResourceId: uuid.nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  scheduledOn: day.nullable().optional(),
  completedOn: day.nullable().optional(),
  subject: workOrderSubjectSchema.nullable().optional(),
  attributes: attrs.optional(),
});
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderSchema>;

/** Assegnazione bulk di una squadra a piu' ordinativi. */
export const assignWorkOrdersSchema = z.object({
  ids: z.array(uuid).min(1).max(500),
  assignedResourceId: uuid.nullable(),
});

/** Una riga del CSV gestore, gia' mappata sui campi interni (mapping FE/config). */
export const importWorkOrderRowSchema = z.object({
  principalOrderRef: z.string().min(1).max(120),
  principalCompanyId: uuid.nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  scheduledOn: day.nullable().optional(),
  subject: workOrderSubjectSchema.optional(),
});
export const importWorkOrdersSchema = z.object({
  engagementId: uuid,
  rows: z.array(importWorkOrderRowSchema).min(1).max(2000),
});
export type ImportWorkOrdersInput = z.infer<typeof importWorkOrdersSchema>;

/** DTO dell'intestatario: i valori PII arrivano MASCHERATI salvo pii:read. */
export interface WorkOrderSubjectDto {
  fullName: string | null; phone: string | null; phoneAlt: string | null;
  email: string | null; fiscalCode: string | null; address: string | null;
  /** true = i valori sopra sono in chiaro (utente con pii:read); false = mascherati. */
  unmasked: boolean;
}
export interface WorkOrderItemDto {
  id: string; materialId: string; materialName: string | null; unit: string | null;
  plannedQty: number; note: string | null; trackedBySerial: boolean;
}
/** Unita' serializzata collegata a un ordinativo (seriale installato). */
export interface WorkOrderSerialDto {
  id: string; materialId: string; materialName: string | null;
  serial: string; status: string; installedOn: string | null;
  /** true = esiste un segreto (password apparato); il valore resta gated da serial:secret_read. */
  hasSecret: boolean;
}
export interface WorkOrderDto {
  id: string;
  code: string;
  engagementId: string;
  engagementTitle: string | null;
  principalCompanyId: string | null;
  principalCompanyName: string | null;
  principalOrderRef: string | null;
  typeId: string | null;
  typeLabel: string | null;
  statusId: string;
  statusCanonical: string | null;
  assignedResourceId: string | null;
  assignedResourceLabel: string | null;
  address: string | null;
  scheduledOn: string | null;
  completedOn: string | null;
  /** Nome intestatario per la lista: mascherato (es. "M•••• R••••") salvo pii:read. */
  subjectNameDisplay: string | null;
  plannedCount: number;     // apparati previsti
  installedCount: number;   // seriali installati
  attributes: Record<string, unknown>;
  subject?: WorkOrderSubjectDto;          // solo nel dettaglio
  items?: WorkOrderItemDto[];             // solo nel dettaglio
  serials?: WorkOrderSerialDto[];         // solo nel dettaglio
}

/* ═══════════════════════════════════════════════════════════════════════
 *  SPEC v1.1 (chat 01.06) — Fiscale, Magazzino completo, Risorse, Asset
 * ═══════════════════════════════════════════════════════════════════════ */

/* ── tax_rate (catalogo imposte country-scoped) — Blocco A.2 ─────────── */
export const createTaxRateSchema = z.object({
  country: z.string().length(2),
  code: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  percent: z.coerce.number(),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
});
export const updateTaxRateSchema = createTaxRateSchema.partial();
export interface TaxRateDto {
  id: string; tenantId: string | null; country: string; code: string;
  label: string; percent: number; isDefault: boolean; active: boolean; isSystem: boolean;
}

/* ── material_category (gerarchica) — Blocco B.2 ─────────────────────── */
export const createMaterialCategorySchema = z.object({
  name: z.string().min(1).max(120),
  parentId: uuid.nullable().optional(),
  color: z.string().max(40).nullable().optional(),
  active: z.boolean().optional(),
});
export const updateMaterialCategorySchema = createMaterialCategorySchema.partial();
export interface MaterialCategoryDto {
  id: string; parentId: string | null; name: string; color: string | null; active: boolean;
}

/* ── material_supplier (più fornitori per articolo) — Blocco B.4 ────── */
export const createMaterialSupplierSchema = z.object({
  materialId: uuid,
  supplierId: uuid,
  supplierSku: z.string().max(120).nullable().optional(),
  purchasePrice: z.coerce.number().nullable().optional(),
  currency: z.string().max(10).nullable().optional(),
  leadTimeDays: z.coerce.number().int().nullable().optional(),
  isPreferred: z.boolean().optional(),
});
export const updateMaterialSupplierSchema = createMaterialSupplierSchema.omit({ materialId: true }).partial();
export interface MaterialSupplierDto {
  id: string; materialId: string; supplierId: string; supplierName: string | null;
  supplierSku: string | null; purchasePrice: number | null; currency: string | null;
  leadTimeDays: number | null; isPreferred: boolean;
}

/* ── material_image (foto multiple MinIO) — Blocco B.3 / J ───────────── */
export interface MaterialImageDto {
  id: string; materialId: string; objectKey: string; isPrimary: boolean; sequence: number;
  /** URL di lettura presigned (a scadenza); il bucket non è pubblico. */
  url?: string | null;
}
export const reorderImagesSchema = z.object({
  order: z.array(z.object({ id: uuid, sequence: z.coerce.number().int() })).min(1),
});

/* ── stock_lot (lotti + scadenze) — Blocco C.1 ──────────────────────── */
export const createStockLotSchema = z.object({
  materialId: uuid,
  lotNumber: z.string().min(1).max(120),
  mfgDate: day.nullable().optional(),
  expiryDate: day.nullable().optional(),
  supplierId: uuid.nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});
export const updateStockLotSchema = createStockLotSchema.omit({ materialId: true }).partial();
export interface StockLotDto {
  id: string; materialId: string; materialName: string | null; lotNumber: string;
  mfgDate: string | null; expiryDate: string | null; supplierId: string | null; note: string | null;
}

/* ── stock_count (conteggio inventariale) — Blocco C.3 ──────────────── */
export const STOCK_COUNT_STATUSES = ['draft', 'counting', 'review', 'posted', 'cancelled'] as const;
export const stockCountLineSchema = z.object({
  materialId: uuid,
  lotId: uuid.nullable().optional(),
  expectedQty: z.coerce.number().nullable().optional(),
  countedQty: z.coerce.number().nullable().optional(),
  unit: z.string().min(1).max(40),
  note: z.string().max(2000).nullable().optional(),
});
export const createStockCountSchema = z.object({
  locationId: uuid,
  countDate: day.optional(),
  note: z.string().max(2000).nullable().optional(),
  lines: z.array(stockCountLineSchema).optional(),
});
export const updateStockCountSchema = z.object({
  status: z.enum(STOCK_COUNT_STATUSES).optional(),
  note: z.string().max(2000).nullable().optional(),
  lines: z.array(stockCountLineSchema).optional(),
});
export interface StockCountLineDto {
  id: string; materialId: string; materialName: string | null; lotId: string | null;
  expectedQty: number | null; countedQty: number | null; unit: string; note: string | null;
}
export interface StockCountDto {
  id: string; number: string | null; locationId: string; locationName: string | null;
  status: string; countDate: string; note: string | null; createdAt: string;
  lines?: StockCountLineDto[];
}

/* ── purchase_order (ordini d'acquisto) — Blocco C.4 ────────────────── */
export const PO_STATUSES = ['draft', 'sent', 'partial', 'received', 'cancelled'] as const;
export const poLineSchema = z.object({
  materialId: uuid,
  qtyOrdered: z.coerce.number().positive(),
  unit: z.string().min(1).max(40),
  unitPrice: z.coerce.number().nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});
export const createPurchaseOrderSchema = z.object({
  supplierId: uuid,
  destLocationId: uuid.nullable().optional(),
  orderDate: day.optional(),
  expectedDate: day.nullable().optional(),
  currency: z.string().max(10).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  lines: z.array(poLineSchema).optional(),
});
export const updatePurchaseOrderSchema = z.object({
  status: z.enum(PO_STATUSES).optional(),
  destLocationId: uuid.nullable().optional(),
  expectedDate: day.nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  lines: z.array(poLineSchema).optional(),
});
export const receivePoLineSchema = z.object({ lineId: uuid, qty: z.coerce.number().positive() });
export const receivePurchaseOrderSchema = z.object({
  destLocationId: uuid.nullable().optional(),
  receipts: z.array(receivePoLineSchema).min(1),
});
export interface PurchaseOrderLineDto {
  id: string; materialId: string; materialName: string | null;
  qtyOrdered: number; qtyReceived: number; unit: string; unitPrice: number | null; note: string | null;
}
export interface PurchaseOrderDto {
  id: string; number: string | null; supplierId: string; supplierName: string | null;
  destLocationId: string | null; destLocationName: string | null; status: string;
  orderDate: string; expectedDate: string | null; currency: string | null; note: string | null; createdAt: string;
  lines?: PurchaseOrderLineDto[];
}

/* ── pick_list (prelievo in campo) — Blocco C.5 ─────────────────────── */
export const PICK_STATUSES = ['draft', 'assigned', 'picking', 'done', 'cancelled'] as const;
export const pickLineSchema = z.object({
  materialId: uuid,
  qtyRequested: z.coerce.number().positive(),
  unit: z.string().min(1).max(40),
  lotId: uuid.nullable().optional(),
});
export const createPickListSchema = z.object({
  sourceLocationId: uuid,
  assignedResourceId: uuid.nullable().optional(),
  workOrderId: uuid.nullable().optional(),
  engagementId: uuid.nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  lines: z.array(pickLineSchema).optional(),
});
export const updatePickListSchema = z.object({
  status: z.enum(PICK_STATUSES).optional(),
  assignedResourceId: uuid.nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  lines: z.array(pickLineSchema).optional(),
});
export interface PickListLineDto {
  id: string; materialId: string; materialName: string | null;
  qtyRequested: number; qtyPicked: number; unit: string; lotId: string | null;
}
export interface PickListDto {
  id: string; number: string | null; sourceLocationId: string; sourceLocationName: string | null;
  assignedResourceId: string | null; assignedResourceLabel: string | null;
  workOrderId: string | null; engagementId: string | null; status: string; note: string | null; createdAt: string;
  lines?: PickListLineDto[];
}

/* ── skill + resource_skill + resource_certification — Blocco D ─────── */
export const createSkillSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.string().max(80).nullable().optional(),
  active: z.boolean().optional(),
});
export const updateSkillSchema = createSkillSchema.partial();
export interface SkillDto { id: string; name: string; category: string | null; active: boolean; }

export const createResourceSkillSchema = z.object({
  skillId: uuid,
  level: z.coerce.number().int().min(1).max(3).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});
export interface ResourceSkillDto {
  id: string; resourceId: string; skillId: string; skillName: string | null;
  category: string | null; level: number | null; note: string | null;
}

export const createCertificationSchema = z.object({
  name: z.string().min(1).max(200),
  issuer: z.string().max(200).nullable().optional(),
  certNumber: z.string().max(120).nullable().optional(),
  validFrom: day.nullable().optional(),
  validUntil: day.nullable().optional(),
  documentObjectKey: z.string().max(500).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});
export const updateCertificationSchema = createCertificationSchema.partial();
export interface ResourceCertificationDto {
  id: string; resourceId: string; name: string; issuer: string | null; certNumber: string | null;
  validFrom: string | null; validUntil: string | null; documentObjectKey: string | null; note: string | null;
  /** giorni alla scadenza (negativo = scaduta); null se senza data. */
  daysToExpiry: number | null;
}
