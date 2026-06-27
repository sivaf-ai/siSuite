/**
 * TimeEntriesPage — "Foglio ore" (Modulo Ore §4.3) su EntityList v2.
 * Lista delle ore con viste per stato di approvazione, selezione a checkbox
 * standard (solo conteggio) e azioni IN BLOCCO custom (invia / approva /
 * respingi / blocca / sblocca). Le azioni sono gated dai permessi
 * (time_entry:create per l'invio, time_entry:approve per il resto;
 * time_entry:delete per l'eliminazione); la sicurezza vera è API+RLS.
 * Click riga → scheda /time-entries/:id.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router';
import { Send, Check, X, Lock, Unlock, Lock as LockIcon, Plus } from 'lucide-react';
import type { TimeEntryDto, EngagementDto, ResourceDto, ActivityDto, PermissionKey } from '@sisuite/shared';
import { Page } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { EntityList, type ListColumn, type ListView, type ListAction } from '../ui/EntityList';
import { useApi, useReloadOnEnter, mutate } from '../api/hooks';
import { PromptDialog } from '../ui/PromptDialog';
import { useLookups } from '../context/Lookups';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';
import { hhmm } from '../lib/time';

type ViewKey = 'all' | 'submitted' | 'approved' | 'draft';
const VIEW_KEYS: ViewKey[] = ['all', 'submitted', 'approved', 'draft'];
const VIEW_CANONICAL: Record<Exclude<ViewKey, 'all'>, string> = {
  submitted: 'submitted', approved: 'approved', draft: 'draft',
};

function dateIt(s: string): string {
  // occurredOn arriva come 'YYYY-MM-DD' o ISO: mostra gg/mm/aaaa
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('it-IT');
}

export function TimeEntriesPage() {
  const { t } = useTranslation();
  const lk = useLookups();
  const toast = useToast();
  const history = useHistory();
  const { user } = useAuth();
  const perms = new Set<PermissionKey>((user?.permissions ?? []) as PermissionKey[]);
  const canApprove = perms.has('time_entry:approve');
  const canSubmit = perms.has('time_entry:create');
  const canDelete = perms.has('time_entry:delete');

  const te = useApi<{ items: TimeEntryDto[] }>('/time-entries');
  const engs = useApi<{ items: EngagementDto[] }>('/engagements');
  const ress = useApi<{ items: ResourceDto[] }>('/resources');
  const acts = useApi<{ items: ActivityDto[] }>('/activities');
  useReloadOnEnter(te.reload);

  const [view, setView] = useState<ViewKey>('all');
  const [q, setQ] = useState('');
  const [selRows, setSelRows] = useState<TimeEntryDto[]>([]);
  const [clearTok, setClearTok] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reasonFor, setReasonFor] = useState<'reject' | 'lock' | null>(null);

  const engById = useMemo(() => new Map((engs.data?.items ?? []).map((e) => [e.id, e])), [engs.data]);
  const resById = useMemo(() => new Map((ress.data?.items ?? []).map((r) => [r.id, r])), [ress.data]);
  const actById = useMemo(() => new Map((acts.data?.items ?? []).map((a) => [a.id, a])), [acts.data]);

  const canonicalOf = (statusId: string | null): string | null => lk.byId(statusId)?.canonical ?? null;

  // viste per stato di approvazione (filtro client-side sulle righe caricate)
  const items = te.data?.items ?? [];
  const rows = useMemo(() => {
    if (view === 'all') return items;
    return items.filter((r) => canonicalOf(r.approvalStatusId) === VIEW_CANONICAL[view]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, view, lk.all]);

  const countByCanonical = (canonical: string) =>
    items.filter((r) => canonicalOf(r.approvalStatusId) === canonical).length;
  const views: ListView[] = [
    { key: 'all', label: 'Tutte', count: items.length },
    { key: 'submitted', label: 'Da approvare', count: countByCanonical('submitted') },
    { key: 'approved', label: 'Approvate', count: countByCanonical('approved') },
    { key: 'draft', label: 'Bozze', count: countByCanonical('draft') },
  ];

  const engLabel = (r: TimeEntryDto) => (r.engagementId ? engById.get(r.engagementId)?.code ?? '' : '');
  const actLabel = (r: TimeEntryDto) => (r.activityId ? actById.get(r.activityId)?.title ?? '' : '');
  const resLabel = (r: TimeEntryDto) => (r.resourceId ? resById.get(r.resourceId)?.label ?? '' : '');

  const columns: ListColumn<TimeEntryDto>[] = [
    {
      key: 'occurredOn', header: 'Data', value: (r) => dateIt(r.occurredOn),
      render: (r) => <span className="mono">{dateIt(r.occurredOn)}</span>,
    },
    {
      key: 'engagement', header: 'Commessa', sub: 'fase / attività',
      value: (r) => [engLabel(r), actLabel(r)].filter(Boolean).join(' · '),
      render: (r) => {
        const code = engLabel(r); const act = actLabel(r);
        return code || act
          ? <div className="two"><span className="a">{code || '—'}</span><span className="b">{act || ''}</span></div>
          : <span className="faint">—</span>;
      },
    },
    {
      key: 'resource', header: 'Risorsa', value: (r) => resLabel(r),
      render: (r) => (resLabel(r) ? <span>{resLabel(r)}</span> : <span className="faint">—</span>),
    },
    {
      key: 'typology', header: 'Tipologia',
      value: (r) => lk.labelOf(r.typologyId) || r.typology,
      render: (r) => {
        const l = lk.byId(r.typologyId);
        return l ? <StatusPill label={lk.labelOf(r.typologyId)} token={l.colorToken} /> : <span className="chip">{r.typology}</span>;
      },
    },
    {
      key: 'minutes', header: 'Durata', sub: 'h:mm', num: true,
      value: (r) => hhmm(r.minutes),
      render: (r) => <span className="mono">{hhmm(r.minutes)}</span>,
    },
    {
      key: 'bill', header: 'Tariffa', num: true,
      value: (r) => (r.billRate != null ? r.billRate : ''),
      render: (r) => r.billRate != null
        ? <span className="mono">€ {r.billRate.toFixed(2)}/h</span>
        : <span className="faint">—</span>,
    },
    {
      key: 'status', header: 'Stato',
      value: (r) => lk.labelOf(r.approvalStatusId) + (r.isLocked ? ' (bloccata)' : ''),
      render: (r) => {
        const l = lk.byId(r.approvalStatusId);
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {l ? <StatusPill label={lk.labelOf(r.approvalStatusId)} token={l.colorToken} /> : <span className="faint">—</span>}
            {r.isLocked && <LockIcon size={14} style={{ color: 'var(--ink-faint)' }} aria-label={`bloccata (${r.lockReason ?? ''})`} />}
          </span>
        );
      },
    },
  ];

  // export: TUTTI i campi della registrazione ore
  const exportFields = [
    { key: 'occurredOn', label: 'Data', value: (r: TimeEntryDto) => dateIt(r.occurredOn) },
    { key: 'engagement', label: 'Commessa', value: (r: TimeEntryDto) => engLabel(r) },
    { key: 'activity', label: 'Fase / attività', value: (r: TimeEntryDto) => actLabel(r) },
    { key: 'resource', label: 'Risorsa', value: (r: TimeEntryDto) => resLabel(r) },
    { key: 'typology', label: 'Tipologia', value: (r: TimeEntryDto) => lk.labelOf(r.typologyId) || r.typology },
    { key: 'minutes', label: 'Durata (h:mm)', value: (r: TimeEntryDto) => hhmm(r.minutes) },
    { key: 'minutesRaw', label: 'Minuti', value: (r: TimeEntryDto) => r.minutes },
    { key: 'costRate', label: 'Costo (€/h)', value: (r: TimeEntryDto) => (r.costRate != null ? r.costRate.toFixed(2) : '') },
    { key: 'billRate', label: 'Tariffa (€/h)', value: (r: TimeEntryDto) => (r.billRate != null ? r.billRate.toFixed(2) : '') },
    { key: 'currency', label: 'Valuta', value: (r: TimeEntryDto) => r.currency ?? '' },
    { key: 'billable', label: 'Fatturabile', value: (r: TimeEntryDto) => (r.billable ? 'Sì' : 'No') },
    { key: 'status', label: 'Stato approvazione', value: (r: TimeEntryDto) => lk.labelOf(r.approvalStatusId) },
    { key: 'isLocked', label: 'Bloccata', value: (r: TimeEntryDto) => (r.isLocked ? 'Sì' : 'No') },
    { key: 'lockReason', label: 'Motivo blocco', value: (r: TimeEntryDto) => r.lockReason ?? '' },
    { key: 'notes', label: 'Note', value: (r: TimeEntryDto) => r.notes ?? '' },
    { key: 'createdAt', label: 'Creata il', value: (r: TimeEntryDto) => dateIt(r.createdAt) },
  ];

  // ── azioni in blocco (preservate dalla versione legacy DataTable) ──
  async function exec(action: 'submit' | 'approve' | 'reject' | 'lock' | 'unlock', body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await mutate<{ updated: number }>('POST', `/time-entries/${action}`, body);
      toast(`${res.updated ?? 0} righe aggiornate`, 'success');
      setClearTok((n) => n + 1); // azzera la selezione di EntityList
      await te.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function run(action: 'submit' | 'approve' | 'reject' | 'lock' | 'unlock') {
    const ids = selRows.map((r) => r.id);
    if (!ids.length) return;
    if (action === 'reject' || action === 'lock') { setReasonFor(action); return; } // chiede il motivo via popup in-app
    void exec(action, { ids });
  }
  function onReasonConfirm(value: string) {
    const action = reasonFor; if (!action) return;
    const ids = selRows.map((r) => r.id); setReasonFor(null);
    if (action === 'reject') { void exec('reject', { ids, reason: value || undefined }); return; }
    const reason = (value || 'MANUAL').toUpperCase();
    void exec('lock', { ids, reason: ['PAYROLL', 'INVOICED', 'PERIOD_CLOSE', 'MANUAL'].includes(reason) ? reason : 'MANUAL' });
  }

  const selCount = selRows.length;
  const rightActions: ListAction[] = [
    ...(canSubmit ? [{ key: 'new', icon: Plus, tip: 'Nuova registrazione ore', variant: 'primary' as const, onClick: () => history.push('/time-entries/new') }] : []),
  ];

  return (
    <Page>
      {/* barra azioni in blocco: appare quando ci sono righe selezionate */}
      {selCount > 0 && (
        <div className="toolbar" style={{
          marginBottom: 12, gap: 8, alignItems: 'center', padding: '8px 12px',
          background: 'var(--surface-2, var(--card))', borderRadius: 'var(--r-md, 10px)', border: '1px solid var(--line)',
        }}>
          <strong>{selCount} selezionate</strong>
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

      <EntityList<TimeEntryDto>
        title={t('terms.time_entry_plural')} subtitle="Ore registrate: invio, approvazione e blocco"
        views={views} activeView={view} onView={(k) => setView(k as ViewKey)}
        search={q} onSearch={setQ} searchPlaceholder="Cerca commessa, risorsa, tipologia…"
        columns={columns} rows={rows}
        loading={te.loading || engs.loading || ress.loading || acts.loading} error={te.error}
        onRowClick={(r) => history.push(`/time-entries/${r.id}`)}
        onDelete={canDelete ? deleteRows : undefined}
        exportName="foglio-ore" exportFields={exportFields}
        onSelectionChange={setSelRows} clearSelectionToken={clearTok}
        rightActions={rightActions}
        emptyText="Nessuna riga ore in questa vista."
      />

      <PromptDialog open={reasonFor === 'reject'} title="Respingi le ore"
        message="Puoi indicare un motivo per il rifiuto (facoltativo)." label="Motivo del rifiuto"
        placeholder="es. ore non coerenti col rapportino" confirmLabel="Respingi" required={false}
        onConfirm={onReasonConfirm} onCancel={() => setReasonFor(null)} />
      <PromptDialog open={reasonFor === 'lock'} title="Blocca le ore"
        message="Indica il motivo del blocco: PAYROLL, INVOICED, PERIOD_CLOSE o MANUAL." label="Motivo del blocco"
        initial="MANUAL" confirmLabel="Blocca"
        onConfirm={onReasonConfirm} onCancel={() => setReasonFor(null)} />
    </Page>
  );

  // elimina in blocco le righe selezionate (gate time_entry:delete; il DELETE
  // lato API rifiuta le righe bloccate). EntityList chiede conferma in-app.
  async function deleteRows(toDel: TimeEntryDto[]) {
    let ok = 0;
    for (const r of toDel) {
      try { await mutate('DELETE', `/time-entries/${r.id}`); ok += 1; }
      catch { /* riga bloccata o non eliminabile: la saltiamo */ }
    }
    toast(`${ok} righe eliminate`, ok ? 'success' : 'error');
    await te.reload();
  }
}
