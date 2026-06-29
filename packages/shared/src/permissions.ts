/**
 * permissions.ts
 * ──────────────────────────────────────────────────────────────────────────
 * CATALOGO PERMESSI RBAC — FONTE DI VERITÀ, versionata con l'app.
 *
 * MODELLO
 *  - Un permesso è una coppia `risorsa:azione` (es. 'time_entry:create').
 *  - Le AZIONI (può fare X?) le copre l'RBAC: questo file.
 *  - La VISIBILITÀ dei dati (può vedere QUESTI record?) è un'altra dimensione:
 *    `data_scope` sul ruolo ('own' | 'team' | 'tenant' | 'customer'), imposta
 *    dalla Row-Level Security di Postgres. Filtrano ENTRAMBI.
 *  - Principio non negoziabile: l'autorizzazione si impone al livello DATI (RLS)
 *    e API, mai solo nascondendo bottoni in UI.
 *  - I permessi sono definiti QUI (codice), versionati con l'app. Nel DB stanno
 *    solo ruoli e assegnazioni (`role`, `role_permission`, `user_role`). Al
 *    bootstrap, i grant dei ruoli di sistema sono scritti in `role_permission`
 *    a partire da questo catalogo (vedi buildRolePermissionRows()).
 *  - Il MENU (app del tecnico + pannello web) si DERIVA da qui: ogni voce
 *    dichiara il permesso che richiede e appare solo se l'utente ce l'ha.
 *  - L'AI agisce sempre dentro i permessi dell'utente che la invoca: il
 *    validatore deterministico controlla questi permessi + RLS prima di
 *    applicare qualunque operazione proposta dall'LLM.
 * ──────────────────────────────────────────────────────────────────────────
 */

/* ===========================================================================
 *  IL CATALOGO — risorse (aree/entità) e azioni ammesse, con etichette per la
 *  UI/menu (per-locale lo si traduce con l'i18n; qui la chiave + label IT base).
 * =========================================================================== */
export const PERMISSION_CATALOG = {
  // --- Lavoro: struttura di progetto -------------------------------------
  engagement: { label: 'Commesse',     actions: { create: 'Crea', read: 'Vedi', update: 'Modifica', delete: 'Elimina' } },
  phase:      { label: 'Fasi',         actions: { create: 'Crea', read: 'Vedi', update: 'Modifica', delete: 'Elimina' } },
  activity:   { label: 'Attività',     actions: { create: 'Crea', read: 'Vedi', update: 'Modifica', delete: 'Elimina', assign: 'Assegna risorse' } },
  dependency: { label: 'Dipendenze',   actions: { read: 'Vedi', manage: 'Gestisci' } },

  // --- Esecuzione e rendicontazione (il mondo del tecnico) ---------------
  capture:              { label: 'Catture',           actions: { create: 'Crea', read: 'Vedi', apply: 'Applica estrazione', delete: 'Elimina' } },
  time_entry:           { label: 'Ore',               actions: { create: 'Registra', read: 'Vedi', update: 'Modifica', delete: 'Elimina', approve: 'Approva/Blocca' } },
  material_consumption: { label: 'Consumi materiali', actions: { create: 'Registra', read: 'Vedi', update: 'Modifica', delete: 'Elimina' } },
  absence:              { label: 'Assenze',           actions: { create: 'Richiedi', read: 'Vedi', update: 'Modifica', delete: 'Elimina', approve: 'Approva' } },
  work_report:          { label: 'Rapportini',        actions: { create: 'Crea', read: 'Vedi', update: 'Modifica', delete: 'Elimina' } },
  stock:                { label: 'Magazzino',         actions: { read: 'Vedi', move: 'Registra movimento', manage: 'Gestisci (ubicazioni/documenti)' } },

  // --- POWERCOM: ordinativi FTTH, seriali, dati personali intestatario -----
  work_order: { label: 'Ordinativi (FTTH)', actions: { create: 'Crea', read: 'Vedi', update: 'Modifica', delete: 'Elimina', assign: 'Assegna a squadra', import: 'Importa da CSV/portale' } },
  serial:     { label: 'Seriali apparati',  actions: { read: 'Vedi', manage: 'Gestisci', secret_read: 'Sblocca password apparato' } },
  // PII = dati personali dell'intestatario (work_order_subject): lo sblocco del
  // valore in chiaro e' un asse a sé (brief §3.4), tracciato e non loggato.
  // 'read' = nome+telefono+CF in chiaro; 'read_contact' = SOLO il recapito
  // (telefono) in chiaro, nome/CF mascherati — per il Tecnico assegnato (Decisione 6.2).
  pii:        { label: 'Dati personali',    actions: { read: 'Mostra tutto', read_contact: 'Mostra solo recapito' } },

  // --- Anagrafiche / master data -----------------------------------------
  company:  { label: 'Aziende',     actions: { create: 'Crea', read: 'Vedi', update: 'Modifica', delete: 'Elimina' } },
  contact:  { label: 'Contatti',    actions: { create: 'Crea', read: 'Vedi', update: 'Modifica', delete: 'Elimina' } },
  asset:    { label: 'Asset',       actions: { create: 'Crea', read: 'Vedi', update: 'Modifica', delete: 'Elimina' } },
  site:     { label: 'Siti / Località', actions: { create: 'Crea', read: 'Vedi', update: 'Modifica', delete: 'Elimina', address: 'Vedi indirizzo' } },
  resource: { label: 'Risorse',     actions: { create: 'Crea', read: 'Vedi', update: 'Modifica', delete: 'Elimina' } },
  material: { label: 'Materiali',   actions: { create: 'Crea', read: 'Vedi', update: 'Modifica', delete: 'Elimina' } },
  template: { label: 'Template',    actions: { create: 'Crea', read: 'Vedi', update: 'Modifica', delete: 'Elimina' } },

  // --- Trasversali --------------------------------------------------------
  report:   { label: 'Report',        actions: { read: 'Vedi', export: 'Esporta' } },

  // --- Amministrazione del tenant ----------------------------------------
  user:     { label: 'Utenti',                actions: { read: 'Vedi', manage: 'Gestisci' } },   // crea/disattiva, assegna ruoli
  role:     { label: 'Ruoli',                 actions: { read: 'Vedi', manage: 'Gestisci' } },   // ruoli custom + grant
  settings: { label: 'Impostazioni',          actions: { read: 'Vedi', manage: 'Gestisci' } },   // stati/etichette, numerazioni, orari, domain pack
  billing:  { label: 'Piano e fatturazione',  actions: { read: 'Vedi', manage: 'Gestisci' } },   // plan/subscription/entitlements
} as const;

