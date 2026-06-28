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
import { useTranslation } from 'react-i18next';
import { Search, Pencil, Copy, Download, Trash2, SlidersHorizontal, Columns3, Sparkles, ArrowUpDown, Archive, RotateCcw, History, MoreVertical, Wand2 } from 'lucide-react';
import { Modal } from './Modal';
import type { LucideIcon } from './icons';
import { type FieldDefinitionDto, fieldLabel, GROUP_LABEL_IT } from '@sisuite/shared';
import { useApi, mutate } from '../api/hooks';
import { currentLocale } from '../i18n';
import { Loading, ErrorBox } from '../components/Page';
import { PromptDialog } from './PromptDialog';
import { FloatingPopover } from './FloatingPopover';
import { SavedHeader } from './SavedHeader';
import { FieldChooser, type ChosenItem, type ChooserField } from './FieldChooser';
import { FilterGroupPanel, type FilterFieldMeta, type FilterFieldType } from './FilterGroupPanel';
import { ReportDesigner, type ReportField } from './ReportDesigner';
import { useListPresets } from './useListPresets';
import { Check, ListFilter, FileBarChart2 } from 'lucide-react';
import { downloadXlsx } from '../lib/xlsx';
import { type FieldOpt } from './FieldPicker';
import { ConfirmDialog } from './ConfirmDialog';
import { AiFilterPanel } from './AiFilterPanel';
import { matchConditions, type FilterCondition, type FilterMode } from '../lib/listFilter';
import '../theme/datapages.css';

export interface ListView { key: string; label: string; count?: number }
export interface ListColumn<T> {
  key: string; header: string; sub?: string; num?: boolean; render: (row: T) => ReactNode;
  /** valore grezzo per l'export Excel (se assente la colonna non viene esportata). */
  value?: (row: T) => string | number | null | undefined;
}
/** campo esportabile: TUTTI i campi dell'entità (non solo le colonne a video). */
export interface ExportField<T> { key: string; label: string; value: (row: T) => string | number | null | undefined }
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
  /** funzioni AI aggiuntive (oltre al Filtro intelligente) raccolte sotto l'UNICA icona AI (stella):
   *  se presenti, l'icona AI apre un hub con "Filtro intelligente" + queste voci (es. "Trova doppioni").
   *  Così ogni nuova funzione AI sta sotto la stessa icona, niente icone-stella multiple. */
  aiActions?: { key: string; label: string; description?: string; icon?: LucideIcon; onClick: () => void }[];
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
  /** etichetta leggibile di una riga (per il popup di conferma Elimina). Default: prima colonna con `value`. */
  rowLabel?: (row: T) => string;
  /** Esporta (1+ righe). Default: Excel dalle colonne con `value`. */
  onExport?: (rows: T[]) => void | Promise<void>;
  /** nome file per l'export di default. */
  exportName?: string;
  /** TUTTI i campi dell'entità per l'export (oltre alle colonne a video). */
  exportFields?: ExportField<T>[];
  /** chiave entità per i `field_definition` (es. 'company','work_order','material'):
   *  se presente, i campi custom del tenant entrano AUTOMATICAMENTE in export/filtro
   *  (Blocco 4 — metadata-driven). Le righe devono esporre `attributes`. */
  entity?: string;
  /** notifica la selezione corrente (per azioni bulk custom della pagina). */
  onSelectionChange?: (rows: T[]) => void;
  /** incrementa questo token per AZZERARE la selezione dall'esterno (dopo un'azione bulk custom). */
  clearSelectionToken?: number;
  /** se presente, il filtro è applicato LATO SERVER: la pagina riceve lo spec e lo passa all'API
   *  (niente filtro client-side). Senza questa prop, EntityList filtra le righe caricate (client). */
  onFilterChange?: (spec: { mode: FilterMode; conditions: FilterCondition[] } | null) => void;

  /* ── modalità pop-up di scelta (controllate dal padre) ── */
  mode?: 'manage' | 'pick-single' | 'pick-multi';
  selectedIds?: string[];
  onToggleSelect?: (row: T) => void;
  total?: number;
  limit?: number;
  offset?: number;
  onPage?: (offset: number) => void;
  emptyText?: string;
  /** chiave entità per le VISTE salvate (filtro + colonne sotto un nome). Opt-in:
   *  se assente, le viste salvate non compaiono (comportamento invariato). Blocco 5.3. */
  savedViewKey?: string;
  /** campi ordinabili (key = chiave SORTABLE del backend) per la mascherina "Ordina". Blocco 5.2. */
  sortFields?: { key: string; label: string }[];
  /** metadati dei campi BASE per il Filtro "Gruppo" (motore §2.1): key=chiave FILTER_FIELDS del backend,
   *  type/section/values. I campi custom (field_definition) si aggiungono in automatico. */
  filterFields?: FilterFieldMeta[];
  /** riceve l'ordinamento multi-campo (priorità) → la pagina lo passa all'API come ?sort=. */
  onSortChange?: (sort: { field: string; dir: 'asc' | 'desc' }[]) => void;

  /* ── soft-delete: vista archiviati + ripristino + purge + storico ── */
  /** true se la lista sta mostrando i record archiviati. */
  archived?: boolean;
  /** se presente, mostra in toolbar il toggle "Mostra archiviati" / "Torna agli attivi". */
  onToggleArchived?: (v: boolean) => void;
  /** Ripristina (torna attivo). Mostrato solo in vista archiviati. */
  onRestore?: (rows: T[]) => void | Promise<void>;
  /** Elimina DEFINITIVAMENTE (purge). Mostrato solo in vista archiviati, con conferma. */
  onPurge?: (rows: T[]) => void | Promise<void>;
  /** Apre lo storico (audit) di una riga. */
  onHistory?: (row: T) => void;
  /** testo del badge "Archiviato" per la riga (es. "Archiviato da Mario"). */
  archivedBadge?: (row: T) => string | null;
}

