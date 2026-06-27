/**
 * CategoriePage — Anagrafica Categorie articolo ad ALBERO (Blocco B.2).
 * Vista gerarchica (parent_id → figli) espandi/collassa, modellata su SiteTree.
 * CRUD in Modal CENTRATO con campi label-nel-bordo (Nome, Colore opz., Padre opz.).
 * Niente popup nativi: elimina via ConfirmDialog con il nome. Riusa material:*.
 */
import { useState } from 'react';
import { ChevronRight, ChevronDown, Plus, Pencil, Trash2, FolderTree } from 'lucide-react';
import type { MaterialCategoryDto } from '@sisuite/shared';
import { Page } from '../components/Page';
import { Modal } from '../ui/Modal';
import { IconPicker } from '../ui/IconPicker';
import { CategoryIcon } from '../ui/categoryIcons';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useApi, useReloadOnEnter, mutate } from '../api/hooks';
import { apiFetch, ApiError } from '../api/client';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';

const errMsg = (e: unknown) => (e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message);

interface Node extends MaterialCategoryDto { children: Node[] }
function buildTree(items: MaterialCategoryDto[]): Node[] {
  const byId = new Map<string, Node>();
  items.forEach((c) => byId.set(c.id, { ...c, children: [] }));
  const roots: Node[] = [];
  byId.forEach((n) => {
    if (n.parentId && byId.has(n.parentId)) byId.get(n.parentId)!.children.push(n);
    else roots.push(n);
  });
  const sortRec = (ns: Node[]) => { ns.sort((a, b) => a.name.localeCompare(b.name, 'it')); ns.forEach((n) => sortRec(n.children)); };
  sortRec(roots);
  return roots;
}

/** opzioni "Categoria padre" con indentazione per livello (esclude un sottoalbero). */
function flatten(nodes: Node[], depth: number, excludeId: string | undefined, out: { id: string; label: string }[]) {
  for (const n of nodes) {
    if (n.id === excludeId) continue; // niente self/discendenti come padre
    out.push({ id: n.id, label: `${'  '.repeat(depth)}${n.name}` });
    flatten(n.children, depth + 1, excludeId, out);
  }
}

