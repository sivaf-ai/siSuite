/**
 * AppShell — shell a 2 livelli (mock 43, Blocco A "vero"):
 *   - desktop (≥768px): RAIL L1 (sezioni, collassabile e persistente) + SUB-PANEL L2
 *     (gruppi+voci, flyout) + topbar con omnibox ⌘K + sibling tab bar.
 *   - mobile (<768px): tab bar in basso (come prima), shell L1/L2 nascosta via CSS.
 * Le voci derivano da `visibleNav(permessi)`: una voce appare solo col permesso.
 * La sicurezza vera è API+RLS; in più qui c'è un route-guard RBAC (le rotte
 * senza permesso non sono raggiungibili nemmeno via URL → redirect).
 */
import { IonRouterOutlet } from '@ionic/react';
import { useEffect, useMemo, useState } from 'react';
import { Redirect, Route } from 'react-router-dom';
import { useHistory, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  visibleNav, siblingTabs, siblingGroups, allNavItems, RAIL_GROUP_LABEL,
  type PermissionKey, type RailGroup, type NavItem, type NavSection,
} from '@sisuite/shared';
import {
  iconByName, MENU_ICON, Circle, Star, CornerDownRight, ExternalLink, ChevronRight, X, Search, Sparkles,
} from '../ui/icons';
import { LogOut, Mic, ShieldAlert, ChevronsLeft, ChevronsRight, ChevronDown, Sun, Moon } from 'lucide-react';
import { visibleMenu, type MenuItem } from '@sisuite/shared';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { NotificationsBell } from '../ui/NotificationsBell';
import { TodayPage } from '../pages/TodayPage';
import { DashboardPage } from '../pages/DashboardPage';
import { EngagementsPage } from '../pages/EngagementsPage';
import { CommessaDetailPage } from '../pages/CommessaDetailPage';
import { AssetDetailPage } from '../pages/AssetDetailPage';
import { AttivitaDetailPage } from '../pages/AttivitaDetailPage';
import { AttivitaPage } from '../pages/AttivitaPage';
import { UserDetailPage } from '../pages/admin/UserDetailPage';
import { RoleDetailPage } from '../pages/admin/RoleDetailPage';
import { RapportinoDetailPage } from '../pages/RapportinoDetailPage';
import { PivotPage } from '../pages/PivotPage';
import { ClientiPage } from '../pages/ClientiPage';
import { ClienteDetailPage } from '../pages/ClienteDetailPage';
import { RisorsePage } from '../pages/RisorsePage';
import { RisorsaDetailPage } from '../pages/RisorsaDetailPage';
import { MaterialiPage } from '../pages/MaterialiPage';
import { MaterialeDetailPage } from '../pages/MaterialeDetailPage';
import { ListinoPage } from '../pages/ListinoPage';
import { ListinoItemDetailPage } from '../pages/ListinoItemDetailPage';
import { LavorazioniPage } from '../pages/LavorazioniPage';
import { LavorazioneDetailPage } from '../pages/LavorazioneDetailPage';
import { OrdinativiPage } from '../pages/OrdinativiPage';
import { OrdinativoDetailPage } from '../pages/OrdinativoDetailPage';
import { TimeEntriesPage } from '../pages/TimeEntriesPage';
import { TimeEntryDetailPage } from '../pages/TimeEntryDetailPage';
import { MagazzinoPage, MagazzinoDetailPage } from '../pages/MagazzinoPage';
import { PurchaseOrdersPage, PickListsPage, DdtPage, StockCountsPage, SkillsPage, TaxRatesPage } from '../pages/SpecListsPages';
import { UnitsPage } from '../pages/UnitsPage';
import { SitiPage } from '../pages/SitiPage';
import { CategoriePage } from '../pages/CategoriePage';
import { PurchaseOrderDetailPage } from '../pages/PurchaseOrderDetailPage';
import { PickListDetailPage } from '../pages/PickListDetailPage';
import { DdtDetailPage } from '../pages/DdtDetailPage';
import { RapportiniPage } from '../pages/RapportiniPage';
import { AssenzePage } from '../pages/AssenzePage';
import { AbsenceDetailPage } from '../pages/AbsenceDetailPage';
import { CronometroPage } from '../pages/CronometroPage';
import { AssetPage } from '../pages/AssetPage';
import { PianificazionePage } from '../pages/PianificazionePage';
import { CapturePage } from '../pages/CapturePage';
import { UsersPage } from '../pages/admin/UsersPage';
import { RolesPage } from '../pages/admin/RolesPage';
import { SettingsLayout } from '../pages/admin/SettingsLayout';
import { GeneralSettings } from '../pages/admin/GeneralSettings';
import { LabelsSettings } from '../pages/admin/LabelsSettings';
import { TerminologySettings } from '../pages/admin/TerminologySettings';
import { CustomFieldsSettings } from '../pages/admin/CustomFieldsSettings';
import { TemplatesSettings } from '../pages/admin/TemplatesSettings';
import { NumbersSettings } from '../pages/admin/NumbersSettings';
import { BillingContent } from '../pages/admin/BillingPage';
import { SuperAdminPage } from '../pages/admin/SuperAdminPage';
import '../theme/nav2.css';

