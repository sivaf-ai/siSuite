/**
 * LavorazioniPage — Lavorazioni di commessa (mock 49, Blocco E) su EntityList.
 * Selettore commessa in testa; viste; ricavo = quantità × prezzo ricavo fotografato.
 */
import { useEffect, useState } from 'react';
import { useHistory } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { WorkLineDto } from '@sisuite/shared';
import { Page } from '../components/Page';
import { Money } from '../ui/Num';
import { EntityList, type ListColumn, type ListView, type ListAction } from '../ui/EntityList';
import { useEntityActions } from '../ui/useEntityActions';
import { SlidersHorizontal, Plus } from '../ui/icons';
import { EngagementPickerDialog } from '../ui/EngagementPickerDialog';
import { PickerField } from '../ui/PickerField';
import { useApi } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import '../theme/datapages.css';

interface Eng { id: string; title?: string; code?: string }
interface ListResp {
  items: WorkLineDto[]; total: number; limit: number; offset: number;
  views: { all: number; with_libretto: number; from_capture: number; manual: number };
}
type ViewKey = 'all' | 'with_libretto' | 'from_capture' | 'manual';
const VIEW_LABEL: Record<ViewKey, string> = { all: 'Tutte', with_libretto: 'Con libretto', from_capture: 'Da cattura', manual: 'Manuali' };
const fmtDate = (iso: string | null) => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

