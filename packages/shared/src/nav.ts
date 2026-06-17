/**
 * nav.ts — MENÙ A 2 LIVELLI (mock 43, brief Parte 8 · Blocco A "vero").
 *
 * Modello (standard SAP Fiori, scalabile a 200+ voci):
 *   RAIL L1  = sezioni (raggruppate in: Lavoro · Dati · Sistema)
 *   SUB-PANEL L2 = gruppi con caption → voci (NavItem). Niente 3° livello.
 *
 * Ogni voce dichiara la PermissionKey richiesta: appare solo se l'utente ce l'ha
 * (la sicurezza vera è API+RLS, qui è solo UX). Una sezione è visibile se ha
 * almeno una voce visibile. `crossLinkTo` = collegamento ↪ alla rotta canonica
 * di un'altra sezione (regola del 10%: entità trasversali stanno in Anagrafiche).
 *
 * NB: `menu.ts` (MENU/visibleMenu) resta per la tab bar mobile; questo file è
 * la navigazione desktop a 2 livelli.
 */
import type { PermissionKey } from './permissions';
import { can } from './permissions';

export type RailGroup = 'lavoro' | 'dati' | 'sistema';

export interface NavItem {
  id: string;
  /** etichetta IT base; i18n traduce per-locale via chiave `nav.<id>`. */
  label: string;
  /** rotta canonica del client. */
  route: string;
  /** nome icona lucide (risolto nel client via MENU_ICON). */
  icon: string;
  /** permesso richiesto per vedere/usare la voce. */
  permission: PermissionKey;
  /** etichetta-tag a destra (es. "fibra"). */
  tag?: string;
  /** voce di Collegamento ↪ alla rotta canonica di un'altra sezione. */
  crossLink?: boolean;
  /** funzionalità in arrivo: voce visibile ma disabilitata, badge PRESTO. */
  soon?: boolean;
}

export interface NavGroup {
  /** caption del gruppo nel sub-panel (eyebrow). */
  caption?: string;
  /** gruppo di Collegamenti (rendering con ↪). */
  link?: boolean;
  items: NavItem[];
}

export interface NavSection {
  id: string;
  /** etichetta IT base del rail L1; i18n via `navsec.<id>`. */
  label: string;
  icon: string;
  group: RailGroup;
  /** se true, sezione riservata al platform admin (flag, non RBAC del tenant). */
  platformOnly?: boolean;
  groups: NavGroup[];
}