/* ===========================================================================
 *  TIPI DERIVATI — la PermissionKey è generata dal catalogo: una sola fonte,
 *  niente drift tra lista e ruoli.
 * =========================================================================== */
type Catalog = typeof PERMISSION_CATALOG;
export type Resource = keyof Catalog;
export type PermissionKey = {
  [R in Resource]: `${R & string}:${keyof Catalog[R]['actions'] & string}`;
}[Resource];

/** Tutte le chiavi permesso, a runtime (per validazione, seed, audit). */
export const ALL_PERMISSION_KEYS: PermissionKey[] = Object.entries(PERMISSION_CATALOG).flatMap(
  ([resource, def]) => Object.keys(def.actions).map((action) => `${resource}:${action}` as PermissionKey),
);

/* ===========================================================================
 *  RUOLI DI SISTEMA — seminati per ogni tenant (tenant_id NULL nello schema).
 *  `dataScope` è la banda di visibilità imposta dalla RLS; `permissions` sono
 *  le azioni. '*' = tutti i permessi del tenant (solo Owner).
 *  I nomi combaciano con il SEED in schema_core.sql.
 * =========================================================================== */
export type DataScope = 'own' | 'team' | 'tenant' | 'customer';

export interface SystemRole {
  name: string;
  description: string;
  dataScope: DataScope;
  permissions: PermissionKey[] | '*';
}

/** helper: i permessi di sola lettura per un insieme di risorse. */
const reads = (...rs: Resource[]): PermissionKey[] => rs.map((r) => `${r}:read` as PermissionKey);

