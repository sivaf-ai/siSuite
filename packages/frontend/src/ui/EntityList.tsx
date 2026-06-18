/**
 * EntityList — archetipo LISTA riusabile (mock 41/44/«Aziende», brief Parte 5).
 * - Testata su UNA riga: titolo+sottotitolo a sinistra, VISTE (filtri salvati) a destra.
 * - Checkbox per riga + checkbox di testata (seleziona tutti / indeterminato).
 * - Toolbar a icone con AZIONI STANDARD dipendenti dalla selezione:
 *     0 selez. → solo Nuovo (+ filtri/colonne/AI)
 *     1 selez. → Modifica · Duplica · Esporta · Elimina
 *     >1 selez. → Esporta · Elimina (modifica/duplica disabilitati)
 * - `mode`: 'manage' (default, con selezione+azioni) | 'pick-single' | 'pick-multi'
 *   (selezione controllata dal padre per i pop-up di scelta).
 * Stili: datapages.css (scope .dsx).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Search, Pencil, Copy, Download, Trash2, SlidersHorizontal, Columns3, Sparkles } from 'lucide-react';
import type { LucideIcon } from './icons';
import { Loading, ErrorBox } from '../components/Page';
import { downloadXlsx } from '../lib/xlsx';
import { FieldPicker, FieldPickerStyles, type FieldOpt } from './FieldPicker';
import { ExportDialog } from './ExportDialog';
import '../theme/datapages.css';

export interface ListView { key: string; label: string; count?: number }
export interface ListColumn<T> {
  key: string; header: string; sub?: string; num?: boolean; render: (row: T) => ReactNode;
  /** valore grezzo per l'export Excel (se assente la colonna non viene esportata). */
  value?: (row: T) => string | number | null | undefined;
}
export interface ListAction { key: string; icon: LucideIcon; tip: string; onClick?: () => void; disabled?: boolean; variant?: 'ai' | 'primary' | 'danger' }

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
  /** azioni a icona a destra (Importa, Nuovo +…). */
  rightActions?: ListAction[];
  columns: ListColumn<T>[];
  rows: T[];
  loading?: boolean;
  error?: string | null;
  onRowClick?: (row: T) => void;

  /* ── selezione + azioni standard (mode 'manage') ── */
  /** mostra le checkbox e le azioni standard (default true in 'manage'). */
  selectable?: boolean;
  /** Modifica (1 sola riga). Default: apre la riga (onRowClick). */
  onEdit?: (row: T) => void;
  /** Duplica (1 sola riga). */
  onDuplicate?: (row: T) => void;
  /** Elimina (1+ righe). EntityList chiede conferma e poi azzera la selezione. */
  onDelete?: (rows: T[]) => void | Promise<void>;
  /** Esporta (1+ righe). Default: Excel dalle colonne con `value`. */
  onExport?: (rows: T[]) => void | Promise<void>;
  /** nome file per l'export di default. */
  exportName?: string;
  /** notifica la selezione corrente (per azioni bulk custom della pagina). */
  onSelectionChange?: (rows: T[]) => void;
  /** incrementa questo token per AZZERARE la selezione dall'esterno (dopo un'azione bulk custom). */
  clearSelectionToken?: number;

  /* ── modalità pop-up di scelta (controllate dal padre) ── */
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
  const selectable = !pick && (p.selectable ?? true);

  // selezione interna (solo 'manage'); nelle modalità pick è controllata dal padre.
  const [sel, setSel] = useState<Set<string>>(new Set());
  // pota la selezione alle sole righe visibili quando i dati cambiano (cambio vista/ricerca/pagina/reload)
  const rowsKey = p.rows.map((r) => r.id).join(',');
  useEffect(() => {
    const visible = new Set(p.rows.map((r) => r.id));
    setSel((prev) => { const n = new Set([...prev].filter((id) => visible.has(id))); return n.size === prev.size ? prev : n; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsKey]);

  const pickSelected = new Set(p.selectedIds ?? []);
  const selectedRows = p.rows.filter((r) => sel.has(r.id));
  const count = selectedRows.length;

  // notifica la pagina della selezione corrente (per azioni bulk custom)
  const onSelChange = p.onSelectionChange;
  useEffect(() => { onSelChange?.(selectedRows); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, rowsKey]);
  // azzeramento selezione dall'esterno
  const clearTok = p.clearSelectionToken;
  useEffect(() => { if (clearTok !== undefined) setSel(new Set()); }, [clearTok]);

  const page = p.limit ? Math.floor((p.offset ?? 0) / p.limit) + 1 : 1;
  const pages = p.total && p.limit ? Math.max(1, Math.ceil(p.total / p.limit)) : 1;

  // ── colonne: visibilità + ordine, persistite per-utente (localStorage per entità) ──
  const lsKey = `sisuite.cols.${p.exportName ?? p.title ?? 'list'}`;
  const [colState, setColState] = useState<{ order: string[]; hidden: string[] }>(() => {
    try { const r = localStorage.getItem(lsKey); if (r) return JSON.parse(r) as { order: string[]; hidden: string[] }; } catch { /* ignore */ }
    return { order: [], hidden: [] };
  });
  const colKeys = p.columns.map((c) => c.key);
  const orderedKeys = [...colState.order.filter((k) => colKeys.includes(k)), ...colKeys.filter((k) => !colState.order.includes(k))];
  const hiddenSet = new Set(colState.hidden);
  const effColumns = orderedKeys.map((k) => p.columns.find((c) => c.key === k)).filter((c): c is ListColumn<T> => !!c && !hiddenSet.has(c.key));
  const colSpan = effColumns.length + (pick || selectable ? 1 : 0);

  const [exportOpen, setExportOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  function saveCols(state: { order: string[]; hidden: string[] }) {
    setColState(state); try { localStorage.setItem(lsKey, JSON.stringify(state)); } catch { /* ignore */ }
  }

  const allOn = selectable && p.rows.length > 0 && count === p.rows.length;
  const someOn = selectable && count > 0 && count < p.rows.length;
  const headRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (headRef.current) headRef.current.indeterminate = someOn; }, [someOn]);

  const toggleRow = (row: T) => setSel((s) => { const n = new Set(s); n.has(row.id) ? n.delete(row.id) : n.add(row.id); return n; });
  const toggleAll = () => setSel(() => (allOn ? new Set() : new Set(p.rows.map((r) => r.id))));

  const exportableCols = p.columns.filter((c) => c.value);
  const exportFields: FieldOpt[] = exportableCols.map((c) => ({ key: c.key, label: c.header }));
  async function runExport(orderedKeys: string[]) {
    setExportOpen(false);
    if (p.onExport) { await p.onExport(selectedRows); return; }
    const cols = orderedKeys.map((k) => exportableCols.find((c) => c.key === k)).filter((c): c is ListColumn<T> => !!c);
    if (!cols.length) return;
    await downloadXlsx(p.exportName ?? (p.title ?? 'export'), [{
      name: (p.title ?? 'Dati').slice(0, 28),
      columns: cols.map((c) => ({ header: c.header, key: c.key, width: 20 })),
      rows: selectedRows.map((r) => Object.fromEntries(cols.map((c) => [c.key, c.value!(r) ?? '']))),
    }]);
  }
  async function doDelete() {
    if (!p.onDelete || count === 0) return;
    if (!window.confirm(`Eliminare ${count} element${count > 1 ? 'i' : 'o'} selezionat${count > 1 ? 'i' : 'o'}?`)) return;
    await p.onDelete(selectedRows);
    setSel(new Set());
  }
  const edit = p.onEdit ?? p.onRowClick;

  // azioni standard dipendenti dalla selezione
  const stdActions: ListAction[] = [];
  if (selectable) {
    if (edit) stdActions.push({ key: 'edit', icon: Pencil, tip: 'Modifica (1 riga)', disabled: count !== 1, onClick: () => count === 1 && edit(selectedRows[0]!) });
    if (p.onDuplicate) stdActions.push({ key: 'dup', icon: Copy, tip: 'Duplica (1 riga)', disabled: count !== 1, onClick: () => count === 1 && p.onDuplicate!(selectedRows[0]!) });
    if (p.onExport || exportableCols.length) stdActions.push({ key: 'exp', icon: Download, tip: count > 1 ? `Esporta ${count} selezionati` : 'Esporta', disabled: count < 1, onClick: () => setExportOpen(true) });
    if (p.onDelete) stdActions.push({ key: 'del', icon: Trash2, tip: count > 1 ? `Elimina ${count} selezionati` : 'Elimina', variant: 'danger', disabled: count < 1, onClick: () => void doDelete() });
  }

  // azioni "di sinistra": built-in standard (Filtri/Colonne/AI) + eventuali custom della pagina.
  // I placeholder con key filters/cols/ai passati dalle pagine vengono sostituiti dai built-in.
  const customLeft = (p.leftActions ?? []).filter((a) => !['filters', 'cols', 'ai'].includes(a.key));
  const builtinLeft: ListAction[] = pick ? [] : [
    { key: 'filters', icon: SlidersHorizontal, tip: 'Filtri (in arrivo)', disabled: true },
    { key: 'cols', icon: Columns3, tip: 'Colonne (mostra/nascondi e ordina)', onClick: () => setColumnsOpen(true) },
    { key: 'ai', icon: Sparkles, tip: 'Azioni AI (in arrivo)', variant: 'ai', disabled: true },
  ];
  const leftAll = [...builtinLeft, ...customLeft];

  const hasToolbar = p.onSearch || leftAll.length > 0 || stdActions.length > 0 || p.rightActions;

  return (
    <div className="dsx">
      {(p.title || (p.views && p.views.length > 0)) && (
        <div className="lhrow">
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
        </div>
      )}

      {hasToolbar && (
        <div className="dsx-toolbar">
          {p.onSearch && (
            <div className="dsx-search grow">
              <Search size={16} />
              <input placeholder={p.searchPlaceholder ?? 'Cerca…'} value={p.search ?? ''} onChange={(e) => p.onSearch?.(e.target.value)} />
            </div>
          )}
          {/* tutto a destra: ricerca larga a sinistra, azioni a destra con il "+" per ultimo */}
          <div className="spacer" />
          {leftAll.map((a) => <Tib key={a.key} a={a} />)}
          {pick && pickSelected.size > 0 && <span className="chip" style={{ marginLeft: 6 }}>{pickSelected.size} selezionati</span>}
          {stdActions.length > 0 && (
            <>
              <span className="tdiv" />
              {count > 0 && <span className="selcount">{count}</span>}
              {stdActions.map((a) => <Tib key={a.key} a={a} />)}
            </>
          )}
          {(p.rightActions ?? []).length > 0 && <span className="tdiv" />}
          {(p.rightActions ?? []).map((a) => <Tib key={a.key} a={a} />)}
        </div>
      )}

      {p.loading ? <Loading /> : p.error ? <ErrorBox message={p.error} /> : (
        <div className="card">
          <table className="t">
            <thead><tr>
              {pick && <th style={{ width: 40 }} />}
              {selectable && <th className="chk"><input ref={headRef} type="checkbox" checked={allOn} onChange={toggleAll} aria-label="Seleziona tutti" /></th>}
              {effColumns.map((c) => (
                <th key={c.key} className={c.num ? 'num' : undefined}>{c.header}{c.sub && <span className="h2">{c.sub}</span>}</th>
              ))}
            </tr></thead>
            <tbody>
              {p.rows.map((row) => {
                const isSel = pick ? pickSelected.has(row.id) : sel.has(row.id);
                return (
                  <tr key={row.id} className={isSel ? 'sel' : undefined}
                    onClick={() => (pick ? p.onToggleSelect?.(row) : p.onRowClick?.(row))}>
                    {pick && <td style={{ width: 40 }}><input type={mode === 'pick-multi' ? 'checkbox' : 'radio'} checked={isSel} readOnly /></td>}
                    {selectable && <td className="chk" onClick={(e) => { e.stopPropagation(); toggleRow(row); }}><input type="checkbox" checked={isSel} readOnly aria-label="Seleziona riga" /></td>}
                    {effColumns.map((c) => <td key={c.key} className={c.num ? 'num' : undefined}>{c.render(row)}</td>)}
                  </tr>
                );
              })}
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

      {/* Esporta: scelta+ordine campi + preset per-utente */}
      {exportOpen && (
        <ExportDialog open entity={p.exportName ?? p.title ?? 'lista'} fields={exportFields}
          onCancel={() => setExportOpen(false)} onExport={(keys) => void runExport(keys)} />
      )}
      {/* Colonne: mostra/nascondi e riordina (persistito per-utente) */}
      {columnsOpen && (
        <FieldPicker open title="Colonne — mostra/nascondi e ordina"
          fields={p.columns.map((c) => ({ key: c.key, label: c.header }))}
          value={effColumns.map((c) => c.key)} confirmLabel="Applica"
          onCancel={() => setColumnsOpen(false)}
          onConfirm={(visible) => {
            const order = [...visible, ...colKeys.filter((k) => !visible.includes(k))];
            const hidden = colKeys.filter((k) => !visible.includes(k));
            saveCols({ order, hidden });
            setColumnsOpen(false);
          }} />
      )}
      {(exportOpen || columnsOpen) && <FieldPickerStyles />}
    </div>
  );
}
