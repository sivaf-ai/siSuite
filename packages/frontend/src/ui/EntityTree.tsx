/**
 * EntityTree — UN SOLO componente per TUTTE le entità ad albero (STANDARD entità
 * ad albero v1.0 §6, ADR-0002). Config-driven: niente viste custom per entità.
 *
 * Funzioni (§6): clic-riga → scheda CRUD · chevron espandi · una sola riga di
 * inserimento rapido in cima · drag&drop a 3 zone (sopra/dentro/sotto) + «Sposta
 * in…» (entrambi escludono il sottoalbero, anti-ciclo) · ricerca con evidenziazione
 * (<mark>) + auto-espansione antenati + potatura · conteggi ricorsivi (diretti·sottoalbero)
 * · toggle Albero⇄Tabella e Manuale⇄Alfabetico · stato attivo/archiviato · eliminazione
 * a doppia conferma e 3 modi (§7). Modalità «pick» (§6.10): checkbox→radio + onPick(node),
 * con TUTTA la toolbar e la creazione al volo. Reattività via reload + bus cache (regola E).
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ChevronRight, ChevronDown, Plus, MoreVertical, Pencil, Copy, FolderInput, Trash2,
  RotateCcw, Search, X, ListTree, Table2, ArrowDownAZ, ArrowUpDown, FoldVertical, UnfoldVertical, Archive,
} from 'lucide-react';
import type { TreeNodeDto } from '@sisuite/shared';
import { CategoryIcon } from './categoryIcons';
import { TreeNodeCard, type NodeFormValue } from './TreeNodeCard';
import { ConfirmDialog } from './ConfirmDialog';
import { PromptDialog } from './PromptDialog';
import { Modal } from './Modal';
import { useApi, useReloadOnEnter, useStickyState, useArchivedView, mutate } from '../api/hooks';
import { apiFetch, ApiError } from '../api/client';
import { useToast } from './Toast';
import { useAuth } from '../auth/AuthContext';

const errMsg = (e: unknown) => (e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message);

export interface EntityTreeConfig {
  entity: string;                       // 'material_category'
  endpoint: string;                     // '/material-categories'
  labels: { singular: string; plural: string; subtitle?: string; newLabel?: string };
  permissions: { read: string; write: string };
  /** etichetta del conteggio per nodo (default: «N diretti · M nel ramo»). */
  countNoun?: string;                   // es. 'articoli'
  /** testo informativo accanto al nome (es. tipo · indirizzo per i siti). */
  rowMeta?: (node: Record<string, unknown>) => string | null;
  defaultSort?: 'manual' | 'alpha';
  /** icona di default per i nodi senza icona propria (es. 'map-pin' per i siti). */
  defaultIcon?: string;
  /** filtri di scope appesi alla GET (es. { company_id: id } per i siti di un cliente). */
  scopeQuery?: Record<string, string>;
  /** campi fissi aggiunti al body di creazione (es. { companyId }). */
  createDefaults?: Record<string, unknown>;
  /** parent_id usato come "radice" per gli alberi SCOPED (es. ubicazioni sotto un
   *  magazzino W): creazioni/sposta-in-radice puntano qui invece che a null. */
  rootParentId?: string | null;
  /** mostra la sezione Aspetto (icona/colore/immagine) nella scheda. Default true.
   *  Le entità ricche (siti, ubicazioni) la disattivano e usano extraCard. */
  showAppearance?: boolean;
  /** specializzazione della scheda per entità ricche (STANDARD §9: site=kind/indirizzo).
   *  init: valori iniziali dai campi extra del nodo · render: UI campi · toBody: → body API. */
  extraCard?: {
    init: (node?: Record<string, unknown>) => Record<string, unknown>;
    render: (vals: Record<string, unknown>, set: (p: Record<string, unknown>) => void) => ReactNode;
    toBody: (vals: Record<string, unknown>) => Record<string, unknown>;
  };
  /** pick mode (§6.10): la lente di un'altra entità apre QUESTO albero per selezionare. */
  mode?: 'manage' | 'pick';
  onPick?: (node: TreeNodeDto) => void;
}