export const SYSTEM_ROLES: SystemRole[] = [
  {
    name: 'Owner',
    description: 'Amministratore del tenant: tutti i permessi.',
    dataScope: 'tenant',
    permissions: '*',
  },
  {
    name: 'Planner',
    description: 'Pianifica progetti e assegna risorse. Niente gestione utenti/impostazioni/fatturazione.',
    dataScope: 'tenant',
    permissions: [
      'engagement:create', 'engagement:read', 'engagement:update',
      'phase:create', 'phase:read', 'phase:update', 'phase:delete',
      'activity:create', 'activity:read', 'activity:update', 'activity:delete', 'activity:assign',
      'dependency:read', 'dependency:manage',
      'asset:create', 'asset:read', 'asset:update',
      'site:create', 'site:read', 'site:update', 'site:delete', 'site:address',
      'template:create', 'template:read', 'template:update',
      'capture:read', 'time_entry:read', 'time_entry:approve', 'material_consumption:read',
      'absence:read', 'absence:approve',
      'work_report:create', 'work_report:read', 'work_report:update',
      'stock:read', 'stock:move', 'stock:manage',
      'work_order:create', 'work_order:read', 'work_order:update', 'work_order:assign', 'work_order:import',
      'serial:read', 'serial:manage',
      'company:read', 'contact:read', 'resource:read', 'material:read',
      'report:read', 'report:export',
    ],
  },
  {
    name: 'Tecnico',
    description: 'Esegue e rendiconta le PROPRIE attività. Niente delete, niente dati altrui (data_scope=own).',
    dataScope: 'own',
    permissions: [
      'activity:read', 'activity:update',
      'capture:create', 'capture:read',
      'time_entry:create', 'time_entry:read',
      'material_consumption:create', 'material_consumption:read',
      'absence:create', 'absence:read',
      'work_report:create', 'work_report:read',
      'stock:read', 'stock:move',
      'work_order:read', 'work_order:update',
      'serial:read',
      'pii:read_contact',
      'engagement:read', 'phase:read', 'asset:read', 'site:read', 'material:read',
    ],
  },
  {
    name: 'Contabile',
    description: 'Consultazione ed export amministrativo. Nessuna modifica operativa.',
    dataScope: 'tenant',
    permissions: [
      ...reads('engagement', 'phase', 'activity', 'time_entry', 'material_consumption',
               'absence', 'work_report', 'stock', 'work_order', 'serial',
               'material', 'company', 'contact', 'asset', 'site', 'resource'),
      'site:address',
      'report:read', 'report:export',
    ],
  },
  {
    name: 'Sola lettura',
    description: 'Accesso in sola lettura a tutto ciò che è leggibile.',
    dataScope: 'tenant',
    permissions: [
      ...reads('engagement', 'phase', 'activity', 'dependency', 'capture', 'time_entry',
               'material_consumption', 'absence', 'work_report', 'stock', 'work_order', 'serial',
               'company', 'contact', 'asset', 'site', 'resource',
               'material', 'template'),
      'site:address',
      'report:read',
    ],
  },
  {
    name: 'Cliente esterno',
    description: 'Utente esterno: vede solo i progetti del proprio cliente, in sola lettura, SENZA costi ' +
                 '(proiezione client-safe imposta da API/RLS, data_scope=customer). Il portale è post-core.',
    dataScope: 'customer',
    permissions: [
      'engagement:read', 'activity:read', 'asset:read',
    ],
  },
];

/* ===========================================================================
 *  PERMESSI DI PIATTAFORMA — NON fanno parte dell'RBAC dei tenant. Riservati a
 *  is_platform_admin (noi, il fornitore): gestiamo i tenant, NON entriamo nei
 *  loro dati. Guardati dal flag, non da un ruolo del tenant.
 * =========================================================================== */
export const PLATFORM_PERMISSIONS = [
  'tenant:create', 'tenant:read', 'tenant:update', 'tenant:suspend', 'tenant:delete',
  'plan:manage', 'platform:access',
] as const;
export type PlatformPermissionKey = typeof PLATFORM_PERMISSIONS[number];

/* ===========================================================================
 *  BOOTSTRAP — espande i ruoli di sistema nelle righe role_permission da
 *  scrivere nel DB. '*' viene espanso in TUTTE le chiavi del catalogo.
 *  Da chiamare al bootstrap (ruoli di sistema, tenant_id NULL) dopo aver
 *  inserito i ruoli del SEED di schema_core.sql.
 * =========================================================================== */
export function permissionsForRole(role: SystemRole): PermissionKey[] {
  return role.permissions === '*' ? ALL_PERMISSION_KEYS : role.permissions;
}

export interface RolePermissionRow { roleName: string; permissionKey: PermissionKey; }

export function buildRolePermissionRows(): RolePermissionRow[] {
  return SYSTEM_ROLES.flatMap((role) =>
    permissionsForRole(role).map((permissionKey) => ({ roleName: role.name, permissionKey })),
  );
}

/* ===========================================================================
 *  GUARDIA — controllo singolo permesso. La visibilità (data_scope) è imposta
 *  a parte dalla RLS; questa funzione copre solo l'AZIONE.
 * =========================================================================== */
export function can(userPermissions: ReadonlySet<PermissionKey>, required: PermissionKey): boolean {
  return userPermissions.has(required);
}
