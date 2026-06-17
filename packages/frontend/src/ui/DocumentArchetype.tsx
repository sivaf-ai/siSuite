/**
 * DocumentArchetype — pezzi riusabili per l'archetipo DOCUMENTO (brief Parte 5):
 * testata + sezioni-righe (manodopera/attrezzature/materiali/…) + striscia totali
 * costi/ricavi/margine. Usato dal Rapportino (Blocco F) e dal Magazzino/DDT (Blocco H).
 */
import type { ReactNode } from 'react';
import { Money } from './Num';
import type { LucideIcon } from './icons';

export interface DocRow { label: string; date?: string | null; qty?: number; unit?: string; cost?: number; revenue?: number }
export interface DocSection { key: string; label: string; kind?: 'cost' | 'revenue' | 'both'; rows: DocRow[]; cost?: number; revenue?: number }

const itDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('it-IT') : '—');

/** Una sezione-righe del documento, con sottototale. */
export function DocSectionTable({ section, icon: Icon, showRevenue = true }: { section: DocSection; icon?: LucideIcon; showRevenue?: boolean }) {
  const rev = showRevenue && section.kind !== 'cost';
  return (
    <div className="obox">
      <span className="obox-t">{Icon && <Icon />} {section.label}<span style={{ fontWeight: 500, color: 'var(--ink-faint)', fontSize: 11, marginLeft: 6 }}>{section.rows.length} righe</span></span>
      <table className="subt">
        <thead><tr>
          <th>Voce</th><th>Data</th><th className="num">Q.tà</th><th className="num">Costo</th>{rev && <th className="num">Ricavo</th>}
        </tr></thead>
        <tbody>
          {section.rows.map((r, i) => (
            <tr key={i}>
              <td>{r.label}</td>
              <td className="mono faint">{itDate(r.date)}</td>
              <td className="num mono">{r.qty != null ? `${r.qty.toLocaleString('it-IT')}${r.unit ? ' ' + r.unit : ''}` : '—'}</td>
              <td className="num"><Money value={r.cost ?? 0} /></td>
              {rev && <td className="num"><Money value={r.revenue ?? 0} /></td>}
            </tr>
          ))}
          {section.rows.length === 0 && <tr><td colSpan={rev ? 5 : 4}><div className="dsx-empty">Nessuna riga.</div></td></tr>}
          {section.rows.length > 0 && (
            <tr style={{ fontWeight: 700, borderTop: '2px solid var(--line)' }}>
              <td colSpan={3} className="num">Sottototale</td>
              <td className="num"><Money value={section.cost ?? 0} /></td>
              {rev && <td className="num"><Money value={section.revenue ?? 0} /></td>}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Striscia totali costi/ricavi/margine (%). */
export function TotalsStrip({ cost, revenue, margin, marginPct, extra }: {
  cost: number; revenue: number; margin: number; marginPct: number | null; extra?: ReactNode;
}) {
  const pos = margin >= 0;
  const cell = (label: string, node: ReactNode, color?: string) => (
    <div style={{ flex: 1, padding: '12px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ink-faint)' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, marginTop: 4, color }}>{node}</div>
    </div>
  );
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap', marginBottom: 14 }}>
      {cell('Ricavi', <Money value={revenue} />)}
      {cell('Costi', <Money value={cost} />)}
      {cell('Margine', <Money value={margin} />, pos ? 'var(--success)' : 'var(--danger)')}
      {cell('Margine %', marginPct != null ? `${marginPct.toLocaleString('it-IT')}%` : '—', pos ? 'var(--success)' : 'var(--danger)')}
      {extra}
    </div>
  );
}
