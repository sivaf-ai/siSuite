/**
 * LavorazioniPage — Lavorazioni di commessa (mock 49, Blocco E) su EntityList.
 * Selettore commessa in testa; viste; ricavo = quantità × prezzo ricavo fotografato.
 */
import { useEffect, useState } from 'react';
import { useHistory } from 'react-router';
import type { WorkLineDto } from '@sisuite/shared';
import { Page } from '../components/Page';
import { Money } from '../ui/Num';
import { EntityList, type ListColumn, type ListView, type ListAction } from '../ui/EntityList';
import { SlidersHorizontal, Plus } from '../ui/icons';
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
  const canWrite = !!user?.permissions.includes('engagement:update' as never);

  const engs = useApi<{ items: Eng[] }>('/engagements');
  const [eng, setEng] = useState('');
  useEffect(() => { const first = engs.data?.items[0]; if (!eng && first) setEng(first.id); }, [engs.data, eng]);

  const [view, setView] = useState<ViewKey>('all');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const params = new URLSearchParams({ view, limit: String(limit), offset: String(offset) });
  if (eng) params.set('engagement_id', eng);
  if (q.trim()) params.set('q', q.trim());
  const { data, loading, error } = useApi<ListResp>(eng ? `/work-lines?${params.toString()}` : null);

  const views: ListView[] = (Object.keys(VIEW_LABEL) as ViewKey[]).map((k) => ({ key: k, label: VIEW_LABEL[k], count: data?.views[k] ?? 0 }));

  const columns: ListColumn<WorkLineDto>[] = [
    { key: 'voce', header: 'Voce', sub: 'codice', render: (w) => (
      <div className="two"><span className="a">{w.itemDescription ?? w.description ?? '—'}</span><span className="b mono">{w.itemCode ?? '—'}</span></div>) },
    { key: 'fase', header: 'Fase / WBS', sub: 'data', render: (w) => (
      <div className="two"><span className="a">{w.wbsCode ? `${w.wbsCode} · ` : ''}{w.phaseName ?? '—'}</span><span className="b mono">{fmtDate(w.occurredOn)}</span></div>) },
    { key: 'qty', header: 'Quantità', sub: 'unità', num: true, render: (w) => (
      <div className="two"><span className="a mono">{w.quantity.toLocaleString('it-IT')}</span><span className="b">{w.unit}{w.hasLibretto ? ' · da libretto' : ''}</span></div>) },
    { key: 'rev', header: 'Ricavo', num: true, render: (w) => <Money value={w.revenue} /> },
    { key: 'orig', header: 'Origine', render: (w) => <span className="serialtag">{w.fromCapture ? 'cattura' : w.origin}</span> },
  ];

  const leftActions: ListAction[] = [{ key: 'filters', icon: SlidersHorizontal, tip: 'Filtri', disabled: true }];
  const rightActions: ListAction[] = canWrite && eng
    ? [{ key: 'new', icon: Plus, tip: 'Nuova lavorazione', variant: 'primary' as const, onClick: () => history.push(`/work-lines/new?engagement=${eng}`) }] : [];

  return (
    <Page title="Lavorazioni">
      <div className="dsx" style={{ marginBottom: 4 }}>
        <div className="lh"><h1>Lavorazioni</h1><span className="sub">Contabilità lavori · ricavo per voce di capitolato</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span className="faint" style={{ fontSize: 12.5 }}>Commessa</span>
          <select className="bi" style={{ minHeight: 34, maxWidth: 380 }} value={eng} onChange={(e) => { setEng(e.target.value); setOffset(0); }}>
            {(engs.data?.items ?? []).map((e) => <option key={e.id} value={e.id}>{e.code ? `${e.code} · ` : ''}{e.title}</option>)}
          </select>
        </div>
      </div>
      <EntityList<WorkLineDto>
        views={views} activeView={view} onView={(k) => { setView(k as ViewKey); setOffset(0); }}
        search={q} onSearch={(v) => { setQ(v); setOffset(0); }} searchPlaceholder="Cerca voce, codice…"
        leftActions={leftActions} rightActions={rightActions}
        columns={columns} rows={data?.items ?? []} loading={loading} error={error}
        onRowClick={(w) => history.push(`/work-lines/${w.id}`)}
        total={data?.total} limit={limit} offset={offset} onPage={setOffset}
        emptyText="Nessuna lavorazione in questa vista."
      />
    </Page>
  );
}
