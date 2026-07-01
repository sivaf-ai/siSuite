/**
 * DdtDetailPage — Scheda documento di magazzino (DDT/Carico/Trasferimento/Rettifica),
 * master-detail come Ordini di lavoro: testata in ObjectBox + righe in tabella .subt.
 * Righe SOLO via MaterialPickerDialog. Azione "Conferma" → genera movimenti, numera.
 */
import { useEffect, useState } from 'react';
import { useHistory, useParams, useLocation } from 'react-router';
import { FileOutput, Boxes, Trash2, Check } from 'lucide-react';
import type { StockDocumentDto, StockLocationDto, CompanyDto, MaterialDto, UnitDto, StockDocAiProposal } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { ObjectPage, ObjectBox } from '../ui/ObjectPage';
import { MaterialPickerDialog } from '../ui/MaterialPickerDialog';
import { CompanyPickerDialog } from '../ui/CompanyPickerDialog';
import { LocationTreePickerDialog, SourceLocationPicker, PutawayLocationPicker } from './MagazzinoPage';
import { PickerField } from '../ui/PickerField';
import { NumInput } from '../ui/NumInput';
import { UnitSelect } from '../ui/UnitSelect';
import { useApi, mutate } from '../api/hooks';
import { apiFetch, ApiError } from '../api/client';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';

interface ListResp<T> { items: T[] }
interface Row {
  materialId: string; materialName: string; quantity: number; unit: string; unitCost: number | null; note: string | null;
  // WMS Fase A: ubicazione della RIGA (null = eredita dalla testata)
  sourceLocationId: string | null; sourceLocationPath: string | null;
  destLocationId: string | null; destLocationPath: string | null;
}
type DocType = 'receipt' | 'transfer' | 'adjustment';

const TYPE_LABEL: Record<DocType, string> = { receipt: 'Carico', transfer: 'Trasferimento', adjustment: 'Rettifica' };
const DOC_STATUS: Record<string, { label: string; token: string }> = {
  draft: { label: 'Bozza', token: 'neutral' },
  confirmed: { label: 'Confermato', token: 'success' },
  cancelled: { label: 'Annullato', token: 'danger' },
};
const fmtErr = (e: unknown) => e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message;

