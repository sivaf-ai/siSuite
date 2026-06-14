/** SettingsLayout — guscio della sezione "Impostazioni" (mock 15/16/17/18):
 *  page-head + griglia con sotto-navigazione a sinistra (Generale, Stati & etichette,
 *  Numerazioni, Piano & fatturazione) e il contenuto della sezione a destra. */
import type { ReactNode } from 'react';
import { useHistory } from 'react-router';
import { Settings, Tags, Hash, CreditCard, Languages, ListPlus, FileStack, type LucideIcon } from 'lucide-react';
import { Page } from '../../components/Page';
import { useAuth } from '../../auth/AuthContext';

export type SettingsSection = 'general' | 'labels' | 'terminology' | 'fields' | 'templates' | 'numbers' | 'billing';

const NAV: { key: SettingsSection; label: string; icon: LucideIcon; route: string; perm: string; title: string; sub: string }[] = [
  { key: 'general', label: 'Generale', icon: Settings, route: '/admin/settings/general', perm: 'settings:read', title: 'Impostazioni', sub: "Configurazione generale dell'organizzazione" },
  { key: 'labels', label: 'Stati & etichette', icon: Tags, route: '/admin/settings/labels', perm: 'settings:read', title: 'Stati & etichette', sub: 'Personalizza nomi, colori e ordine — la logica resta sui canonici' },
  { key: 'terminology', label: 'Terminologia', icon: Languages, route: '/admin/settings/terminology', perm: 'settings:read', title: 'Terminologia', sub: 'Le parole di dominio della tua azienda (es. Commessa → Cantiere)' },
  { key: 'fields', label: 'Campi personalizzati', icon: ListPlus, route: '/admin/settings/fields', perm: 'settings:read', title: 'Campi personalizzati', sub: 'Aggiungi campi alle tue entità senza codice — compaiono nei form' },
  { key: 'templates', label: 'Modelli commessa', icon: FileStack, route: '/admin/settings/templates', perm: 'engagement:read', title: 'Modelli commessa', sub: 'Crea nuove commesse da una struttura-tipo (fasi, attività, dipendenze)' },
  { key: 'numbers', label: 'Numerazioni', icon: Hash, route: '/admin/settings/numbers', perm: 'settings:read', title: 'Numerazioni', sub: 'Serie e formati degli identificativi visibili' },
  { key: 'billing', label: 'Piano & fatturazione', icon: CreditCard, route: '/admin/settings/billing', perm: 'billing:read', title: 'Piano & fatturazione', sub: 'Abbonamento, consumo AI e piani disponibili' },
];

export function SettingsLayout({ active, children }: { active: SettingsSection; children: ReactNode }) {
  const history = useHistory();
  const { user } = useAuth();
  const can = (p: string) => !!user?.permissions.includes(p as never);
  const items = NAV.filter((n) => can(n.perm));
  const current = NAV.find((n) => n.key === active) ?? NAV[0]!;

  return (
    <Page title="Impostazioni">
      <div className="page-head">
        <div>
          <h1>{current.title}</h1>
          <div className="sub">{current.sub}</div>
        </div>
      </div>
      <div className="settings-grid">
        <div className="set-nav">
          {items.map((n) => {
            const I = n.icon;
            return (
              <a key={n.key} className={n.key === active ? 'on' : ''} onClick={() => history.push(n.route)}>
                <I size={17} />{n.label}
              </a>
            );
          })}
        </div>
        <div>{children}</div>
      </div>
    </Page>
  );
}