interface SavedView {
  id: string; name: string; isOwn: boolean; isShared: boolean;
  payload: { filter?: { mode?: FilterMode; conditions?: FilterCondition[] } | null; columns?: { order?: string[]; hidden?: string[] } | null; exportRef?: string | null };
}

/** Valore grezzo di un attributo custom per l'export (Blocco 4 — export dinamico).
 *  select/multiselect → etichetta opzione nella lingua corrente; boolean → Sì/No;
 *  numeri/date → valore come memorizzato. */
function attrExportValue(def: FieldDefinitionDto, attributes: Record<string, unknown> | undefined): string | number {
  const raw = attributes?.[def.key];
  if (raw == null || raw === '') return '';
  const loc = currentLocale();
  if (def.dataType === 'select') {
    const opt = def.options?.find((o) => o.value === raw);
    return opt ? fieldLabel(opt.label, loc, String(raw)) : String(raw);
  }
  if (def.dataType === 'multiselect' && Array.isArray(raw)) {
    return raw.map((v) => def.options?.find((o) => o.value === v))
      .map((o, i) => (o ? fieldLabel(o.label, loc, '') : String((raw as unknown[])[i]))).join(', ');
  }
  if (def.dataType === 'boolean') return raw ? 'Sì' : 'No';
  if (typeof raw === 'number') return raw;
  return String(raw);
}

/** Mappa un field_definition del tenant in metadati per il Filtro Gruppo. */
function fieldDefToFilterMeta(d: FieldDefinitionDto): FilterFieldMeta {
  const loc = currentLocale();
  let type: FilterFieldType = 'text';
  if (d.dataType === 'number' || d.dataType === 'money' || d.dataType === 'integer') type = 'number';
  else if (d.dataType === 'date') type = 'date';
  else if (d.dataType === 'select' || d.dataType === 'multiselect') type = 'enum';
  else if (d.dataType === 'boolean') type = 'enum';
  const values = d.dataType === 'boolean'
    ? [{ value: 'true', label: 'Sì' }, { value: 'false', label: 'No' }]
    : (d.options ?? []).map((o) => ({ value: o.value, label: fieldLabel(o.label, loc, o.value) }));
  return { key: d.key, label: fieldLabel(d.label, loc, d.key), type, section: GROUP_LABEL_IT[d.groupKey ?? 'general'] ?? (d.groupKey ?? 'Campi'), values: type === 'enum' ? values : undefined };
}

function Tib({ a }: { a: ListAction }) {
  const I = a.icon;
  // hint SEMPRE presente: tooltip su hover (desktop, via data-tip) + title/aria-label (accessibilità
  // e long-press), + etichetta testuale visibile su mobile (.tib-lbl). Vedi STANDARD U-1.
  return (
    <button className={`tib${a.variant ? ' ' + a.variant : ''}`} data-tip={a.tip} title={a.tip} aria-label={a.tip}
      onClick={a.onClick} disabled={a.disabled}>
      <I /><span className="tib-lbl">{a.tip}</span>
    </button>
  );
}

