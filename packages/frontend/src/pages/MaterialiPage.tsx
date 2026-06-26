/**
 * MaterialiPage — Articoli & seriali, lista (mock 45), sul componente EntityList.
 * Viste = filtri salvati; righe a 2 livelli; giacenza/costo a destra; stato a pill.
 */
import { useState } from 'react';
import { useHistory } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { MaterialDto } from '@sisuite/shared';
import { Page } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { Money } from '../ui/Num';
import { EntityList, type ListColumn, type ListView, type ListAction } from '../ui/EntityList';
import { useEntityActions } from '../ui/useEntityActions';
import { SlidersHorizontal, Columns3, Sparkles, Plus } from '../ui/icons';
import { Package } from 'lucide-react';
import { useApi } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { Modal } from '../ui/Modal';
import { MaterialeDetailPage } from './MaterialeDetailPage';

/** Props di SELEZIONE: la stessa lista, richiamata in pop-up da un'altra maschera
 *  (es. righe DDT). Radio invece di checkbox; "+ Nuovo" e click-riga aprono la CRUD
 *  in un modale annidato (non si lascia il documento). */
export interface MaterialiPickProps {
  pick: 'single' | 'multi';
  selectedIds?: string[];
  onToggleSelect?: (m: MaterialDto) => void;
  /** chiamato dopo aver creato un nuovo articolo con "+ Nuovo" (il chiamante decide se finalizzare/aggiungere). */
  onCreated?: (m: MaterialDto) => void;
}

interface ListResp {
  items: MaterialDto[]; total: number; limit: number; offset: number;
  views: { all: number; stock: number; serial: number; service: number; low: number };
}
type ViewKey = 'all' | 'stock' | 'serial' | 'service' | 'low';
const VIEW_LABEL: Record<ViewKey, string> = {
  all: 'Tutti', stock: 'A magazzino', serial: 'A seriale', service: 'Servizi', low: 'Scorta bassa',
};
const attr = (m: MaterialDto, k: string) => (m.attributes as Record<string, unknown>)[k] as string | undefined;

/** Miniatura primaria nella riga lista (placeholder se assente). */
function Thumb({ url }: { url: string | null }) {
  return (
    <span style={{
      width: 36, height: 36, flex: '0 0 auto', borderRadius: 'var(--r-sm, 6px)', overflow: 'hidden',
      background: 'var(--surface-soft, #f3f4f6)', display: 'grid', placeItems: 'center', border: '1px solid var(--line)',
    }}>
      {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <Package size={16} style={{ color: 'var(--ink-faint)' }} />}
    </span>
  );
}

function trackingTag(m: MaterialDto): string {
  if (attr(m, 'item_type') === 'service') return 'servizio';
  if (m.trackedBySerial) return 'a seriale';
  if (m.trackStock) return 'a magazzino';
  return '—';
}
function statusOf(m: MaterialDto): { label: string; token: string } {
  if (attr(m, 'item_type') === 'service') return { label: 'Servizio', token: 'neutral' };
  if (m.lowStock) return { label: 'Scorta bassa', token: 'warning' };
  if (m.qtyOnHand > 0) return { label: 'Disponibile', token: 'success' };
  return { label: 'Esaurito', token: 'neutral' };
}

