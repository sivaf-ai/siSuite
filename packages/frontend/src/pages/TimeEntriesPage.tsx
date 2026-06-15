/**
 * TimeEntriesPage — "Foglio ore" (Modulo Ore §4.3): lista delle ore con
 * filtro per stato di approvazione, multi-selezione e azioni IN BLOCCO
 * (invia / approva / respingi / blocca / sblocca). Le azioni sono gated dai
 * permessi (time_entry:create per l'invio, time_entry:approve per il resto);
 * la sicurezza vera è API+RLS.
 */
import { useMemo, useState } from 'react';
import { Clock, Send, Check, X, Lock, Unlock, Lock as LockIcon } from 'lucide-react';
import type { TimeEntryDto, EngagementDto, ResourceDto, PermissionKey } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { DataTable, type Column } from '../ui/DataTable';
import { EmptyState } from '../ui/EmptyState';
import { useApi, mutate } from '../api/hooks';
import { useLookups } from '../context/Lookups';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';
import { hhmm } from '../lib/time';

type StatusFilter = 'all' | 'draft' | 'submitted' | 'approved' | 'rejected';
const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Tutte' },
  { key: 'draft', label: 'Bozze' },
  { key: 'submitted', label: 'Inviate' },
  { key: 'approved', label: 'Approvate' },
  { key: 'rejected', label: 'Respinte' },
];

function dateIt(s: string): string {
  // occurredOn arriva come 'YYYY-MM-DD' o ISO: mostra gg/mm/aaaa
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('it-IT');
}

