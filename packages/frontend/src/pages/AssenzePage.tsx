/**
 * AssenzePage — MODULO ORE §4.4: assenze e saldi, su EntityList v2. Due schede:
 *  - Richieste: lista (EntityList) + crea (Modal) ; click riga → scheda /absences/:id.
 *    Viste "Tutte/In attesa/Approvate" (filtro client sul canonical dell'approvazione).
 *  - Saldi: EntityList in sola lettura (maturato/goduto/residuo per risorsa+tipo+anno).
 * L'approvazione e l'eliminazione vivono nella scheda; la creazione resta in Modal.
 */
import { useMemo, useState } from 'react';
import { useHistory } from 'react-router';
import { Plus } from 'lucide-react';
import type { AbsenceDto, AbsenceBalanceDto, ResourceDto, PermissionKey } from '@sisuite/shared';
import { Page } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { EntityList, type ListColumn, type ListView, type ListAction, type ExportField } from '../ui/EntityList';
import { Modal } from '../ui/Modal';
import { useApi, mutate } from '../api/hooks';
import { useLookups } from '../context/Lookups';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';

type Tab = 'requests' | 'balances';
type ReqView = 'all' | 'pending' | 'approved';
type BalRow = AbsenceBalanceDto & { id: string };

export function AssenzePage() {
  const lk = useLookups();
  const toast = useToast();
  const history = useHistory();
  const { user } = useAuth();
  const perms = new Set<PermissionKey>((user?.permissions ?? []) as PermissionKey[]);
  const canCreate = perms.has('absence:create');
  const [tab, setTab] = useState<Tab>('requests');
  const [view, setView] = useState<ReqView>('all');

  const abs = useApi<{ items: AbsenceDto[] }>('/absences');
  const bal = useApi<{ items: AbsenceBalanceDto[] }>('/absence-balances');
  const ress = useApi<{ items: ResourceDto[] }>('/resources');
  const resById = useMemo(() => new Map((ress.data?.items ?? []).map((r) => [r.id, r])), [ress.data]);
  const types = lk.byCategory('absence_type');

  const [busy, setBusy] = useState(false);
  // crea richiesta (Modal centrato)
  const [open, setOpen] = useState(false);
  const [rRes, setRRes] = useState('');
  const [rType, setRType] = useState('');
  const [rFrom, setRFrom] = useState('');
  const [rTo, setRTo] = useState('');
  const [rHours, setRHours] = useState('');
  const [rNote, setRNote] = useState('');

  async function createAbsence() {
    if (!rRes || !rType || !rFrom || !rTo) { toast('Compila risorsa, tipo e date', 'error'); return; }
    setBusy(true);
    try {
      await mutate('POST', '/absences', {
        resourceId: rRes, typeId: rType, startsOn: rFrom, endsOn: rTo,
        hours: rHours ? Number(rHours) : undefined, note: rNote || undefined,
      });
      toast('Richiesta creata', 'success');
      setOpen(false); setRRes(''); setRType(''); setRFrom(''); setRTo(''); setRHours(''); setRNote('');
      await abs.reload();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  const resLabel = (r: AbsenceDto | BalRow) => resById.get(r.resourceId)?.label ?? '—';
  const isApproved = (r: AbsenceDto) => lk.byId(r.approvalStatusId)?.canonical === 'approved';

  // ── Tab Richieste ──────────────────────────────────────────────────────
  const allReq = abs.data?.items ?? [];
  const viewReq = view === 'pending' ? allReq.filter((r) => !isApproved(r))
    : view === 'approved' ? allReq.filter(isApproved) : allReq;
  const reqViews: ListView[] = [
    { key: 'all', label: 'Tutte', count: allReq.length },
    { key: 'pending', label: 'In attesa', count: allReq.filter((r) => !isApproved(r)).length },
    { key: 'approved', label: 'Approvate', count: allReq.filter(isApproved).length },
  ];

  const reqColumns: ListColumn<AbsenceDto>[] = [
    { key: 'res', header: 'Risorsa', value: (r) => resLabel(r), render: (r) => <span className="cellname">{resLabel(r)}</span> },
    { key: 'type', header: 'Tipo', value: (r) => lk.labelOf(r.typeId), render: (r) => {
      const l = lk.byId(r.typeId); return l ? <StatusPill label={lk.labelOf(r.typeId)} token={l.colorToken} /> : <span className="faint">—</span>;
    } },
    { key: 'period', header: 'Periodo', value: (r) => `${r.startsOn} → ${r.endsOn}${r.halfDay ? ' (½)' : ''}`,
      render: (r) => <span className="cellsub">{r.startsOn} → {r.endsOn}{r.halfDay ? ' (½)' : ''}</span> },
    { key: 'amount', header: 'Quantità', num: true, value: (r) => (r.hours != null ? `${r.hours}h` : ''),
      render: (r) => <span className="mono">{r.hours != null ? `${r.hours}h` : '—'}</span> },
    { key: 'status', header: 'Stato', value: (r) => lk.labelOf(r.approvalStatusId) || 'bozza', render: (r) => {
      const l = lk.byId(r.approvalStatusId);
      return l ? <StatusPill label={lk.labelOf(r.approvalStatusId)} token={l.colorToken} /> : <span className="chip">bozza</span>;
    } },
  ];

  const reqExportFields: ExportField<AbsenceDto>[] = [
    { key: 'res', label: 'Risorsa', value: (r) => resLabel(r) },
    { key: 'type', label: 'Tipo', value: (r) => lk.labelOf(r.typeId) },
    { key: 'startsOn', label: 'Dal', value: (r) => r.startsOn },
    { key: 'endsOn', label: 'Al', value: (r) => r.endsOn },
    { key: 'halfDay', label: 'Mezza giornata', value: (r) => (r.halfDay ? 'Sì' : 'No') },
    { key: 'hours', label: 'Ore', value: (r) => (r.hours != null ? r.hours : '') },
    { key: 'status', label: 'Stato', value: (r) => lk.labelOf(r.approvalStatusId) || 'bozza' },
    { key: 'note', label: 'Note', value: (r) => r.note ?? '' },
    { key: 'createdAt', label: 'Creata il', value: (r) => new Date(r.createdAt).toLocaleDateString('it-IT') },
  ];

  const reqRight: ListAction[] = canCreate
    ? [{ key: 'new', icon: Plus, tip: 'Nuova richiesta', variant: 'primary' as const, onClick: () => setOpen(true) }]
    : [];

  // ── Tab Saldi (sola lettura) ───────────────────────────────────────────
  const balRows: BalRow[] = (bal.data?.items ?? []).map((r) => ({ ...r, id: `${r.resourceId}_${r.typeId}_${r.year}` }));
  const balColumns: ListColumn<BalRow>[] = [
    { key: 'res', header: 'Risorsa', value: (r) => resLabel(r), render: (r) => <span className="cellname">{resLabel(r)}</span> },
    { key: 'type', header: 'Tipo', value: (r) => lk.labelOf(r.typeId), render: (r) => lk.labelOf(r.typeId) || '—' },
    { key: 'year', header: 'Anno', num: true, value: (r) => r.year, render: (r) => <span className="mono">{r.year}</span> },
    { key: 'accrued', header: 'Maturato', num: true, value: (r) => r.accrued, render: (r) => <span className="mono">{r.accrued}</span> },
    { key: 'used', header: 'Goduto', num: true, value: (r) => r.used, render: (r) => <span className="mono">{r.used}</span> },
    { key: 'residual', header: 'Residuo', num: true, value: (r) => r.residual, render: (r) => (
      <span className="mono" style={{ fontWeight: 700, color: r.residual < 0 ? 'var(--c-danger, #c0392b)' : 'var(--c-success, #1e8e4e)' }}>{r.residual}</span>) },
  ];

  return (
    <Page>
      <div className="dsx" style={{ marginBottom: 4 }}>
        <div className="seg" style={{ display: 'inline-flex' }}>
          <button className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>Richieste</button>
          <button className={tab === 'balances' ? 'on' : ''} onClick={() => setTab('balances')}>Saldi</button>
        </div>
      </div>

      {tab === 'requests' && (
        <EntityList<AbsenceDto>
          title="Assenze" subtitle="Richieste di ferie e permessi"
          views={reqViews} activeView={view} onView={(k) => setView(k as ReqView)}
          columns={reqColumns} rows={viewReq} loading={abs.loading} error={abs.error}
          onRowClick={(r) => history.push(`/absences/${r.id}`)}
          rightActions={reqRight}
          selectable={false}
          exportName="assenze" exportFields={reqExportFields}
          emptyText="Nessuna assenza in questa vista."
        />
      )}

      {tab === 'balances' && (
        <EntityList<BalRow>
          title="Saldi assenze" subtitle="Maturato, goduto e residuo per risorsa, tipo e anno"
          columns={balColumns} rows={balRows} loading={bal.loading} error={bal.error}
          selectable={false}
          exportName="saldi-assenze"
          emptyText="Nessun saldo. I saldi si popolano approvando le assenze o caricando il maturato."
        />
      )}

      <Modal open={open} title="Nuova richiesta di assenza" size="md" onClose={() => setOpen(false)} footer={
        <>
          <button className="btn btn-ghost" onClick={() => setOpen(false)}>Annulla</button>
          <button className="btn btn-primary" disabled={busy} onClick={createAbsence}>Crea</button>
        </>
      }>
        <div className="bgrid">
          <div className="bf c2"><span className="bl">Risorsa <span className="req">*</span></span>
            <select className="bi" value={rRes} onChange={(e) => setRRes(e.target.value)}>
              <option value="">—</option>
              {(ress.data?.items ?? []).filter((r) => r.kind === 'person').map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select></div>
          <div className="bf c2"><span className="bl">Tipo <span className="req">*</span></span>
            <select className="bi" value={rType} onChange={(e) => setRType(e.target.value)}>
              <option value="">—</option>
              {types.map((t) => <option key={t.id} value={t.id}>{lk.labelOf(t.id)}</option>)}
            </select></div>
          <div className="bf c2"><span className="bl">Dal <span className="req">*</span></span><input className="bi mono" type="date" value={rFrom} onChange={(e) => setRFrom(e.target.value)} /></div>
          <div className="bf c2"><span className="bl">Al <span className="req">*</span></span><input className="bi mono" type="date" value={rTo} onChange={(e) => setRTo(e.target.value)} /></div>
          <div className="bf c2"><span className="bl">Ore (solo permessi a ore)</span><input className="bi mono" style={{ textAlign: 'right' }} type="number" value={rHours} onChange={(e) => setRHours(e.target.value)} placeholder="vuoto = giornate intere" /></div>
          <div className="bf c4"><span className="bl">Note</span><input className="bi" value={rNote} onChange={(e) => setRNote(e.target.value)} /></div>
        </div>
      </Modal>
    </Page>
  );
}
