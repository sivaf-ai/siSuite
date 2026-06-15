/**
 * menu.ts — DEFINIZIONE DEL MENU, derivata dai permessi.
 * Ogni voce dichiara la PermissionKey che richiede: appare solo se l'utente
 * ce l'ha (regola del brief). La visibilità in UI è solo UX — l'autorizzazione
 * vera è imposta da RBAC (API) + RLS (DB).
 *
 * Due shell:
 *   - 'mobile'  → app del tecnico (tab bar, voce-centrica)
 *   - 'desktop' → pannello pianificatore/admin (sidebar)
 * Una voce può vivere in entrambe.
 */
import type { PermissionKey } from './permissions';
import { can } from './permissions';

export type Shell = 'mobile' | 'desktop';

export interface MenuItem {
  id: string;
  /** etichetta IT base; i18n la traduce per-locale. */
  label: string;
  /** rotta del client. */
  route: string;
  /** nome icona (set ionicons), risolto nel client. */
  icon: string;
  /** permesso richiesto per vedere la voce. */
  permission: PermissionKey;
  /** in quali shell compare. */
  shells: Shell[];
  /** raggruppamento nella sidebar desktop. */
  group?: 'lavoro' | 'anagrafiche' | 'amministrazione';
}

export const MENU: MenuItem[] = [
  // ── App tecnico (mobile) ──────────────────────────────────────────
  { id: 'today',    label: 'Oggi',     route: '/today',    icon: 'today-outline',    permission: 'activity:read',   shells: ['mobile'] },
  { id: 'agenda',   label: 'Agenda',   route: '/agenda',   icon: 'calendar-outline', permission: 'activity:read',   shells: ['mobile'] },
  { id: 'captures', label: 'Catture',  route: '/captures', icon: 'sparkles-outline', permission: 'capture:read',    shells: ['mobile'] },

  // ── Pannello pianificatore/admin (desktop) ────────────────────────
  { id: 'dashboard',   label: 'Dashboard',     route: '/dashboard',   icon: 'grid-outline',       permission: 'engagement:read', shells: ['desktop'], group: 'lavoro' },
  { id: 'planning',    label: 'Pianificazione', route: '/planning',   icon: 'git-network-outline', permission: 'activity:read',  shells: ['desktop'], group: 'lavoro' },
  { id: 'engagements', label: 'Commesse',      route: '/engagements', icon: 'briefcase-outline',  permission: 'engagement:read', shells: ['desktop'], group: 'lavoro' },
  { id: 'time-entries', label: 'Foglio ore',   route: '/time-entries', icon: 'time-outline',      permission: 'time_entry:read', shells: ['desktop'], group: 'lavoro' },
  { id: 'work-reports', label: 'Rapportini',    route: '/work-reports', icon: 'document-text-outline', permission: 'work_report:read', shells: ['desktop'], group: 'lavoro' },
  { id: 'timer',        label: 'Cronometro',    route: '/timer',        icon: 'stopwatch-outline', permission: 'time_entry:read', shells: ['desktop'], group: 'lavoro' },
  { id: 'absences',     label: 'Assenze',       route: '/absences',     icon: 'calendar-clear-outline', permission: 'absence:read', shells: ['desktop'], group: 'lavoro' },
  { id: 'captures-inbox', label: 'Catture',    route: '/captures',    icon: 'sparkles-outline',   permission: 'capture:read',    shells: ['desktop'], group: 'lavoro' },
  { id: 'assets',      label: 'Asset',         route: '/assets',      icon: 'cube-outline',       permission: 'asset:read',      shells: ['desktop'], group: 'lavoro' },

  { id: 'companies',   label: 'Clienti',       route: '/companies',   icon: 'business-outline',   permission: 'company:read',    shells: ['desktop'], group: 'anagrafiche' },
  { id: 'resources',   label: 'Risorse',       route: '/resources',   icon: 'people-outline',     permission: 'resource:read',   shells: ['desktop'], group: 'anagrafiche' },
  { id: 'materials',   label: 'Materiali',     route: '/materials',   icon: 'layers-outline',     permission: 'material:read',   shells: ['desktop'], group: 'anagrafiche' },
  { id: 'stock',       label: 'Magazzino',     route: '/stock',       icon: 'cube-outline',       permission: 'stock:read',      shells: ['desktop'], group: 'anagrafiche' },

  { id: 'users',       label: 'Utenti',        route: '/admin/users',    icon: 'person-circle-outline', permission: 'user:read',     shells: ['desktop'], group: 'amministrazione' },
  { id: 'roles',       label: 'Ruoli',         route: '/admin/roles',    icon: 'shield-outline',        permission: 'role:read',     shells: ['desktop'], group: 'amministrazione' },
  { id: 'settings',    label: 'Impostazioni',  route: '/admin/settings', icon: 'settings-outline',      permission: 'settings:read', shells: ['desktop'], group: 'amministrazione' },
];

/** Le voci visibili per un dato insieme di permessi e una shell. */
export function visibleMenu(permissions: ReadonlySet<PermissionKey>, shell: Shell): MenuItem[] {
  return MENU.filter((item) => item.shells.includes(shell) && can(permissions, item.permission));
}
