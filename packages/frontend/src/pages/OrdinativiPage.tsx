/**
 * OrdinativiPage — Lista Ordini di lavoro su EntityList (mock 44 · §6.1).
 * B-bis: selezione multipla righe + azioni bulk (assegna a squadra, esporta selezionati)
 * + import CSV con editor di mapping colonna→campo (POST /work-orders/import).
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router';
import { Lock } from 'lucide-react';
import type { WorkOrderDto, EngagementDto, ResourceDto } from '@sisuite/shared';
import { Page } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { EntityList, type ListColumn, type ListView, type ListAction } from '../ui/EntityList';
import { useEntityActions } from '../ui/useEntityActions';
import { Modal } from '../ui/Modal';
import { SlidersHorizontal, Columns3, Sparkles, Upload, Users, Plus } from '../ui/icons';
import { useApi, mutate, useArchivedView } from '../api/hooks';
import { useToast } from '../ui/Toast';
import { ApiError } from '../api/client';
import { AuditDialog } from '../ui/AuditDialog';
import { useAuth } from '../auth/AuthContext';
import { useLookups } from '../context/Lookups';

const errMsg = (e: unknown) => (e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message);

interface ListResp {
  items: WorkOrderDto[]; total: number; limit: number; offset: number;
  views: { all: number; unassigned: number; in_progress: number; done: number; ko: number };
}
type ViewKey = 'all' | 'unassigned' | 'in_progress' | 'done' | 'ko';
const VIEW_LABEL: Record<ViewKey, string> = {
  all: 'Tutti', unassigned: 'Da assegnare', in_progress: 'In lavorazione', done: 'Completati', ko: 'KO / da ricontattare',
};
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`;
}

/** Props di SELEZIONE (solo selezione): radio invece di checkbox; click-riga =
 *  seleziona. Niente azioni bulk/assign/import/nuovo. */
export interface OrdinativiPickProps {
  pick: 'single' | 'multi';
  selectedIds?: string[];
  onToggleSelect?: (w: WorkOrderDto) => void;
}

