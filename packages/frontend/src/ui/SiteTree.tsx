/**
 * SiteTree — albero Siti/Località di un soggetto (STANDARD entità ad albero §9:
 * "albero in scheda Soggetto, scope companyId"). Usa il componente generico
 * EntityTree (niente logica d'albero custom): scope per cliente, scheda con campo
 * extra «Tipo» (i siti non hanno icona/colore). Drag&drop, Sposta in…, ricerca,
 * eliminazione a 3 modi, sequence: tutto dallo standard.
 */
import { EntityTree, type EntityTreeConfig } from './EntityTree';
import { AddressField } from './AddressField';
import { useLookups, lookupLabel } from '../context/Lookups';
import { useAuth } from '../auth/AuthContext';

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
  opts: { country: string; canAddr: boolean },
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
            <AddressField label="Indirizzo" country={opts.country}
              value={(vals.address as Record<string, unknown>) ?? {}}
              onChange={(address) => set({ address })} />
          )}
        </>
      ),
    },
  };
}

export function SiteTree({ companyId, country = 'IT' }: { companyId: string; country?: string; canEdit?: boolean }) {
  const lk = useLookups();
  const { user } = useAuth();
  const canAddr = !!user?.permissions.includes('site:address' as never);
  const kinds = lk.byCategory('site_kind').map((l) => ({ value: l.code, label: lookupLabel(l) }));
  // niente FormCard: l'EntityTree ha già il suo riquadro + testata (evita il doppio titolo).
  return <EntityTree config={siteTreeConfig(companyId, kinds, { country, canAddr })} />;
}