/** Rotte fisse (liste + dettagli). `perm` = permesso minimo per accedere (route-guard). */
interface RouteDef { path: string; render: () => JSX.Element; perm?: PermissionKey }
const ROUTES: RouteDef[] = [
  { path: '/today', render: () => <TodayPage />, perm: 'activity:read' },
  { path: '/dashboard', render: () => <DashboardPage />, perm: 'engagement:read' },
  { path: '/planning', render: () => <PianificazionePage />, perm: 'activity:read' },
  { path: '/engagements', render: () => <EngagementsPage />, perm: 'engagement:read' },
  { path: '/time-entries', render: () => <TimeEntriesPage />, perm: 'time_entry:read' },
  { path: '/time-entries/:id', render: () => <TimeEntryDetailPage />, perm: 'time_entry:read' },
  { path: '/work-reports', render: () => <RapportiniPage />, perm: 'work_report:read' },
  { path: '/work-reports/:id', render: () => <RapportinoDetailPage />, perm: 'work_report:read' },
  { path: '/timer', render: () => <CronometroPage />, perm: 'time_entry:read' },
  { path: '/absences', render: () => <AssenzePage />, perm: 'absence:read' },
  { path: '/absences/:id', render: () => <AbsenceDetailPage />, perm: 'absence:read' },
  { path: '/engagements/:id', render: () => <CommessaDetailPage />, perm: 'engagement:read' },
  { path: '/activities', render: () => <AttivitaPage />, perm: 'activity:read' },
  { path: '/activities/:id', render: () => <AttivitaDetailPage />, perm: 'activity:read' },
  { path: '/companies', render: () => <ClientiPage />, perm: 'company:read' },
  { path: '/companies/:id', render: () => <ClienteDetailPage />, perm: 'company:read' },
  { path: '/assets', render: () => <AssetPage />, perm: 'asset:read' },
  { path: '/assets/:id', render: () => <AssetDetailPage />, perm: 'asset:read' },
  { path: '/resources', render: () => <RisorsePage />, perm: 'resource:read' },
  { path: '/resources/:id', render: () => <RisorsaDetailPage />, perm: 'resource:read' },
  { path: '/materials', render: () => <MaterialiPage />, perm: 'material:read' },
  { path: '/materials/:id', render: () => <MaterialeDetailPage />, perm: 'material:read' },
  { path: '/price-list', render: () => <ListinoPage />, perm: 'report:read' },
  { path: '/price-list/:id', render: () => <ListinoItemDetailPage />, perm: 'report:read' },
  { path: '/work-lines', render: () => <LavorazioniPage />, perm: 'report:read' },
  { path: '/work-lines/:id', render: () => <LavorazioneDetailPage />, perm: 'report:read' },
  { path: '/finance/pivot', render: () => <PivotPage />, perm: 'report:read' },
  { path: '/work-orders', render: () => <OrdinativiPage />, perm: 'work_order:read' },
  { path: '/work-orders/:id', render: () => <OrdinativoDetailPage />, perm: 'work_order:read' },
  { path: '/stock', render: () => <MagazzinoPage />, perm: 'stock:read' },
  { path: '/stock/documents', render: () => <DdtPage />, perm: 'stock:read' },
  { path: '/stock/documents/new', render: () => <DdtDetailPage />, perm: 'stock:read' },
  { path: '/stock/documents/:id', render: () => <DdtDetailPage />, perm: 'stock:read' },
  { path: '/warehouses/:id', render: () => <MagazzinoDetailPage />, perm: 'stock:read' },
  { path: '/purchase-orders', render: () => <PurchaseOrdersPage />, perm: 'stock:read' },
  { path: '/purchase-orders/new', render: () => <PurchaseOrderDetailPage />, perm: 'stock:read' },
  { path: '/purchase-orders/:id', render: () => <PurchaseOrderDetailPage />, perm: 'stock:read' },
  { path: '/pick-lists', render: () => <PickListsPage />, perm: 'stock:read' },
  { path: '/pick-lists/new', render: () => <PickListDetailPage />, perm: 'stock:read' },
  { path: '/pick-lists/:id', render: () => <PickListDetailPage />, perm: 'stock:read' },
  { path: '/stock-counts', render: () => <StockCountsPage />, perm: 'stock:read' },
  { path: '/skills', render: () => <SkillsPage />, perm: 'resource:read' },
  { path: '/tax-rates', render: () => <TaxRatesPage />, perm: 'material:read' },
  { path: '/units', render: () => <UnitsPage />, perm: 'material:read' },
  { path: '/sites', render: () => <SitiPage />, perm: 'site:read' },
  { path: '/material-categories', render: () => <CategoriePage />, perm: 'material:read' },
  { path: '/captures', render: () => <CapturePage />, perm: 'capture:read' },
  { path: '/admin/users', render: () => <UsersPage />, perm: 'user:read' },
  { path: '/admin/users/:id', render: () => <UserDetailPage />, perm: 'user:read' },
  { path: '/admin/roles', render: () => <RolesPage />, perm: 'role:read' },
  { path: '/admin/roles/:id', render: () => <RoleDetailPage />, perm: 'role:read' },
  { path: '/admin/settings', render: () => <Redirect to="/admin/settings/general" />, perm: 'settings:read' },
  { path: '/admin/settings/general', render: () => <SettingsLayout active="general"><GeneralSettings /></SettingsLayout>, perm: 'settings:read' },
  { path: '/admin/settings/labels', render: () => <SettingsLayout active="labels"><LabelsSettings /></SettingsLayout>, perm: 'settings:read' },
  { path: '/admin/settings/terminology', render: () => <SettingsLayout active="terminology"><TerminologySettings /></SettingsLayout>, perm: 'settings:read' },
  { path: '/admin/settings/fields', render: () => <SettingsLayout active="fields"><CustomFieldsSettings /></SettingsLayout>, perm: 'settings:read' },
  { path: '/admin/settings/templates', render: () => <SettingsLayout active="templates"><TemplatesSettings /></SettingsLayout>, perm: 'settings:read' },
  { path: '/admin/settings/numbers', render: () => <SettingsLayout active="numbers"><NumbersSettings /></SettingsLayout>, perm: 'settings:read' },
  { path: '/admin/settings/billing', render: () => <SettingsLayout active="billing"><BillingContent /></SettingsLayout>, perm: 'billing:read' },
  { path: '/admin/platform', render: () => <SuperAdminPage /> },
];

