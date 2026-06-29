/**
 * SiteTree — albero Siti/Località di un soggetto (STANDARD entità ad albero §9:
 * "albero in scheda Soggetto, scope companyId"). Usa il componente generico
 * EntityTree (niente logica d'albero custom): scope per cliente, scheda con campo
 * extra «Tipo» (i siti non hanno icona/colore). Drag&drop, Sposta in…, ricerca,
 * eliminazione a 3 modi, sequence: tutto dallo standard.
 */
import { FormCard } from './FormPage';
import { Building2 } from 'lucide-react';
import { SITE_KINDS } from '@sisuite/shared';
import { EntityTree, type EntityTreeConfig } from './EntityTree';

const KIND_LABEL: Record<string, string> = {
  plant: 'Stabilimento', building: 'Edificio', floor: 'Piano', room: 'Locale',
  cabinet: 'Armadio', pop: 'POP', area: 'Area', other: 'Altro',
};
const kindLabel = (k: string) => KIND_LABEL[k] ?? k;

/** indirizzo jsonb country-driven → riga leggibile (ignora la chiave country). */
function addrSummary(a: unknown): string {
  if (!a || typeof a !== 'object') return '';
  return Object.entries(a as Record<string, unknown>)
    .filter(([k, v]) => k !== 'country' && typeof v === 'string' && (v as string).trim() !== '')
    .map(([, v]) => String(v)).join(', ');
}

export function siteTreeConfig(companyId: string): EntityTreeConfig {
  return {
    entity: 'site',
    endpoint: '/sites',
    labels: { singular: 'Sito', plural: 'Siti / Località', subtitle: 'Gerarchia siti e località del cliente' },
    permissions: { read: 'site:read', write: 'site:update' },
    defaultIcon: 'map-pin',
    showAppearance: false,
    countNoun: 'asset/ordini',
    scopeQuery: { company_id: companyId },
    createDefaults: { companyId },
    rowMeta: (n) => [kindLabel(String(n.kind ?? 'building')), addrSummary(n.address)].filter(Boolean).join(' · ') || null,
    extraCard: {
      init: (node) => ({ kind: (node?.kind as string) ?? 'building' }),
      toBody: (vals) => ({ kind: vals.kind ?? 'building' }),
      render: (vals, set) => (
        <div className="tnc-field" style={{ border: '1.5px solid var(--line)', borderRadius: 10, padding: '9px 11px 7px' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-faint)', marginBottom: 2 }}>Tipo</label>
          <select value={String(vals.kind ?? 'building')} onChange={(e) => set({ kind: e.target.value })}
            style={{ width: '100%', border: 0, outline: 'none', background: 'none', font: 'inherit', fontSize: 14, color: 'var(--ink)' }}>
            {SITE_KINDS.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
          </select>
        </div>
      ),
    },
  };
}

export function SiteTree({ companyId, canEdit: _canEdit }: { companyId: string; canEdit: boolean }) {
  return (
    <FormCard icon={<Building2 size={16} />} title="Siti / Località">
      <EntityTree config={siteTreeConfig(companyId)} />
    </FormCard>
  );
}