export function MaterialiPage({ pickProps }: { pickProps?: MaterialiPickProps } = {}) {
  const { user } = useAuth();
  const history = useHistory();
  const { t } = useTranslation();
  const can = (a: string) => !!user?.permissions.includes(`material:${a}` as never);
  const pick = pickProps?.pick;

  const [view, setView] = useState<ViewKey>('all');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [filterParam, setFilterParam] = useState<string | null>(null);
  const [sortParam, setSortParam] = useState<string | null>(null);
  const [crud, setCrud] = useState<{ id: string } | null>(null);   // CRUD articolo in modale (pick mode)
  const limit = 25;

  const params = new URLSearchParams({ view, limit: String(limit), offset: String(offset) });
  if (q.trim()) params.set('q', q.trim());
  if (filterParam) params.set('filter', filterParam);
  if (sortParam) params.set('sort', sortParam);
  const { data, loading, error, reload } = useApi<ListResp>(`/materials?${params.toString()}`);

  const { onDelete, onDuplicate } = useEntityActions<MaterialDto>({
    basePath: '/materials', reload, noun: 'articolo',
    duplicateBody: (m) => ({ name: m.name, unit: m.unit, sku: null, trackStock: m.trackStock, trackedBySerial: m.trackedBySerial, trackedByLot: m.trackedByLot, costingMethod: m.costingMethod, attributes: m.attributes }),
  });

  const views: ListView[] = (Object.keys(VIEW_LABEL) as ViewKey[]).map((k) => ({ key: k, label: VIEW_LABEL[k], count: data?.views[k] ?? 0 }));

  const columns: ListColumn<MaterialDto>[] = [
    { key: 'name', header: t('cols.articolo'), sub: t('cols.sku'), value: (m) => m.name, render: (m) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Thumb url={m.primaryImageUrl} />
        <div className="two"><span className="a">{m.name}</span><span className="b mono">{m.sku ?? '—'}</span></div>
      </div>) },
    { key: 'cat', header: t('cols.categoria'), sub: t('cols.tracciamento'), value: (m) => attr(m, 'category') ?? '', render: (m) => (
      <div className="two"><span className="a">{attr(m, 'category') ?? '—'}</span><span className="b"><span className="serialtag">{trackingTag(m)}</span></span></div>) },
    { key: 'qty', header: t('cols.giacenza'), sub: t('cols.unita'), num: true, value: (m) => (attr(m, 'item_type') === 'service' ? '' : m.qtyOnHand), render: (m) => (attr(m, 'item_type') === 'service'
      ? <span className="faint">—</span>
      : <div className="two"><span className="a mono">{m.qtyOnHand.toLocaleString('it-IT')}</span><span className="b">{m.unit}</span></div>) },
    { key: 'cost', header: t('cols.costoMedio'), sub: t('cols.perUnita'), num: true, value: (m) => m.avgCost ?? m.defaultCost ?? '', render: (m) => <Money value={m.avgCost ?? m.defaultCost} /> },
    { key: 'st', header: t('cols.stato'), value: (m) => statusOf(m).label, render: (m) => { const s = statusOf(m); return <StatusPill label={s.label} token={s.token} />; } },
  ];

  const exportFields = [
    { key: 'name', label: 'Articolo', value: (m: MaterialDto) => m.name },
    { key: 'sku', label: 'SKU', value: (m: MaterialDto) => m.sku ?? '' },
    { key: 'unit', label: 'Unità di misura', value: (m: MaterialDto) => m.unit },
    { key: 'category', label: 'Categoria', value: (m: MaterialDto) => attr(m, 'category') ?? '' },
    { key: 'item_type', label: 'Tipo', value: (m: MaterialDto) => attr(m, 'item_type') ?? '' },
    { key: 'supplier_code', label: 'Codice fornitore', value: (m: MaterialDto) => attr(m, 'supplier_code') ?? '' },
    { key: 'tracking', label: 'Tracciamento', value: (m: MaterialDto) => trackingTag(m) },
    { key: 'costingMethod', label: 'Metodo costo', value: (m: MaterialDto) => m.costingMethod },
    { key: 'qtyOnHand', label: 'Giacenza', value: (m: MaterialDto) => m.qtyOnHand },
    { key: 'avgCost', label: 'Costo medio', value: (m: MaterialDto) => m.avgCost ?? m.defaultCost ?? '' },
    { key: 'min_stock', label: 'Scorta minima', value: (m: MaterialDto) => (attr(m, 'min_stock') as unknown as number) ?? '' },
    { key: 'status', label: 'Stato', value: (m: MaterialDto) => statusOf(m).label },
  ];

  const leftActions: ListAction[] = [
    { key: 'filters', icon: SlidersHorizontal, tip: 'Filtri', disabled: true },
    { key: 'cols', icon: Columns3, tip: 'Colonne', disabled: true },
    { key: 'ai', icon: Sparkles, tip: 'Azioni AI (presto)', variant: 'ai', disabled: true },
  ];
  // "+ Nuovo": in pick apre la CRUD in modale (resti nel documento); altrimenti naviga.
  const rightActions: ListAction[] = [
    ...(can('create') ? [{ key: 'new', icon: Plus, tip: 'Nuovo articolo', variant: 'primary' as const,
      onClick: () => (pick ? setCrud({ id: 'new' }) : history.push('/materials/new')) }] : []),
  ];
  // click riga: in pick apre la CRUD per modificare (poi si seleziona col radio); altrimenti naviga.
  const onRowClick = (m: MaterialDto) => (pick ? setCrud({ id: m.id }) : history.push(`/materials/${m.id}`));

  const list = (
      <EntityList<MaterialDto>
        title={pick ? undefined : t('terms.material_plural')} subtitle={pick ? undefined : 'Catalogo magazzino & servizi'}
        views={views} activeView={view} onView={(k) => { setView(k as ViewKey); setOffset(0); }}
        search={q} onSearch={(v) => { setQ(v); setOffset(0); }} searchPlaceholder="Cerca nome, SKU, categoria…"
        leftActions={pick ? [] : leftActions} rightActions={rightActions}
        mode={pick ? (pick === 'multi' ? 'pick-multi' : 'pick-single') : undefined}
        selectedIds={pick ? pickProps?.selectedIds : undefined}
        onToggleSelect={pick ? pickProps?.onToggleSelect : undefined}
        columns={columns} rows={data?.items ?? []} loading={loading} error={error}
        onRowClick={onRowClick}
        onDelete={!pick && can('delete') ? onDelete : undefined}
        onDuplicate={!pick && can('create') ? onDuplicate : undefined}
        exportName="articoli" exportFields={exportFields} entity="material"
        sortFields={[{ key: 'name', label: 'Articolo' }, { key: 'sku', label: 'SKU' }, { key: 'qty', label: 'Giacenza' }, { key: 'cost', label: 'Costo medio' }]}
        filterFields={[
          { key: 'name', label: 'Nome', type: 'text', section: 'Catalogo', span: 2 },
          { key: 'sku', label: 'SKU', type: 'text', section: 'Catalogo' },
          { key: 'category', label: 'Categoria', type: 'text', section: 'Catalogo' },
          { key: 'item_type', label: 'Tipo', type: 'enum', section: 'Catalogo', values: [{ value: 'good', label: 'Bene' }, { value: 'service', label: 'Servizio' }] },
          { key: 'unit', label: 'Unità', type: 'text', section: 'Catalogo' },
          { key: 'supplier_code', label: 'Codice fornitore', type: 'text', section: 'Catalogo' },
          { key: 'costingMethod', label: 'Metodo costo', type: 'text', section: 'Economia' },
          { key: 'min_stock', label: 'Scorta minima', type: 'number', section: 'Economia' },
        ]}
        onSortChange={(s) => { setSortParam(s.length ? JSON.stringify(s) : null); setOffset(0); }}
        onFilterChange={(s) => { setFilterParam(s ? JSON.stringify(s) : null); setOffset(0); }}
        total={data?.total} limit={limit} offset={offset} onPage={setOffset}
        emptyText="Nessun articolo in questa vista."
      />
  );

  // CRUD articolo in modale centrato (solo in pick: "+ Nuovo" o modifica riga)
  const crudModal = crud && (
    <Modal open size="xl" title={crud.id === 'new' ? 'Nuovo articolo' : 'Modifica articolo'} onClose={() => setCrud(null)}>
      <MaterialeDetailPage embed={{
        id: crud.id,
        onClose: () => setCrud(null),
        onSaved: (m, wasNew) => { void reload(); if (wasNew) pickProps?.onCreated?.(m); },
      }} />
    </Modal>
  );

  if (pick) return <>{list}{crudModal}</>;
  return <Page>{list}{crudModal}</Page>;
}
