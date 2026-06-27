/**
 * PickListDetailPage — Scheda pick list (master-detail come Ordini di lavoro):
 * testata in ObjectBox + righe in tabella .subt. Righe SOLO via MaterialPickerDialog.
 * Azione "Conferma prelievo" → genera scarichi, stato 'done'.
 */
import { useEffect, useState } from 'react';
import { useHistory, useParams } from 'react-router';
import { ListChecks, Boxes, Trash2, Check } from 'lucide-react';
import type { PickListDto, StockLocationDto, ResourceDto, EngagementDto, WorkOrderDto, MaterialDto, UnitDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { ObjectPage, ObjectBox } from '../ui/ObjectPage';
import { MaterialPickerDialog } from '../ui/MaterialPickerDialog';
import { LocationPickerDialog } from '../ui/LocationPickerDialog';
import { ResourcePickerDialog } from '../ui/ResourcePickerDialog';
import { EngagementPickerDialog } from '../ui/EngagementPickerDialog';
import { WorkOrderPickerDialog } from '../ui/WorkOrderPickerDialog';
import { PickerField } from '../ui/PickerField';
import { NumInput } from '../ui/NumInput';
import { UnitSelect } from '../ui/UnitSelect';
import { useApi, mutate } from '../api/hooks';
import { apiFetch, ApiError } from '../api/client';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';

interface ListResp<T> { items: T[] }
interface Row { materialId: string; materialName: string; qtyRequested: number; qtyPicked: number; unit: string }

const PICK_STATUS: Record<string, { label: string; token: string }> = {
  draft: { label: 'Bozza', token: 'neutral' },
  assigned: { label: 'Assegnata', token: 'info' },
  picking: { label: 'In prelievo', token: 'warning' },
  done: { label: 'Completata', token: 'success' },
  cancelled: { label: 'Annullata', token: 'danger' },
};
const fmtErr = (e: unknown) => e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message;

export function PickListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const history = useHistory();
  const toast = useToast();
  const { user } = useAuth();
  const canManage = !!user?.permissions.includes('stock:manage' as never);

  const detail = useApi<PickListDto>(isNew ? null : `/pick-lists/${id}`);
  const locations = useApi<ListResp<StockLocationDto>>('/stock/locations');
  const units = useApi<ListResp<UnitDto>>('/units');
  const resources = useApi<ListResp<ResourceDto>>('/resources?kind=person&limit=200');
  const engagements = useApi<ListResp<EngagementDto>>('/engagements');
  const workOrders = useApi<ListResp<WorkOrderDto>>('/work-orders?limit=200');

  const [form, setForm] = useState<Record<string, string>>({ sourceLocationId: '', assignedResourceId: '', engagementId: '', workOrderId: '', note: '' });
  const [sourceName, setSourceName] = useState('');
  const [resourceName, setResourceName] = useState('');
  const [engagementName, setEngagementName] = useState('');
  const [workOrderName, setWorkOrderName] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [sourcePick, setSourcePick] = useState(false);
  const [resPick, setResPick] = useState(false);
  const [engPick, setEngPick] = useState(false);
  const [woPick, setWoPick] = useState(false);

  const d = detail.data;
  useEffect(() => {
    if (!d) return;
    setForm({
      sourceLocationId: d.sourceLocationId, assignedResourceId: d.assignedResourceId ?? '',
      engagementId: d.engagementId ?? '', workOrderId: d.workOrderId ?? '', note: d.note ?? '',
    });
    setRows((d.lines ?? []).map((l) => ({
      materialId: l.materialId, materialName: l.materialName ?? '—',
      qtyRequested: l.qtyRequested, qtyPicked: l.qtyPicked, unit: l.unit,
    })));
  }, [d]);

  // risolvi il nome dell'origine dalla lista già caricata
  useEffect(() => {
    if (form.sourceLocationId && !sourceName) {
      const l = locations.data?.items.find((x) => x.id === form.sourceLocationId);
      if (l) setSourceName(l.name);
    }
  }, [form.sourceLocationId, locations.data, sourceName]);

  // risolvi i nomi di risorsa/commessa/ordine dalle liste già caricate
  useEffect(() => {
    if (form.assignedResourceId) { const r = resources.data?.items.find((x) => x.id === form.assignedResourceId); if (r) setResourceName(r.label); }
    else setResourceName('');
  }, [form.assignedResourceId, resources.data]);
  useEffect(() => {
    if (form.engagementId) { const e = engagements.data?.items.find((x) => x.id === form.engagementId); if (e) setEngagementName(`${e.code ? `${e.code} · ` : ''}${e.title}`); }
    else setEngagementName('');
  }, [form.engagementId, engagements.data]);
  useEffect(() => {
    if (form.workOrderId) { const w = workOrders.data?.items.find((x) => x.id === form.workOrderId); if (w) setWorkOrderName(`${w.code}${w.address ? ` · ${w.address}` : ''}`); }
    else setWorkOrderName('');
  }, [form.workOrderId, workOrders.data]);

  const status = d?.status ?? 'draft';
  const editable = isNew || status === 'draft' || status === 'assigned';
  const readOnly = !isNew && !editable;
  const st = PICK_STATUS[status] ?? { label: status, token: 'neutral' };
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function addMaterials(mats: MaterialDto[]) {
    setRows((arr) => [...arr, ...mats.map((m) => ({
      materialId: m.id, materialName: m.name, qtyRequested: 1, qtyPicked: 0, unit: m.unit,
    }))]);
  }

  async function save() {
    if (!form.sourceLocationId) { toast('Seleziona il magazzino di origine', 'error'); return; }
    if (rows.length === 0) { toast('Aggiungi almeno una riga', 'error'); return; }
    setBusy(true);
    const lines = rows.map((r) => ({ materialId: r.materialId, qtyRequested: r.qtyRequested, unit: r.unit }));
    try {
      if (isNew) {
        const created = await apiFetch<PickListDto>('/pick-lists', { method: 'POST', body: JSON.stringify({
          sourceLocationId: form.sourceLocationId,
          assignedResourceId: form.assignedResourceId || null,
          engagementId: form.engagementId || null, workOrderId: form.workOrderId || null,
          note: form.note || null, lines,
        }) });
        toast('Pick list creata');
        history.push(`/pick-lists/${created.id}`);
      } else {
        await mutate('PATCH', `/pick-lists/${id}`, {
          assignedResourceId: form.assignedResourceId || null, note: form.note || null, lines,
        });
        toast('Modifiche salvate');
        void detail.reload();
      }
    } catch (e) { toast(fmtErr(e), 'error'); } finally { setBusy(false); }
  }

  async function confirmPick() {
    setBusy(true);
    try {
      await mutate('POST', `/pick-lists/${id}/confirm`, {});
      toast('Prelievo confermato');
      void detail.reload();
    } catch (e) { toast(fmtErr(e), 'error'); } finally { setBusy(false); }
  }

  if (!isNew && detail.loading) return <Page title="Pick list"><Loading /></Page>;
  if (!isNew && detail.error) return <Page title="Pick list"><ErrorBox message={detail.error} /></Page>;

  const canConfirm = canManage && !isNew && ['draft', 'assigned', 'picking'].includes(status);

  return (
    <Page title={isNew ? 'Pick list — nuova' : 'Pick list'} bleed>
      <ObjectPage
        backLabel="Pick list" onBack={() => history.push('/pick-lists')}
        title={!isNew && d?.number ? d.number : 'Pick list'}
        code={!isNew && d?.number ? undefined : (isNew ? 'nuova' : 'bozza')}
        status={!isNew ? <StatusPill label={st.label} token={st.token} /> : undefined}
        onSave={canManage && editable ? save : undefined}
        onCancel={() => history.push('/pick-lists')} saving={busy}
      >
        {canConfirm && (
          <div className="capbar">
            <div className="mic"><Check size={18} /></div>
            <div className="tx"><b>Conferma prelievo</b><span>Genera gli scarichi a magazzino delle quantità richieste; la pick list passa a completata.</span></div>
            <div className="sp" />
            <button className="btn btn-primary" onClick={confirmPick} disabled={busy}><Check size={16} /> Conferma prelievo</button>
          </div>
        )}

        <ObjectBox icon={ListChecks} title="Prelievo">
          <div className="bgrid">
            <div className="bf c2"><span className="bl">Origine <span className="req">*</span></span>
              <PickerField value={sourceName} placeholder="Scegli l'origine…" disabled={readOnly || !isNew}
                onOpen={() => setSourcePick(true)} /></div>
            <div className="bf c2"><span className="bl">Assegnata a</span>
              <PickerField value={resourceName} placeholder="Scegli la risorsa…" disabled={readOnly}
                onOpen={() => setResPick(true)}
                onClear={() => { set('assignedResourceId', ''); setResourceName(''); }} /></div>
            <div className="bf c2"><span className="bl">Commessa</span>
              <PickerField value={engagementName} placeholder="Scegli la commessa…" disabled={readOnly || !isNew}
                onOpen={() => setEngPick(true)}
                onClear={() => { set('engagementId', ''); setEngagementName(''); }} /></div>
            <div className="bf c2"><span className="bl">Ordine di lavoro</span>
              <PickerField value={workOrderName} placeholder="Scegli l'ordine di lavoro…" disabled={readOnly || !isNew}
                onOpen={() => setWoPick(true)}
                onClear={() => { set('workOrderId', ''); setWorkOrderName(''); }} /></div>
            <div className="bf c4"><span className="bl">Note</span>
              <input className="bi" value={form.note} onChange={(e) => set('note', e.target.value)} disabled={readOnly} /></div>
          </div>
        </ObjectBox>

        <ObjectBox icon={Boxes} title="Righe">
          <table className="subt">
            <colgroup>
              <col />
              <col style={{ width: 130 }} />
              <col style={{ width: 120 }} />
              {!isNew && <col style={{ width: 110 }} />}
              {!readOnly && <col style={{ width: 50 }} />}
            </colgroup>
            <thead><tr><th>Articolo</th><th className="num">Qtà richiesta</th><th>Unità</th>{!isNew && <th className="num">Prelevata</th>}{!readOnly && <th />}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.materialName}</td>
                  <td className="num"><NumInput align="right" value={r.qtyRequested} disabled={readOnly}
                    onChange={(n) => setRows((arr) => arr.map((x, j) => j === i ? { ...x, qtyRequested: n ?? 0 } : x))} /></td>
                  <td><UnitSelect value={r.unit} disabled={readOnly} units={units.data?.items ?? []}
                    onChange={(u) => setRows((arr) => arr.map((x, j) => j === i ? { ...x, unit: u } : x))} /></td>
                  {!isNew && <td className="num mono">{r.qtyPicked.toLocaleString('it-IT')}</td>}
                  {!readOnly && <td><button className="reveal locked" style={{ background: 'none', color: 'var(--ink-faint)' }} onClick={() => setRows((arr) => arr.filter((_, j) => j !== i))}><Trash2 /></button></td>}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5}><div className="dsx-empty">Nessuna riga. Aggiungi un articolo.</div></td></tr>}
            </tbody>
          </table>
          {!readOnly && <div className="addline" onClick={() => setPickOpen(true)}><Boxes size={15} /> + Aggiungi articolo</div>}
        </ObjectBox>
      </ObjectPage>

      <MaterialPickerDialog open={pickOpen} multi onClose={() => setPickOpen(false)} onPick={addMaterials} />
      <LocationPickerDialog open={sourcePick} onClose={() => setSourcePick(false)}
        onPick={(ls) => { const l = ls[0]; if (l) { set('sourceLocationId', l.id); setSourceName(l.name); } }} />
      <ResourcePickerDialog open={resPick} onClose={() => setResPick(false)}
        onPick={(rs) => { const r = rs[0]; if (r) { set('assignedResourceId', r.id); setResourceName(r.label); } }} />
      <EngagementPickerDialog open={engPick} onClose={() => setEngPick(false)}
        onPick={(es) => { const e = es[0]; if (e) { set('engagementId', e.id); setEngagementName(`${e.code ? `${e.code} · ` : ''}${e.title}`); } }} />
      <WorkOrderPickerDialog open={woPick} onClose={() => setWoPick(false)}
        onPick={(ws) => { const w = ws[0]; if (w) { set('workOrderId', w.id); setWorkOrderName(`${w.code}${w.address ? ` · ${w.address}` : ''}`); } }} />
    </Page>
  );
}