/** L'albero completo (mock 43). Le voci "soon" non hanno ancora una pagina. */
export const NAV: NavSection[] = [
  // ── LAVORO ──────────────────────────────────────────────────────────
  {
    id: 'cruscotto', label: 'Cruscotto', icon: 'layout-dashboard', group: 'lavoro',
    groups: [
      { caption: 'Viste', items: [
        { id: 'dashboard', label: 'Panoramica', route: '/dashboard', icon: 'layout-dashboard', permission: 'engagement:read' },
      ] },
    ],
  },
  {
    id: 'commesse', label: 'Commesse', icon: 'folder-kanban', group: 'lavoro',
    groups: [
      { caption: 'Gestione', items: [
        { id: 'engagements', label: 'Elenco commesse', route: '/engagements', icon: 'briefcase', permission: 'engagement:read' },
        { id: 'activities', label: 'Attività', route: '/activities', icon: 'clipboard-list', permission: 'activity:read' },
        { id: 'planning', label: 'Pianificazione & Agenda', route: '/planning', icon: 'calendar', permission: 'activity:read' },
      ] },
      { caption: 'Catture', items: [
        { id: 'captures-inbox', label: 'Inbox catture (AI)', route: '/captures', icon: 'sparkles', permission: 'capture:read' },
      ] },
    ],
  },
  {
    id: 'campo', label: 'Campo', icon: 'hard-hat', group: 'lavoro',
    groups: [
      { caption: 'Operatività', items: [
        { id: 'work-orders', label: 'Ordini di lavoro', route: '/work-orders', icon: 'cable', permission: 'work_order:read' },
        { id: 'agenda', label: 'Agenda & pianificazione', route: '/agenda', icon: 'calendar', permission: 'activity:read' },
        { id: 'work-reports', label: 'Rapportini', route: '/work-reports', icon: 'clipboard-list', permission: 'work_report:read' },
      ] },
      { caption: 'Tempi & presenze', items: [
        { id: 'time-entries', label: 'Foglio ore', route: '/time-entries', icon: 'clock', permission: 'time_entry:read' },
        { id: 'timer', label: 'Cronometro', route: '/timer', icon: 'timer', permission: 'time_entry:read' },
        { id: 'absences', label: 'Assenze', route: '/absences', icon: 'calendar-off', permission: 'absence:read' },
      ] },
      { caption: 'Cattura', items: [
        { id: 'captures', label: 'Catture vocali', route: '/captures', icon: 'mic', permission: 'capture:read' },
      ] },
    ],
  },
  {
    id: 'magazzino', label: 'Magazzino', icon: 'warehouse', group: 'lavoro',
    groups: [
      { caption: 'Giacenze', items: [
        { id: 'stock', label: 'Giacenze & disponibilità', route: '/stock', icon: 'layers', permission: 'stock:read' },
        { id: 'stock-movements', label: 'Movimenti', route: '/stock', icon: 'arrow-left-right', permission: 'stock:read', soon: true },
        { id: 'stock-inventory', label: 'Inventario', route: '/stock', icon: 'clipboard-check', permission: 'stock:manage', soon: true },
      ] },
      { caption: 'Documenti', items: [
        { id: 'stock-docs', label: 'DDT / Scarico / Trasferimento', route: '/stock', icon: 'file-output', permission: 'stock:manage', soon: true },
      ] },
      { caption: 'Collegamenti', link: true, items: [
        { id: 'materials-link', label: 'Articoli & seriali', route: '/materials', icon: 'package', permission: 'material:read', crossLink: true },
      ] },
    ],
  },
  {
    id: 'finanza', label: 'Finanza & Budget', icon: 'wallet', group: 'lavoro',
    groups: [
      { caption: 'Produzione', items: [
        { id: 'work-lines', label: 'Lavorazioni', route: '/work-lines', icon: 'wrench', permission: 'report:read' },
      ] },
      { caption: 'Budget', items: [
        { id: 'budget', label: 'Budget commessa', route: '/engagements', icon: 'piggy-bank', permission: 'report:read', soon: true },
        { id: 'pivot', label: 'Preventivo–consuntivo', route: '/finance/pivot', icon: 'scale', permission: 'report:read' },
      ] },
    ],
  },
  // ── DATI ────────────────────────────────────────────────────────────
  {
    id: 'anagrafiche', label: 'Anagrafiche', icon: 'contact-2', group: 'dati',
    groups: [
      { caption: 'Entità', items: [
        { id: 'companies', label: 'Soggetti', route: '/companies', icon: 'contact-2', permission: 'company:read' },
        { id: 'resources', label: 'Risorse', route: '/resources', icon: 'users', permission: 'resource:read' },
        { id: 'materials', label: 'Articoli & seriali', route: '/materials', icon: 'package', permission: 'material:read' },
        { id: 'assets', label: 'Asset', route: '/assets', icon: 'box', permission: 'asset:read' },
      ] },
      { caption: 'Viste per ruolo', items: [
        { id: 'companies-customers', label: 'Clienti', route: '/companies?role=customer', icon: 'user-round', permission: 'company:read' },
        { id: 'companies-suppliers', label: 'Fornitori', route: '/companies?role=supplier', icon: 'truck', permission: 'company:read' },
        { id: 'companies-operators', label: 'Gestori', route: '/companies?role=operator', icon: 'radio-tower', permission: 'company:read' },
      ] },
      { caption: 'Produzione', items: [
        { id: 'price-list', label: 'Listino voci di capitolato', route: '/price-list', icon: 'tags', permission: 'report:read' },
      ] },
    ],
  },
  // ── SISTEMA ─────────────────────────────────────────────────────────
  {
    id: 'impostazioni', label: 'Impostazioni', icon: 'settings', group: 'sistema',
    groups: [
      { caption: 'Configurazione', items: [
        { id: 'settings', label: 'Impostazioni', route: '/admin/settings', icon: 'sliders-horizontal', permission: 'settings:read' },
      ] },
    ],
  },
  {
    id: 'amministrazione', label: 'Amministrazione', icon: 'shield', group: 'sistema',
    groups: [
      { caption: 'Accessi', items: [
        { id: 'users', label: 'Utenti', route: '/admin/users', icon: 'user-cog', permission: 'user:read' },
        { id: 'roles', label: 'Ruoli & permessi', route: '/admin/roles', icon: 'key-round', permission: 'role:read' },
      ] },
    ],
  },
];

/** etichette IT base dei raggruppamenti del rail (i18n via `navgroup.<g>`). */
export const RAIL_GROUP_LABEL: Record<RailGroup, string> = {
  lavoro: 'Lavoro', dati: 'Dati', sistema: 'Sistema',
};

/** Le sezioni visibili per un dato insieme di permessi (sezione visibile se ha
 *  almeno una voce non-crossLink visibile). I gruppi/voci vengono filtrati. */
export function visibleNav(permissions: ReadonlySet<PermissionKey>): NavSection[] {
  return NAV.map((sec) => {
    const groups = sec.groups
      .map((g) => ({ ...g, items: g.items.filter((it) => can(permissions, it.permission)) }))
      .filter((g) => g.items.length > 0);
    return { ...sec, groups };
  }).filter((sec) => sec.groups.some((g) => !g.link && g.items.length > 0));
}

/** Tutte le voci "vere" (con rotta, non soon, non crossLink) per ricerca/omnibox. */
export function allNavItems(): { item: NavItem; section: NavSection }[] {
  const out: { item: NavItem; section: NavSection }[] = [];
  for (const sec of NAV) for (const g of sec.groups) {
    if (g.link) continue;
    for (const it of g.items) if (!it.soon) out.push({ item: it, section: sec });
  }
  return out;
}

/** Sibling tab bar: voci "sorelle" della sezione che contiene la rotta attiva. */
export function siblingTabs(permissions: ReadonlySet<PermissionKey>, pathname: string): NavItem[] {
  const norm = (r: string) => r.split('?')[0];
  for (const sec of NAV) {
    const flat = sec.groups.filter((g) => !g.link).flatMap((g) => g.items);
    if (flat.some((it) => norm(it.route) === pathname || pathname.startsWith(norm(it.route) + '/'))) {
      return flat.filter((it) => !it.soon && can(permissions, it.permission));
    }
  }
  return [];
}