interface Node extends TreeNodeDto { children: Node[]; depth: number; subtree: number }

/** Costruisce l'albero dai DTO piatti + calcola subtreeCount (somma diretti del ramo). */
function buildTree(items: TreeNodeDto[], sort: 'manual' | 'alpha'): { roots: Node[]; byId: Map<string, Node> } {
  const byId = new Map<string, Node>();
  items.forEach((c) => byId.set(c.id, { ...c, children: [], depth: 0, subtree: 0 }));
  const roots: Node[] = [];
  byId.forEach((n) => {
    const p = n.parentId ? byId.get(n.parentId) : undefined;
    if (p) p.children.push(n); else roots.push(n);
  });
  const cmp = sort === 'alpha'
    ? (a: Node, b: Node) => a.name.localeCompare(b.name, 'it')
    : (a: Node, b: Node) => (a.sequence - b.sequence) || a.name.localeCompare(b.name, 'it');
  const walk = (ns: Node[], depth: number): number => {
    ns.sort(cmp);
    let total = 0;
    for (const n of ns) {
      n.depth = depth;
      const childSub = walk(n.children, depth + 1);
      n.subtree = (n.directCount ?? 0) + childSub;
      total += n.subtree;
    }
    return total;
  };
  walk(roots, 0);
  return { roots, byId };
}

/** insieme degli id del sottoalbero di `id` (incluso) — per esclusione anti-ciclo. */
function subtreeIds(byId: Map<string, Node>, id: string): Set<string> {
  const out = new Set<string>([id]);
  const rec = (n: Node) => n.children.forEach((c) => { out.add(c.id); rec(c); });
  const n = byId.get(id); if (n) rec(n);
  return out;
}

function breadcrumb(byId: Map<string, Node>, id: string | null): string {
  const parts: string[] = [];
  let cur = id ? byId.get(id) : undefined;
  while (cur) { parts.unshift(cur.name); cur = cur.parentId ? byId.get(cur.parentId) : undefined; }
  return parts.length ? parts.join(' › ') : 'Radice';
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q.trim()) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark style={{ background: '#FFE39A', color: '#5A3B00', borderRadius: 3, padding: '0 1px' }}>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

const EMPTY_FORM: NodeFormValue = { name: '', description: '', color: '', icon: '', imageUrl: '' };

