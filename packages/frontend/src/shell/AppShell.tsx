/**
 * AppShell — le DUE shell del brief:
 *   - desktop: sidebar (IonSplitPane) con il menu raggruppato
 *   - mobile : tab bar in basso
 * Entrambe derivano le voci da visibleMenu(permessi, shell): una voce appare
 * SOLO se l'utente ha la PermissionKey. (La sicurezza vera è API+RLS.)
 */
import {
  IonContent, IonMenu, IonRouterOutlet, IonSplitPane, IonButton,
} from '@ionic/react';
import { useState, type CSSProperties } from 'react';
import { Redirect, Route } from 'react-router-dom';
import { useHistory, useLocation } from 'react-router';
import { LogOut, Mic, Circle, ShieldAlert, PanelLeftClose, PanelLeftOpen, Sun, Moon } from 'lucide-react';
import { MENU_ICON } from '../ui/icons';
import { useTranslation } from 'react-i18next';
import { visibleMenu, type MenuItem, type PermissionKey } from '@sisuite/shared';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { NotificationsBell } from '../ui/NotificationsBell';
import { TodayPage } from '../pages/TodayPage';
import { DashboardPage } from '../pages/DashboardPage';
import { EngagementsPage } from '../pages/EngagementsPage';
import { CommessaDetailPage } from '../pages/CommessaDetailPage';
import { AttivitaDetailPage } from '../pages/AttivitaDetailPage';
import { ClientiPage } from '../pages/ClientiPage';
import { ClienteDetailPage } from '../pages/ClienteDetailPage';
import { RisorsePage } from '../pages/RisorsePage';
import { RisorsaDetailPage } from '../pages/RisorsaDetailPage';
import { MaterialiPage } from '../pages/MaterialiPage';
import { TimeEntriesPage } from '../pages/TimeEntriesPage';
import { MagazzinoPage } from '../pages/MagazzinoPage';
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
import { PlaceholderPage } from '../pages/PlaceholderPage';

const GROUP_LABEL: Record<NonNullable<MenuItem['group']>, string> = {
  lavoro: 'Lavoro',
  anagrafiche: 'Anagrafiche',
  amministrazione: 'Amministrazione',
};

/** voci di menu che sono ENTITÀ di dominio → usano il glossario `terms` (override-abili per-tenant). */
const TERM_OF: Record<string, string> = {
  engagements: 'engagement_plural', resources: 'resource_plural', materials: 'material_plural',
  companies: 'customer_plural', assets: 'asset_plural', captures: 'capture_plural', 'captures-inbox': 'capture_plural',
};

/** Rotte fisse dell'app (liste + dettagli). Le voci di MENU controllano solo
 *  la NAVIGAZIONE visibile (dai permessi); le rotte di dettaglio non sono nel menu. */
const ROUTES: { path: string; render: () => JSX.Element }[] = [
  { path: '/today', render: () => <TodayPage /> },
  { path: '/dashboard', render: () => <DashboardPage /> },
  { path: '/planning', render: () => <PianificazionePage /> },
  { path: '/engagements', render: () => <EngagementsPage /> },
  { path: '/time-entries', render: () => <TimeEntriesPage /> },
  { path: '/engagements/:id', render: () => <CommessaDetailPage /> },
  { path: '/activities/:id', render: () => <AttivitaDetailPage /> },
  { path: '/companies', render: () => <ClientiPage /> },
  { path: '/companies/:id', render: () => <ClienteDetailPage /> },
  { path: '/assets', render: () => <AssetPage /> },
  { path: '/resources', render: () => <RisorsePage /> },
  { path: '/resources/:id', render: () => <RisorsaDetailPage /> },
  { path: '/materials', render: () => <MaterialiPage /> },
  { path: '/stock', render: () => <MagazzinoPage /> },
  { path: '/agenda', render: () => <PlaceholderPage title="Agenda" /> },
  { path: '/captures', render: () => <CapturePage /> },
  { path: '/admin/users', render: () => <UsersPage /> },
  { path: '/admin/roles', render: () => <RolesPage /> },
  { path: '/admin/settings', render: () => <Redirect to="/admin/settings/general" /> },
  { path: '/admin/settings/general', render: () => <SettingsLayout active="general"><GeneralSettings /></SettingsLayout> },
  { path: '/admin/settings/labels', render: () => <SettingsLayout active="labels"><LabelsSettings /></SettingsLayout> },
  { path: '/admin/settings/terminology', render: () => <SettingsLayout active="terminology"><TerminologySettings /></SettingsLayout> },
  { path: '/admin/settings/fields', render: () => <SettingsLayout active="fields"><CustomFieldsSettings /></SettingsLayout> },
  { path: '/admin/settings/templates', render: () => <SettingsLayout active="templates"><TemplatesSettings /></SettingsLayout> },
  { path: '/admin/settings/numbers', render: () => <SettingsLayout active="numbers"><NumbersSettings /></SettingsLayout> },
  { path: '/admin/settings/billing', render: () => <SettingsLayout active="billing"><BillingContent /></SettingsLayout> },
  { path: '/admin/platform', render: () => <SuperAdminPage /> },
];

