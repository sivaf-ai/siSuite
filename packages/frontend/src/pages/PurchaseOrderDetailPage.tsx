/**
 * PurchaseOrderDetailPage — Scheda ordine d'acquisto (master-detail come Ordini di
 * lavoro): testata in ObjectBox + righe in tabella .subt nella STESSA pagina.
 * Righe SOLO via MaterialPickerDialog. Azione "Ricevi merce" in Modal centrato.
 */
import { useEffect, useMemo, useState } from 'react';
import { useHistory, useParams } from 'react-router';
import { ShoppingCart, Boxes, Trash2, PackageCheck } from 'lucide-react';
import type { PurchaseOrderDto, CompanyDto, StockLocationDto, MaterialDto, UnitDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { ObjectPage, ObjectBox } from '../ui/ObjectPage';
import { Modal } from '../ui/Modal';
import { MaterialPickerDialog } from '../ui/MaterialPickerDialog';
import { CompanyPickerDialog } from '../ui/CompanyPickerDialog';
import { LocationTreePickerDialog } from './MagazzinoPage';
import { PickerField } from '../ui/PickerField';
import { NumInput } from '../ui/NumInput';
import { UnitSelect } from '../ui/UnitSelect';
import { useApi, mutate } from '../api/hooks';
import { apiFetch, ApiError } from '../api/client';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';

interface ListResp<T> { items: T[] }
interface Row { materialId: string; materialName: string; qtyOrdered: number; qtyReceived: number; unit: string; unitPrice: number | null; note: string | null }

const PO_STATUS: Record<string, { label: string; token: string }> = {
  draft: { label: 'Bozza', token: 'neutral' },
  sent: { label: 'Inviato', token: 'info' },
  partial: { label: 'Ricevuto parz.', token: 'warning' },
  received: { label: 'Ricevuto', token: 'success' },
  cancelled: { label: 'Annullato', token: 'danger' },
};
const fmtErr = (e: unknown) => e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message;

export function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const history = useHistory();
  const toast = useToast();
  const { user } = useAuth();
  const canManage = !!user?.permissions.includes('stock:manage' as never);

  const detail = useApi<PurchaseOrderDto>(isNew ? null : `/purchase-orders/${id}`);
  const companies = useApi<ListResp<CompanyDto>>('/companies?limit=200');
  const locations = useApi<ListResp<StockLocationDto>>('/stock/locations');
  const units = useApi<ListResp<UnitDto>>('/units');

  const [form, setForm] = useState<Record<string, string>>({ supplierId: '', destLocationId: '', orderDate: '', expectedDate: '', currency: 'EUR', note: '' });
  const [supplierName, setSupplierName] = useState('');
  const [destName, setDestName] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [supplierPick, setSupplierPick] = useState(false);
  const [destPick, setDestPick] = useState(false);

  const d = detail.data;
  useEffect(() => {
    if (!d) return;
    setForm({
      supplierId: d.supplierId, destLocationId: d.destLocationId ?? '',
      orderDate: d.orderDate ?? '', expectedDate: d.expectedDate ?? '',
      currency: d.currency ?? 'EUR', note: d.note ?? '',
    });
    setRows((d.lines ?? []).map((l) => ({
      materialId: l.materialId, materialName: l.materialName ?? '—', qtyOrdered: l.qtyOrdered,
      qtyReceived: l.qtyReceived, unit: l.unit, unitPrice: l.unitPrice, note: l.note,
    })));
  }, [d]);

  // risolvi i nomi da mostrare dalle liste già caricate (fornitore / destinazione)
  useEffect(() => {
    if (form.supplierId && !supplierName) {
      const c = companies.data?.items.find((x) => x.id === form.supplierId);
      if (c) setSupplierName(c.displayName);
    }
    if (form.destLocationId && !destName) {
      const l = locations.data?.items.find((x) => x.id === form.destLocationId);
      if (l) setDestName(l.name);
    }
  }, [form.supplierId, form.destLocationId, companies.data, locations.data, supplierName, destName]);

  const status = d?.status ?? 'draft';
  const isDraft = isNew || status === 'draft';
  const readOnly = !isNew && !isDraft;
  const st = PO_STATUS[status] ?? { label: status, token: 'neutral' };
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function addMaterials(mats: MaterialDto[]) {
    setRows((arr) => [...arr, ...mats.map((m) => ({
      materialId: m.id, materialName: m.name, qtyOrdered: 1, qtyReceived: 0,
      unit: m.unit, unitPrice: null, note: null,
    }))]);
  }

  async function save() {
    if (!form.supplierId) { toast('Seleziona il fornitore', 'error'); return; }
    if (rows.length === 0) { toast('Aggiungi almeno una riga', 'error'); return; }
    setBusy(true);
    const lines = rows.map((r) => ({ materialId: r.materialId, qtyOrdered: r.qtyOrdered, unit: r.unit, unitPrice: r.unitPrice ?? undefined, note: r.note ?? undefined }));
    try {
      if (isNew) {
        const created = await apiFetch<PurchaseOrderDto>('/purchase-orders', { method: 'POST', body: JSON.stringify({
          supplierId: form.supplierId, destLocationId: form.destLocationId || null,
          orderDate: form.orderDate || undefined, expectedDate: form.expectedDate || null,
          currency: form.currency || null, note: form.note || null, lines,
        }) });
        toast('Ordine d\'acquisto creato');
        history.push(`/purchase-orders/${created.id}`);
      } else {
        await mutate('PATCH', `/purchase-orders/${id}`, {
          destLocationId: form.destLocationId || null, expectedDate: form.expectedDate || null,
          note: form.note || null, lines,
        });
        toast('Modifiche salvate');
        void detail.reload();
      }
    } catch (e) { toast(fmtErr(e), 'error'); } finally { setBusy(false); }
  }

  if (!isNew && detail.loading) return <Page title="Ordine d'acquisto"><Loading /></Page>;
  if (!isNew && detail.error) return <Page title="Ordine d'acquisto"><ErrorBox message={detail.error} /></Page>;

  const locOpts = (locations.data?.items ?? []).filter((l) => l.holdsStock);
  const canReceive = canManage && !isNew && ['draft', 'sent', 'partial'].includes(status);

  return (
    <Page title={isNew ? 'Ordine d\'acquisto — nuovo' : 'Ordine d\'acquisto'} bleed>
      <ObjectPage
        backLabel="Ordini d'acquisto" onBack={() => history.push('/purchase-orders')}
        title={!isNew && d?.number ? d.number : 'Ordine d\'acquisto'}
        code={!isNew && d?.number ? undefined : (isNew ? 'nuovo' : 'bozza')}
        status={!isNew ? <StatusPill label={st.label} token={st.token} /> : undefined}
        onSave={canManage && (isNew || isDraft) ? save : undefined}
        onCancel={() => history.push('/purchase-orders')} saving={busy}
      >
        {canReceive && (
          <div className="capbar">
            <div className="mic"><PackageCheck size={18} /></div>
            <div className="tx"><b>Ricevi la merce</b><span>Registra i carichi a magazzino riga per riga; lo stato passa a parziale/ricevuto.</span></div>
            <div className="sp" />
            <button className="btn btn-primary" onClick={() => setReceiveOpen(true)}><PackageCheck size={16} /> Ricevi merce</button>
          </div>
        )}

        <ObjectBox icon={ShoppingCart} title="Ordine">
          <div className="bgrid">
            <div className="bf c2"><span className="bl">Fornitore <span className="req">*</span></span>
              <PickerField value={supplierName} placeholder="Scegli un fornitore…" disabled={readOnly || !isNew}
                onOpen={() => setSupplierPick(true)} /></div>
            <div className="bf c2"><span className="bl">Destinazione</span>
              <PickerField value={destName} placeholder="Scegli una destinazione…" disabled={readOnly}
                onOpen={() => setDestPick(true)} onClear={() => { set('destLocationId', ''); setDestName(''); }} /></div>
            <div className="bf"><span className="bl">Data ordine</span>
              <input type="date" className="bi mono" value={form.orderDate} onChange={(e) => set('orderDate', e.target.value)} disabled={readOnly || !isNew} /></div>
            <div className="bf"><span className="bl">Data prevista</span>
              <input type="date" className="bi mono" value={form.expectedDate} onChange={(e) => set('expectedDate', e.target.value)} disabled={readOnly} /></div>
            <div className="bf"><span className="bl">Valuta</span>
              <input className="bi mono" value={form.currency} onChange={(e) => set('currency', e.target.value)} disabled={readOnly || !isNew} placeholder="EUR" /></div>
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
              <col style={{ width: 130 }} />
              {!isNew && <col style={{ width: 110 }} />}
              {!readOnly && <col style={{ width: 50 }} />}
            </colgroup>
            <thead><tr><th>Articolo</th><th className="num">Qtà ordinata</th><th>Unità</th><th className="num">Prezzo unit.</th>{!isNew && <th className="num">Ricevuta</th>}{!readOnly && <th />}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.materialName}</td>
                  <td className="num"><NumInput align="right" value={r.qtyOrdered} disabled={readOnly}
                    onChange={(n) => setRows((arr) => arr.map((x, j) => j === i ? { ...x, qtyOrdered: n ?? 0 } : x))} /></td>
                  <td><UnitSelect value={r.unit} disabled={readOnly} units={units.data?.items ?? []}
                    onChange={(u) => setRows((arr) => arr.map((x, j) => j === i ? { ...x, unit: u } : x))} /></td>
                  <td className="num"><NumInput align="right" value={r.unitPrice} disabled={readOnly} placeholder="€"
                    onChange={(n) => setRows((arr) => arr.map((x, j) => j === i ? { ...x, unitPrice: n } : x))} /></td>
                  {!isNew && <td className="num mono">{r.qtyReceived.toLocaleString('it-IT')}</td>}
                  {!readOnly && <td><button className="reveal locked" style={{ background: 'none', color: 'var(--ink-faint)' }} onClick={() => setRows((arr) => arr.filter((_, j) => j !== i))}><Trash2 /></button></td>}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6}><div className="dsx-empty">Nessuna riga. Aggiungi un articolo.</div></td></tr>}
            </tbody>
          </table>
          {!readOnly && <div className="addline" onClick={() => setPickOpen(true)}><Boxes size={15} /> + Aggiungi articolo</div>}
        </ObjectBox>
      </ObjectPage>

      <MaterialPickerDialog open={pickOpen} multi onClose={() => setPickOpen(false)} onPick={addMaterials} />
      <CompanyPickerDialog open={supplierPick} role="supplier" onClose={() => setSupplierPick(false)}
        onPick={(cs) => { const c = cs[0]; if (c) { set('supplierId', c.id); setSupplierName(c.displayName); } }} />
      <LocationTreePickerDialog open={destPick} onClose={() => setDestPick(false)}
        onPick={(l) => { set('destLocationId', l.id); setDestName(l.name); setDestPick(false); }} />
      {receiveOpen && d && (
        <ReceiveModal po={d} defaultLocationId={form.destLocationId || null} locations={locOpts}
          onClose={() => setReceiveOpen(false)} onDone={() => { setReceiveOpen(false); void detail.reload(); }} />
      )}
    </Page>
  );
}

