/**
 * SiteTree — albero Siti/Località di un soggetto (STANDARD entità ad albero §9:
 * "albero in scheda Soggetto, scope companyId"). Usa il componente generico
 * EntityTree (niente logica d'albero custom): scope per cliente, scheda con campo
 * extra «Tipo» (i siti non hanno icona/colore). Drag&drop, Sposta in…, ricerca,
 * eliminazione a 3 modi, sequence: tutto dallo standard.
 */
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Building2 } from 'lucide-react';
import { EntityTree, type EntityTreeConfig } from './EntityTree';
import { AddressField } from './AddressField';
import { useApi } from '../api/hooks';
import { useLookups, lookupLabel } from '../context/Lookups';
import { swatchColor } from '../theme/palette';
import { useAuth } from '../auth/AuthContext';

export type KindMeta = Record<string, { icon: string | null; color: string }>;

/** indirizzo jsonb country-driven → riga leggibile (ignora la chiave country). */
function addrSummary(a: unknown): string {
  if (!a || typeof a !== 'object') return '';
  return Object.entries(a as Record<string, unknown>)
    .filter(([k, v]) => k !== 'country' && typeof v === 'string' && (v as string).trim() !== '')
    .map(([, v]) => String(v)).join(', ');
}

export function siteTreeConfig(
  companyId: string,
  kinds: { value: string; label: string }[],
  opts: { country: string; canAddr: boolean; kindMeta: KindMeta },
): EntityTreeConfig {
  const labelOf = (k: string) => kinds.find((o) => o.value === k)?.label ?? k;
  const def = kinds.find((o) => o.value === 'building') ? 'building' : (kinds[0]?.value ?? 'building');
  return {
    entity: 'site',
    endpoint: '/sites',
    labels: { singular: 'Sito', plural: 'Siti / Località', subtitle: 'Gerarchia siti e località del cliente', newLabel: 'Nuovo sito' },
    permissions: { read: 'site:read', write: 'site:update' },
    defaultIcon: 'map-pin',
    showAppearance: false,
    countNoun: 'asset/ordini',
    scopeQuery: { company_id: companyId },
    createDefaults: { companyId },
    // icona+colore dal Tipo di sito (configurabili in Stati & etichette)
    nodeAppearance: (n) => opts.kindMeta[String(n.kind ?? def)] ?? {},
    rowMeta: (n) => [labelOf(String(n.kind ?? def)), addrSummary(n.address)].filter(Boolean).join(' · ') || null,
    extraCard: {
      init: (node) => ({ kind: (node?.kind as string) ?? def, address: (node?.address as Record<string, unknown>) ?? {} }),
      // l'indirizzo entra nel body solo se l'utente può vederlo/modificarlo (field-level RBAC)
      toBody: (vals) => ({ kind: vals.kind ?? def, ...(opts.canAddr ? { address: (vals.address as Record<string, unknown>) ?? {} } : {}) }),
      render: (vals, set) => (
        <>
          <div className="tnc-field" style={{ border: '1.5px solid var(--line)', borderRadius: 10, padding: '9px 11px 7px' }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-faint)', marginBottom: 2 }}>Tipo</label>
            <select value={String(vals.kind ?? def)} onChange={(e) => set({ kind: e.target.value })}
              style={{ width: '100%', border: 0, outline: 'none', background: 'none', font: 'inherit', fontSize: 14, color: 'var(--ink)' }}>
              {kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>
          {opts.canAddr && (
            <AddressField label="Indirizzo" country={opts.country} bare
              value={(vals.address as Record<string, unknown>) ?? {}}
              onChange={(address) => set({ address })} />
          )}
        </>
      ),
    },
  };
}

/** Albero GLOBALE dei siti, raggruppato per cliente (menu Anagrafiche › Siti/Località):
 *  ogni cliente è un nodo radice espandibile che contiene il SUO albero siti completo
 *  (stesso SiteTree per-cliente, con icone/indirizzo/3-modi). Lazy: l'albero del cliente
 *  si carica all'espansione. */
export function GlobalSiteTree() {
  const { data, loading } = useApi<{ items: import('@sisuite/shared').SiteDto[] }>('/sites');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; count: number }>();
    for (const s of data?.items ?? []) {
      if (!s.companyId) continue;
      const g = m.get(s.companyId) ?? { name: s.companyName ?? '—', count: 0 };
      g.count++; m.set(s.companyId, g);
    }
    return [...m.entries()].map(([id, g]) => ({ id, ...g })).sort((a, b) => a.name.localeCompare(b.name, 'it'));
  }, [data]);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (loading) return <div className="et-sub" style={{ padding: 12 }}>Caricamento…</div>;
  if (!groups.length) return <div className="et-sub" style={{ padding: 12 }}>Nessun sito. Crea i siti dalla scheda di un Soggetto › Località e siti.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <style>{`.gst-cli{display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:var(--r-lg);background:var(--card);cursor:pointer;font:inherit;font-size:14px;font-weight:700;color:var(--ink)}
        .gst-cli:hover{background:var(--paper)} .gst-cnt{margin-left:auto;font-size:12px;font-weight:600;color:var(--ink-faint);font-family:var(--font-mono)}`}</style>
      {groups.map((g) => (
        <div key={g.id}>
          <button className="gst-cli" onClick={() => toggle(g.id)}>
            {open.has(g.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <Building2 size={15} style={{ color: 'var(--brand)' }} /> {g.name}
            <span className="gst-cnt">{g.count} siti</span>
          </button>
          {open.has(g.id) && <div style={{ marginTop: 8, paddingLeft: 8 }}><SiteTree companyId={g.id} /></div>}
        </div>
      ))}
    </div>
  );
}

/** mappa codice-tipo → {icona, colore} dai lookup site_kind (per colorare l'albero). */
export function useSiteKindMeta(): { kinds: { value: string; label: string }[]; kindMeta: KindMeta } {
  const lk = useLookups();
  const items = lk.byCategory('site_kind');
  const kinds = items.map((l) => ({ value: l.code, label: lookupLabel(l) }));
  const kindMeta: KindMeta = {};
  items.forEach((l) => { kindMeta[l.code] = { icon: l.icon, color: swatchColor(l.colorToken) }; });
  return { kinds, kindMeta };
}

export function SiteTree({ companyId, country = 'IT' }: { companyId: string; country?: string; canEdit?: boolean }) {
  const { user } = useAuth();
  const canAddr = !!user?.permissions.includes('site:address' as never);
  const { kinds, kindMeta } = useSiteKindMeta();
  // niente FormCard: l'EntityTree ha già il suo riquadro + testata (evita il doppio titolo).
  return <EntityTree config={siteTreeConfig(companyId, kinds, { country, canAddr, kindMeta })} />;
}