export function DdtDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const history = useHistory();
  const toast = useToast();
  const { user } = useAuth();
  const canManage = !!user?.permissions.includes('stock:manage' as never);

  const detail = useApi<StockDocumentDto>(isNew ? null : `/stock/documents/${id}`);
  const locations = useApi<ListResp<StockLocationDto>>('/stock/locations');
  const companies = useApi<ListResp<CompanyDto>>('/companies?limit=200');
  const units = useApi<ListResp<UnitDto>>('/units');

  const [type, setType] = useState<DocType>('receipt');
  const [form, setForm] = useState<Record<string, string>>({ docDate: '', sourceLocationId: '', destLocationId: '', companyId: '', externalRef: '', note: '' });
  const [sourceName, setSourceName] = useState('');
  const [destName, setDestName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<{ source?: boolean; dest?: boolean; lines?: boolean }>({});
  const [pickOpen, setPickOpen] = useState(false);
  const [sourcePick, setSourcePick] = useState(false);
  const [destPick, setDestPick] = useState(false);
  const [companyPick, setCompanyPick] = useState(false);
  const [linePick, setLinePick] = useState<{ i: number; field: 'source' | 'dest' } | null>(null);

  const d = detail.data;
  useEffect(() => {
    if (!d) return;
    if (d.typeCanonical && ['receipt', 'transfer', 'adjustment'].includes(d.typeCanonical)) setType(d.typeCanonical as DocType);
    setForm({
      docDate: d.docDate ?? '', sourceLocationId: d.sourceLocationId ?? '', destLocationId: d.destLocationId ?? '',
      companyId: d.companyId ?? '', externalRef: d.externalRef ?? '', note: d.note ?? '',
    });
    setRows((d.lines ?? []).map((l) => ({
      materialId: l.materialId, materialName: l.materialName ?? '—',
      quantity: l.quantity, unit: l.unit, unitCost: l.unitCost, note: l.note,
      sourceLocationId: l.sourceLocationId ?? null, sourceLocationPath: l.sourceLocationPath ?? null,
      destLocationId: l.destLocationId ?? null, destLocationPath: l.destLocationPath ?? null,
    })));
  }, [d]);

  // WMS Fase D: bozza precompilata dall'assistente AI (passata via router state)
  const location = useLocation<{ aiProposal?: StockDocAiProposal } | undefined>();
  const aiProposal = isNew ? location.state?.aiProposal : undefined;
  useEffect(() => {
    if (!aiProposal) return;
    setType(aiProposal.typeCode);
    setForm({
      docDate: '', sourceLocationId: aiProposal.sourceLocationId ?? '', destLocationId: aiProposal.destLocationId ?? '',
      companyId: aiProposal.supplierId ?? '', externalRef: '', note: '',
    });
    if (aiProposal.sourceLocationName) setSourceName(aiProposal.sourceLocationName);
    if (aiProposal.destLocationName) setDestName(aiProposal.destLocationName);
    if (aiProposal.supplierName) setCompanyName(aiProposal.supplierName);
    setRows(aiProposal.lines.map((l) => ({
      materialId: l.materialId, materialName: l.materialName, quantity: l.quantity, unit: l.unit, unitCost: null, note: null,
      sourceLocationId: l.sourceLocationId, sourceLocationPath: l.sourceLocationPath,
      destLocationId: l.destLocationId, destLocationPath: l.destLocationPath,
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiProposal]);

  // risolvi i nomi (origine / destinazione / fornitore) dalle liste già caricate
  useEffect(() => {
    const locs = locations.data?.items;
    if (form.sourceLocationId && !sourceName) { const l = locs?.find((x) => x.id === form.sourceLocationId); if (l) setSourceName(l.name); }
    if (form.destLocationId && !destName) { const l = locs?.find((x) => x.id === form.destLocationId); if (l) setDestName(l.name); }
    if (form.companyId && !companyName) { const c = companies.data?.items.find((x) => x.id === form.companyId); if (c) setCompanyName(c.displayName); }
  }, [form.sourceLocationId, form.destLocationId, form.companyId, locations.data, companies.data, sourceName, destName, companyName]);

  const status = d?.status ?? 'draft';
  const isDraft = isNew || status === 'draft';
  const readOnly = !isNew && !isDraft;
  const st = DOC_STATUS[status] ?? { label: status, token: 'neutral' };
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const needsSource = type === 'transfer' || type === 'adjustment';
  const needsDest = type === 'receipt' || type === 'transfer';
  const needsCompany = type === 'receipt';

  function addMaterials(mats: MaterialDto[]) {
    setRows((arr) => [...arr, ...mats.map((m) => ({
      materialId: m.id, materialName: m.name, quantity: 1, unit: m.unit, unitCost: null, note: null,
      sourceLocationId: null, sourceLocationPath: null, destLocationId: null, destLocationPath: null,
    }))]);
    setErrs((e) => ({ ...e, lines: false }));
  }

  async function save() {
    // validazione campi obbligatori: messaggio chiaro + evidenzia in rosso
    const miss = {
      lines: rows.length === 0,
      source: needsSource && !form.sourceLocationId,
      dest: needsDest && !form.destLocationId,
    };
    setErrs(miss);
    if (miss.lines || miss.source || miss.dest) {
      const what: string[] = [];
      if (miss.source) what.push('Origine');
      if (miss.dest) what.push('Destinazione');
      if (miss.lines) what.push('almeno una riga articolo');
      toast(`Compila i campi obbligatori: ${what.join(', ')}.`, 'error');
      return;
    }
    setBusy(true);
    const lines = rows.map((r) => ({ materialId: r.materialId, quantity: r.quantity, unit: r.unit, unitCost: r.unitCost ?? undefined, note: r.note ?? undefined,
      sourceLocationId: needsSource ? (r.sourceLocationId ?? null) : null,
      destLocationId: needsDest ? (r.destLocationId ?? null) : null }));
    const body = {
      docDate: form.docDate || undefined,
      sourceLocationId: needsSource ? (form.sourceLocationId || null) : null,
      destLocationId: needsDest ? (form.destLocationId || null) : null,
      companyId: needsCompany ? (form.companyId || null) : null,
      externalRef: form.externalRef || null, note: form.note || null, lines,
    };
    try {
      if (isNew) {
        const created = await apiFetch<{ id: string }>('/stock/documents', { method: 'POST', body: JSON.stringify({ typeCode: type, ...body }) });
        toast('Documento creato');
        history.push(`/stock/documents/${created.id}`);
      } else {
        await mutate('PATCH', `/stock/documents/${id}`, body);
        toast('Modifiche salvate');
        void detail.reload();
      }
    } catch (e) { toast(fmtErr(e), 'error'); } finally { setBusy(false); }
  }

  async function confirmDoc() {
    setBusy(true);
    try {
      await mutate('POST', `/stock/documents/${id}/confirm`, {});
      toast('Documento confermato');
      void detail.reload();
    } catch (e) { toast(fmtErr(e), 'error'); } finally { setBusy(false); }
  }

  if (!isNew && detail.loading) return <Page title="Documento di magazzino"><Loading /></Page>;
  if (!isNew && detail.error) return <Page title="Documento di magazzino"><ErrorBox message={detail.error} /></Page>;

  const canConfirm = canManage && !isNew && status === 'draft';

  // cella "ubicazione di riga": mostra la catena, oppure "= testata" (eredita); ✕ per tornare alla testata
  const locCell = (r: Row, i: number, field: 'source' | 'dest') => {
    const path = field === 'source' ? r.sourceLocationPath : r.destLocationPath;
    const headerName = field === 'source' ? sourceName : destName;
    return (
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={readOnly}
            style={{ maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', justifyContent: 'flex-start', flex: 1 }}
            title={path || (headerName ? `Eredita dalla testata: ${headerName}` : 'Scegli l\'ubicazione')}
            onClick={() => setLinePick({ i, field })}>
            {path || <span className="muted">{headerName ? '= testata' : 'scegli…'}</span>}
          </button>
          {path && !readOnly && <button type="button" title="Segui la testata" style={{ background: 'none', border: 0, color: 'var(--ink-faint)', cursor: 'pointer', fontSize: 15 }}
            onClick={() => setRows((arr) => arr.map((x, j) => j === i ? (field === 'source' ? { ...x, sourceLocationId: null, sourceLocationPath: null } : { ...x, destLocationId: null, destLocationPath: null }) : x))}>×</button>}
        </div>
      </td>
    );
  };
  const lineColSpan = 4 + (needsSource ? 1 : 0) + (needsDest ? 1 : 0) + (!readOnly ? 1 : 0);

  return (
    <Page title={isNew ? 'Documento di magazzino — nuovo' : 'Documento di magazzino'} bleed>
      <ObjectPage
        backLabel="Documenti di magazzino" onBack={() => history.push('/stock/documents')}
        title={!isNew && d?.number ? d.number : `Documento · ${TYPE_LABEL[type]}`}
        code={!isNew && d?.number ? undefined : (isNew ? 'nuovo' : 'bozza')}
        status={!isNew ? <StatusPill label={st.label} token={st.token} /> : undefined}
        onSave={canManage && isDraft ? save : undefined}
        onCancel={() => history.push('/stock/documents')} saving={busy}
      >
        {canConfirm && (
          <div className="capbar">
            <div className="mic"><Check size={18} /></div>
            <div className="tx"><b>Conferma documento</b><span>Genera i movimenti di magazzino e assegna il numero progressivo. Operazione non reversibile.</span></div>
            <div className="sp" />
            <button className="btn btn-primary" onClick={confirmDoc} disabled={busy}><Check size={16} /> Conferma</button>
          </div>
        )}

        <ObjectBox icon={FileOutput} title="Documento">
          <div className="bgrid">
            <div className="bf"><span className="bl">Tipo <span className="req">*</span></span>
              <select className="bi" value={type} onChange={(e) => setType(e.target.value as DocType)} disabled={readOnly || !isNew}>
                <option value="receipt">Carico</option>
                <option value="transfer">Trasferimento</option>
                <option value="adjustment">Rettifica</option>
              </select></div>
            <div className="bf"><span className="bl">Data</span>
              <input type="date" className="bi mono" value={form.docDate} onChange={(e) => set('docDate', e.target.value)} disabled={readOnly} /></div>
            {needsSource && <div className="bf c2"><span className="bl">Origine <span className="req">*</span></span>
              <PickerField value={sourceName} placeholder="Scegli l'origine…" disabled={readOnly} invalid={errs.source}
                onOpen={() => setSourcePick(true)} onClear={() => { set('sourceLocationId', ''); setSourceName(''); }} /></div>}
            {needsDest && <div className="bf c2"><span className="bl">Destinazione <span className="req">*</span></span>
              <PickerField value={destName} placeholder="Scegli la destinazione…" disabled={readOnly} invalid={errs.dest}
                onOpen={() => setDestPick(true)} onClear={() => { set('destLocationId', ''); setDestName(''); }} /></div>}
            {needsCompany && <div className="bf c2"><span className="bl">Fornitore</span>
              <PickerField value={companyName} placeholder="Scegli il fornitore…" disabled={readOnly}
                onOpen={() => setCompanyPick(true)} onClear={() => { set('companyId', ''); setCompanyName(''); }} /></div>}
            <div className="bf"><span className="bl">Rif. esterno</span>
              <input className="bi mono" value={form.externalRef} onChange={(e) => set('externalRef', e.target.value)} disabled={readOnly} placeholder="es. DDT fornitore" /></div>
            <div className="bf c4"><span className="bl">Note</span>
              <input className="bi" value={form.note} onChange={(e) => set('note', e.target.value)} disabled={readOnly} /></div>
          </div>
        </ObjectBox>

        <ObjectBox icon={Boxes} title="Righe">
          <table className="subt">
            <colgroup>
              <col />
              <col style={{ width: 110 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 110 }} />
              {needsSource && <col style={{ width: 210 }} />}
              {needsDest && <col style={{ width: 210 }} />}
              {!readOnly && <col style={{ width: 44 }} />}
            </colgroup>
            <thead><tr><th>Articolo</th><th className="num">Quantità</th><th>Unità</th><th className="num">Costo unit.</th>
              {needsSource && <th>{type === 'adjustment' ? 'Ubicazione' : 'Preleva da'}</th>}
              {needsDest && <th>Versa in</th>}
              {!readOnly && <th />}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.materialName}</td>
                  <td className="num"><NumInput align="right" value={r.quantity} disabled={readOnly}
                    onChange={(n) => setRows((arr) => arr.map((x, j) => j === i ? { ...x, quantity: n ?? 0 } : x))} /></td>
                  <td><UnitSelect value={r.unit} disabled={readOnly} units={units.data?.items ?? []}
                    onChange={(u) => setRows((arr) => arr.map((x, j) => j === i ? { ...x, unit: u } : x))} /></td>
                  <td className="num"><NumInput align="right" value={r.unitCost} disabled={readOnly} placeholder="€"
                    onChange={(n) => setRows((arr) => arr.map((x, j) => j === i ? { ...x, unitCost: n } : x))} /></td>
                  {needsSource && locCell(r, i, 'source')}
                  {needsDest && locCell(r, i, 'dest')}
                  {!readOnly && <td><button className="reveal locked" style={{ background: 'none', color: 'var(--ink-faint)' }} onClick={() => setRows((arr) => arr.filter((_, j) => j !== i))}><Trash2 /></button></td>}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={lineColSpan}><div className="dsx-empty" style={errs.lines ? { color: 'var(--danger)' } : undefined}>Nessuna riga. Aggiungi un articolo.</div></td></tr>}
            </tbody>
          </table>
          {(needsSource || needsDest) && <p className="faint" style={{ fontSize: 12, color: 'var(--ink-faint)', margin: '6px 2px 0' }}>
            «= testata» significa che la riga usa l'ubicazione della testata. Imposta un'ubicazione per riga per prelevare/versare articoli in posti diversi nello stesso documento.
          </p>}
          {!readOnly && <div className="addline" onClick={() => setPickOpen(true)}><Boxes size={15} /> + Aggiungi articolo</div>}
        </ObjectBox>
      </ObjectPage>

      <MaterialPickerDialog open={pickOpen} multi onClose={() => setPickOpen(false)} onPick={addMaterials} />
      <LocationTreePickerDialog open={sourcePick} onClose={() => setSourcePick(false)}
        onPick={(l) => { set('sourceLocationId', l.id); setSourceName(l.name); setErrs((e) => ({ ...e, source: false })); setSourcePick(false); }} />
      <LocationTreePickerDialog open={destPick} onClose={() => setDestPick(false)}
        onPick={(l) => { set('destLocationId', l.id); setDestName(l.name); setErrs((e) => ({ ...e, dest: false })); setDestPick(false); }} />
      <CompanyPickerDialog open={companyPick} role="supplier" onClose={() => setCompanyPick(false)}
        onPick={(cs) => { const c = cs[0]; if (c) { set('companyId', c.id); setCompanyName(c.displayName); } }} />
      {/* prelievo guidato (FIFO, solo dove l'articolo c'è) per l'origine di riga */}
      {linePick && linePick.field === 'source' && (
        <SourceLocationPicker open materialId={rows[linePick.i]?.materialId ?? ''} onClose={() => setLinePick(null)}
          onPick={(l) => { const i = linePick.i; setRows((arr) => arr.map((x, j) => j === i ? { ...x, sourceLocationId: l.id, sourceLocationPath: l.name } : x)); setLinePick(null); }} />
      )}
      {/* putaway guidato (capacità disponibile) per la destinazione di riga */}
      {linePick && linePick.field === 'dest' && (
        <PutawayLocationPicker open materialId={rows[linePick.i]?.materialId} quantity={rows[linePick.i]?.quantity ?? null} onClose={() => setLinePick(null)}
          onPick={(l) => { const i = linePick.i; setRows((arr) => arr.map((x, j) => j === i ? { ...x, destLocationId: l.id, destLocationPath: l.name } : x)); setLinePick(null); }} />
      )}
    </Page>
  );
}