export function OrdinativiPage({ pickProps }: { pickProps?: OrdinativiPickProps } = {}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const history = useHistory();
  const toast = useToast();
  const lookups = useLookups();
  const can = (a: string) => !!user?.permissions.includes(`work_order:${a}` as never);
  const pick = pickProps?.pick;

  const [view, setView] = useState<ViewKey>('all');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [selRows, setSelRows] = useState<WorkOrderDto[]>([]);
  const [clearTok, setClearTok] = useState(0);
  const [filterParam, setFilterParam] = useState<string | null>(null);
  const [sortParam, setSortParam] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [archived, setArchived] = useArchivedView();
  const [audit, setAudit] = useState<{ id: string; title: string } | null>(null);
  const limit = 25;

  const params = new URLSearchParams({ view, limit: String(limit), offset: String(offset), sortBy: 'scheduled', sortDir: 'desc' });
  if (q.trim()) params.set('q', q.trim());
  if (filterParam) params.set('filter', filterParam);
  if (sortParam) params.set('sort', sortParam);
  if (archived) params.set('archived', '1');
  const { data, loading, error, reload } = useApi<ListResp>(`/work-orders?${params.toString()}`);
  const rows = data?.items ?? [];

  const onRestore = async (sel: WorkOrderDto[]) => {
    try {
      for (const r of sel) await mutate('POST', `/work-orders/${r.id}/restore`);
      toast(sel.length > 1 ? `${sel.length} ordini ripristinati` : 'Ordine ripristinato');
      setClearTok((x) => x + 1); reload();
    } catch (e) { toast(errMsg(e) || 'Errore durante il ripristino', 'error'); }
  };
  const onPurge = async (sel: WorkOrderDto[]) => {
    try {
      for (const r of sel) await mutate('DELETE', `/work-orders/${r.id}/purge`);
      toast(sel.length > 1 ? `${sel.length} ordini eliminati definitivamente` : 'Ordine eliminato definitivamente');
      setClearTok((x) => x + 1); reload();
    } catch (e) { toast(errMsg(e) || 'Errore durante l\'eliminazione', 'error'); }
  };

  const { onDelete, onDuplicate } = useEntityActions<WorkOrderDto>({
    basePath: '/work-orders', reload, noun: t('terms.work_order'),
    // Duplica (standard): apre il "nuovo" precompilato (no rif. esterno: è chiave unica per gestore).
    duplicateBody: (w) => ({
      engagementId: w.engagementId, principalCompanyId: w.principalCompanyId, typeId: w.typeId,
      statusId: w.statusId, assignedResourceId: w.assignedResourceId, address: w.address, attributes: w.attributes,
    }),
  });

  const statusOf = (wo: WorkOrderDto) => ({
    label: lookups.labelOf(wo.statusId) || (wo.statusCanonical ?? '—'),
    token: lookups.byId(wo.statusId)?.colorToken ?? 'neutral',
  });

  const views: ListView[] = (Object.keys(VIEW_LABEL) as ViewKey[]).map((k) => ({ key: k, label: VIEW_LABEL[k], count: data?.views[k] ?? 0 }));

  const columns: ListColumn<WorkOrderDto>[] = [
    { key: 'op', header: t('cols.committente'), sub: t('cols.refEsternoTipo'), value: (wo) => wo.principalCompanyName ?? '', render: (wo) => (
      <div className="two"><span className="a">{wo.principalCompanyName ?? '—'}</span><span className="b mono">{wo.principalOrderRef ?? '—'}{wo.typeLabel ? ` · ${wo.typeLabel}` : ''}</span></div>) },
    { key: 'addr', header: t('cols.indirizzoAttivazione'), sub: t('cols.commessa'), value: (wo) => wo.address ?? '', render: (wo) => (
      <div className="two"><span className="a">{wo.address ?? '—'}</span><span className="b">{wo.engagementTitle ?? '—'}</span></div>) },
    { key: 'subj', header: t('cols.intestatario'), sub: t('cols.protetto'), value: (wo) => wo.subjectNameDisplay ?? '', render: (wo) => (
      <span className="pii"><Lock /> {wo.subjectNameDisplay ?? '—'}</span>) },
    { key: 'app', header: t('cols.apparati'), sub: t('cols.previstiInstallati'), render: (wo) => (
      <span className="mono">{wo.plannedCount} · {wo.installedCount}</span>) },
    { key: 'st', header: t('cols.stato'), sub: t('cols.squadra'), value: (wo) => statusOf(wo).label, render: (wo) => { const s = statusOf(wo); return (
      <div className="two"><span className="a"><StatusPill label={s.label} token={s.token} /></span><span className="b">{wo.assignedResourceLabel ?? '—'}</span></div>); } },
    { key: 'sched', header: t('cols.programmato'), sub: 'codice', value: (wo) => wo.code, render: (wo) => (
      <div className="two"><span className="a mono">{fmtDate(wo.scheduledOn)}</span><span className="b mono">{wo.code}</span></div>) },
  ];

  const exportFields = [
    { key: 'code', label: 'Codice', value: (w: WorkOrderDto) => w.code },
    { key: 'principalCompanyName', label: 'Committente', value: (w: WorkOrderDto) => w.principalCompanyName ?? '' },
    { key: 'principalOrderRef', label: 'Rif. esterno', value: (w: WorkOrderDto) => w.principalOrderRef ?? '' },
    { key: 'typeLabel', label: 'Tipo', value: (w: WorkOrderDto) => w.typeLabel ?? '' },
    { key: 'address', label: 'Indirizzo', value: (w: WorkOrderDto) => w.address ?? '' },
    { key: 'engagementTitle', label: 'Commessa', value: (w: WorkOrderDto) => w.engagementTitle ?? '' },
    { key: 'subject', label: 'Intestatario', value: (w: WorkOrderDto) => w.subjectNameDisplay ?? '' },
    { key: 'planned', label: 'Apparati previsti', value: (w: WorkOrderDto) => w.plannedCount },
    { key: 'installed', label: 'Apparati installati', value: (w: WorkOrderDto) => w.installedCount },
    { key: 'status', label: 'Stato', value: (w: WorkOrderDto) => statusOf(w).label },
    { key: 'team', label: 'Squadra', value: (w: WorkOrderDto) => w.assignedResourceLabel ?? '' },
    { key: 'scheduledOn', label: 'Programmato', value: (w: WorkOrderDto) => (w.scheduledOn ? fmtDate(w.scheduledOn) : '') },
  ];

  const leftActions: ListAction[] = pick ? [] : [
    { key: 'filters', icon: SlidersHorizontal, tip: 'Filtri', disabled: true },
    { key: 'cols', icon: Columns3, tip: 'Colonne', disabled: true },
    { key: 'ai', icon: Sparkles, tip: 'Azioni AI (presto)', variant: 'ai', disabled: true },
    ...(can('assign') ? [{ key: 'assign', icon: Users, tip: selRows.length ? `Assegna ${selRows.length} a squadra` : 'Assegna a squadra (seleziona righe)', disabled: selRows.length < 1, onClick: () => setAssignOpen(true) } as ListAction] : []),
  ];
  const rightActions: ListAction[] = pick ? [] : [
    ...(can('import') ? [{ key: 'import', icon: Upload, tip: 'Importa da CSV', onClick: () => setImportOpen(true) } as ListAction] : []),
    ...(can('create') ? [{ key: 'new', icon: Plus, tip: 'Nuovo ordine di lavoro', variant: 'primary' as const, onClick: () => history.push('/work-orders/new') }] : []),
  ];

  const list = (
      <EntityList<WorkOrderDto>
        title={pick ? undefined : t('terms.work_order_plural')} subtitle={pick ? undefined : 'Ordini di lavoro · gestione a pezzi'}
        views={views} activeView={view} onView={(k) => { setView(k as ViewKey); setOffset(0); }}
        search={q} onSearch={(v) => { setQ(v); setOffset(0); }} searchPlaceholder="Cerca rif. esterno, indirizzo, seriale…"
        leftActions={leftActions} rightActions={rightActions}
        mode={pick ? (pick === 'multi' ? 'pick-multi' : 'pick-single') : undefined}
        selectedIds={pick ? pickProps?.selectedIds : undefined}
        onToggleSelect={pick ? pickProps?.onToggleSelect : undefined}
        columns={columns} rows={rows} loading={loading} error={error}
        onRowClick={pick ? undefined : (wo) => history.push(`/work-orders/${wo.id}`)}
        onDelete={!pick && can('delete') ? onDelete : undefined}
        onDuplicate={!pick && can('create') ? onDuplicate : undefined}
        archived={archived}
        onToggleArchived={pick ? undefined : (v) => { setArchived(v); setOffset(0); setClearTok((x) => x + 1); }}
        onRestore={pick ? undefined : (can('delete') ? onRestore : undefined)}
        onPurge={pick ? undefined : (can('delete') ? onPurge : undefined)}
        onHistory={pick ? undefined : (row) => setAudit({ id: row.id, title: row.code })}
        archivedBadge={(row) => row.archivedAt ? `Archiviato${row.archivedByName ? ' da ' + row.archivedByName : ''}` : null}
        onSelectionChange={pick ? undefined : setSelRows}
        clearSelectionToken={clearTok}
        exportName="ordini-di-lavoro" exportFields={exportFields} entity="work_order" savedViewKey="work_order"
        sortFields={[{ key: 'code', label: 'Codice' }, { key: 'scheduled', label: 'Data pianificata' }, { key: 'operator', label: 'Gestore' }, { key: 'status', label: 'Stato' }]}
        filterFields={[
          { key: 'code', label: 'Codice', type: 'text', section: 'Ordine' },
          { key: 'principalOrderRef', label: 'Rif. esterno', type: 'text', section: 'Ordine' },
          { key: 'address', label: 'Indirizzo', type: 'text', section: 'Ordine', span: 2 },
          { key: 'principalCompanyName', label: 'Gestore', type: 'text', section: 'Ordine' },
          { key: 'status', label: 'Stato', type: 'text', section: 'Stato' },
          { key: 'scheduledOn', label: 'Data pianificata', type: 'date', section: 'Pianificazione' },
        ]}
        onSortChange={(s) => { setSortParam(s.length ? JSON.stringify(s) : null); setOffset(0); }}
        onFilterChange={(s) => { setFilterParam(s ? JSON.stringify(s) : null); setOffset(0); }}
        total={data?.total} limit={limit} offset={offset} onPage={setOffset}
        emptyText="Nessun ordinativo in questa vista."
      />
  );

  if (pick) return list;

  return (
    <Page>
      {list}
      {assignOpen && (
        <AssignModal ids={selRows.map((r) => r.id)} onClose={() => setAssignOpen(false)}
          onDone={() => { setAssignOpen(false); setClearTok((t) => t + 1); void reload(); }} />
      )}
      {importOpen && (
        <ImportModal onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); void reload(); }} />
      )}
      {audit && <AuditDialog entity="work_order" entityId={audit.id} title={audit.title} onClose={() => setAudit(null)} />}
    </Page>
  );
}