export function EntityTree({ config }: { config: EntityTreeConfig }) {
  const pick = config.mode === 'pick';
  const toast = useToast();
  const { user } = useAuth();
  const canWrite = !!user?.permissions.includes(config.permissions.write as never);

  const [archived, setArchived] = useArchivedView();
  const showArchived = !pick && archived;
  const qp = new URLSearchParams(config.scopeQuery ?? {});
  if (showArchived) qp.set('includeArchived', 'true');
  const { data, loading, reload } = useApi<{ items: TreeNodeDto[] }>(`${config.endpoint}${qp.toString() ? `?${qp.toString()}` : ''}`);
  useReloadOnEnter(reload);

  const [sort, setSort] = useStickyState<'manual' | 'alpha'>(`tree:${config.entity}:sort`, config.defaultSort ?? 'manual');
  const [view, setView] = useStickyState<'tree' | 'table'>(`tree:${config.entity}:view`, 'tree');
  const [expandedArr, setExpandedArr] = useStickyState<string[]>(`tree:${config.entity}:exp`, []);
  const expanded = useMemo(() => new Set(expandedArr), [expandedArr]);
  const setExpanded = (s: Set<string>) => setExpandedArr([...s]);
  const [q, setQ] = useState('');

  // scheda CRUD: chiusa | create(parentId) | edit(node)
  const [card, setCard] = useState<{ mode: 'create' | 'edit'; parentId: string | null; node?: Node } | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const [quick, setQuick] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [del, setDel] = useState<{ node: Node; step: 'choose' | 'confirmReassign' } | null>(null);
  const [cascade, setCascade] = useState<Node | null>(null);
  const [moveOf, setMoveOf] = useState<Node | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; zone: 'before' | 'inside' | 'after' } | null>(null);

  const all = (data?.items ?? []).filter((n) => pick ? n.active !== false : true);
  const { roots, byId } = useMemo(() => buildTree(all, sort), [all, sort]);

  // ricerca: set dei nodi che matchano + tutti i loro antenati (per la potatura)
  const visibleIds = useMemo(() => {
    if (!q.trim()) return null;
    const ql = q.toLowerCase();
    const keep = new Set<string>();
    byId.forEach((n) => {
      if (n.name.toLowerCase().includes(ql)) {
        keep.add(n.id);
        let p = n.parentId ? byId.get(n.parentId) : undefined;
        while (p) { keep.add(p.id); p = p.parentId ? byId.get(p.parentId) : undefined; }
      }
    });
    return keep;
  }, [q, byId]);
  const matchCount = visibleIds ? [...byId.values()].filter((n) => n.name.toLowerCase().includes(q.toLowerCase())).length : 0;

  const toggle = (id: string) => { const n = new Set(expanded); n.has(id) ? n.delete(id) : n.add(id); setExpanded(n); };
  const expandAll = () => setExpanded(new Set(all.map((n) => n.id)));
  const collapseAll = () => setExpanded(new Set());

  function openCreate(parentId: string | null) { setCard({ mode: 'create', parentId }); setMenuFor(null); }
  function openEdit(node: Node) { setCard({ mode: 'edit', parentId: node.parentId, node }); setMenuFor(null); }

  async function saveCard(v: NodeFormValue, extra: Record<string, unknown>) {
    if (!card) return;
    setCardBusy(true);
    try {
      const appearance = config.showAppearance === false ? {} : { color: v.color || null, icon: v.icon || null, imageUrl: v.imageUrl || null };
      const extraBody = config.extraCard ? config.extraCard.toBody(extra) : {};
      const base = { name: v.name, description: v.description || null, ...appearance, ...extraBody };
      if (card.mode === 'edit' && card.node) {
        await mutate('PATCH', `${config.endpoint}/${card.node.id}`, base);
        toast('Modifiche salvate');
      } else {
        const parentId = card.parentId ?? config.rootParentId ?? null;
        await apiFetch(config.endpoint, { method: 'POST', body: JSON.stringify({ ...base, parentId, ...(config.createDefaults ?? {}) }) });
        toast(`${config.labels.singular} creata`);
        if (card.parentId) { const n = new Set(expanded); n.add(card.parentId); setExpanded(n); }
      }
      setCard(null); reload();
    } catch (e) { toast(errMsg(e), 'error'); }
    finally { setCardBusy(false); }
  }

  async function quickAdd() {
    if (!quick.trim()) return;
    try { await apiFetch(config.endpoint, { method: 'POST', body: JSON.stringify({ name: quick.trim(), parentId: config.rootParentId ?? null, ...(config.createDefaults ?? {}) }) }); setQuick(''); reload(); }
    catch (e) { toast(errMsg(e), 'error'); }
  }

  async function duplicate(node: Node) {
    setMenuFor(null);
    try { await apiFetch(`${config.endpoint}/${node.id}/duplicate`, { method: 'POST' }); toast('Duplicata'); reload(); }
    catch (e) { toast(errMsg(e), 'error'); }
  }
  async function restore(node: Node) {
    try { await mutate('POST', `${config.endpoint}/${node.id}/restore`); toast('Ripristinata'); reload(); }
    catch (e) { toast(errMsg(e), 'error'); }
  }

  // ── eliminazione (§7): step 1 = block (prova diretta), poi scelta modi ──
  async function tryBlockDelete(node: Node) {
    setMenuFor(null);
    try {
      await mutate('DELETE', `${config.endpoint}/${node.id}?mode=block`);
      toast(`${config.labels.singular} eliminata`); reload();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setDel({ node, step: 'choose' }); // ha figli/usi → offri i modi
      else toast(errMsg(e), 'error');
    }
  }
  async function doReassign(node: Node) {
    try { await mutate('DELETE', `${config.endpoint}/${node.id}?mode=reassign`); toast('Voce eliminata, contenuti riassegnati al livello superiore'); setDel(null); reload(); }
    catch (e) { toast(errMsg(e), 'error'); setDel(null); }
  }
  async function doCascade(node: Node) {
    try { await mutate('DELETE', `${config.endpoint}/${node.id}?mode=cascade`); toast('Ramo eliminato'); setCascade(null); reload(); }
    catch (e) { toast(errMsg(e), 'error'); setCascade(null); }
  }

  // ── spostamento ──
  async function moveTo(nodeId: string, newParentId: string | null, sequence?: number) {
    const pid = newParentId ?? config.rootParentId ?? null;   // "radice" scoped → rootParentId
    try {
      await mutate('PATCH', `${config.endpoint}/${nodeId}`, { parentId: pid, ...(sequence !== undefined ? { sequence } : {}) });
      if (pid) { const n = new Set(expanded); n.add(pid); setExpanded(n); }
      reload();
    } catch (e) { toast(errMsg(e), 'error'); }
  }
  async function performDrop(dragId: string, target: { id: string; zone: 'before' | 'inside' | 'after' }) {
    const banned = subtreeIds(byId, dragId);
    if (banned.has(target.id)) { toast('Non puoi spostare una voce dentro sé stessa o una sua sotto-voce', 'error'); return; }
    const t = byId.get(target.id)!;
    if (target.zone === 'inside') { await moveTo(dragId, t.id); return; }
    const newParent = t.parentId ?? null;
    // riordino fratelli: inserisci dragId prima/dopo target
    const siblings = (newParent ? byId.get(newParent)!.children : roots).filter((s) => s.id !== dragId);
    const idx = siblings.findIndex((s) => s.id === target.id);
    const at = target.zone === 'before' ? idx : idx + 1;
    const order = [...siblings.slice(0, at).map((s) => s.id), dragId, ...siblings.slice(at).map((s) => s.id)];
    try {
      for (let i = 0; i < order.length; i++) {
        const body: Record<string, unknown> = { sequence: i };
        if (order[i] === dragId) body.parentId = newParent;
        await mutate('PATCH', `${config.endpoint}/${order[i]}`, body);
      }
      reload();
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  // ── render riga albero ──
  const renderRow = (n: Node): ReactNode => {
    if (visibleIds && !visibleIds.has(n.id)) return null;
    const hasKids = n.children.length > 0;
    const isOpen = expanded.has(n.id) || (!!visibleIds && hasKids); // in ricerca: antenati aperti
    const dragging = drag === n.id;
    const zone = over?.id === n.id ? over.zone : null;
    return (
      <div key={n.id}>
        <div className={`et-row${dragging ? ' et-dragging' : ''}${zone === 'inside' ? ' et-inside' : ''}`}
          style={{ paddingLeft: 6 + n.depth * 20 }}
          draggable={canWrite && !pick}
          onDragStart={() => setDrag(n.id)}
          onDragEnd={() => { setDrag(null); setOver(null); }}
          onDragOver={(e) => { if (!drag || drag === n.id) return; e.preventDefault();
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const y = (e.clientY - r.top) / r.height;
            setOver({ id: n.id, zone: y < 0.3 ? 'before' : y > 0.7 ? 'after' : 'inside' }); }}
          onDragLeave={() => setOver((o) => (o?.id === n.id ? null : o))}
          onDrop={(e) => { e.preventDefault(); if (drag && over) performDrop(drag, over); setDrag(null); setOver(null); }}
          onClick={() => { if (pick) config.onPick?.(n); else if (canWrite) openEdit(n); }}>
          {zone === 'before' && <span className="et-line" style={{ top: 0 }} />}
          {zone === 'after' && <span className="et-line" style={{ bottom: 0 }} />}
          <button className="et-chev" style={{ visibility: hasKids ? 'visible' : 'hidden' }}
            onClick={(e) => { e.stopPropagation(); toggle(n.id); }} aria-label={isOpen ? 'Comprimi' : 'Espandi'}>
            {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          {pick
            ? <input type="radio" name={`pick-${config.entity}`} onClick={(e) => e.stopPropagation()} onChange={() => config.onPick?.(n)} className="et-radio" />
            : null}
          <span className="et-ico" style={{ color: n.color || 'var(--brand)' }}>
            {n.imageUrl ? <img src={n.imageUrl} alt="" className="et-img" /> : <CategoryIcon name={n.icon || config.defaultIcon || null} size={16} color={n.color} />}
          </span>
          <span className="et-name"><Highlight text={n.name} q={q} /></span>
          {config.rowMeta && config.rowMeta(n as unknown as Record<string, unknown>) && <span className="et-meta">{config.rowMeta(n as unknown as Record<string, unknown>)}</span>}
          {n.active === false && <span className="et-badge et-off">off</span>}
          {n.archivedAt ? <span className="et-badge et-arch">Archiviato</span> : null}
          {(n.directCount !== undefined || n.subtree > 0) && (
            <span className="et-count" title={`${n.directCount ?? 0} diretti · ${n.subtree} nel ramo${config.countNoun ? ' (' + config.countNoun + ')' : ''}`}>
              {n.directCount ?? 0}{n.subtree !== (n.directCount ?? 0) ? <span className="et-count-sub"> · {n.subtree}▾</span> : null}
            </span>
          )}
          {!pick && canWrite && !showArchived && (
            <span className="et-acts">
              <button className="xbtn" title={`Aggiungi sotto-${config.labels.singular.toLowerCase()}`} onClick={(e) => { e.stopPropagation(); openCreate(n.id); }}><Plus size={14} /></button>
              <button className="xbtn" title="Altre azioni" onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === n.id ? null : n.id); }}><MoreVertical size={14} /></button>
              {menuFor === n.id && (
                <>
                  <div onClick={(e) => { e.stopPropagation(); setMenuFor(null); }} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                  <div className="et-menu" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => openEdit(n)}><Pencil size={14} /> Modifica</button>
                    <button onClick={() => openCreate(n.id)}><Plus size={14} /> Aggiungi sotto-voce</button>
                    <button onClick={() => duplicate(n)}><Copy size={14} /> Duplica</button>
                    <button onClick={() => { setMoveOf(n); setMenuFor(null); }}><FolderInput size={14} /> Sposta in…</button>
                    <button className="danger" onClick={() => tryBlockDelete(n)}><Trash2 size={14} /> Elimina</button>
                  </div>
                </>
              )}
            </span>
          )}
          {!pick && canWrite && showArchived && (
            <span className="et-acts" style={{ opacity: 1 }}>
              <button className="xbtn" title="Ripristina" onClick={(e) => { e.stopPropagation(); restore(n); }}><RotateCcw size={14} /></button>
            </span>
          )}
        </div>
        {isOpen && n.children.map(renderRow)}
      </div>
    );
  };

  // ── render tabella (vista piatta con Percorso) ──
  const flat: Node[] = [];
  const collect = (ns: Node[]) => ns.forEach((n) => { if (!visibleIds || visibleIds.has(n.id)) { flat.push(n); collect(n.children); } });
  collect(roots);

  const body = (
    <>
      <style>{`
        .et-wrap{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);display:flex;flex-direction:column;min-height:0}
        .et-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line);flex-wrap:wrap;position:sticky;top:0;background:var(--card);z-index:3;border-radius:var(--r-lg) var(--r-lg) 0 0}
        .et-title{font-size:var(--fs-h2);font-weight:700;margin:0}
        .et-sub{font-size:12px;color:var(--ink-faint)}
        .et-search{display:flex;align-items:center;gap:7px;height:34px;padding:0 10px;border:1.5px solid var(--line);border-radius:9px;background:var(--card);min-width:180px;flex:1;max-width:340px}
        .et-search input{border:0;outline:none;background:none;font:inherit;font-size:13px;flex:1;color:var(--ink)}
        .et-tool{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:1px solid var(--line);border-radius:9px;background:var(--card);color:var(--ink-soft);cursor:pointer}
        .et-tool.on{background:var(--brand-wash);border-color:var(--brand);color:var(--brand-ink)}
        .et-body{padding:6px;overflow:auto;flex:1 1 auto}
        .et-quick{display:flex;align-items:center;gap:8px;padding:7px 10px;margin:2px 2px 6px;border:1px dashed var(--line);border-radius:9px}
        .et-quick input{border:0;outline:none;background:none;font:inherit;font-size:13px;flex:1;color:var(--ink)}
        .et-row{display:flex;align-items:center;gap:7px;padding:7px 8px;border-radius:8px;font-size:13.5px;position:relative;cursor:pointer}
        .et-row:hover{background:var(--paper)}
        .et-row.et-inside{box-shadow:inset 0 0 0 2px var(--brand)}
        .et-dragging{opacity:.45}
        .et-line{position:absolute;left:8px;right:8px;height:2px;background:var(--brand)}
        .et-chev{background:none;border:0;color:var(--ink-faint);cursor:pointer;display:grid;place-items:center;width:18px;flex:0 0 auto}
        .et-radio{flex:0 0 auto;accent-color:var(--brand);width:15px;height:15px}
        .et-ico{flex:0 0 auto;display:inline-flex;align-items:center}
        .et-img{width:18px;height:18px;border-radius:4px;object-fit:cover}
        .et-name{font-weight:600;color:var(--ink)}
        .et-meta{font-size:11.5px;color:var(--ink-faint);margin-left:2px}
        .et-count{margin-left:6px;font-size:11.5px;color:var(--ink-faint);font-family:var(--font-mono)}
        .et-count-sub{color:var(--brand-ink)}
        .et-badge{font-size:10px;padding:1px 6px;border-radius:999px;font-weight:600}
        .et-off{background:var(--neutral-wash);color:var(--ink-soft)}
        .et-arch{background:var(--warning-wash);color:var(--warning)}
        .et-acts{margin-left:auto;display:flex;gap:2px;opacity:0;position:relative}
        .et-row:hover .et-acts{opacity:1}
        .et-menu{position:absolute;top:26px;right:0;z-index:21;background:var(--card);border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow-2);padding:5px;min-width:190px;display:flex;flex-direction:column}
        .et-menu button{display:flex;align-items:center;gap:9px;padding:8px 10px;border:0;background:none;font:inherit;font-size:13px;color:var(--ink);cursor:pointer;border-radius:7px;text-align:left}
        .et-menu button:hover{background:var(--paper)}
        .et-menu button.danger{color:var(--danger)}
        .et-tbl{width:100%;border-collapse:collapse;font-size:13px}
        .et-tbl th{text-align:left;font-size:var(--fs-th);text-transform:uppercase;color:var(--ink-faint);padding:8px 10px;border-bottom:1px solid var(--line)}
        .et-tbl td{padding:8px 10px;border-bottom:1px solid var(--line-2)}
        .et-path{color:var(--ink-faint);font-size:12px}
      `}</style>
      <div className="et-wrap" style={pick ? { height: '70vh' } : {}}>
        <div className="et-head">
          <div style={{ flex: '0 0 auto', marginRight: 4 }}>
            <h2 className="et-title">{config.labels.plural}</h2>
            {config.labels.subtitle && <div className="et-sub">{config.labels.subtitle}</div>}
          </div>
          <div className="et-search">
            <Search size={15} color="var(--ink-faint)" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Cerca ${config.labels.plural.toLowerCase()}…`} />
            {q && <button className="xbtn" title="Pulisci" onClick={() => setQ('')}><X size={14} /></button>}
          </div>
          {q && <span className="et-sub">{matchCount} risultati</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="et-tool" title="Espandi tutto" onClick={expandAll}><UnfoldVertical size={16} /></button>
            <button className="et-tool" title="Comprimi tutto" onClick={collapseAll}><FoldVertical size={16} /></button>
            <button className={`et-tool${sort === 'alpha' ? ' on' : ''}`} title={sort === 'alpha' ? 'Ordine alfabetico (clic: manuale)' : 'Ordine manuale (clic: alfabetico)'}
              onClick={() => setSort(sort === 'alpha' ? 'manual' : 'alpha')}>{sort === 'alpha' ? <ArrowDownAZ size={16} /> : <ArrowUpDown size={16} />}</button>
            <button className={`et-tool${view === 'table' ? ' on' : ''}`} title={view === 'table' ? 'Vista albero' : 'Vista tabella'}
              onClick={() => setView(view === 'table' ? 'tree' : 'table')}>{view === 'table' ? <ListTree size={16} /> : <Table2 size={16} />}</button>
            {!pick && canWrite && (
              <button className={`et-tool${showArchived ? ' on' : ''}`} title={showArchived ? 'Mostra attivi' : 'Mostra archiviati'}
                onClick={() => setArchived(!archived)}><Archive size={16} /></button>
            )}
            {canWrite && <button className="btn btn-primary btn-sm" onClick={() => openCreate(null)}><Plus size={15} /> {config.labels.newLabel ?? `Nuova ${config.labels.singular.toLowerCase()}`}</button>}
          </div>
        </div>

        <div className="et-body">
          {canWrite && !showArchived && view === 'tree' && (
            <div className="et-quick">
              <Plus size={15} color="var(--ink-faint)" />
              <input value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') quickAdd(); }}
                placeholder={`Aggiungi ${config.labels.singular.toLowerCase()} alla radice e premi Invio…`} />
            </div>
          )}
          {loading ? <div className="et-sub" style={{ padding: 12 }}>Caricamento…</div>
            : roots.length === 0 ? <div className="et-sub" style={{ padding: 12 }}>{showArchived ? 'Nessuna voce archiviata.' : 'Ancora nessuna voce.'}</div>
            : view === 'tree' ? roots.map(renderRow)
            : (
              <table className="et-tbl">
                <thead><tr><th>{config.labels.singular}</th><th>Percorso</th><th style={{ textAlign: 'right' }}>{config.countNoun ?? 'Rif.'}</th></tr></thead>
                <tbody>
                  {flat.map((n) => (
                    <tr key={n.id} style={{ cursor: pick || canWrite ? 'pointer' : 'default' }}
                      onClick={() => { if (pick) config.onPick?.(n); else if (canWrite) openEdit(n); }}>
                      <td><span className="et-ico" style={{ color: n.color || 'var(--brand)', marginRight: 7, verticalAlign: 'middle' }}><CategoryIcon name={n.icon || config.defaultIcon || null} size={15} color={n.color} /></span><Highlight text={n.name} q={q} />{n.active === false && <span className="et-badge et-off" style={{ marginLeft: 6 }}>off</span>}</td>
                      <td className="et-path">{breadcrumb(byId, n.parentId)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}>{n.directCount ?? 0} · {n.subtree}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>

      {/* Scheda CRUD nodo */}
      {card && (
        <TreeNodeCard open mode={card.mode} busy={cardBusy}
          parentLabel={card.mode === 'create' ? `In: ${breadcrumb(byId, card.parentId)}` : breadcrumb(byId, card.node!.parentId)}
          showAppearance={config.showAppearance !== false}
          initial={card.mode === 'edit' && card.node
            ? { name: card.node.name, description: card.node.description ?? '', color: card.node.color ?? '', icon: card.node.icon ?? '', imageUrl: card.node.imageUrl ?? '' }
            : EMPTY_FORM}
          extraInitial={config.extraCard ? config.extraCard.init(card.mode === 'edit' ? (card.node as unknown as Record<string, unknown>) : undefined) : undefined}
          renderExtra={config.extraCard ? config.extraCard.render : undefined}
          onSave={saveCard} onClose={() => setCard(null)} />
      )}

      {/* Eliminazione — passo 1: scelta dei modi (il nodo ha figli/usi) */}
      <ConfirmDialog open={!!del && del.step === 'choose'} danger title={`Eliminare «${del?.node.name}»?`}
        message={`«${del?.node.name}» contiene sotto-voci o elementi collegati (${del?.node.directCount ?? 0} diretti · ${del?.node.subtree ?? 0} nel ramo). Scegli come procedere.`}
        confirmLabel="Riassegna al livello superiore" cancelLabel="Annulla"
        extraLabel="Elimina tutto il ramo" extraDanger
        onExtra={() => { const n = del!.node; setDel(null); setCascade(n); }}
        onConfirm={() => del && doReassign(del.node)} onCancel={() => setDel(null)} />

      {/* Eliminazione — passo 2 cascata: digita il nome */}
      <PromptDialog open={!!cascade} title={`Elimina tutto il ramo «${cascade?.name}»`}
        message={`Verranno archiviati la voce e tutte le sue sotto-voci. Gli elementi collegati resteranno senza ${config.labels.singular.toLowerCase()}. Per confermare digita il nome esatto: «${cascade?.name}».`}
        label="Nome della voce" placeholder={cascade?.name} confirmLabel="Elimina il ramo"
        onConfirm={(val) => { if (cascade && val.trim() === cascade.name) doCascade(cascade); else toast('Il nome non corrisponde', 'error'); }}
        onCancel={() => setCascade(null)} />

      {/* Sposta in… (esclude il sottoalbero) */}
      {moveOf && (
        <Modal open size="md" title={`Sposta «${moveOf.name}» in…`} onClose={() => setMoveOf(null)}
          footer={<button className="btn btn-ghost" onClick={() => setMoveOf(null)}>Annulla</button>}>
          <MovePicker roots={roots} banned={subtreeIds(byId, moveOf.id)} currentParent={moveOf.parentId}
            onChoose={(pid) => { const id = moveOf.id; setMoveOf(null); moveTo(id, pid); }} />
        </Modal>
      )}
    </>
  );

  return body;
}

/** Selettore di destinazione per «Sposta in…»: albero ridotto, esclude il sottoalbero. */
function MovePicker({ roots, banned, currentParent, onChoose }: {
  roots: Node[]; banned: Set<string>; currentParent: string | null; onChoose: (parentId: string | null) => void;
}) {
  const render = (n: Node): ReactNode => {
    const disabled = banned.has(n.id);
    return (
      <div key={n.id} style={{ paddingLeft: n.depth * 18 }}>
        <button className="mv-row" disabled={disabled} onClick={() => onChoose(n.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', border: 0, background: 'none',
            cursor: disabled ? 'not-allowed' : 'pointer', color: disabled ? 'var(--ink-faint)' : 'var(--ink)', borderRadius: 8, font: 'inherit', fontSize: 13.5 }}>
          <CategoryIcon name={n.icon} size={15} color={n.color} />
          <span style={{ fontWeight: 600 }}>{n.name}</span>
          {n.id === currentParent && <span className="et-sub" style={{ marginLeft: 6 }}>(attuale)</span>}
        </button>
        {n.children.map(render)}
      </div>
    );
  };
  return (
    <div>
      <style>{`.mv-row:hover:not(:disabled){background:var(--paper)}`}</style>
      <button className="mv-row" onClick={() => onChoose(null)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', border: 0, background: 'none', cursor: 'pointer', color: 'var(--ink)', borderRadius: 8, font: 'inherit', fontSize: 13.5, fontWeight: 700 }}>
        ⌂ Radice {currentParent === null && <span className="et-sub" style={{ marginLeft: 6 }}>(attuale)</span>}
      </button>
      {roots.map(render)}
    </div>
  );
}
