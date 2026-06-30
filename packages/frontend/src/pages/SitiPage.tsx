/**
 * SitiPage — Anagrafica Siti/Località (STANDARD entità, promossa a primo livello).
 * EntityList con toolbar standard + CRUD in Modal CENTRATO (campi label-nel-bordo
 * .dsx/.bgrid/.bf/.bl/.bi). Il Cliente si sceglie via PickerField + CompanyPickerDialog
 * (mai <select> per entità). Il Sito padre è un <select> dei siti dello STESSO cliente
 * (relazione interna alla stessa entità, non una scelta cross-entità).
 * Supporta la modalità `pick` (pop-up SitePickerDialog) e il soft-delete completo.
 * NB: l'albero per-cliente resta in SiteTree (scheda Soggetto) — qui è la lista globale.
 */
import { useMemo, useState } from 'react';
import { MapPin, Table2, ListTree } from 'lucide-react';
import type { SiteDto } from '@sisuite/shared';
import { Page } from '../components/Page';
import { useLookups, lookupLabel } from '../context/Lookups';
import { EntityList, type ListColumn, type ListAction } from '../ui/EntityList';
import { Modal } from '../ui/Modal';
import { PickerField } from '../ui/PickerField';
import { CompanyPickerDialog } from '../ui/CompanyPickerDialog';
import { AddressField } from '../ui/AddressField';
import { GlobalSiteTree } from '../ui/SiteTree';
import { Plus } from '../ui/icons';
import { useApi, useReloadOnEnter, useArchivedView, mutate } from '../api/hooks';
import { apiFetch, ApiError } from '../api/client';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';
import { AuditDialog } from '../ui/AuditDialog';

const errMsg = (e: unknown) => (e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message);

/** riassunto leggibile dall'indirizzo jsonb (country-driven, A.5). */
function addressSummary(a: Record<string, unknown>): string {
  if (!a) return '';
  const parts = [a.street, a.city, a.province, a.postal_code].filter((x) => typeof x === 'string' && x.trim());
  return parts.join(', ');
}

/** Props di SELEZIONE: la stessa lista, richiamata in pop-up da un'altra maschera
 *  (es. sito di un Asset). Radio (single)/checkbox (multi); "+ Nuovo" e click-riga
 *  aprono la CRUD in un modale annidato (non si lascia il documento). */
export interface SitePickProps {
  pick: 'single' | 'multi';
  selectedIds?: string[];
  onToggleSelect?: (s: SiteDto) => void;
  onCreated?: (s: SiteDto) => void;
  /** se passato, filtra la lista sui soli siti di quel cliente (?company_id=). */
  companyId?: string;
}

interface FormState {
  companyId: string; companyName: string; name: string; kind: string; parentId: string | null;
  address: Record<string, unknown>; country: string;
}
const emptyForm: FormState = { companyId: '', companyName: '', name: '', kind: 'building', parentId: null, address: {}, country: 'IT' };

