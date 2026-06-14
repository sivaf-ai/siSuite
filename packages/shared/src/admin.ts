/**
 * admin.ts — schemi zod (validazione input) + DTO delle entità AMMINISTRATIVE
 * (utenti, ruoli, etichette/lookup, numeratori). Identificatori in inglese; UI
 * in italiano. Gli UUID non si mostrano in UI: si usano nomi/codici.
 *
 * Le righe di SISTEMA (tenant_id NULL: ruoli e lookup di default) sono in sola
 * lettura per il tenant — la RLS lo impone, qui esponiamo `isSystem` per la UI.
 */
import { z } from 'zod';
import { ALL_PERMISSION_KEYS, PERMISSION_CATALOG, type PermissionKey } from './permissions';
import type { Locale } from './types';

const dataScopeEnum = z.enum(['own', 'team', 'tenant', 'customer']);
const permissionKey = z.enum(ALL_PERMISSION_KEYS as [PermissionKey, ...PermissionKey[]]);
const label = z.record(z.string()); // { 'it-IT': '...', en?: '...', 'es-AR'?: '...' }

/* ── Lookup value (stati/etichette/priorità configurabili) ─────────────── */
export const createLookupSchema = z.object({
  category: z.string().min(1).max(60),
  canonical: z.string().min(1).max(60),
  code: z.string().min(1).max(60),
  label,
  abbreviation: z.string().max(12).nullable().optional(),
  colorToken: z.string().max(40).nullable().optional(),
  sequence: z.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
});
/** In modifica non si toccano category/canonical/code (chiave logica/stato). */
export const updateLookupSchema = z.object({
  label: label.optional(),
  abbreviation: z.string().max(12).nullable().optional(),
  colorToken: z.string().max(40).nullable().optional(),
  sequence: z.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
});
export type CreateLookupInput = z.infer<typeof createLookupSchema>;

/* ── Number series (numeratori documenti) ──────────────────────────────── */
export const resetPeriodEnum = z.enum(['never', 'yearly', 'monthly']);
export const createNumberSeriesSchema = z.object({
  key: z.string().min(1).max(60),
  format: z.string().min(1).max(120).default('{YYYY}-{SEQ:4}'),
  resetPeriod: resetPeriodEnum.default('yearly'),
});
export const updateNumberSeriesSchema = z.object({
  format: z.string().min(1).max(120).optional(),
  resetPeriod: resetPeriodEnum.optional(),
});
export type CreateNumberSeriesInput = z.infer<typeof createNumberSeriesSchema>;

export interface NumberSeriesDto {
  id: string;        // = key (gli UUID non esistono qui; la PK è (tenant_id,key))
  key: string;
  format: string;
  resetPeriod: string;
  currentPeriod: string;
  lastNumber: number;
}

/* ── Role (ruoli RBAC: di sistema + custom del tenant) ─────────────────── */
export const createRoleSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(400).nullable().optional(),
  dataScope: dataScopeEnum.default('own'),
  permissions: z.array(permissionKey).default([]),
});
export const updateRoleSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(400).nullable().optional(),
  dataScope: dataScopeEnum.optional(),
  permissions: z.array(permissionKey).optional(),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export interface RoleDto {
  id: string;
  name: string;
  description: string | null;
  dataScope: string;
  isSystem: boolean;
  permissions: string[];
}

/* ── User (app_user: anagrafica utente + ruoli) ────────────────────────── */
export const createUserSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(8, 'La password deve avere almeno 8 caratteri').max(128),
  phone: z.string().max(60).nullable().optional(),
  locale: z.enum(['it-IT', 'en', 'es-AR']).optional(),
  roleIds: z.array(z.string().uuid()).default([]),
});
export const updateUserSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  phone: z.string().max(60).nullable().optional(),
  active: z.boolean().optional(),
  locale: z.enum(['it-IT', 'en', 'es-AR']).optional(),
  roleIds: z.array(z.string().uuid()).optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export interface UserAdminDto {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  isPlatformAdmin: boolean;
  locale: Locale | null;
  roles: { id: string; name: string }[];
  createdAt: string;
}

/* ── Orari di lavoro (tenant e risorsa) ─────────────────────────────────── */
// per giorno (mon..sun): lista di intervalli [inizio,fine] in "HH:MM" (ora locale del tenant)
const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Ora in formato HH:MM');
export const workingHoursSchema = z.record(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']), z.array(z.tuple([timeStr, timeStr])));
export type WorkingHoursInput = z.infer<typeof workingHoursSchema>;
export const updateWorkingHoursSchema = z.object({ workingHours: workingHoursSchema });

export interface TenantSettingsDto {
  name: string; vertical: string; defaultLocale: string; timezone: string;
  workingHours: Record<string, [string, string][]>;
}

/* ── Terminologia per-tenant (glossario di dominio, parte 8 §1) ─────────── */
// Insieme CURATO di termini di dominio sovrascrivibili dal tenant (~20).
export const TERM_KEYS = [
  'engagement', 'phase', 'activity', 'resource', 'asset', 'material', 'customer',
  'contact', 'capture', 'dependency', 'time_entry', 'consumption', 'checklist',
  'planning', 'dashboard', 'template', 'priority', 'status',
] as const;
export type TermKey = (typeof TERM_KEYS)[number];

export interface TermOverrideDto { termKey: string; valueSingular: string; valuePlural: string | null }

export const updateTerminologySchema = z.object({
  locale: z.enum(['it-IT', 'en', 'es-AR']),
  terms: z.array(z.object({
    termKey: z.string().min(1).max(60),
    valueSingular: z.string().max(120),
    valuePlural: z.string().max(120).nullable().optional(),
  })),
});
export type UpdateTerminologyInput = z.infer<typeof updateTerminologySchema>;

/* ── Billing: piano + abbonamento del tenant (sola lettura) ─────────────── */
export interface PlanDto {
  id: string;
  code: string;
  name: string;
  billingModel: string;
  priceMonth: number | null;
  currency: string;
  entitlements: Record<string, unknown>;
  active: boolean;
}
export interface SubscriptionDto {
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAt: string | null;
  planCode: string;
  planName: string;
  /** entitlement EFFETTIVI = plan.entitlements + entitlement_overrides. */
  entitlements: Record<string, unknown>;
}
export interface BillingInfoDto {
  subscription: SubscriptionDto | null;
  plans: PlanDto[];
  usage: { aiThisMonth: number };
}

/* ── Helper UI: opzioni permessi (per la multiselect del form ruoli) ────── */
export interface PermissionOption { value: PermissionKey; label: string; resource: string }
export const PERMISSION_OPTIONS: PermissionOption[] = Object.entries(PERMISSION_CATALOG).flatMap(
  ([resource, def]) =>
    Object.entries(def.actions).map(([action, actionLabel]) => ({
      value: `${resource}:${action}` as PermissionKey,
      label: `${def.label} · ${actionLabel}`,
      resource,
    })),
);
