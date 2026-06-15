/**
 * AssenzePage — MODULO ORE §4.4: assenze e saldi. Due schede:
 *  - Richieste: lista + crea + approva (l'approvazione imputa il saldo).
 *  - Saldi: maturato/goduto/residuo per risorsa+tipo+anno (carico manuale).
 */
import { useMemo, useState } from 'react';
import { CalendarOff, Plus, Check, Trash2 } from 'lucide-react';
import type { AbsenceDto, AbsenceBalanceDto, ResourceDto, PermissionKey } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { DataTable, type Column } from '../ui/DataTable';
import { EmptyState } from '../ui/EmptyState';
import { Drawer } from '../ui/Drawer';
import { useApi, mutate } from '../api/hooks';
import { useLookups } from '../context/Lookups';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';

type Tab = 'requests' | 'balances';

export function AssenzePage() {
  const lk = useLookups();
  const toast = useToast();
  const { user } = useAuth();
  const perms = new Set<PermissionKey>((user?.permissions ?? []) as PermissionKey[]);
  const canCreate = perms.has('absence:create');
  const canApprove = perms.has('absence:approve');
  const [tab, setTab] = useState<Tab>('requests');

  const abs = useApi<{ items: AbsenceDto[] }>('/absences');
  const bal = useApi<{ items: AbsenceBalanceDto[] }>('/absence-balances');
  const ress = useApi<{ items: ResourceDto[] }>('/resources');
  const resById = useMemo(() => new Map((ress.data?.items ?? []).map((r) => [r.id, r])), [ress.data]);
  const types = lk.byCategory('absence_type');

  const [busy, setBusy] = useState(false);
  // crea richiesta
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

  async function approve(id: string) {
    setBusy(true);
    try { await mutate('POST', `/absences/${id}/approve`); toast('Approvata', 'success'); await abs.reload(); await bal.reload(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true);
    try { await mutate('DELETE', `/absences/${id}`); toast('Eliminata', 'success'); await abs.reload(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  const reqCols: Column<AbsenceDto>[] = [
    { key: 'res', header: 'Risorsa', render: (r) => <span className="cellname">{resById.get(r.resourceId)?.label ?? '—'}</span> },
    { key: 'type', header: 'Tipo', render: (r) => { const l = lk.byId(r.typeId); return l ? <StatusPill label={lk.labelOf(r.typeId)} token={l.colorToken} /> : '—'; } },
    { key: 'period', header: 'Periodo', render: (r) => <span className="cellsub">{r.startsOn} → {r.endsOn}{r.halfDay ? ' (½)' : ''}</span> },
    { key: 'amount', header: 'Quantità', align: 'right', render: (r) => <span className="mono">{r.hours != null ? `${r.hours}h` : '—'}</span> },
    { key: 'status', header: 'Stato', render: (r) => { const l = lk.byId(r.approvalStatusId); return l ? <StatusPill label={lk.labelOf(r.approvalStatusId)} token={l.colorToken} /> : <span className="chip">bozza</span>; } },
  ];
  const reqActions = [
    ...(canApprove ? [{ icon: Check, label: 'Approva', onClick: (r: AbsenceDto) => approve(r.id) }] : []),
    ...(perms.has('absence:delete') ? [{ icon: Trash2, label: 'Elimina', danger: true, onClick: (r: AbsenceDto) => remove(r.id) }] : []),
  ];

  const balCols: Column<AbsenceBalanceDto & { id: string }>[] = [
    { key: 'res', header: 'Risorsa', render: (r) => <span className="cellname">{resById.get(r.resourceId)?.label ?? '—'}</span> },
    { key: 'type', header: 'Tipo', render: (r) => lk.labelOf(r.typeId) || '—' },
    { key: 'year', header: 'Anno', render: (r) => r.year },
    { key: 'accrued', header: 'Maturato', align: 'right', render: (r) => <span className="mono">{r.accrued}</span> },
    { key: 'used', header: 'Goduto', align: 'right', render: (r) => <span className="mono">{r.used}</span> },
    { key: 'res2', header: 'Residuo', align: 'right', render: (r) => <span className="mono" style={{ fontWeight: 700, color: r.residual < 0 ? 'var(--c-danger, #c0392b)' : 'var(--c-success, #1e8e4e)' }}>{r.residual}</span> },
  ];
  const balRows = (bal.data?.items ?? []).map((r) => ({ ...r, id: `${r.resourceId}_${r.typeId}_${r.year}` }));

  if (abs.error) return <Page title="Assenze"><ErrorBox message={abs.error} /></Page>;

  return (
    <Page title="Assenze">
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="seg">
          <button className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>Richieste</button>
          <button className={tab === 'balances' ? 'on' : ''} onClick={() => setTab('balances')}>Saldi</button>
        </div>
        <span style={{ flex: 1 }} />
        {tab === 'requests' && canCreate && <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}><Plus size={16} /> Nuova richiesta</button>}
      </div>

      {tab === 'requests' && (abs.loading ? <Loading /> :
        <DataTable columns={reqCols} rows={abs.data?.items ?? []} actions={reqActions.length ? reqActions : undefined}
          empty={<EmptyState icon={CalendarOff} title="Nessuna assenza" hint="Crea una richiesta di ferie/permesso." />} />)}

      {tab === 'balances' && (bal.loading ? <Loading /> :
        <DataTable columns={balCols} rows={balRows}
          empty={<EmptyState icon={CalendarOff} title="Nessun saldo" hint="I saldi si popolano approvando le assenze o caricando il maturato." />} />)}

      <Drawer open={open} title="Nuova richiesta di assenza" onClose={() => setOpen(false)} footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => setOpen(false)}>Annulla</button>
          <button className="btn btn-primary" disabled={busy} onClick={createAbsence}>Crea</button>
        </div>
      }>
        <div className="field"><label>Risorsa<span className="req">*</span></label>
          <select className="txt" value={rRes} onChange={(e) => setRRes(e.target.value)}>
            <option value="">—</option>
            {(ress.data?.items ?? []).filter((r) => r.kind === 'person').map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select></div>
        <div className="field"><label>Tipo<span className="req">*</span></label>
          <select className="txt" value={rType} onChange={(e) => setRType(e.target.value)}>
            <option value="">—</option>
            {types.map((t) => <option key={t.id} value={t.id}>{lk.labelOf(t.id)}</option>)}
          </select></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field"><label>Dal<span className="req">*</span></label><input className="txt" type="date" value={rFrom} onChange={(e) => setRFrom(e.target.value)} /></div>
          <div className="field"><label>Al<span className="req">*</span></label><input className="txt" type="date" value={rTo} onChange={(e) => setRTo(e.target.value)} /></div>
        </div>
        <div className="field"><label>Ore (solo per permessi a ore)</label><input className="txt" type="number" value={rHours} onChange={(e) => setRHours(e.target.value)} placeholder="lascia vuoto = giornate intere" /></div>
        <div className="field"><label>Note</label><textarea className="txt" value={rNote} onChange={(e) => setRNote(e.target.value)} /></div>
      </Drawer>
    </Page>
  );
}
