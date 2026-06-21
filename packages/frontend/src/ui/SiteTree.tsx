/**
 * SiteTree — albero Siti/Località di un soggetto (brief Blocco C-bis).
 * Gerarchia espandibile (riusa il pattern albero fasi/WBS): ogni nodo è un sito
 * con tipo e indirizzo. Add (radice / sotto-sito) e delete inline. FormCard.
 */
import { useState } from 'react';
import { MapPin, ChevronRight, ChevronDown, Plus, Trash2, Building2 } from 'lucide-react';
import type { SiteDto } from '@sisuite/shared';
import { FormCard } from './FormPage';
import { useApi, mutate } from '../api/hooks';
import { apiFetch, ApiError } from '../api/client';
import { useToast } from './Toast';

const KIND_LABEL: Record<string, string> = {
  plant: 'Stabilimento', building: 'Edificio', floor: 'Piano', room: 'Locale',
  cabinet: 'Armadio', pop: 'POP', area: 'Area', other: 'Altro',
};
const KINDS = Object.keys(KIND_LABEL);

interface Node extends SiteDto { children: Node[] }
/** indirizzo jsonb country-driven → riga leggibile (ignora la chiave country). */
function fmtAddr(a: Record<string, unknown> | null | undefined): string {
  if (!a) return '';
  return Object.entries(a)
    .filter(([k, v]) => k !== 'country' && typeof v === 'string' && v.trim() !== '')
    .map(([, v]) => String(v))
    .join(', ');
}
function buildTree(items: SiteDto[]): Node[] {
  const byId = new Map<string, Node>();
  items.forEach((s) => byId.set(s.id, { ...s, children: [] }));
  const roots: Node[] = [];
  byId.forEach((n) => {
    if (n.parentId && byId.has(n.parentId)) byId.get(n.parentId)!.children.push(n);
    else roots.push(n);
  });
  return roots;
}

export function SiteTree({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const toast = useToast();
  const { data, loading, reload } = useApi<{ items: SiteDto[] }>(`/sites?company_id=${companyId}`);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null | undefined>(undefined); // undefined=nessuno, null=radice, id=figlio
  const [name, setName] = useState('');
  const [kind, setKind] = useState('building');
  const [busy, setBusy] = useState(false);

  const roots = buildTree(data?.items ?? []);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await apiFetch('/sites', { method: 'POST', body: JSON.stringify({ companyId, parentId: adding ?? null, name: name.trim(), kind }) });
      toast('Sito aggiunto'); setName(''); setAdding(undefined);
      if (adding) setOpen((s) => new Set(s).add(adding));
      void reload();
    } catch (e) { toast(e instanceof ApiError ? `Errore ${e.status}` : 'Errore', 'error'); }
    finally { setBusy(false); }
  }
  async function del(id: string) {
    try { await mutate('DELETE', `/sites/${id}`); toast('Sito eliminato'); void reload(); }
    catch (e) { toast(e instanceof ApiError ? `Errore ${e.status}` : 'Errore', 'error'); }
  }

  const renderNode = (n: Node, depth: number): React.ReactNode => {
    const hasKids = n.children.length > 0;
    const isOpen = open.has(n.id);
    return (
      <div key={n.id}>
        <div className="site-row" style={{ paddingLeft: 8 + depth * 20 }}>
          <button className="site-chev" onClick={() => hasKids && toggle(n.id)} style={{ visibility: hasKids ? 'visible' : 'hidden' }}>
            {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          <MapPin size={15} className="site-ico" />
          <span className="site-name">{n.name}</span>
          <span className="serialtag">{KIND_LABEL[n.kind] ?? n.kind}</span>
          {fmtAddr(n.address) && <span className="site-addr">{fmtAddr(n.address)}</span>}
          {canEdit && (
            <span className="site-acts">
              <button className="xbtn" title="Aggiungi sotto-sito" onClick={() => { setAdding(n.id); setName(''); setKind('floor'); }}><Plus size={14} /></button>
              <button className="xbtn" title="Elimina (e i sotto-siti)" onClick={() => del(n.id)}><Trash2 size={14} /></button>
            </span>
          )}
        </div>
        {adding === n.id && renderAddRow(depth + 1)}
        {isOpen && n.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  const renderAddRow = (depth: number) => (
    <div className="site-row site-add" style={{ paddingLeft: 8 + depth * 20 }}>
      <input className="bi" style={{ minHeight: 30, flex: 1 }} autoFocus placeholder="Nome del sito…" value={name}
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
      <select className="bi" style={{ minHeight: 30, width: 130 }} value={kind} onChange={(e) => setKind(e.target.value)}>
        {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
      </select>
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={add}>Aggiungi</button>
      <button className="btn btn-ghost btn-sm" onClick={() => setAdding(undefined)}>Annulla</button>
    </div>
  );

  return (
    <FormCard icon={<Building2 size={16} />} title="Siti / Località">
      <style>{`
        .site-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;font-size:13px}
        .site-row:hover{background:var(--paper)}
        .site-chev{background:none;border:0;color:var(--ink-faint);cursor:pointer;display:grid;place-items:center;width:18px}
        .site-ico{color:var(--brand);flex:0 0 auto}
        .site-name{font-weight:600;color:var(--ink)}
        .site-addr{font-size:11.5px;color:var(--ink-faint)}
        .site-acts{margin-left:auto;display:flex;gap:2px;opacity:0}
        .site-row:hover .site-acts{opacity:1}
        .site-add{gap:8px}
      `}</style>
      {loading ? <div className="faint" style={{ padding: 8 }}>Caricamento…</div>
        : roots.length === 0 && adding === undefined ? <div className="faint" style={{ padding: 8 }}>Nessun sito. {canEdit && 'Aggiungi il primo (es. uno stabilimento).'}</div>
        : roots.map((n) => renderNode(n, 0))}
      {adding === null && renderAddRow(0)}
      {canEdit && adding === undefined && (
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => { setAdding(null); setName(''); setKind('plant'); }}><Plus size={15} /> Aggiungi sito radice</button>
      )}
    </FormCard>
  );
}