export function TimeEntriesPage() {
  const lk = useLookups();
  const toast = useToast();
  const { user } = useAuth();
  const perms = new Set<PermissionKey>((user?.permissions ?? []) as PermissionKey[]);
  const canApprove = perms.has('time_entry:approve');
  const canSubmit = perms.has('time_entry:create');

  const te = useApi<{ items: TimeEntryDto[] }>('/time-entries');
  const engs = useApi<{ items: EngagementDto[] }>('/engagements');
  const ress = useApi<{ items: ResourceDto[] }>('/resources');

  const [filter, setFilter] = useState<StatusFilter>('all');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const engById = useMemo(() => new Map((engs.data?.items ?? []).map((e) => [e.id, e])), [engs.data]);
  const resById = useMemo(() => new Map((ress.data?.items ?? []).map((r) => [r.id, r])), [ress.data]);

  // canonical dello stato per il filtro
  const canonicalOf = (statusId: string | null): string | null => lk.byId(statusId)?.canonical ?? null;

  const rows = useMemo(() => {
    const items = te.data?.items ?? [];
    if (filter === 'all') return items;
    return items.filter((r) => canonicalOf(r.approvalStatusId) === filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [te.data, filter, lk.all]);

  const allSelected = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function run(action: 'submit' | 'approve' | 'reject' | 'lock' | 'unlock') {
    const ids = [...sel];
    if (!ids.length) return;
    let body: Record<string, unknown> = { ids };
    if (action === 'reject') {
      const reason = window.prompt('Motivo del rifiuto (opzionale):') ?? undefined;
      body = { ids, reason };
    } else if (action === 'lock') {
      const reason = (window.prompt('Motivo blocco: PAYROLL / INVOICED / PERIOD_CLOSE / MANUAL', 'MANUAL') ?? 'MANUAL').toUpperCase();
      body = { ids, reason: ['PAYROLL', 'INVOICED', 'PERIOD_CLOSE', 'MANUAL'].includes(reason) ? reason : 'MANUAL' };
    }
    setBusy(true);
    try {
      const res = await mutate<{ updated: number }>('POST', `/time-entries/${action}`, body);
      toast(`${res.updated ?? 0} righe aggiornate`, 'success');
      setSel(new Set());
      await te.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<TimeEntryDto>[] = [
    {
      key: 'sel', header: '', render: (r) => (
        <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)}
          onClick={(e) => e.stopPropagation()} aria-label="seleziona riga" />
      ),
    },
    { key: 'occurredOn', header: 'Data', sortable: false, render: (r) => <span className="cellsub">{dateIt(r.occurredOn)}</span> },
    {
      key: 'engagement', header: 'Commessa', render: (r) => {
        const e = r.engagementId ? engById.get(r.engagementId) : undefined;
        return e ? <span className="cellname">{e.code}</span> : <span style={{ color: 'var(--ink-faint)' }}>—</span>;
      },
    },
    {
      key: 'resource', header: 'Risorsa', render: (r) => {
        const res = r.resourceId ? resById.get(r.resourceId) : undefined;
        return res ? res.label : <span style={{ color: 'var(--ink-faint)' }}>—</span>;
      },
    },
    {
      key: 'typology', header: 'Tipologia', render: (r) => {
        const l = lk.byId(r.typologyId);
        return l ? <StatusPill label={lk.labelOf(r.typologyId)} token={l.colorToken} /> : <span className="chip">{r.typology}</span>;
      },
    },
    { key: 'minutes', header: 'Ore (hh:mm)', align: 'right', render: (r) => <span className="mono">{hhmm(r.minutes)}</span> },
    {
      key: 'bill', header: 'Tariffa', align: 'right', render: (r) =>
        r.billRate != null ? <span className="mono">€ {r.billRate.toFixed(2)}/h</span> : <span style={{ color: 'var(--ink-faint)' }}>—</span>,
    },
    {
      key: 'status', header: 'Stato', render: (r) => {
        const l = lk.byId(r.approvalStatusId);
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {l ? <StatusPill label={lk.labelOf(r.approvalStatusId)} token={l.colorToken} /> : <span className="cellsub">—</span>}
            {r.isLocked && <LockIcon size={14} style={{ color: 'var(--ink-faint)' }} aria-label={`bloccata (${r.lockReason ?? ''})`} />}
          </span>
        );
      },
    },
  ];

  if (te.error) return <Page title="Foglio ore"><ErrorBox message={te.error} /></Page>;

  return (
    <Page title="Foglio ore">
      {/* filtro stato */}
      <div className="toolbar" style={{ marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <div className="seg">
          {FILTERS.map((f) => (
            <button key={f.key} className={filter === f.key ? 'on' : ''}
              onClick={() => { setFilter(f.key); setSel(new Set()); }}>{f.label}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {rows.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={toggleAll}>
            {allSelected ? 'Deseleziona' : 'Seleziona tutto'}
          </button>
        )}
      </div>

      {/* barra azioni in blocco */}
      {sel.size > 0 && (
        <div className="toolbar" style={{
          marginBottom: 12, gap: 8, alignItems: 'center', padding: '8px 12px',
          background: 'var(--surface-2, var(--card))', borderRadius: 'var(--r-md, 10px)', border: '1px solid var(--line)',
        }}>
          <strong>{sel.size} selezionate</strong>
          <div style={{ flex: 1 }} />
          {canSubmit && <button className="btn btn-sm" disabled={busy} onClick={() => run('submit')}><Send size={15} /> Invia</button>}
          {canApprove && <>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run('approve')}><Check size={15} /> Approva</button>
            <button className="btn btn-sm" disabled={busy} onClick={() => run('reject')}><X size={15} /> Respingi</button>
            <button className="btn btn-sm" disabled={busy} onClick={() => run('lock')}><Lock size={15} /> Blocca</button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run('unlock')}><Unlock size={15} /> Sblocca</button>
          </>}
        </div>
      )}

      {te.loading || engs.loading || ress.loading
        ? <Loading />
        : <DataTable<TimeEntryDto>
          columns={columns} rows={rows}
          empty={<EmptyState icon={Clock} title="Nessuna riga ore" hint="Le ore registrate dai tecnici compaiono qui." />}
        />}
    </Page>
  );
}