export function LavorazioniPage() {
  const { user } = useAuth();
  const history = useHistory();
  const { t } = useTranslation();
  const canWrite = !!user?.permissions.includes('engagement:update' as never);

  const engs = useApi<{ items: Eng[] }>('/engagements');
  const [eng, setEng] = useState('');
  const [engName, setEngName] = useState('');
  const [engPick, setEngPick] = useState(false);
  const fmtEng = (e: { code?: string; title?: string }) => `${e.code ? `${e.code} · ` : ''}${e.title ?? ''}`;
  useEffect(() => { const first = engs.data?.items[0]; if (!eng && first) { setEng(first.id); setEngName(fmtEng(first)); } }, [engs.data, eng]);
  // risolvi l'etichetta della commessa selezionata dalla lista già caricata
  useEffect(() => {
    if (eng && !engName) { const e = engs.data?.items.find((x) => x.id === eng); if (e) setEngName(fmtEng(e)); }
  }, [eng, engs.data, engName]);

  const [view, setView] = useState<ViewKey>('all');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [filterParam, setFilterParam] = useState<string | null>(null);
  const limit = 25;

  const params = new URLSearchParams({ view, limit: String(limit), offset: String(offset) });
  if (eng) params.set('engagement_id', eng);
  if (q.trim()) params.set('q', q.trim());
  if (filterParam) params.set('filter', filterParam);
  const { data, loading, error, reload } = useApi<ListResp>(eng ? `/work-lines?${params.toString()}` : null);

  const { onDelete } = useEntityActions<WorkLineDto>({ basePath: '/work-lines', reload, noun: 'lavorazione' });

  const views: ListView[] = (Object.keys(VIEW_LABEL) as ViewKey[]).map((k) => ({ key: k, label: VIEW_LABEL[k], count: data?.views[k] ?? 0 }));

  const columns: ListColumn<WorkLineDto>[] = [
    { key: 'voce', header: 'Voce', sub: 'codice', value: (w) => w.itemDescription ?? w.description ?? '', render: (w) => (
      <div className="two"><span className="a">{w.itemDescription ?? w.description ?? '—'}</span><span className="b mono">{w.itemCode ?? '—'}</span></div>) },
    { key: 'fase', header: 'Fase / WBS', sub: 'data', value: (w) => `${w.wbsCode ? w.wbsCode + ' ' : ''}${w.phaseName ?? ''}`.trim(), render: (w) => (
      <div className="two"><span className="a">{w.wbsCode ? `${w.wbsCode} · ` : ''}{w.phaseName ?? '—'}</span><span className="b mono">{fmtDate(w.occurredOn)}</span></div>) },
    { key: 'qty', header: 'Quantità', sub: 'unità', num: true, value: (w) => w.quantity, render: (w) => (
      <div className="two"><span className="a mono">{w.quantity.toLocaleString('it-IT')}</span><span className="b">{w.unit}{w.hasLibretto ? ' · da libretto' : ''}</span></div>) },
    { key: 'rev', header: 'Ricavo', num: true, value: (w) => w.revenue ?? '', render: (w) => <Money value={w.revenue} /> },
    { key: 'orig', header: 'Origine', value: (w) => (w.fromCapture ? 'cattura' : w.origin), render: (w) => <span className="serialtag">{w.fromCapture ? 'cattura' : w.origin}</span> },
  ];

  const exportFields = [
    { key: 'voce', label: 'Voce', value: (w: WorkLineDto) => w.itemDescription ?? w.description ?? '' },
    { key: 'code', label: 'Codice', value: (w: WorkLineDto) => w.itemCode ?? '' },
    { key: 'phase', label: 'Fase / WBS', value: (w: WorkLineDto) => `${w.wbsCode ? w.wbsCode + ' ' : ''}${w.phaseName ?? ''}`.trim() },
    { key: 'occurredOn', label: 'Data', value: (w: WorkLineDto) => fmtDate(w.occurredOn) },
    { key: 'quantity', label: 'Quantità', value: (w: WorkLineDto) => w.quantity },
    { key: 'unit', label: 'Unità', value: (w: WorkLineDto) => w.unit },
    { key: 'revenue', label: 'Ricavo', value: (w: WorkLineDto) => w.revenue ?? '' },
    { key: 'origin', label: 'Origine', value: (w: WorkLineDto) => (w.fromCapture ? 'cattura' : w.origin) },
  ];

  const leftActions: ListAction[] = [{ key: 'filters', icon: SlidersHorizontal, tip: 'Filtri', disabled: true }];
  const rightActions: ListAction[] = canWrite && eng
    ? [{ key: 'new', icon: Plus, tip: 'Nuova lavorazione', variant: 'primary' as const, onClick: () => history.push(`/work-lines/new?engagement=${eng}`) }] : [];

  return (
    <Page>
      <div className="dsx" style={{ marginBottom: 4 }}>
        <div className="lhrow">
          <div className="lh"><h1>{t('terms.work_line_plural')}</h1><span className="sub">Contabilità lavori · ricavo per voce di capitolato</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="faint" style={{ fontSize: 12.5 }}>Commessa</span>
            <div style={{ minWidth: 280, maxWidth: 380 }}>
              <PickerField value={engName} placeholder="Scegli la commessa…" onOpen={() => setEngPick(true)} />
            </div>
          </div>
        </div>
      </div>
      <EntityList<WorkLineDto>
        views={views} activeView={view} onView={(k) => { setView(k as ViewKey); setOffset(0); }}
        search={q} onSearch={(v) => { setQ(v); setOffset(0); }} searchPlaceholder="Cerca voce, codice…"
        leftActions={leftActions} rightActions={rightActions}
        columns={columns} rows={data?.items ?? []} loading={loading} error={error}
        onRowClick={(w) => history.push(`/work-lines/${w.id}`)}
        onDelete={canWrite ? onDelete : undefined}
        exportName="lavorazioni" exportFields={exportFields}
        onFilterChange={(s) => { setFilterParam(s ? JSON.stringify(s) : null); setOffset(0); }}
        total={data?.total} limit={limit} offset={offset} onPage={setOffset}
        emptyText="Nessuna lavorazione in questa vista."
      />
      <EngagementPickerDialog open={engPick} onClose={() => setEngPick(false)}
        onPick={(es) => { const e = es[0]; if (e) { setEng(e.id); setEngName(fmtEng(e)); setOffset(0); } }} />
    </Page>
  );
}
