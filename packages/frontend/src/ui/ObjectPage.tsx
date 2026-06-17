/**
 * ObjectPage / ObjectBox / RelatedTabs — archetipo SCHEDA riusabile (mock 44, Parte 5).
 * - ObjectPage: header sticky opaco con SOLO Salva/Annulla; titolo + code pill + StatusPill.
 * - ObjectBox: box con titolo e label nel bordo; azione AI opzionale nel bordo.
 * - RelatedTabs: tabelle correlate come strip di tab in fondo.
 * Stili: datapages.css (scope .dsx). Una pagina per crea+vedi+modifica.
 */
import type { ReactNode } from 'react';
import { ChevronLeft, Check, Sparkles } from 'lucide-react';
import type { LucideIcon } from './icons';
import '../theme/datapages.css';

export function ObjectPage({
  backLabel, onBack, title, code, status, onSave, onCancel, canSave = true, saving = false, children,
}: {
  backLabel: string; onBack: () => void; title: ReactNode;
  code?: ReactNode; status?: ReactNode;
  onSave?: () => void; onCancel?: () => void; canSave?: boolean; saving?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="dsx">
      <div className="op-head">
        <button className="back" onClick={onBack}><ChevronLeft size={16} /> {backLabel}</button>
        <h1>{title}</h1>
        {code && <span className="code">{code}</span>}
        {status}
        <div className="acts">
          {onCancel && <button className="btn btn-ghost" onClick={onCancel}>Annulla</button>}
          {onSave && canSave && <button className="btn btn-primary" onClick={onSave} disabled={saving}><Check size={16} /> Salva</button>}
        </div>
      </div>
      {children}
    </div>
  );
}

export function ObjectBox({
  icon: Icon, title, subtitle, action, children,
}: {
  icon: LucideIcon; title: ReactNode; subtitle?: string;
  action?: { label: string; onClick?: () => void; tip?: string };
  children: ReactNode;
}) {
  return (
    <div className="obox">
      <span className="obox-t"><Icon /> {title}{subtitle && <span style={{ fontWeight: 500, color: 'var(--ink-faint)', fontSize: 11, marginLeft: 4 }}>{subtitle}</span>}</span>
      {action && <button className="obox-act" data-tip={action.tip} onClick={action.onClick}><Sparkles /> {action.label}</button>}
      {children}
    </div>
  );
}

export interface RelTab { key: string; label: string; icon: LucideIcon; count?: number; content: ReactNode }

export function RelatedTabs({ tabs, active, onChange }: { tabs: RelTab[]; active: string; onChange: (k: string) => void }) {
  const cur = tabs.find((t) => t.key === active) ?? tabs[0];
  return (
    <div className="card" style={{ padding: '0 16px 14px' }}>
      <div className="reltabbar">
        {tabs.map((t) => {
          const I = t.icon;
          return (
            <button key={t.key} className={`rtab${active === t.key ? ' on' : ''}`} onClick={() => onChange(t.key)}>
              <I /> {t.label}{t.count != null && <span className="cnt">{t.count}</span>}
            </button>
          );
        })}
      </div>
      {cur?.content}
    </div>
  );
}
