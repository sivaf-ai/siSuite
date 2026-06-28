/**
 * types.ts — tipi condivisi tra backend e frontend.
 * Identificatori in inglese; la UI li traduce con l'i18n.
 */
import type { PermissionKey, DataScope } from './permissions';

/** Locale supportati (MVP: attivo solo it-IT; en/es-AR abilitabili). */
export type Locale = 'it-IT' | 'en' | 'es-AR';

/** Categorie di stato canonico riconosciute dal sistema (vedi canonical_state). */
export type CanonicalCategory =
  | 'activity_status'
  | 'engagement_status'
  | 'phase_status'
  | 'priority'
  | 'company_role';

/** Archetipi di commessa (engagement_type nello schema). */
export type EngagementType = 'build' | 'maintenance';

/**
 * Il contesto dell'utente autenticato, calcolato dal backend a ogni richiesta
 * e usato per impostare la sessione RLS (SET LOCAL) + i controlli RBAC.
 * Esposto al frontend (senza segreti) via GET /me.
 */
export interface UserContext {
  userId: string;          // app_user.id (uuid) — non mostrato in UI
  tenantId: string;        // tenant.id (uuid)
  fullName: string;
  email: string | null;
  locale: Locale;
  isPlatformAdmin: boolean;
  /** data_scope EFFETTIVO = il più ampio tra i ruoli (own < team < tenant). */
  dataScope: DataScope;
  /** company_id valorizzato solo per utenti esterni (portale cliente). */
  companyId: string | null;
  /** chiavi permesso concesse dai ruoli dell'utente. */
  permissions: PermissionKey[];
  /** entitlement effettivi del piano del tenant (gating, separato dall'RBAC). */
  entitlements: Record<string, unknown>;
}

/** Forma standard di errore API. */
export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

/** Riga engagement come la espone l'API (UUID non mostrati in UI: si usa `code`). */
export interface EngagementDto {
  id: string;
  code: string;
  title: string;
  type: EngagementType;
  companyId: string;
  companyName: string | null;
  statusId: string;
  statusCanonical: string | null;
  startedOn: string | null;
  endedOn: string | null;
  createdAt: string;
  attributes: Record<string, unknown>;
  archivedAt: string | null;
  archivedByName: string | null;
}