/* ── Ricevi merce ─────────────────────────────────────────────────────── */
function ReceiveModal({ po, defaultLocationId, locations, onClose, onDone }: {
  po: PurchaseOrderDto; defaultLocationId: string | null; locations: StockLocationDto[];
  onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const lines = po.lines ?? [];
  const [locId, setLocId] = useState(defaultLocationId ?? '');
  const [locName, setLocName] = useState(() => locations.find((l) => l.id === (defaultLocationId ?? ''))?.name ?? '');
  const [locPick, setLocPick] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(
    lines.map((l) => [l.id, Math.max(0, l.qtyOrdered - l.qtyReceived)])));
  const [busy, setBusy] = useState(false);

  const total = useMemo(() => Object.values(qty).reduce((a, n) => a + (n > 0 ? n : 0), 0), [qty]);

  async function confirm() {
    const receipts = lines.map((l) => ({ lineId: l.id, qty: qty[l.id] ?? 0 })).filter((r) => r.qty > 0);
    if (receipts.length === 0) { toast('Imposta almeno una quantità da ricevere', 'error'); return; }
    setBusy(true);
    try {
      await mutate('POST', `/purchase-orders/${po.id}/receive`, { destLocationId: locId || null, receipts });
      toast('Merce ricevuta');
      onDone();
    } catch (e) { toast(fmtErr(e), 'error'); } finally { setBusy(false); }
  }

  return (
    <Modal open title="Ricevi merce" size="lg" onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Annulla</button>
        <button className="btn btn-primary" onClick={confirm} disabled={busy || total <= 0}>Registra carico</button>
      </>}>
      <div className="bgrid">
        <div className="bf c4"><span className="bl">Magazzino di destinazione</span>
          <PickerField value={locName} placeholder="— predefinito ordine —"
            onOpen={() => setLocPick(true)}
            onClear={() => { setLocId(''); setLocName(''); }} /></div>
      </div>
      <LocationTreePickerDialog open={locPick} onClose={() => setLocPick(false)}
        onPick={(l) => { setLocId(l.id); setLocName(l.name); setLocPick(false); }} />
      <table className="subt" style={{ marginTop: 14 }}>
        <colgroup>
          <col />
          <col style={{ width: 100 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 130 }} />
        </colgroup>
        <thead><tr><th>Articolo</th><th className="num">Ord.</th><th className="num">Già ric.</th><th className="num">Ricevi ora</th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td>{l.materialName ?? '—'}</td>
              <td className="num mono">{l.qtyOrdered.toLocaleString('it-IT')}</td>
              <td className="num mono">{l.qtyReceived.toLocaleString('it-IT')}</td>
              <td className="num"><NumInput align="right" value={qty[l.id] ?? 0}
                onChange={(n) => setQty((q) => ({ ...q, [l.id]: n ?? 0 }))} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="help" style={{ marginTop: 10 }}>Le quantità &gt; 0 generano i carichi a magazzino; lo stato dell'ordine si aggiorna a parziale o ricevuto.</p>
    </Modal>
  );
}
