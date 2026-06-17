/**
 * EntityList — archetipo LISTA riusabile (mock 41/44, brief Parte 5).
 * Righe a 2 livelli o 1 livello, viste (filtri salvati), toolbar a sole icone
 * con tooltip, paginazione. `mode`: 'manage' (default) | 'pick-single' | 'pick-multi'
 * per riuso in selezione pop-up. Selezione mostrata come NUMERO; nessuna
 * icona-azione sulle righe (brief Parte 4). Stili: datapages.css (scope .dsx).
 */
import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import type { LucideIcon } from './icons';
import { Loading, ErrorBox } from '../components/Page';
import '../theme/datapages.css';

export interface ListView { key: string; label: string; count?: number }
export interface ListColumn<T> { key: string; header: string; sub?: string; num?: boolean; render: (row: T) => ReactNode }
export interface ListAction { key: string; icon: LucideIcon; tip: string; onClick?: () => void; disabled?: boolean; variant?: 'ai' | 'primary' }

interface Props<T extends { id: string }> {
  title?: string;
  subtitle?: string;
  views?: ListView[];
  activeView?: string;
  onView?: (k: string) => void;
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  /** azioni a icona dopo la ricerca (Filtri, Colonne, AI…). */
  leftActions?: ListAction[];
  /** azioni a icona a destra (Importa, Esporta, Assegna, Nuovo +). */
  rightActions?: ListAction[];
  columns: ListColumn<T>[];
  rows: T[];
  loading?: boolean;
  error?: string | null;
  onRowClick?: (row: T) => void;
  mode?: 'manage' | 'pick-single' | 'pick-multi';
  selectedIds?: string[];
  onToggleSelect?: (row: T) => void;
  total?: number;
  limit?: number;
  offset?: number;
  onPage?: (offset: number) => void;
  emptyText?: string;
}

function Tib({ a }: { a: ListAction }) {
  const I = a.icon;
  return (
    <button className={`tib${a.variant ? ' ' + a.variant : ''}`} data-tip={a.tip} onClick={a.onClick} disabled={a.disabled}>
      <I />
    </button>
  );
}

export function EntityList<T extends { id: string }>(p: Props<T>) {
  const mode = p.mode ?? 'manage';
  const pick = mode !== 'manage';
  const selected = new Set(p.selectedIds ?? []);
  const page = p.limit ? Math.floor((p.offset ?? 0) / p.limit) + 1 : 1;
  const pages = p.total && p.limit ? Math.max(1, Math.ceil(p.total / p.limit)) : 1;
  const colSpan = p.columns.length + (pick ? 1 : 0);

  return (
    <div className="dsx">
      {p.title && <div className="lh"><h1>{p.title}</h1>{p.subtitle && <span className="sub">{p.subtitle}</span>}</div>}

      {p.views && p.views.length > 0 && (
        <div className="views">
          {p.views.map((v) => (
            <span key={v.key} className={`viewchip${p.activeView === v.key ? ' on' : ''}`} onClick={() => p.onView?.(v.key)}>
              {v.label} {v.count != null && <span className="c">{v.count}</span>}
            </span>
          ))}
        </div>
      )}

      {(p.onSearch || p.leftActions || p.rightActions) && (
        <div className="dsx-toolbar">
          {p.onSearch && (
            <div className="dsx-search">
              <Search size={16} />
              <input placeholder={p.searchPlaceholder ?? 'Cerca…'} value={p.search ?? ''} onChange={(e) => p.onSearch?.(e.target.value)} />
            </div>
          )}
          {(p.leftActions ?? []).map((a) => <Tib key={a.key} a={a} />)}
          {pick && selected.size > 0 && <span className="chip" style={{ marginLeft: 6 }}>{selected.size} selezionati</span>}
          <div className="spacer" />
          {(p.rightActions ?? []).map((a, i) => (
            <span key={a.key} style={{ display: 'contents' }}>
              {i === (p.rightActions ?? []).length - 1 && (p.rightActions ?? []).length > 1 && <span className="tdiv" />}
              <Tib a={a} />
            </span>
          ))}
        </div>
      )}

      {p.loading ? <Loading /> : p.error ? <ErrorBox message={p.error} /> : (
        <div className="card">
          <table className="t">
            <thead><tr>
              {pick && <th style={{ width: 40 }} />}
              {p.columns.map((c) => (
                <th key={c.key} className={c.num ? 'num' : undefined}>{c.header}{c.sub && <span className="h2">{c.sub}</span>}</th>
              ))}
            </tr></thead>
            <tbody>
              {p.rows.map((row) => (
                <tr key={row.id} className={selected.has(row.id) ? 'sel' : undefined}
                  onClick={() => (pick ? p.onToggleSelect?.(row) : p.onRowClick?.(row))}>
                  {pick && <td style={{ width: 40 }}><input type={mode === 'pick-multi' ? 'checkbox' : 'radio'} checked={selected.has(row.id)} readOnly /></td>}
                  {p.columns.map((c) => <td key={c.key} className={c.num ? 'num' : undefined}>{c.render(row)}</td>)}
                </tr>
              ))}
              {p.rows.length === 0 && <tr><td colSpan={colSpan}><div className="dsx-empty">{p.emptyText ?? 'Nessun elemento.'}</div></td></tr>}
            </tbody>
          </table>
          {p.total != null && p.total > 0 && p.limit != null && (
            <div className="pager">
              <span>{p.total} · pagina {page} di {pages}</span>
              <div className="pgs">
                <button className="pgbtn" disabled={page <= 1} onClick={() => p.onPage?.(Math.max(0, (p.offset ?? 0) - p.limit!))}>‹</button>
                <span className="pgbtn on">{page}</span>
                <button className="pgbtn" disabled={page >= pages} onClick={() => p.onPage?.((p.offset ?? 0) + p.limit!)}>›</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