const SIDEBAR_KEY = 'sisuite.sidebar';
function initialCollapsed(): boolean {
  const s = localStorage.getItem(SIDEBAR_KEY);
  if (s === '1') return true;
  if (s === '0') return false;
  return typeof window !== 'undefined' && window.innerWidth < 1024; // schermi stretti: collassata di default
}

export function AppShell() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const { theme, toggle: toggleTheme } = useTheme();
  const history = useHistory();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState<boolean>(() => initialCollapsed());
  const toggleSidebar = () => setCollapsed((c) => { localStorage.setItem(SIDEBAR_KEY, c ? '0' : '1'); return !c; });
  const sideW = collapsed ? '64px' : '248px';
  const perms = new Set<PermissionKey>((user?.permissions ?? []) as PermissionKey[]);
  const desktop = visibleMenu(perms, 'desktop');
  const mobile = visibleMenu(perms, 'mobile');

  const defaultRoute = desktop[0]?.route ?? mobile[0]?.route ?? '/today';
  const groups = ['lavoro', 'anagrafiche', 'amministrazione'] as const;
  const initials = (user?.fullName ?? '?').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  const isActive = (route: string) =>
    location.pathname === route || (route !== '/' && location.pathname.startsWith(route + '/'));
  const go = (route: string) => history.push(route);

  return (
    <>
      <style>{`
        .sisuite-tabbar{ display:flex; }
        @media (min-width: 768px){ .sisuite-tabbar{ display:none !important; } }
        ion-menu::part(container){ box-shadow:none; }
      `}</style>

      <IonSplitPane contentId="main" when="md"
        style={{ '--side-min-width': sideW, '--side-max-width': sideW, '--side-width': sideW } as CSSProperties}>
        {/* ── Sidebar desktop (scura) ── */}
        <IonMenu contentId="main">
          <IonContent style={{ '--background': 'var(--sidebar)' } as CSSProperties}>
            <div className={`ds-sidebar${collapsed ? ' collapsed' : ''}`}>
              <div className="ds-brand">
                <div className="mark">s</div>
                <div className="name">siSuite</div>
                <button className="ds-iconbtn toggle" onClick={toggleSidebar} aria-label={collapsed ? t('actions.expand') : t('actions.collapse')} title={collapsed ? t('actions.expand') : t('actions.collapse')}>
                  {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                </button>
              </div>

              {groups.map((g) => {
                const items = desktop.filter((m) => m.group === g);
                if (items.length === 0) return null;
                return (
                  <div key={g}>
                    <div className="ds-navgroup">{t(`group.${g}`, { defaultValue: GROUP_LABEL[g] })}</div>
                    {items.map((m) => {
                      const I = MENU_ICON[m.id] ?? Circle;
                      const label = TERM_OF[m.id]
                        ? t(`terms.${TERM_OF[m.id]}`, { defaultValue: t(`nav.${m.id}`, { defaultValue: m.label }) })
                        : t(`nav.${m.id}`, { defaultValue: m.label });
                      return (
                        <div key={m.id} className={`ds-navitem${isActive(m.route) ? ' active' : ''}`} data-tip={label} onClick={() => go(m.route)}>
                          <I size={18} />
                          <span>{label}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {user?.isPlatformAdmin && (
                <div>
                  <div className="ds-navgroup">Piattaforma</div>
                  <div className={`ds-navitem${isActive('/admin/platform') ? ' active' : ''}`} data-tip={t('nav.platform')} onClick={() => go('/admin/platform')}>
                    <ShieldAlert size={18} />
                    <span>{t('nav.platform')}</span>
                  </div>
                </div>
              )}

              <div className="ds-side-user">
                <div className="avatar" style={{ width: 34, height: 34, fontSize: 13 }}>{initials}</div>
                <div className="who" style={{ flex: 1, minWidth: 0 }}>
                  <div className="nm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.fullName}</div>
                  <div className="rl">{user?.dataScope}</div>
                </div>
                <NotificationsBell />
                <button className="ds-iconbtn" onClick={toggleTheme} aria-label={t('actions.theme')} title={t('actions.theme')}>
                  {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </button>
                <IonButton fill="clear" size="small" onClick={logout} aria-label={t('actions.logout')} style={{ '--color': '#8A8F9B' } as CSSProperties}>
                  <LogOut size={18} />
                </IonButton>
              </div>
            </div>
          </IonContent>
        </IonMenu>

        {/* ── Router outlet + tab bar mobile ── */}
        <div id="main" style={{ position: 'relative', height: '100%' }}>
          <IonRouterOutlet>
            {ROUTES.map((r) => (
              <Route key={r.path} path={r.path} exact render={r.render} />
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
              <div className="sisuite-tabbar ds-tabbar" style={{
                position: 'absolute', left: 0, right: 0, bottom: 0, height: 64,
                alignItems: 'stretch', zIndex: 50,
              }}>
                {mobile.map((m) => {
                  const I = MENU_ICON[m.id] ?? Circle;
                  return (
                    <div key={m.id} className={`ds-tab${isActive(m.route) ? ' active' : ''}`} onClick={() => go(m.route)}
                      style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer', fontWeight: 600 }}>
                      <I size={22} />
                      <span style={{ fontSize: 11 }}>{m.label}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </IonSplitPane>
    </>
  );
}