/* ── Assegna a squadra (bulk) ─────────────────────────────────────────── */
function AssignModal({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const resources = useApi<{ items: ResourceDto[] }>('/resources?kind=person&limit=200');
  const [resId, setResId] = useState('');
  const [busy, setBusy] = useState(false);

  async function assign() {
    setBusy(true);
    try {
      await mutate('POST', '/work-orders/assign', { ids, assignedResourceId: resId || null });
      toast(resId ? `Assegnati ${ids.length} ordini` : `Rimossa assegnazione da ${ids.length} ordini`);
      onDone();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  return (
    <Modal open title={`Assegna ${ids.length} ordini`} size="md" onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Annulla</button>
        <button className="btn btn-primary" onClick={assign} disabled={busy}>Assegna</button>
      </>}>
      <div className="bgrid">
        <div className="bf c4"><span className="bl">Squadra / tecnico</span>
          <select className="bi" value={resId} onChange={(e) => setResId(e.target.value)}>
            <option value="">— rimuovi assegnazione —</option>
            {(resources.data?.items ?? []).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select></div>
      </div>
      <p className="help" style={{ marginTop: 10 }}>Gli ordini selezionati passano alla squadra scelta (o restano da assegnare se vuoto).</p>
    </Modal>
  );
}

/* ── Import CSV con mapping colonna→campo ─────────────────────────────── */
const TARGET_FIELDS = [
  { key: 'principalOrderRef', label: 'Rif. esterno (obbligatorio)', required: true },
  { key: 'address', label: 'Indirizzo' },
  { key: 'scheduledOn', label: 'Data programmata (YYYY-MM-DD)' },
  { key: 'subjectName', label: 'Intestatario · nome' },
  { key: 'subjectPhone', label: 'Intestatario · telefono' },
];

/** parser CSV minimale: gestisce virgolette e separatore `,`/`;`. */
function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const sep = (text.split('\n')[0] ?? '').includes(';') ? ';' : ',';
  const out: string[][] = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    if (!raw.trim()) continue;
    const cells: string[] = []; let cur = ''; let inQ = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (inQ) { if (ch === '"' && raw[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') inQ = false; else cur += ch; }
      else if (ch === '"') inQ = true; else if (ch === sep) { cells.push(cur); cur = ''; } else cur += ch;
    }
    cells.push(cur); out.push(cells.map((c) => c.trim()));
  }
  return { header: out[0] ?? [], rows: out.slice(1) };
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const engs = useApi<{ items: EngagementDto[] }>('/engagements');
  const [engId, setEngId] = useState('');
  const [parsed, setParsed] = useState<{ header: string[]; rows: string[][] } | null>(null);
  const [map, setMap] = useState<Record<string, string>>({}); // targetField → csv column index (string)
  const [busy, setBusy] = useState(false);

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const p = parseCsv(String(reader.result ?? ''));
      setParsed(p);
      // auto-map per nome colonna simile
      const auto: Record<string, string> = {};
      p.header.forEach((h, i) => {
        const hl = h.toLowerCase();
        if (/rif|ref|ordine|order/.test(hl) && auto.principalOrderRef === undefined) auto.principalOrderRef = String(i);
        else if (/indiriz|address|via/.test(hl)) auto.address = String(i);
        else if (/data|date|program/.test(hl)) auto.scheduledOn = String(i);
        else if (/nome|name|intesta/.test(hl)) auto.subjectName = String(i);
        else if (/tel|phone|cell/.test(hl)) auto.subjectPhone = String(i);
      });
      setMap(auto);
    };
    reader.readAsText(file);
  }

  const preview = useMemo(() => {
    if (!parsed) return [];
    const idx = (k: string) => (map[k] !== undefined && map[k] !== '' ? Number(map[k]) : -1);
    return parsed.rows.slice(0, 5).map((r) => ({
      ref: idx('principalOrderRef') >= 0 ? r[idx('principalOrderRef')] : '',
      addr: idx('address') >= 0 ? r[idx('address')] : '',
      name: idx('subjectName') >= 0 ? r[idx('subjectName')] : '',
    }));
  }, [parsed, map]);

  async function doImport() {
    if (!engId) { toast('Scegli la commessa di destinazione', 'error'); return; }
    if (!parsed || map.principalOrderRef === undefined || map.principalOrderRef === '') { toast('Mappa almeno il Rif. esterno', 'error'); return; }
    const idx = (k: string) => (map[k] !== undefined && map[k] !== '' ? Number(map[k]) : -1);
    const rows = parsed.rows.map((r) => {
      const ref = r[idx('principalOrderRef')]?.trim();
      if (!ref) return null;
      const subjName = idx('subjectName') >= 0 ? r[idx('subjectName')]?.trim() : '';
      const subjPhone = idx('subjectPhone') >= 0 ? r[idx('subjectPhone')]?.trim() : '';
      return {
        principalOrderRef: ref,
        address: idx('address') >= 0 ? (r[idx('address')]?.trim() || undefined) : undefined,
        scheduledOn: idx('scheduledOn') >= 0 ? (r[idx('scheduledOn')]?.trim() || undefined) : undefined,
        subject: (subjName || subjPhone) ? { fullName: subjName || undefined, phone: subjPhone || undefined } : undefined,
      };
    }).filter(Boolean);
    if (!rows.length) { toast('Nessuna riga valida da importare', 'error'); return; }
    setBusy(true);
    try {
      const res = await mutate<{ created: number; duplicates: string[]; total: number }>('POST', '/work-orders/import', { engagementId: engId, rows });
      toast(`Importati ${res.created}/${res.total} (${res.duplicates.length} duplicati)`);
      onDone();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  return (
    <Modal open title="Importa ordini da CSV" size="lg" onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Annulla</button>
        <button className="btn btn-primary" onClick={doImport} disabled={busy || !parsed}>Importa</button>
      </>}>
      <div className="bgrid">
        <div className="bf c2"><span className="bl">Commessa di destinazione <span className="req">*</span></span>
          <select className="bi" value={engId} onChange={(e) => setEngId(e.target.value)}>
            <option value="">—</option>
            {(engs.data?.items ?? []).map((e) => <option key={e.id} value={e.id}>{e.code} · {e.title}</option>)}
          </select></div>
        <div className="bf c2"><span className="bl">File CSV</span>
          <input className="bi" type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></div>
      </div>

      {parsed && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ink-faint)', margin: '16px 0 10px' }}>Mappatura colonne</div>
          <div className="bgrid">
            {TARGET_FIELDS.map((f) => (
              <div className="bf c2" key={f.key}><span className="bl">{f.label}</span>
                <select className="bi" value={map[f.key] ?? ''} onChange={(e) => setMap((m) => ({ ...m, [f.key]: e.target.value }))}>
                  <option value="">— non importare —</option>
                  {parsed.header.map((h, i) => <option key={i} value={String(i)}>{h || `Colonna ${i + 1}`}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ink-faint)', margin: '16px 0 6px' }}>Anteprima ({parsed.rows.length} righe)</div>
          <table className="subt"><thead><tr><th>Rif.</th><th>Indirizzo</th><th>Intestatario</th></tr></thead>
            <tbody>{preview.map((p, i) => <tr key={i}><td className="mono">{p.ref || '—'}</td><td>{p.addr || '—'}</td><td>{p.name || '—'}</td></tr>)}</tbody>
          </table>
        </>
      )}
    </Modal>
  );
}