export function EntityList<T extends { id: string }>(p: Props<T>) {
  const { t } = useTranslation();
  const mode = p.mode ?? 'manage';
  const pick = mode !== 'manage';
  const selectable = !pick && (p.selectable ?? true);

  // fonte campi per export E filtro: TUTTI i campi dell'entità (prop exportFields) o le colonne con value.
  const baseExport: ExportField<T>[] = p.exportFields
    ?? p.columns.filter((c) => c.value).map((c) => ({ key: c.key, label: c.header, value: c.value! }));
  // Blocco 4: i field_definition del tenant entrano AUTOMATICAMENTE nell'export (no codice per pagina).
  const fieldDefs = useApi<{ items: FieldDefinitionDto[] }>(p.entity ? `/field-definitions?entity=${encodeURIComponent(p.entity)}` : null);
  const customExport: ExportField<T>[] = (fieldDefs.data?.items ?? [])
    .filter((d) => d.active !== false)
    .filter((d) => !baseExport.some((f) => f.key === d.key)) // la pagina può aver già mappato un attributo a mano
    .sort((a, b) => a.sequence - b.sequence)
    .map((d) => ({
      key: d.key,
      label: fieldLabel(d.label, currentLocale(), d.key),
      value: (row: T) => attrExportValue(d, (row as { attributes?: Record<string, unknown> }).attributes),
    }));
  const exportSource: ExportField<T>[] = [...baseExport, ...customExport];
  const exportFields: FieldOpt[] = exportSource.map((f) => ({ key: f.key, label: f.label }));

  // ── Filtro AI (client-side su TUTTI i campi) ──
  const [aiFilterOpen, setAiFilterOpen] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [filterConds, setFilterConds] = useState<FilterCondition[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>('and');
  const [filterDesc, setFilterDesc] = useState('');
  const serverFilter = !!p.onFilterChange;
  const colVal = (field: string, row: T) => exportSource.find((f) => f.key === field)?.value(row);
  const allVals = (row: T) => exportSource.map((f) => f.value(row));
  // server mode: le righe arrivano già filtrate dall'API → nessun filtro client.
  const viewRows = (!serverFilter && filterConds.length)
    ? p.rows.filter((row) => matchConditions(filterConds, (f) => colVal(f, row), () => allVals(row), filterMode))
    : p.rows;

  // selezione interna (solo 'manage'); nelle modalità pick è controllata dal padre.
  const [sel, setSel] = useState<Set<string>>(new Set());
  // pota la selezione alle sole righe visibili quando i dati cambiano (cambio vista/ricerca/pagina/reload/filtro)
  const rowsKey = viewRows.map((r) => r.id).join(',');
  useEffect(() => {
    const visible = new Set(viewRows.map((r) => r.id));
    setSel((prev) => { const n = new Set([...prev].filter((id) => visible.has(id))); return n.size === prev.size ? prev : n; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsKey]);

  const pickSelected = new Set(p.selectedIds ?? []);
  const selectedRows = viewRows.filter((r) => sel.has(r.id));
  const count = selectedRows.length;
  // etichetta leggibile di una riga (per il popup Elimina): prop rowLabel o prima colonna con value.
  const labelOf = (r: T): string => {
    if (p.rowLabel) return p.rowLabel(r);
    const col = p.columns.find((c) => c.value);
    const v = col?.value?.(r);
    return v != null && String(v).trim() ? String(v) : r.id;
  };

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
  // draft del motore per Colonne/Export (FieldChooser) + relativi salvataggi
  const [columnsDraft, setColumnsDraft] = useState<ChosenItem[]>([]);
  const [exportDraft, setExportDraft] = useState<ChosenItem[]>([]);
  const openColumns = () => { setColumnsDraft(effColumns.map((c) => ({ key: c.key }))); setColumnsOpen(true); };
  const openExport = () => { setExportDraft(exportSource.map((f) => ({ key: f.key }))); setExportOpen(true); };
  function applyColumns(draft: ChosenItem[]) {
    const visible = draft.map((d) => d.key);
    saveCols({ order: [...visible, ...colKeys.filter((k) => !visible.includes(k))], hidden: colKeys.filter((k) => !visible.includes(k)) });
    setColumnsOpen(false);
  }
  const columnsChooserFields: ChooserField[] = p.columns.map((c) => ({ key: c.key, label: c.header }));
  const exportChooserFields: ChooserField[] = exportSource.map((f) => ({ key: f.key, label: f.label }));

  // ── Viste salvate (Blocco 5.3): impacchettano filtro + colonne sotto un nome ──
  const savedViews = useApi<{ items: SavedView[] }>(p.savedViewKey ? `/saved-views?entity=${encodeURIComponent(p.savedViewKey)}` : null);
  const [activeSV, setActiveSV] = useState<string | null>(null);
  const [svPromptOpen, setSvPromptOpen] = useState(false);
  function applySavedView(v: SavedView) {
    const f = v.payload.filter;
    const conds = (f?.conditions as FilterCondition[]) ?? [];
    const m = (f?.mode as FilterMode) ?? 'and';
    setFilterConds(conds); setFilterMode(m); setFilterDesc(conds.length ? v.name : '');
    p.onFilterChange?.(conds.length ? { mode: m, conditions: conds } : null);
    if (v.payload.columns) saveCols({ order: v.payload.columns.order ?? [], hidden: v.payload.columns.hidden ?? [] });
    setActiveSV(v.id);
  }
  async function saveCurrentView(name: string) {
    if (!p.savedViewKey || !name.trim()) { setSvPromptOpen(false); return; }
    await mutate('POST', '/saved-views', { entity: p.savedViewKey, name: name.trim(), payload: {
      filter: filterConds.length ? { mode: filterMode, conditions: filterConds } : null,
      columns: colState, exportRef: p.exportName ?? null,
    } });
    setSvPromptOpen(false);
    void savedViews.reload();
  }
  async function deleteSavedView(id: string) {
    await mutate('DELETE', `/saved-views/${id}`);
    if (activeSV === id) setActiveSV(null);
    void savedViews.reload();
  }

  // ── Ordinamento multi-campo (motore §2.2, mockup 55) ──
  const presetEntity = p.savedViewKey ?? p.entity ?? p.exportName ?? p.title;
  const sortPresets = useListPresets(presetEntity, 'sort');
  const columnsPresets = useListPresets(presetEntity, 'columns');
  const exportPresets = useListPresets(presetEntity, 'export');

  // ── Filtro "Gruppo" (motore §2.1, mockup 54): campi base + field_definition del tenant ──
  const groupFilterFields: FilterFieldMeta[] = [
    ...(p.filterFields ?? []),
    ...(fieldDefs.data?.items ?? [])
      .filter((d) => d.active !== false)
      .filter((d) => !(p.filterFields ?? []).some((b) => b.key === d.key))
      .map(fieldDefToFilterMeta),
  ];
  const [groupOpen, setGroupOpen] = useState(false);
  const canGroup = !!p.onFilterChange && groupFilterFields.length > 0;

  // ── Report designer (motore §2.5, mockup 56) ──
  const [reportOpen, setReportOpen] = useState(false);
  const numericKeys = new Set<string>([
    ...p.columns.filter((c) => c.num).map((c) => c.key),
    ...(p.filterFields ?? []).filter((f) => f.type === 'number').map((f) => f.key),
    ...(fieldDefs.data?.items ?? []).filter((d) => d.dataType === 'number' || d.dataType === 'money' || d.dataType === 'integer').map((d) => d.key),
  ]);
  const reportFields: ReportField<T>[] = exportSource.map((f) => ({ key: f.key, label: f.label, numeric: numericKeys.has(f.key), value: f.value }));
  const [sortOpen, setSortOpen] = useState(false);
  const [sortState, setSortState] = useState<{ field: string; dir: 'asc' | 'desc' }[]>([]);
  const [sortDraft, setSortDraft] = useState<ChosenItem[]>([]);
  const openSort = () => { setSortDraft(sortState.map((s) => ({ key: s.field, dir: s.dir }))); setSortOpen(true); };
  function applySort(draft: ChosenItem[]) {
    const next = draft.map((d) => ({ field: d.key, dir: (d.dir ?? 'asc') as 'asc' | 'desc' }));
    setSortState(next);
    p.onSortChange?.(next);
    setSortOpen(false);
  }
  // Ordina su TUTTI i campi dell'entità (non solo i sortFields): usa la sorgente export
  // (colonne base + field_definition). Il backend ordina per attributo via attrsCol.
  const sortChooserFields: ChooserField[] = exportSource.map((f) => ({ key: f.key, label: f.label }));

  const allOn = selectable && viewRows.length > 0 && count === viewRows.length;
  const someOn = selectable && count > 0 && count < viewRows.length;
  const headRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (headRef.current) headRef.current.indeterminate = someOn; }, [someOn]);

  const toggleRow = (row: T) => setSel((s) => { const n = new Set(s); n.has(row.id) ? n.delete(row.id) : n.add(row.id); return n; });
  const toggleAll = () => setSel(() => (allOn ? new Set() : new Set(viewRows.map((r) => r.id))));

  async function runExport(orderedKeys: string[]) {
    setExportOpen(false);
    if (p.onExport) { await p.onExport(selectedRows); return; }
    const flds = orderedKeys.map((k) => exportSource.find((f) => f.key === k)).filter((f): f is ExportField<T> => !!f);
    if (!flds.length) return;
    await downloadXlsx(p.exportName ?? (p.title ?? 'export'), [{
      name: (p.title ?? 'Dati').slice(0, 28),
      columns: flds.map((f) => ({ header: f.label, key: f.key, width: 20 })),
      rows: selectedRows.map((r) => Object.fromEntries(flds.map((f) => [f.key, f.value(r) ?? '']))),
    }]);
  }
  // ConfirmDialog interna: serve sia per Elimina (delete) sia per Elimina definitiva (purge).
  const [delOpen, setDelOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [delMode, setDelMode] = useState<'delete' | 'purge'>('delete');
  const [delBusy, setDelBusy] = useState(false);
  async function confirmDelete() {
    const handler = delMode === 'purge' ? p.onPurge : p.onDelete;
    if (!handler) return;
    setDelBusy(true);
    try { await handler(selectedRows); setSel(new Set()); }
    finally { setDelBusy(false); setDelOpen(false); }
  }
  const edit = p.onEdit ?? p.onRowClick;

  // azioni standard dipendenti dalla selezione, divise tra PRIMARIE (in toolbar) e
  // SECONDARIE (nel menu overflow ⋮): teniamo a vista le 2-3 più usate, il resto nel ⋮.
  const stdPrimary: ListAction[] = [];
  const stdOverflow: ListAction[] = [];
  if (selectable) {
    if (p.archived) {
      // vista archiviati: Ripristina + Elimina definitiva in toolbar; Storico + Esporta nel ⋮
      if (p.onRestore) stdPrimary.push({ key: 'restore', icon: RotateCcw, tip: 'Ripristina', disabled: count < 1, onClick: () => count >= 1 && void p.onRestore!(selectedRows) });
      if (p.onPurge) stdPrimary.push({ key: 'purge', icon: Trash2, tip: 'Elimina definitivamente', variant: 'danger', disabled: count < 1, onClick: () => { setDelMode('purge'); setDelOpen(true); } });
      if (p.onHistory) stdOverflow.push({ key: 'history', icon: History, tip: 'Storico', disabled: count !== 1, onClick: () => count === 1 && p.onHistory!(selectedRows[0]!) });
      if (p.onExport || exportSource.length) stdOverflow.push({ key: 'exp', icon: Download, tip: count > 1 ? t('list.exportN', { n: count }) : t('list.export'), disabled: count < 1, onClick: openExport });
    } else {
      // normale: Modifica · Duplica · Elimina in toolbar; Esporta + Storico nel ⋮
      if (edit) stdPrimary.push({ key: 'edit', icon: Pencil, tip: t('list.edit'), disabled: count !== 1, onClick: () => count === 1 && edit(selectedRows[0]!) });
      if (p.onDuplicate) stdPrimary.push({ key: 'dup', icon: Copy, tip: t('list.duplicate'), disabled: count !== 1, onClick: () => count === 1 && p.onDuplicate!(selectedRows[0]!) });
      if (p.onDelete) stdPrimary.push({ key: 'del', icon: Trash2, tip: count > 1 ? t('list.deleteN', { n: count }) : t('list.delete'), variant: 'danger', disabled: count < 1, onClick: () => { setDelMode('delete'); setDelOpen(true); } });
      if (p.onExport || exportSource.length) stdOverflow.push({ key: 'exp', icon: Download, tip: count > 1 ? t('list.exportN', { n: count }) : t('list.export'), disabled: count < 1, onClick: openExport });
      if (p.onHistory) stdOverflow.push({ key: 'history', icon: History, tip: 'Storico', disabled: count !== 1, onClick: () => count === 1 && p.onHistory!(selectedRows[0]!) });
    }
  }
  // Toggle soft-delete "Mostra archiviati"/"Torna agli attivi": azione secondaria → nel ⋮.
  if (!pick && p.onToggleArchived) {
    stdOverflow.push({ key: 'archived', icon: Archive, tip: p.archived ? 'Torna agli attivi' : 'Mostra archiviati', variant: (p.archived ? 'primary' : undefined) as ListAction['variant'], onClick: () => p.onToggleArchived!(!p.archived) });
  }

  // azioni "di sinistra": built-in standard (Filtri/Colonne/AI) + eventuali custom della pagina.
  // I placeholder con key filters/cols/ai passati dalle pagine vengono sostituiti dai built-in.
  const customLeft = (p.leftActions ?? []).filter((a) => !['filters', 'cols', 'ai'].includes(a.key));
  const builtinLeft: ListAction[] = pick ? [] : [
    canGroup
      ? { key: 'gruppo', icon: ListFilter, tip: filterConds.length ? `Filtra (Gruppo) · ${filterConds.length}` : 'Filtra (Gruppo)', variant: (filterConds.length ? 'primary' : undefined) as ListAction['variant'], onClick: () => setGroupOpen(true) }
      : { key: 'filters', icon: SlidersHorizontal, tip: t('list.filtersSoon'), disabled: true },
    ...(p.onSortChange && sortChooserFields.length
      ? [{ key: 'sort', icon: ArrowUpDown, tip: sortState.length ? t('list.sortN', { n: sortState.length }) : t('list.sort'), variant: (sortState.length ? 'primary' : undefined) as ListAction['variant'], onClick: openSort }]
      : []),
    { key: 'cols', icon: Columns3, tip: t('list.columns'), onClick: openColumns },
    ...(exportSource.length ? [{ key: 'report', icon: FileBarChart2, tip: 'Report', onClick: () => setReportOpen(true) }] : []),
    { key: 'ai', icon: Sparkles, tip: (p.aiActions && p.aiActions.length) ? 'Funzioni AI' : t('list.aiFilter'), variant: 'ai', onClick: () => ((p.aiActions && p.aiActions.length) ? setAiMenuOpen(true) : setAiFilterOpen(true)) },
  ];
  const leftAll = [...builtinLeft, ...customLeft];

  const hasToolbar = p.onSearch || leftAll.length > 0 || stdPrimary.length > 0 || stdOverflow.length > 0 || p.rightActions;

  return (
    <div className="dsx">
      {/* Testata FISSA: titolo/viste + toolbar + filtro attivo restano in alto;
          scrollano solo le righe della lista (regola standard liste). */}
      <div className="dsx-head">
      {(p.title || (p.views && p.views.length > 0) || p.savedViewKey) && (
        <div className="lhrow">
          {p.title && <div className="lh"><h1>{p.title}</h1>{p.subtitle && <span className="sub">{p.subtitle}</span>}</div>}
          <div className="views">
            {(p.views ?? []).map((v) => (
              <span key={v.key} className={`viewchip${p.activeView === v.key ? ' on' : ''}`}
                onClick={() => { setActiveSV(null); p.onView?.(v.key); }}>
                {v.label} {v.count != null && <span className="c">{v.count}</span>}
              </span>
            ))}
            {p.savedViewKey && (savedViews.data?.items ?? []).map((v) => (
              <span key={v.id} className={`viewchip sv${activeSV === v.id ? ' on' : ''}`} title={t('list.savedView')} onClick={() => applySavedView(v)}>
                {v.name}{v.isOwn && <button className="sv-x" title="Elimina vista" onClick={(e) => { e.stopPropagation(); void deleteSavedView(v.id); }}>✕</button>}
              </span>
            ))}
            {p.savedViewKey && (
              <span className="viewchip sv-add" title="Salva la lista corrente (filtro + colonne) come vista" onClick={() => setSvPromptOpen(true)}>{t('list.saveView')}</span>
            )}
          </div>
        </div>
      )}

      {hasToolbar && (
        <div className="dsx-toolbar">
          {p.onSearch && (
            <div className="dsx-search grow">
              <Search size={16} />
              <input placeholder={p.searchPlaceholder ?? t('list.search')} value={p.search ?? ''} onChange={(e) => p.onSearch?.(e.target.value)} />
            </div>
          )}
          {/* tutto a destra: ricerca larga a sinistra, azioni a destra con il "+" per ultimo */}
          <div className="spacer" />
          {leftAll.map((a) => <Tib key={a.key} a={a} />)}
          {pick && pickSelected.size > 0 && <span className="chip" style={{ marginLeft: 6 }}>{pickSelected.size} selezionati</span>}
          {(stdPrimary.length > 0 || stdOverflow.length > 0) && (
            <>
              <span className="tdiv" />
              {count > 0 && <span className="selcount">{count}</span>}
              {stdPrimary.map((a) => <Tib key={a.key} a={a} />)}
              {stdOverflow.length > 0 && (
                <div className="tib-of-wrap">
                  <button className="tib" data-tip="Altre azioni" title="Altre azioni" aria-label="Altre azioni"
                    onClick={() => setOverflowOpen((o) => !o)}>
                    <MoreVertical /><span className="tib-lbl">Altre azioni</span>
                  </button>
                  {overflowOpen && (
                    <>
                      <div className="tib-of-back" onClick={() => setOverflowOpen(false)} />
                      <div className="tib-of-menu">
                        {stdOverflow.map((a) => { const I = a.icon; return (
                          <button key={a.key} className={`tib-of-item${a.variant === 'danger' ? ' danger' : ''}${a.variant === 'primary' ? ' on' : ''}`}
                            disabled={a.disabled} onClick={() => { setOverflowOpen(false); a.onClick?.(); }}>
                            <I size={15} />{a.tip}
                          </button>
                        ); })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
          {(p.rightActions ?? []).length > 0 && <span className="tdiv" />}
          {(p.rightActions ?? []).map((a) => <Tib key={a.key} a={a} />)}
        </div>
      )}

      {filterConds.length > 0 && (
        <div className="aif-active">
          <Sparkles size={14} />
          <button className="aif-text" onClick={() => setAiFilterOpen(true)}>{t('list.filterActive')}: {filterDesc || `${filterConds.length} condizioni`}</button>
          <span className="aif-n">{t('list.resultsN', { n: serverFilter ? (p.total ?? viewRows.length) : viewRows.length })}</span>
          <button className="aif-clear" title="Rimuovi filtro" onClick={() => { setFilterConds([]); setFilterDesc(''); p.onFilterChange?.(null); }}>✕</button>
        </div>
      )}
      </div>{/* /dsx-head */}

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
              {viewRows.map((row) => {
                const isSel = pick ? pickSelected.has(row.id) : sel.has(row.id);
                return (
                  <tr key={row.id} className={isSel ? 'sel' : undefined}
                    onClick={() => {
                      // togli il focus dal bottone/elemento corrente prima di navigare:
                      // evita il warning Ionic "aria-hidden on a focused element" sulla pagina che viene nascosta.
                      (document.activeElement as HTMLElement | null)?.blur?.();
                      if (pick) { p.onRowClick ? p.onRowClick(row) : p.onToggleSelect?.(row); } else { p.onRowClick?.(row); }
                    }}>
                    {pick && <td style={{ width: 40 }} onClick={(e) => { e.stopPropagation(); p.onToggleSelect?.(row); }}>
                      <input type={mode === 'pick-multi' ? 'checkbox' : 'radio'} checked={isSel} readOnly /></td>}
                    {selectable && <td className="chk" onClick={(e) => { e.stopPropagation(); toggleRow(row); }}><input type="checkbox" checked={isSel} readOnly aria-label="Seleziona riga" /></td>}
                    {effColumns.map((c, ci) => (
                      <td key={c.key} className={c.num ? 'num' : undefined}>
                        {p.archived && ci === 0 && (
                          <span className="chip" title={p.archivedBadge?.(row) ?? undefined}
                            style={{ background: 'var(--surface-soft, #f3f4f6)', color: 'var(--ink-soft)', marginRight: 8, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                            <Archive size={11} /> Archiviato
                          </span>
                        )}
                        {c.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {viewRows.length === 0 && <tr><td colSpan={colSpan}><div className="dsx-empty">{filterConds.length ? t('list.emptyFiltered') : (p.emptyText ?? t('list.empty'))}</div></td></tr>}
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

      {/* Esporta: stesso FieldChooser (motore §2.4) + SavedHeader */}
      {exportOpen && (
        <FloatingPopover title={t('list.export')} icon={Download} onClose={() => setExportOpen(false)}
          saver={<SavedHeader items={exportPresets.items} placeholder="Export salvato…"
            onLoad={(id) => { const pr = exportPresets.items.find((x) => x.id === id); if (pr) setExportDraft((pr.payload as string[]).map((k) => ({ key: k }))); }}
            onSave={(name) => void exportPresets.save(name, exportDraft.map((d) => d.key))} onDelete={(id) => void exportPresets.remove(id)} />}
          footer={<>
            <span className="left">{exportDraft.length} camp{exportDraft.length === 1 ? 'o' : 'i'} · {count} record</span>
            <button className="btn btn-primary" disabled={!exportDraft.length} onClick={() => void runExport(exportDraft.map((d) => d.key))}><Download size={16} /> {t('list.export')} (Excel)</button>
          </>}>
          <FieldChooser mode="export" fields={exportChooserFields} value={exportDraft} onChange={setExportDraft} />
        </FloatingPopover>
      )}
      {/* Colonne: stesso FieldChooser (motore §2.3), mostra/nascondi + ordine, persistito */}
      {columnsOpen && (
        <FloatingPopover title={t('list.columns')} icon={Columns3} onClose={() => setColumnsOpen(false)}
          saver={<SavedHeader items={columnsPresets.items} placeholder="Set colonne salvato…"
            onLoad={(id) => { const pr = columnsPresets.items.find((x) => x.id === id); if (pr) setColumnsDraft((pr.payload as string[]).map((k) => ({ key: k }))); }}
            onSave={(name) => void columnsPresets.save(name, columnsDraft.map((d) => d.key))} onDelete={(id) => void columnsPresets.remove(id)} />}
          footer={<>
            <span className="left">{columnsDraft.length} di {p.columns.length} colonne</span>
            <button className="btn btn-ghost" onClick={() => setColumnsDraft(p.columns.map((c) => ({ key: c.key })))}>Tutte</button>
            <button className="btn btn-primary" onClick={() => applyColumns(columnsDraft)}><Check size={16} /> Applica</button>
          </>}>
          <FieldChooser mode="columns" fields={columnsChooserFields} value={columnsDraft} onChange={setColumnsDraft} />
        </FloatingPopover>
      )}

      <PromptDialog open={svPromptOpen} title="Salva vista"
        message="Salva filtro e colonne correnti come vista, per ricaricarli con un clic."
        label="Nome della vista" placeholder="Es. Clienti di Bergamo" confirmLabel="Salva"
        onConfirm={(name) => void saveCurrentView(name)} onCancel={() => setSvPromptOpen(false)} />

      {sortOpen && p.sortFields && (
        <FloatingPopover title={t('list.sort')} icon={ArrowUpDown} onClose={() => setSortOpen(false)}
          saver={<SavedHeader items={sortPresets.items} placeholder="Ordinamento salvato…"
            onLoad={(id) => { const pr = sortPresets.items.find((x) => x.id === id); if (pr) setSortDraft(pr.payload as ChosenItem[]); }}
            onSave={(name) => void sortPresets.save(name, sortDraft)} onDelete={(id) => void sortPresets.remove(id)} />}
          footer={<>
            <span className="left">{sortDraft.length ? `${sortDraft.length} livell${sortDraft.length === 1 ? 'o' : 'i'} di ordinamento` : ''}</span>
            <button className="btn btn-ghost" onClick={() => setSortDraft([])}>Pulisci</button>
            <button className="btn btn-primary" onClick={() => applySort(sortDraft)}><Check size={16} /> Applica</button>
          </>}>
          <FieldChooser mode="sort" fields={sortChooserFields} value={sortDraft} onChange={setSortDraft} />
        </FloatingPopover>
      )}

      {groupOpen && (
        <FilterGroupPanel title={p.title ?? 'Record'} presetEntity={presetEntity} fields={groupFilterFields}
          initial={filterConds}
          onApply={(conds) => {
            setFilterConds(conds); setFilterMode('and'); setFilterDesc('');
            p.onFilterChange?.(conds.length ? { mode: 'and', conditions: conds } : null);
            setActiveSV(null); setGroupOpen(false);
          }}
          onClose={() => setGroupOpen(false)} />
      )}

      {reportOpen && (
        <ReportDesigner title={p.title ?? 'Report'} presetEntity={presetEntity} fields={reportFields} rows={viewRows}
          onClose={() => setReportOpen(false)} />
      )}

      <ConfirmDialog open={delOpen} danger
        title={delMode === 'purge'
          ? (count > 1 ? `Elimina definitivamente ${count} elementi` : 'Elimina definitivamente')
          : (count > 1 ? t('list.deleteManyTitle', { n: count }) : t('list.deleteOneTitle'))}
        message={delMode === 'purge'
          ? (count === 1
            ? `Eliminazione DEFINITIVA e irreversibile di «${labelOf(selectedRows[0]!)}».`
            : `Eliminazione DEFINITIVA e irreversibile di ${count} elementi: ${selectedRows.slice(0, 8).map(labelOf).join(', ')}${count > 8 ? `, e altri ${count - 8}` : ''}.`)
          : (count === 1
            ? `Vuoi eliminare «${labelOf(selectedRows[0]!)}»?`
            : `Vuoi eliminare ${count} elementi: ${selectedRows.slice(0, 8).map(labelOf).join(', ')}${count > 8 ? `, e altri ${count - 8}` : ''}?`)}
        confirmLabel={delMode === 'purge' ? 'Elimina definitivamente' : t('list.delete')} busy={delBusy} onConfirm={() => void confirmDelete()} onCancel={() => setDelOpen(false)} />

      {aiFilterOpen && (
        <AiFilterPanel open entity={p.exportName ?? p.title ?? 'lista'}
          fields={exportFields}
          initial={{ query: '', conditions: filterConds, mode: filterMode }}
          onApply={(conds, d, m) => { setFilterConds(conds); setFilterDesc(d); setFilterMode(m); p.onFilterChange?.(conds.length ? { mode: m, conditions: conds } : null); }}
          onClose={() => setAiFilterOpen(false)} />
      )}

      {/* Hub AI: unica icona stella → tutte le funzioni AI (Filtro intelligente + extra es. Trova doppioni) */}
      {aiMenuOpen && (
        <Modal open size="md" title="Funzioni AI" onClose={() => setAiMenuOpen(false)}>
          <div className="ai-hub">
            <button className="ai-hub-item" onClick={() => { setAiMenuOpen(false); setAiFilterOpen(true); }}>
              <Wand2 size={18} />
              <span><span className="t">Filtro intelligente</span><span className="d">Cerca e filtra in linguaggio naturale (anche a voce)</span></span>
            </button>
            {(p.aiActions ?? []).map((a) => { const I = a.icon ?? Sparkles; return (
              <button key={a.key} className="ai-hub-item" onClick={() => { setAiMenuOpen(false); a.onClick(); }}>
                <I size={18} />
                <span><span className="t">{a.label}</span>{a.description && <span className="d">{a.description}</span>}</span>
              </button>
            ); })}
          </div>
        </Modal>
      )}
    </div>
  );
}