export function SitiPage({ pickProps }: { pickProps?: SitePickProps } = {}) {
  const [q, setQ] = useState('');
  const toast = useToast();
  const lk = useLookups();
  const siteKinds = lk.byCategory('site_kind');
  const kindLabel = (k: string) => { const m = siteKinds.find((l) => l.code === k); return m ? lookupLabel(m) : k; };
  const { user } = useAuth();
  const canWrite = !!user?.permissions.includes('site:create' as never);
  const canDelete = !!user?.permissions.includes('site:delete' as never);
  const canAddr = !!user?.permissions.includes('site:address' as never);
  const [view, setView] = useState<'list' | 'tree'>('list');
  const pick = pickProps?.pick;
  const [archived, setArchived] = useArchivedView();
  const [clearTok, setClearTok] = useState(0);
  const [audit, setAudit] = useState<{ id: string; title: string } | null>(null);

  // company_id forzato in pick (asset di un certo cliente) oppure libero (lista globale)
  const lockedCompanyId = pickProps?.companyId;
  const params = new URLSearchParams();
  if (lockedCompanyId) params.set('company_id', lockedCompanyId);
  if (archived) params.set('archived', '1');
  if (q.trim()) params.set('q', q.trim());
  const { data, loading, error, reload } = useApi<{ items: SiteDto[] }>(`/sites${params.toString() ? `?${params.toString()}` : ''}`);
  useReloadOnEnter(reload);

  // editing: undefined = chiuso, null = nuovo, SiteDto = modifica
  const [editing, setEditing] = useState<SiteDto | null | undefined>(undefined);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [companyPicker, setCompanyPicker] = useState(false);

  // siti dello stesso cliente del form (per la select del Sito padre), escluso se stesso
  const parentOptions = useMemo(
    () => (data?.items ?? []).filter((s) => s.companyId === form.companyId && (!editing || s.id !== editing.id)),
    [data?.items, form.companyId, editing],
  );

  function openNew(prefill?: SiteDto) {
    setForm(prefill
      ? { companyId: prefill.companyId ?? '', companyName: prefill.companyName ?? '', name: prefill.name, kind: prefill.kind, parentId: prefill.parentId, address: prefill.address ?? {}, country: String((prefill.address as Record<string, unknown>)?.country ?? 'IT') }
      : { ...emptyForm, companyId: lockedCompanyId ?? '' });
    setEditing(null);
  }
  function openEdit(row: SiteDto) {
    setForm({ companyId: row.companyId ?? '', companyName: row.companyName ?? '', name: row.name, kind: row.kind, parentId: row.parentId, address: row.address ?? {}, country: String((row.address as Record<string, unknown>)?.country ?? 'IT') });
    setEditing(row);
  }

  async function save() {
    if (!form.companyId) { toast('Il cliente è obbligatorio', 'error'); return; }
    if (!form.name.trim()) { toast('Il nome è obbligatorio', 'error'); return; }
    setBusy(true);
    try {
      // l'indirizzo entra nel body solo con il permesso (field-level RBAC, ignorato a DB altrimenti)
      const addr = canAddr ? { address: { ...form.address, country: form.country } } : {};
      if (editing) {
        const body = { name: form.name.trim(), kind: form.kind, parentId: form.parentId, ...addr };
        await mutate('PATCH', `/sites/${editing.id}`, body);
        toast('Modifiche salvate');
        setEditing(undefined); reload();
      } else {
        const body = { companyId: form.companyId, name: form.name.trim(), kind: form.kind, parentId: form.parentId ?? undefined, ...addr };
        const created = await apiFetch<SiteDto>('/sites', { method: 'POST', body: JSON.stringify(body) });
        toast('Sito creato');
        setEditing(undefined); reload();
        if (pick) pickProps?.onCreated?.(created);
      }
    } catch (e) { toast(errMsg(e), 'error'); }
    finally { setBusy(false); }
  }

  async function deleteSites(rs: SiteDto[]) {
    try {
      for (const r of rs) await mutate('DELETE', `/sites/${r.id}`);
      toast(rs.length > 1 ? `${rs.length} siti eliminati` : 'Sito eliminato');
      setClearTok((x) => x + 1); reload();
    } catch (e) { toast(errMsg(e), 'error'); }
  }
  async function onRestore(rs: SiteDto[]) {
    try {
      for (const r of rs) await mutate('POST', `/sites/${r.id}/restore`);
      toast(rs.length > 1 ? `${rs.length} siti ripristinati` : 'Sito ripristinato');
      setClearTok((x) => x + 1); reload();
    } catch (e) { toast(errMsg(e) || 'Errore durante il ripristino', 'error'); }
  }
  async function onPurge(rs: SiteDto[]) {
    try {
      for (const r of rs) await mutate('DELETE', `/sites/${r.id}/purge`);
      toast(rs.length > 1 ? `${rs.length} siti eliminati definitivamente` : 'Sito eliminato definitivamente');
      setClearTok((x) => x + 1); reload();
    } catch (e) { toast(errMsg(e) || 'Errore durante l\'eliminazione', 'error'); }
  }

  const cols: ListColumn<SiteDto>[] = [
    { key: 'name', header: 'Nome', value: (r) => r.name, render: (r) => <span className="cellname">{r.name}</span> },
    { key: 'company', header: 'Cliente', value: (r) => r.companyName ?? '', render: (r) => <span>{r.companyName ?? '—'}</span> },
    { key: 'kind', header: 'Tipo', value: (r) => kindLabel(r.kind), render: (r) => <span className="chip">{kindLabel(r.kind)}</span> },
    { key: 'address', header: 'Indirizzo', value: (r) => addressSummary(r.address), render: (r) => <span className="faint">{addressSummary(r.address) || '—'}</span> },
  ];

  const rightActions: ListAction[] = canWrite ? [{ key: 'new', icon: Plus, tip: 'Nuovo sito', variant: 'primary', onClick: () => openNew() }] : [];

  const exportFields = [
    { key: 'name', label: 'Nome', value: (r: SiteDto) => r.name },
    { key: 'company', label: 'Cliente', value: (r: SiteDto) => r.companyName ?? '' },
    { key: 'kind', label: 'Tipo', value: (r: SiteDto) => kindLabel(r.kind) },
    { key: 'address', label: 'Indirizzo', value: (r: SiteDto) => addressSummary(r.address) },
  ];

  const list = (
    <EntityList<SiteDto>
      title={pick ? undefined : 'Siti / Località'} subtitle={pick ? undefined : 'Anagrafica siti e località per cliente'}
      search={q} onSearch={setQ} searchPlaceholder="Cerca nome sito…"
      rightActions={rightActions}
      mode={pick ? (pick === 'multi' ? 'pick-multi' : 'pick-single') : undefined}
      selectedIds={pick ? pickProps?.selectedIds : undefined}
      onToggleSelect={pick ? pickProps?.onToggleSelect : undefined}
      onRowClick={canWrite ? openEdit : undefined}
      onEdit={!pick && canWrite ? openEdit : undefined}
      onDuplicate={!pick && canWrite ? (r) => openNew(r) : undefined}
      onDelete={!pick && canDelete ? deleteSites : undefined}
      rowLabel={(r) => r.name}
      archived={archived}
      clearSelectionToken={clearTok}
      onToggleArchived={pick ? undefined : (v) => { setArchived(v); setClearTok((x) => x + 1); }}
      onRestore={!pick && canDelete ? onRestore : undefined}
      onPurge={!pick && canDelete ? onPurge : undefined}
      onHistory={pick ? undefined : (row) => setAudit({ id: row.id, title: row.name })}
      archivedBadge={(row) => row.archivedAt ? `Archiviato${row.archivedByName ? ' da ' + row.archivedByName : ''}` : null}
      columns={cols} rows={data?.items ?? []} loading={loading} error={error}
      exportName="siti" exportFields={pick ? undefined : exportFields} emptyText="Nessun sito." />
  );

  const crudModal = (
    <Modal open={editing !== undefined} size="md" title={editing ? 'Modifica sito' : 'Nuovo sito'} onClose={() => setEditing(undefined)}
      footer={<>
        <button className="btn btn-ghost" onClick={() => setEditing(undefined)} disabled={busy}>Annulla</button>
        <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>{busy ? 'Salvo…' : 'Salva'}</button>
      </>}>
      <div className="dsx">
        <div className="bgrid">
          <div className="bf c2"><span className="bl">Cliente <span className="req">*</span></span>
            <PickerField value={form.companyName || null} placeholder="Scegli cliente…"
              disabled={!!editing || !!lockedCompanyId}
              onOpen={() => setCompanyPicker(true)}
              onClear={() => setForm((f) => ({ ...f, companyId: '', companyName: '', parentId: null }))} />
          </div>
          <div className="bf c2"><span className="bl">Nome <span className="req">*</span></span>
            <input className="bi" autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Sede centrale, Cabina 1…" /></div>
          <div className="bf c2"><span className="bl">Tipo</span>
            <select className="bi" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
              {siteKinds.map((k) => <option key={k.code} value={k.code}>{lookupLabel(k)}</option>)}
            </select></div>
          <div className="bf c2"><span className="bl">Sito padre</span>
            <select className="bi" value={form.parentId ?? ''} disabled={!form.companyId}
              onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value || null }))}>
              <option value="">— nessuno —</option>
              {parentOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          {canAddr && (
            <div style={{ gridColumn: 'span 4' }}><AddressField label="Indirizzo" country={form.country} bare
              value={form.address} onChange={(address) => setForm((f) => ({ ...f, address }))} /></div>
          )}
        </div>
      </div>
    </Modal>
  );

  const companyPickerDialog = (
    <CompanyPickerDialog open={companyPicker} onClose={() => setCompanyPicker(false)}
      onPick={(cs) => { const c = cs[0]; if (c) setForm((f) => ({ ...f, companyId: c.id, companyName: c.displayName, parentId: null, country: c.country || f.country })); }} />
  );

  const auditModal = audit && <AuditDialog entity="site" entityId={audit.id} title={audit.title} onClose={() => setAudit(null)} />;

  if (pick) return <>{list}{crudModal}{companyPickerDialog}{auditModal}</>;
  return (
    <Page>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button className={`btn btn-sm ${view === 'list' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('list')}><Table2 size={15} /> Lista</button>
        <button className={`btn btn-sm ${view === 'tree' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('tree')}><ListTree size={15} /> Albero per cliente</button>
      </div>
      {view === 'tree' ? <GlobalSiteTree /> : list}
      {crudModal}
      {companyPickerDialog}
      {auditModal}
    </Page>
  );
}
