/**
 * AbsenceDetailPage — scheda della singola richiesta di assenza su ObjectPage v2.
 * Sola lettura dei campi (risorsa, tipo, periodo, ore, mezza giornata, note) con
 * azioni Approva (idempotente, imputa il saldo) ed Elimina. La creazione resta nel
 * Drawer della lista (AssenzePage), quindi qui non si gestisce il caso /new.
 */
import { useState } from 'react';
import { useParams, useHistory } from 'react-router';
import { CalendarOff, Check, Trash2 } from 'lucide-react';
import type { AbsenceDto, ResourceDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { ObjectPage, ObjectBox } from '../ui/ObjectPage';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useApi, mutate } from '../api/hooks';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';
import { useLookups } from '../context/Lookups';

export function AbsenceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const history = useHistory();
  const toast = useToast();
  const lk = useLookups();
  const { user } = useAuth();
  const can = (a: string) => !!user?.permissions.includes(`absence:${a}` as never);

  const abs = useApi<AbsenceDto>(`/absences/${id}`);
  const ress = useApi<{ items: ResourceDto[] }>('/resources');
  const resById = new Map((ress.data?.items ?? []).map((r) => [r.id, r]));

  const [busy, setBusy] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  const a = abs.data;
  const approved = lk.byId(a?.approvalStatusId)?.canonical === 'approved';

  async function approve() {
    if (!a) return; setBusy(true);
    try { await mutate('POST', `/absences/${a.id}/approve`); toast('Assenza approvata', 'success'); void abs.reload(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function remove() {
    if (!a) return; setBusy(true);
    try { await mutate('DELETE', `/absences/${a.id}`); toast('Assenza eliminata', 'success'); history.push('/absences'); }
    catch (e) { toast((e as Error).message, 'error'); setDelOpen(false); } finally { setBusy(false); }
  }

  if (abs.loading) return <Page title="Assenza"><Loading /></Page>;
  if (abs.error) return <Page title="Assenza"><ErrorBox message={abs.error} /></Page>;
  if (!a) return <Page title="Assenza"><ErrorBox message="Assenza non trovata" /></Page>;

  const resLabel = resById.get(a.resourceId)?.label ?? '—';
  const typeL = lk.byId(a.typeId);
  const statusL = lk.byId(a.approvalStatusId);
  const title = `Assenza — ${resLabel}`;

  return (
    <Page title={title} bleed>
      <ObjectPage
        backLabel="Assenze" onBack={() => history.push('/absences')}
        title={title} code={a.id.slice(0, 8).toUpperCase()}
        status={statusL ? <StatusPill label={lk.labelOf(a.approvalStatusId)} token={statusL.colorToken} /> : <span className="chip">bozza</span>}
        onCancel={() => history.push('/absences')}
      >
        <ObjectBox icon={CalendarOff} title="Richiesta di assenza">
          <div className="bgrid">
            <div className="bf c2"><span className="bl">Risorsa</span><div className="bi">{resLabel}</div></div>
            <div className="bf c2"><span className="bl">Tipo</span>
              <div className="bi">{typeL ? <StatusPill label={lk.labelOf(a.typeId)} token={typeL.colorToken} /> : '—'}</div></div>
            <div className="bf"><span className="bl">Dal</span><div className="bi mono">{a.startsOn}</div></div>
            <div className="bf"><span className="bl">Al</span><div className="bi mono">{a.endsOn}</div></div>
            <div className="bf"><span className="bl">Mezza giornata</span><div className="bi">{a.halfDay ? 'Sì' : 'No'}</div></div>
            <div className="bf"><span className="bl">Ore</span><div className="bi mono">{a.hours != null ? `${a.hours}h` : '— (giornate intere)'}</div></div>
            <div className="bf c4"><span className="bl">Note</span><div className="bi" style={{ height: 'auto', minHeight: 38, padding: '9px 11px', alignItems: 'flex-start' }}>{a.note || '—'}</div></div>
          </div>
        </ObjectBox>

        <div style={{ display: 'flex', gap: 8, padding: '6px 2px 4px', flexWrap: 'wrap' }}>
          {can('approve') && !approved && (
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void approve()}><Check size={15} /> Approva</button>
          )}
          {approved && <span className="faint" style={{ alignSelf: 'center' }}>Già approvata — il saldo è già stato imputato.</span>}
          <span style={{ flex: 1 }} />
          {can('delete') && (
            <button className="btn btn-ghost" disabled={busy} onClick={() => setDelOpen(true)} style={{ color: 'var(--danger)' }}><Trash2 size={15} /> Elimina</button>
          )}
        </div>
      </ObjectPage>

      <ConfirmDialog open={delOpen} danger title="Eliminare l'assenza?"
        message={`Stai per eliminare l'assenza «${lk.labelOf(a.typeId) || 'assenza'}» di ${resLabel} dal ${a.startsOn} al ${a.endsOn}. Il saldo eventualmente già imputato non viene ripristinato automaticamente.`}
        confirmLabel="Elimina" busy={busy} onConfirm={() => void remove()} onCancel={() => setDelOpen(false)} />
    </Page>
  );
}