export function CategoriePage() {
  const toast = useToast();
  const { user } = useAuth();
  const canWrite = !!user?.permissions.includes('material:update' as never);
  const { data, loading, reload } = useApi<{ items: MaterialCategoryDto[] }>('/material-categories');
  useReloadOnEnter(reload);

  const [open, setOpen] = useState<Set<string>>(new Set());
  // editing: undefined = chiuso; altrimenti { id?: per modifica } + form
  const [editing, setEditing] = useState<{ id?: string } | undefined>(undefined);
  const [form, setForm] = useState<{ name: string; color: string; icon: string; parentId: string }>({ name: '', color: '', icon: '', parentId: '' });
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<MaterialCategoryDto | null>(null);

  const roots = buildTree(data?.items ?? []);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function openNew(parentId?: string) {
    setForm({ name: '', color: '', icon: '', parentId: parentId ?? '' });
    setEditing({});
  }
  function openEdit(c: MaterialCategoryDto) {
    setForm({ name: c.name, color: c.color ?? '', icon: c.icon ?? '', parentId: c.parentId ?? '' });
    setEditing({ id: c.id });
  }

  const parentOptions: { id: string; label: string }[] = [];
  flatten(roots, 0, editing?.id, parentOptions);

  async function save() {
    if (!form.name.trim()) { toast('Il nome è obbligatorio', 'error'); return; }
    setBusy(true);
    try {
      const body = { name: form.name.trim(), color: form.color.trim() || null, icon: form.icon.trim() || null, parentId: form.parentId || null };
      if (editing?.id) await mutate('PATCH', `/material-categories/${editing.id}`, body);
      else await apiFetch('/material-categories', { method: 'POST', body: JSON.stringify(body) });
      toast(editing?.id ? 'Modifiche salvate' : 'Categoria creata');
      if (!editing?.id && form.parentId) setOpen((s) => new Set(s).add(form.parentId));
      setEditing(undefined); reload();
    } catch (e) { toast(errMsg(e), 'error'); }
    finally { setBusy(false); }
  }

  async function doDelete() {
    if (!del) return;
    setBusy(true);
    try { await mutate('DELETE', `/material-categories/${del.id}`); toast('Categoria eliminata'); setDel(null); reload(); }
    catch (e) { toast(errMsg(e), 'error'); setDel(null); }
    finally { setBusy(false); }
  }

  const renderNode = (n: Node, depth: number): React.ReactNode => {
    const hasKids = n.children.length > 0;
    const isOpen = open.has(n.id);
    return (
      <div key={n.id}>
        <div className="cat-row" style={{ paddingLeft: 8 + depth * 22 }}>
          <button className="cat-chev" onClick={() => hasKids && toggle(n.id)} style={{ visibility: hasKids ? 'visible' : 'hidden' }}>
            {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          <span className="cat-ico" style={n.color ? { color: n.color } : undefined}><CategoryIcon name={n.icon} size={15} color={n.color} /></span>
          <span className="cat-name">{n.name}</span>
          {!n.active && <span className="serialtag">disattivata</span>}
          {canWrite && (
            <span className="cat-acts">
              <button className="xbtn" title="Aggiungi sotto-categoria" onClick={() => openNew(n.id)}><Plus size={14} /></button>
              <button className="xbtn" title="Modifica" onClick={() => openEdit(n)}><Pencil size={14} /></button>
              <button className="xbtn" title="Elimina" onClick={() => setDel(n)}><Trash2 size={14} /></button>
            </span>
          )}
        </div>
        {isOpen && n.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <Page>
      <style>{`
        .cat-wrap{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);padding:8px}
        .cat-head{display:flex;align-items:center;gap:10px;padding:10px 12px 12px}
        .cat-head h1{font-size:18px;font-weight:700;margin:0}
        .cat-head .sub{font-size:12.5px;color:var(--ink-faint)}
        .cat-row{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:8px;font-size:13.5px}
        .cat-row:hover{background:var(--paper)}
        .cat-chev{background:none;border:0;color:var(--ink-faint);cursor:pointer;display:grid;place-items:center;width:18px}
        .cat-ico{color:var(--brand);flex:0 0 auto;display:inline-flex;align-items:center}
        .cat-name{font-weight:600;color:var(--ink)}
        .cat-acts{margin-left:auto;display:flex;gap:2px;opacity:0}
        .cat-row:hover .cat-acts{opacity:1}
      `}</style>
      <div className="cat-wrap">
        <div className="cat-head">
          <FolderTree size={20} style={{ color: 'var(--brand)' }} />
          <div style={{ flex: 1 }}>
            <h1>Categorie articolo</h1>
            <div className="sub">Classificazione gerarchica degli articoli</div>
          </div>
          {canWrite && <button className="btn btn-primary btn-sm" onClick={() => openNew()}><Plus size={15} /> Nuova categoria</button>}
        </div>
        {loading ? <div className="faint" style={{ padding: 12 }}>Caricamento…</div>
          : roots.length === 0 ? <div className="faint" style={{ padding: 12 }}>Nessuna categoria. {canWrite && 'Crea la prima categoria radice.'}</div>
          : roots.map((n) => renderNode(n, 0))}
      </div>

      <Modal open={editing !== undefined} size="md" title={editing?.id ? 'Modifica categoria' : 'Nuova categoria'} onClose={() => setEditing(undefined)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setEditing(undefined)} disabled={busy}>Annulla</button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>{busy ? 'Salvo…' : 'Salva'}</button>
        </>}>
        <div className="dsx">
          <div className="bgrid">
            <div className="bf c4"><span className="bl">Nome <span className="req">*</span></span>
              <input className="bi" autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Es. Cavi, Connettori…" /></div>
            <div className="bf c2"><span className="bl">Colore</span>
              <input className="bi" type="color" value={form.color || '#888888'} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} style={{ padding: 4, minHeight: 38 }} /></div>
            <div className="bf c2"><span className="bl">Categoria padre</span>
              <select className="bi" value={form.parentId} onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}>
                <option value="">— Radice —</option>
                {parentOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select></div>
            <div className="bf c4"><span className="bl">Icona</span>
              <div style={{ border: '1.5px solid var(--line)', borderRadius: 9, padding: '14px 11px 11px', background: 'var(--card)' }}>
                <IconPicker value={form.icon} onChange={(icon) => setForm((f) => ({ ...f, icon }))} /></div></div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!del} danger title="Eliminare la categoria?"
        message={del ? `«${del.name}» verrà eliminata. Le eventuali sotto-categorie e gli articoli collegati restano senza categoria.` : ''}
        confirmLabel="Elimina" busy={busy} onConfirm={() => void doDelete()} onCancel={() => setDel(null)} />
    </Page>
  );
}