const SIDEBAR_KEY = 'sisuite.sidebar';
const RAIL_GROUPS: RailGroup[] = ['lavoro', 'dati', 'sistema'];

function favKey(uid?: string) { return `sisuite.fav.${uid ?? 'anon'}`; }
function recentKey(uid?: string) { return `sisuite.recent.${uid ?? 'anon'}`; }
function readArr(k: string): string[] { try { return JSON.parse(localStorage.getItem(k) ?? '[]'); } catch { return []; } }

export function AppShell() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const { theme, toggle: toggleTheme } = useTheme();
  const history = useHistory();
  const location = useLocation();

  const perms = useMemo(() => new Set<PermissionKey>((user?.permissions ?? []) as PermissionKey[]), [user]);
  const sections = useMemo(() => visibleNav(perms), [perms]);
  const mobile = useMemo(() => visibleMenu(perms, 'mobile'), [perms]);

  const pathname = location.pathname;
  const norm = (r: string) => r.split('?')[0];
  const isActive = (route: string) => { const r = norm(route); return pathname === r || (r !== '/' && pathname.startsWith(r + '/')); };

  // sezione del rail che contiene la rotta attiva
  const activeSectionId = useMemo(() => {
    for (const s of sections) for (const g of s.groups) for (const it of g.items) if (isActive(it.route)) return s.id;
    return sections[0]?.id;
  }, [sections, pathname]);

  const [mini, setMini] = useState<boolean>(() => localStorage.getItem(SIDEBAR_KEY) === '1');
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [omni, setOmni] = useState(false);
  const [fav, setFav] = useState<string[]>(() => readArr(favKey(user?.userId)));

  // recenti: registra la rotta attiva
  useEffect(() => {
    if (!user) return;
    const k = recentKey(user.userId);
    const cur = readArr(k).filter((r) => r !== pathname);
    cur.unshift(pathname);
    localStorage.setItem(k, JSON.stringify(cur.slice(0, 6)));
  }, [pathname, user]);

  // ⌘K / Ctrl+K apre l'omnibox; Esc chiude
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOmni((o) => !o); }
      if (e.key === 'Escape') { setOmni(false); setOpenSection(null); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const toggleMini = () => setMini((m) => { localStorage.setItem(SIDEBAR_KEY, m ? '0' : '1'); return !m; });
  const go = (route: string) => { history.push(route); setOpenSection(null); };
  const toggleFav = (id: string) => setFav((f) => {
    const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
    localStorage.setItem(favKey(user?.userId), JSON.stringify(next));
    return next;
  });

  const defaultRoute = sections[0]?.groups[0]?.items[0]?.route ?? '/today';
  const initials = (user?.fullName ?? '?').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  // voci navigabili di una sezione (no Collegamenti). Se è UNA sola, il click sul
  // rail va dritto alla pagina (es. Cruscotto→Dashboard, Impostazioni→Impostazioni):
  // niente sub-panel ridondante con una sola voce.
  const sectionItems = (s: NavSection) => s.groups.filter((g) => !g.link).flatMap((g) => g.items);
  const onRail = (s: NavSection) => {
    const items = sectionItems(s);
    if (items.length === 1 && items[0]) { setOpenSection(null); go(items[0].route); }
    else setOpenSection((cur) => (cur === s.id ? null : s.id));
  };

  // voce attiva nel rail = sezione aperta (flyout) o, se chiuso, la sezione della rotta
  const railActive = openSection ?? activeSectionId;
  const openSec = sections.find((s) => s.id === (openSection ?? ''));

  // sibling tabs della sezione corrente
  const siblings = useMemo(() => siblingTabs(perms, pathname), [perms, pathname]);
  // raggruppamento a tendine quando le entità sorelle sono tante (es. Anagrafiche)
  const sibGroups = useMemo(() => siblingGroups(perms, pathname), [perms, pathname]);
  const sibFlatCount = sibGroups.reduce((a, g) => a + g.items.length, 0);
  const sibGrouped = sibFlatCount > 9 && sibGroups.filter((g) => g.caption).length > 1;
  const [openSib, setOpenSib] = useState<number | null>(null);

  // preferiti risolti a NavItem
  const allItems = useMemo(() => allNavItems(), []);
  const favItems = fav.map((id) => allItems.find((x) => x.item.id === id)?.item).filter(Boolean) as NavItem[];

  const sectionLabel = (id: string, fallback: string) => t(`navsec.${id}`, { defaultValue: fallback });
  const itemLabel = (it: NavItem) => t(`nav.${it.id}`, { defaultValue: it.label });

  return (
    <>
      <style>{`
        .sisuite-tabbar{ display:flex; }
        @media (min-width: 768px){ .sisuite-tabbar{ display:none !important; } }
      `}</style>

      <div className={`n2${mini ? ' mini' : ''}`}>
        {/* ── RAIL L1 (desktop) ── */}
        <aside className="n2-rail n2-only">
          <div className="n2-brand">
            <div className="mark">s</div>
            <div className="name"><em>si</em>Suite</div>
            <button className="cl" onClick={toggleMini} title={mini ? t('actions.expand', { defaultValue: 'Espandi' }) : t('actions.collapse', { defaultValue: 'Riduci' })}>
              {mini ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
            </button>
          </div>

          {favItems.length > 0 && (
            <button className={`n2-ritem fav${railActive === '__fav' ? ' active' : ''}`} title={t('nav2.favorites', { defaultValue: 'Preferiti' })}
              onClick={() => setOpenSection((s) => (s === '__fav' ? null : '__fav'))}>
              <Star size={18} /><span className="lbl">{t('nav2.favorites', { defaultValue: 'Preferiti' })}</span>
              <span className="chev"><ChevronRight size={14} /></span>
            </button>
          )}

          {RAIL_GROUPS.map((rg) => {
            const secs = sections.filter((s) => s.group === rg);
            if (secs.length === 0) return null;
            return (
              <div key={rg}>
                <div className="n2-rgroup">{t(`navgroup.${rg}`, { defaultValue: RAIL_GROUP_LABEL[rg] })}</div>
                {secs.map((s) => {
                  const I = iconByName(s.icon);
                  const single = sectionItems(s).length === 1;
                  return (
                    <button key={s.id} className={`n2-ritem${railActive === s.id ? ' active' : ''}`} title={sectionLabel(s.id, s.label)}
                      onClick={() => onRail(s)}>
                      <I size={18} /><span className="lbl">{sectionLabel(s.id, s.label)}</span>
                      {!single && <span className="chev"><ChevronRight size={14} /></span>}
                    </button>
                  );
                })}
              </div>
            );
          })}

          <div className="n2-rsp" />
          {user?.isPlatformAdmin && (
            <button className={`n2-ritem${isActive('/admin/platform') ? ' active' : ''}`} title={t('nav.platform', { defaultValue: 'Piattaforma' })} onClick={() => go('/admin/platform')}>
              <ShieldAlert size={18} /><span className="lbl">{t('nav.platform', { defaultValue: 'Piattaforma' })}</span>
            </button>
          )}
          <div className="n2-ruser">
            <div className="av">{initials}</div>
            <div className="who"><div className="nm">{user?.fullName}</div><div className="rl">{user?.dataScope}</div></div>
          </div>
        </aside>

        {/* ── SUB-PANEL L2 (flyout) ── */}
        {(openSec || openSection === '__fav') && (
          <>
            <div className="n2-subback" onClick={() => setOpenSection(null)} />
            <aside className="n2-sub n2-only">
              {openSection === '__fav' ? (
                <>
                  <div className="n2-sub-h"><div className="ti">{t('nav2.favorites', { defaultValue: 'Preferiti' })}</div>
                    <div className="ct">{favItems.length}</div>
                    <button className="x" onClick={() => setOpenSection(null)}><X size={16} /></button></div>
                  <div className="n2-sub-b">
                    {favItems.map((it) => { const I = iconByName(it.icon); return (
                      <button key={it.id} className={`n2-si${isActive(it.route) ? ' active' : ''}`} onClick={() => go(it.route)}>
                        <I className="li" /><span>{itemLabel(it)}</span>
                        <span className={`pin on`} onClick={(e) => { e.stopPropagation(); toggleFav(it.id); }}><Star /></span>
                      </button>
                    ); })}
                  </div>
                </>
              ) : openSec && (
                <>
                  <div className="n2-sub-h"><div className="ti">{sectionLabel(openSec.id, openSec.label)}</div>
                    <div className="ct">{openSec.groups.filter((g) => !g.link).reduce((a, g) => a + g.items.length, 0)}</div>
                    <button className="x" onClick={() => setOpenSection(null)}><X size={16} /></button></div>
                  <div className="n2-sub-b">
                    {openSec.groups.map((g, gi) => (
                      <div key={gi}>
                        {g.caption && <div className={`n2-sg${g.link ? ' link' : ''}`}>{g.link && <CornerDownRight />}{g.caption}</div>}
                        {g.items.map((it) => {
                          const I = iconByName(it.icon);
                          if (it.soon) return (
                            <div key={it.id} className="n2-si soon"><I className="li" /><span>{itemLabel(it)}</span><span className="badge">{t('nav2.soon', { defaultValue: 'PRESTO' })}</span></div>
                          );
                          if (g.link) return (
                            <button key={it.id} className="n2-si link" onClick={() => go(it.route)}><I className="li" /><span>{itemLabel(it)}</span><ExternalLink className="ext" /></button>
                          );
                          return (
                            <button key={it.id} className={`n2-si${isActive(it.route) ? ' active' : ''}`} onClick={() => go(it.route)}>
                              <I className="li" /><span>{itemLabel(it)}</span>
                              {it.tag ? <span className="tag">{it.tag}</span>
                                : <span className={`pin${fav.includes(it.id) ? ' on' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFav(it.id); }}><Star /></span>}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </aside>
          </>
        )}

        {/* ── MAIN ── */}
        <div className="n2-main">
          <div className="n2-topbar n2-only">
            <div style={{ width: 8 }} />
            <div className="n2-omni" onClick={() => setOmni(true)}>
              <Sparkles className="sp" /><span className="ph">{t('nav2.search', { defaultValue: 'Cerca o chiedi all’AI…' })}</span>
              <span className="two">{t('nav2.two', { defaultValue: 'cerca + comando AI' })}</span><span className="kbd">⌘K</span>
            </div>
            <NotificationsBell />
            <button className="n2-ico" onClick={toggleTheme} title={t('actions.theme', { defaultValue: 'Tema' })}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button className="n2-ico" onClick={logout} title={t('actions.logout', { defaultValue: 'Esci' })}><LogOut size={18} /></button>
          </div>

          {sibGrouped ? (
            <div className="n2-siblings n2-grouped n2-only">
              {sibGroups.map((g, gi) => {
                const activeHere = g.items.some((it) => isActive(it.route));
                return (
                  <div key={g.caption ?? gi} className="n2-sibg">
                    <button className={`n2-sib${activeHere ? ' on' : ''}`} onClick={() => setOpenSib(openSib === gi ? null : gi)}>
                      {g.caption ?? '—'}<ChevronDown size={13} style={{ marginLeft: 2 }} />
                    </button>
                    {openSib === gi && (
                      <>
                        <div className="n2-sibg-back" onClick={() => setOpenSib(null)} />
                        <div className="n2-sibg-menu">
                          {g.items.map((it) => { const I = iconByName(it.icon); return (
                            <button key={it.id} className={`n2-sibg-item${isActive(it.route) ? ' on' : ''}`}
                              onClick={() => { setOpenSib(null); go(it.route); }}><I size={15} />{itemLabel(it)}</button>
                          ); })}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : siblings.length > 1 && (
            <div className="n2-siblings n2-only">
              {siblings.map((it) => { const I = iconByName(it.icon); return (
                <button key={it.id} className={`n2-sib${isActive(it.route) ? ' on' : ''}`} onClick={() => go(it.route)}><I size={14} />{itemLabel(it)}</button>
              ); })}
            </div>
          )}

          <div className="n2-outlet">
            <IonRouterOutlet>
              {ROUTES.map((r) => (
                <Route key={r.path} path={r.path} exact render={() => (
                  r.perm && !perms.has(r.perm) ? <Redirect to={defaultRoute} /> : r.render()
                )} />
              ))}
              <Route exact path="/"><Redirect to={defaultRoute} /></Route>
            </IonRouterOutlet>

            {mobile.length > 0 && (
              <>
                <button className="sisuite-tabbar" aria-label="Cattura" onClick={() => go('/captures')} style={{
                  position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 38, zIndex: 60,
                  width: 58, height: 58, borderRadius: 18, border: '4px solid var(--card)',
                  background: 'var(--flow-grad)', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-pop)', cursor: 'pointer',
                }}><Mic size={24} /></button>
                <div className="sisuite-tabbar ds-tabbar" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 64, alignItems: 'stretch', zIndex: 50 }}>
                  {mobile.map((m: MenuItem) => {
                    const I = MENU_ICON[m.id] ?? Circle;
                    return (
                      <div key={m.id} className={`ds-tab${isActive(m.route) ? ' active' : ''}`} onClick={() => go(m.route)}
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer', fontWeight: 600 }}>
                        <I size={22} /><span style={{ fontSize: 11 }}>{t(`nav.${m.id}`, { defaultValue: m.label })}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── OMNIBOX ⌘K ── */}
        {omni && <OmniBox onClose={() => setOmni(false)} onGo={(r) => { setOmni(false); go(r); }}
          perms={perms} uid={user?.userId} />}
      </div>
    </>
  );
}

/* ── Omnibox: ricerca voci di menu (+ slot AI placeholder, Blocco F) ── */
function OmniBox({ onClose, onGo, perms, uid }: {
  onClose: () => void; onGo: (route: string) => void; perms: ReadonlySet<PermissionKey>; uid?: string;
}) {
  const { t } = useTranslation();
  const itemLabel = (it: NavItem) => t(`nav.${it.id}`, { defaultValue: it.label });
  const sectionLabel = (id: string, fb: string) => t(`navsec.${id}`, { defaultValue: fb });
  const [q, setQ] = useState('');
  const all = useMemo(() => allNavItems().filter((x) => perms.has(x.item.permission)), [perms]);
  const recents = readArr(recentKey(uid));
  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) {
      const recItems = recents.map((r) => all.find((x) => x.item.route.split('?')[0] === r)).filter(Boolean) as typeof all;
      return { kind: 'recent' as const, list: recItems.slice(0, 6) };
    }
    return { kind: 'results' as const, list: all.filter((x) => itemLabel(x.item).toLowerCase().includes(term) || sectionLabel(x.section.id, x.section.label).toLowerCase().includes(term)).slice(0, 12) };
  }, [q, all]);

  return (
    <div className="n2-omni-back" onClick={onClose}>
      <div className="n2-omni-modal" onClick={(e) => e.stopPropagation()}>
        <div className="n2-omni-in">
          <Search size={18} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('nav2.search', { defaultValue: 'Cerca o chiedi all’AI…' })}
            onKeyDown={(e) => { if (e.key === 'Enter' && results.list[0]) onGo(results.list[0].item.route); }} />
          <span className="kbd">esc</span>
        </div>
        <div className="n2-omni-res">
          <div className="n2-omni-cap">{results.kind === 'recent' ? t('nav2.recents', { defaultValue: 'Recenti' }) : t('nav2.results', { defaultValue: 'Risultati' })}</div>
          {results.list.length === 0 ? <div className="n2-omni-empty">{t('nav2.noResults', { defaultValue: 'Nessun risultato' })}</div>
            : results.list.map((x, i) => { const I = iconByName(x.item.icon); return (
              <div key={x.item.id} className={`n2-omni-row${i === 0 && q ? ' cur' : ''}`} onClick={() => onGo(x.item.route)}>
                <I /><span>{itemLabel(x.item)}</span><span className="sec">{sectionLabel(x.section.id, x.section.label)}</span>
              </div>
            ); })}
        </div>
      </div>
    </div>
  );
}
