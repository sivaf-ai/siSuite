/**
 * OrdinativoDetailPage — Scheda ordinativo (mock 44 §6.1), costruita sui
 * componenti riusabili ObjectPage/ObjectBox/RelatedTabs (Blocco A 2/2).
 * Una pagina crea+vedi+modifica. PII mascherata (MaskedField). Attributi fibra
 * da field_definition. Tabelle correlate in fondo.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory, useParams, useLocation } from 'react-router';
import {
  Cable, ShieldCheck, MapPin, Boxes, Mic, ShieldAlert, Sparkles,
  ScanLine, PackageMinus, Image as ImageIcon, History, Plus, Trash2,
} from 'lucide-react';
import type { WorkOrderDto, CompanyDto, ResourceDto, MaterialDto, FieldDefinitionDto, StockMovementDto } from '@sisuite/shared';
import { fieldLabel } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { Money } from '../ui/Num';
import { MaskedField } from '../components/MaskedField';
import { ObjectPage, ObjectBox, RelatedTabs, type RelTab } from '../ui/ObjectPage';
import { useApi, mutate } from '../api/hooks';
import { apiFetch, ApiError } from '../api/client';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';
import { useLookups } from '../context/Lookups';

interface ListItem { id: string; title?: string; code?: string }
interface ListResp<T> { items: T[] }

export function OrdinativoDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const history = useHistory();
  const toast = useToast();
  const { user } = useAuth();
  const lookups = useLookups();
  const can = (a: string) => !!user?.permissions.includes(`work_order:${a}` as never);

  const detail = useApi<WorkOrderDto>(isNew ? null : `/work-orders/${id}`);
  const companies = useApi<ListResp<CompanyDto>>('/companies?limit=200');
  const engagements = useApi<ListResp<ListItem>>('/engagements');
  const resources = useApi<ListResp<ResourceDto>>('/resources?limit=200');
  const materials = useApi<ListResp<MaterialDto>>('/materials?limit=200');
  const fieldDefs = useApi<ListResp<FieldDefinitionDto>>('/field-definitions?entity=work_order');
  const statuses = lookups.byCategory('work_order_status');
  const types = lookups.byCategory('work_order_type');

  const [form, setForm] = useState<Record<string, string>>({});
  const [subject, setSubject] = useState<Record<string, string>>({});
  const [attrs, setAttrs] = useState<Record<string, unknown>>({});
  const [items, setItems] = useState<{ materialId: string; plannedQty: number; unit?: string | null }[]>([]);
  const [tab, setTab] = useState('serials');
  const [busy, setBusy] = useState(false);

  // Duplica (standard): "nuovo" precompilato da location.state.prefill.
  const location = useLocation();
  useEffect(() => {
    if (!isNew) return;
    const pf = (location.state as { prefill?: Record<string, unknown> } | null)?.prefill;
    if (!pf) return;
    setForm({
      principalCompanyId: (pf.principalCompanyId as string) ?? '', principalOrderRef: '',
      typeId: (pf.typeId as string) ?? '', statusId: (pf.statusId as string) ?? '',
      assignedResourceId: (pf.assignedResourceId as string) ?? '', engagementId: (pf.engagementId as string) ?? '',
      address: (pf.address as string) ?? '', scheduledOn: '',
    });
    if (pf.attributes) setAttrs(pf.attributes as Record<string, unknown>);
  }, [isNew, location.state]);

  const d = detail.data;
  useEffect(() => {
    if (!d) return;
    setForm({
      principalCompanyId: d.principalCompanyId ?? '', principalOrderRef: d.principalOrderRef ?? '',
      typeId: d.typeId ?? '', statusId: d.statusId, assignedResourceId: d.assignedResourceId ?? '',
      engagementId: d.engagementId, address: d.address ?? '', scheduledOn: d.scheduledOn ?? '',
    });
    if (d.subject?.unmasked) setSubject({
      fullName: d.subject.fullName ?? '', phone: d.subject.phone ?? '', phoneAlt: d.subject.phoneAlt ?? '',
      email: d.subject.email ?? '', fiscalCode: d.subject.fiscalCode ?? '', address: d.subject.address ?? '',
    });
    setAttrs(d.attributes ?? {});
    setItems((d.items ?? []).map((it) => ({ materialId: it.materialId, plannedQty: it.plannedQty, unit: it.unit })));
  }, [d]);

  const canEditPii = isNew || (d?.subject?.unmasked ?? false);
  const statusToken = useMemo(() => lookups.byId(form.statusId)?.colorToken ?? 'neutral', [form.statusId, lookups]);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.engagementId) { toast('Seleziona la commessa', 'error'); return; }
    setBusy(true);
    const body: Record<string, unknown> = {
      principalCompanyId: form.principalCompanyId || null, principalOrderRef: form.principalOrderRef || null,
      typeId: form.typeId || null,
      statusId: form.statusId || undefined, assignedResourceId: form.assignedResourceId || null,
      address: form.address || null, scheduledOn: form.scheduledOn || null, attributes: attrs,
    };
    if (canEditPii) body.subject = {
      fullName: subject.fullName || null, phone: subject.phone || null, phoneAlt: subject.phoneAlt || null,
      email: subject.email || null, fiscalCode: subject.fiscalCode || null, address: subject.address || null,
    };
    try {
      let woId = id;
      if (isNew) {
        const created = await apiFetch<WorkOrderDto>('/work-orders', { method: 'POST', body: JSON.stringify({ engagementId: form.engagementId, ...body }) });
        woId = created.id; toast('Ordine di lavoro creato');
      } else { await mutate('PATCH', `/work-orders/${id}`, body); toast('Modifiche salvate'); }
      await mutate('PUT', `/work-orders/${woId}/items`, { items: items.map((it) => ({ materialId: it.materialId, plannedQty: it.plannedQty })) });
      history.push(`/work-orders/${woId}`);
      if (!isNew) void detail.reload();
    } catch (e) {
      toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message, 'error');
    } finally { setBusy(false); }
  }

  if (!isNew && detail.loading) return <Page title={t('terms.work_order')}><Loading /></Page>;
  if (!isNew && detail.error) return <Page title={t('terms.work_order')}><ErrorBox message={detail.error} /></Page>;

  const companyOpts = companies.data?.items ?? [];
  const engOpts = engagements.data?.items ?? [];
  const resOpts = (resources.data?.items ?? []).filter((r) => r.kind === 'person');
  const matOpts = materials.data?.items ?? [];
  const defs = fieldDefs.data?.items ?? [];
  const loc = user?.locale ?? 'it-IT';

  const serialsTable = (
    <table className="subt">
      <thead><tr><th>Apparato</th><th>Seriale</th><th>Password</th><th>Installato</th></tr></thead>
      <tbody>
        {(d?.serials ?? []).map((s) => (
          <tr key={s.id}>
            <td>{s.materialName ?? '—'}</td>
            <td><span className="serialtag">{s.serial}</span></td>
            <td>{s.hasSecret ? <MaskedField value={'••••••••'} unmasked={false} kind="generic" /> : <span className="faint">—</span>}</td>
            <td className="mono">{s.installedOn ?? '—'}</td>
          </tr>
        ))}
        {(d?.serials ?? []).length === 0 && <tr><td colSpan={4}><div className="dsx-empty">Nessun seriale installato. (ciclo seriale completo: Blocco C)</div></td></tr>}
      </tbody>
    </table>
  );
  const tabs: RelTab[] = [
    { key: 'serials', label: 'Seriali installati', icon: ScanLine, count: d?.serials?.length ?? 0, content: serialsTable },
    { key: 'materials', label: 'Materiali scaricati', icon: PackageMinus, content: isNew ? <div className="dsx-empty">Salva l'ordine per vedere i materiali scaricati.</div> : <WorkOrderMaterials workOrderId={id} /> },
    { key: 'photos', label: 'Foto', icon: ImageIcon, content: <div className="dsx-empty">In arrivo.</div> },
    { key: 'history', label: 'Storico', icon: History, content: <div className="dsx-empty">In arrivo.</div> },
  ];

  return (
    <Page title={isNew ? `${t('terms.work_order')} — nuovo` : t('terms.work_order')} bleed>
      <ObjectPage
        backLabel={t('terms.work_order_plural')} onBack={() => history.push('/work-orders')}
        title={(!isNew && d?.typeLabel) || t('terms.work_order')} code={!isNew && d ? d.code : undefined}
        status={!isNew ? <StatusPill label={lookups.labelOf(form.statusId) || 'Nuovo'} token={statusToken} /> : undefined}
        onSave={(isNew ? can('create') : can('update')) ? save : undefined}
        onCancel={() => history.push('/work-orders')} saving={busy}
      >
        {/* cattura AI (placeholder — Blocco F) */}
        <div className="capbar">
          <div className="mic"><Mic size={18} /></div>
          <div className="tx"><b>Chiudi l'ordinativo dettando</b><span>«Montato ONT seriale …, una borchia, attivazione ok» → l'AI propone seriali e stato, tu confermi. (in arrivo · Blocco F)</span></div>
          <div className="sp" />
          <button className="btn btn-ai" disabled><Sparkles size={16} /> Proponi chiusura</button>
        </div>

        <ObjectBox icon={Cable} title="Pratica">
          <div className="bgrid">
            <div className="bf"><span className="bl">Codice</span><div className="bi green">{isNew ? 'auto' : d?.code}</div></div>
            <div className="bf"><span className="bl">Committente</span>
              <select className="bi" value={form.principalCompanyId} onChange={(e) => set('principalCompanyId', e.target.value)}>
                <option value="">—</option>{companyOpts.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
              </select></div>
            <div className="bf"><span className="bl">Rif. esterno</span>
              <input className="bi mono" value={form.principalOrderRef ?? ''} onChange={(e) => set('principalOrderRef', e.target.value)} placeholder="es. FEN-…" /></div>
            <div className="bf"><span className="bl">Tipo</span>
              <select className="bi" value={form.typeId ?? ''} onChange={(e) => set('typeId', e.target.value)}>
                <option value="">—</option>{types.map((t) => <option key={t.id} value={t.id}>{lookups.labelOf(t.id)}</option>)}
              </select></div>
            <div className="bf"><span className="bl">Stato</span>
              <select className="bi" value={form.statusId} onChange={(e) => set('statusId', e.target.value)}>
                {statuses.map((s) => <option key={s.id} value={s.id}>{lookups.labelOf(s.id)}</option>)}
              </select></div>
            <div className="bf c2"><span className="bl">Commessa <span className="req">*</span></span>
              <select className="bi" value={form.engagementId} onChange={(e) => set('engagementId', e.target.value)} disabled={!isNew}>
                <option value="">—</option>{engOpts.map((e) => <option key={e.id} value={e.id}>{e.code ? `${e.code} · ` : ''}{e.title}</option>)}
              </select></div>
            <div className="bf"><span className="bl">Squadra assegnata</span>
              <select className="bi" value={form.assignedResourceId} onChange={(e) => set('assignedResourceId', e.target.value)}>
                <option value="">—</option>{resOpts.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select></div>
            <div className="bf"><span className="bl">Programmato</span>
              <input type="date" className="bi mono" value={form.scheduledOn ?? ''} onChange={(e) => set('scheduledOn', e.target.value)} /></div>
          </div>
        </ObjectBox>

        <ObjectBox icon={ShieldCheck} title="Intestatario" subtitle="dati protetti">
          <div className="bgrid">
            {canEditPii ? (
              <>
                <div className="bf c2"><span className="bl">Nome e cognome</span><input className="bi" value={subject.fullName ?? ''} onChange={(e) => setSubject((s) => ({ ...s, fullName: e.target.value }))} /></div>
                <div className="bf"><span className="bl">Telefono</span><input className="bi mono" value={subject.phone ?? ''} onChange={(e) => setSubject((s) => ({ ...s, phone: e.target.value }))} /></div>
                <div className="bf"><span className="bl">Telefono alt.</span><input className="bi mono" value={subject.phoneAlt ?? ''} onChange={(e) => setSubject((s) => ({ ...s, phoneAlt: e.target.value }))} /></div>
                <div className="bf c2"><span className="bl">Email</span><input className="bi" value={subject.email ?? ''} onChange={(e) => setSubject((s) => ({ ...s, email: e.target.value }))} /></div>
                <div className="bf c2"><span className="bl">Codice fiscale</span><input className="bi mono" value={subject.fiscalCode ?? ''} onChange={(e) => setSubject((s) => ({ ...s, fiscalCode: e.target.value }))} /></div>
              </>
            ) : (
              <>
                <div className="bf c2"><span className="bl">Nome e cognome</span><div className="bi"><MaskedField value={d?.subject?.fullName ?? null} unmasked={false} kind="name" /></div></div>
                <div className="bf c2"><span className="bl">Telefono</span><div className="bi"><MaskedField value={d?.subject?.phone ?? null} unmasked={false} kind="phone" /></div></div>
                <div className="bf c2"><span className="bl">Codice fiscale</span><div className="bi"><MaskedField value={d?.subject?.fiscalCode ?? null} unmasked={false} kind="generic" /></div></div>
              </>
            )}
          </div>
          <div className="privacy-note"><ShieldAlert /><div>I dati dell'utente finale sono <b>isolati</b> e mascherati per impostazione. Lo sblocco richiede il permesso <span className="tag">pii.read</span> ed è tracciato. {canEditPii ? '' : 'Non hai il permesso: i valori restano mascherati.'}</div></div>
        </ObjectBox>

        <ObjectBox icon={MapPin} title="Indirizzo di attivazione">
          <div className="bgrid">
            <div className="bf c4"><span className="bl">Indirizzo</span><input className="bi" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder="Via, civico, interno, città…" /></div>
          </div>
        </ObjectBox>

        {defs.length > 0 && (
          <ObjectBox icon={Cable} title="Dati tecnici (fibra)">
            <div className="bgrid">
              {defs.map((f) => (
                <div className="bf c2" key={f.key}>
                  <span className="bl">{fieldLabel(f.label, loc, f.key)}{f.unit ? ` (${f.unit})` : ''}</span>
                  {f.dataType === 'select' ? (
                    <select className="bi" value={String(attrs[f.key] ?? '')} onChange={(e) => setAttrs((a) => ({ ...a, [f.key]: e.target.value || undefined }))}>
                      <option value="">—</option>{(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{fieldLabel(o.label, loc, o.value)}</option>)}
                    </select>
                  ) : (
                    <input className="bi" type={f.dataType === 'number' ? 'number' : 'text'} value={String(attrs[f.key] ?? '')}
                      onChange={(e) => setAttrs((a) => ({ ...a, [f.key]: e.target.value === '' ? undefined : (f.dataType === 'number' ? Number(e.target.value) : e.target.value) }))} />
                  )}
                </div>
              ))}
            </div>
          </ObjectBox>
        )}

        <ObjectBox icon={Boxes} title="Apparati da installare" subtitle="pianificato">
          <table className="subt">
            <thead><tr><th>Articolo</th><th className="num">Qtà</th><th>Unità</th><th style={{ width: 50 }} /></tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td>
                    <select className="bi" style={{ minHeight: 32 }} value={it.materialId}
                      onChange={(e) => setItems((arr) => arr.map((x, j) => j === i ? { ...x, materialId: e.target.value, unit: matOpts.find((m) => m.id === e.target.value)?.unit } : x))}>
                      <option value="">— scegli —</option>{matOpts.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select></td>
                  <td className="num"><input className="bi mono" style={{ minHeight: 32, width: 70, textAlign: 'right' }} type="number" value={it.plannedQty}
                    onChange={(e) => setItems((arr) => arr.map((x, j) => j === i ? { ...x, plannedQty: Number(e.target.value) } : x))} /></td>
                  <td>{it.unit ?? matOpts.find((m) => m.id === it.materialId)?.unit ?? '—'}</td>
                  <td><button className="reveal locked" style={{ background: 'none', color: 'var(--ink-faint)' }} onClick={() => setItems((arr) => arr.filter((_, j) => j !== i))}><Trash2 /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="addline" onClick={() => setItems((arr) => [...arr, { materialId: '', plannedQty: 1 }])}><Plus /> Aggiungi apparato</div>
        </ObjectBox>

        {!isNew && <RelatedTabs tabs={tabs} active={tab} onChange={setTab} />}
      </ObjectPage>
    </Page>
  );
}

/** Materiali scaricati sull'ordine di lavoro (movimenti di magazzino con work_order_id, Blocco H). */
function WorkOrderMaterials({ workOrderId }: { workOrderId: string }) {
  const lk = useLookups();
  const { data, loading } = useApi<{ items: StockMovementDto[] }>(`/stock/movements?workOrderId=${workOrderId}`);
  if (loading) return <div className="dsx-empty">Carico…</div>;
  const rows = data?.items ?? [];
  return (
    <table className="subt">
      <thead><tr><th>Data</th><th>Articolo</th><th>Tipo</th><th className="num">Qtà</th><th className="num">Costo unit.</th></tr></thead>
      <tbody>
        {rows.map((r) => {
          const l = lk.byId(r.typeId);
          return (
            <tr key={r.id}>
              <td className="mono faint">{new Date(r.occurredOn).toLocaleDateString('it-IT')}</td>
              <td>{r.materialName ?? '—'}</td>
              <td>{l ? <StatusPill label={lk.labelOf(r.typeId)} token={l.colorToken} /> : '—'}</td>
              <td className="num mono" style={r.quantity < 0 ? { color: 'var(--danger)' } : undefined}>{r.quantity.toLocaleString('it-IT')} {r.unit}</td>
              <td className="num"><Money value={r.unitCost} /></td>
            </tr>
          );
        })}
        {rows.length === 0 && <tr><td colSpan={5}><div className="dsx-empty">Nessun materiale scaricato su questo ordine.</div></td></tr>}
      </tbody>
    </table>
  );
}
