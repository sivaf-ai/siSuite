/**
 * UnitsPage — Anagrafica Unità di misura (STANDARD entità).
 * EntityList con toolbar standard (Nuovo/Modifica/Duplica/Elimina/Esporta) +
 * CRUD in Modal CENTRATO con campi label-nel-bordo (ObjectBox .bgrid/.bf/.bl/.bi).
 * Le righe di SISTEMA (isSystem) sono in sola lettura: niente modifica/elimina.
 */
import { useState } from 'react';
import { Ruler } from 'lucide-react';
import type { UnitDto } from '@sisuite/shared';
import { Page } from '../components/Page';
import { EntityList, type ListColumn, type ListAction } from '../ui/EntityList';
import { Modal } from '../ui/Modal';
import { Plus } from '../ui/icons';
import { useApi, useReloadOnEnter, useArchivedView, mutate } from '../api/hooks';
import { apiFetch, ApiError } from '../api/client';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';
import { AuditDialog } from '../ui/AuditDialog';

const errMsg = (e: unknown) => (e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message);

/** Props di SELEZIONE: la stessa lista, richiamata in pop-up da un'altra maschera
 *  (es. UM di un articolo). Radio invece di checkbox; "+ Nuovo" e click-riga aprono
 *  la CRUD nello stesso Modal annidato (non si lascia il documento). */
export interface UnitsPickProps {
  pick: 'single';
  selectedIds?: string[];
  onToggleSelect?: (u: UnitDto) => void;
  /** chiamato dopo aver creato una nuova unità con "+ Nuovo". */
  onCreated?: (u: UnitDto) => void;
}

export function UnitsPage({ pickProps }: { pickProps?: UnitsPickProps } = {}) {
  const pick = pickProps?.pick;
  const [q, setQ] = useState('');
  const toast = useToast();
  const { user } = useAuth();
  const canWrite = !!user?.permissions.includes('material:create' as never);
  const [archived, setArchived] = useArchivedView();
  const [clearTok, setClearTok] = useState(0);
  const [audit, setAudit] = useState<{ id: string; title: string } | null>(null);
  const { data, loading, error, reload } = useApi<{ items: UnitDto[] }>(`/units${archived ? '?archived=1' : ''}`);
  useReloadOnEnter(reload);

  // editing: undefined = chiuso, null = nuovo, UnitDto = modifica
  const [editing, setEditing] = useState<UnitDto | null | undefined>(undefined);
  const [form, setForm] = useState<{ code: string; name: string; active: boolean }>({ code: '', name: '', active: true });
  const [busy, setBusy] = useState(false);

  function openNew(prefill?: UnitDto) {
    setForm({ code: prefill?.code ?? '', name: prefill?.name ?? '', active: prefill?.active ?? true });
    setEditing(null);
  }
  function openEdit(row: UnitDto) {
    if (row.isSystem) { toast('Le unità di sistema non sono modificabili', 'error'); return; }
    setForm({ code: row.code, name: row.name, active: row.active });
    setEditing(row);
  }

  async function save() {
    if (!form.code.trim() || !form.name.trim()) { toast('Codice e nome sono obbligatori', 'error'); return; }
    setBusy(true);
    try {
      const body = { code: form.code.trim(), name: form.name.trim(), active: form.active };
      let created: UnitDto | undefined;
      if (editing) await mutate('PATCH', `/units/${editing.id}`, body);
      else created = await apiFetch<UnitDto>('/units', { method: 'POST', body: JSON.stringify(body) });
      toast(editing ? 'Modifiche salvate' : 'Unità creata');
      setEditing(undefined); reload();
      if (created && pickProps?.onCreated) pickProps.onCreated(created);
    } catch (e) { toast(errMsg(e), 'error'); }
    finally { setBusy(false); }
  }

  // Cancellazione DIRETTA: EntityList ha già chiesto conferma (col nome). Niente seconda conferma.
  // Il backend ora ARCHIVIA (soft-delete) la riga tenant.
  async function deleteUnits(rs: UnitDto[]) {
    const own = rs.filter((r) => !r.isSystem);
    if (rs.some((r) => r.isSystem)) toast('Le unità di sistema non sono eliminabili', 'error');
    if (!own.length) return;
    try {
      for (const r of own) await mutate('DELETE', `/units/${r.id}`);
      toast(own.length > 1 ? `${own.length} unità eliminate` : 'Unità eliminata');
      setClearTok((x) => x + 1); reload();
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  async function onRestore(rs: UnitDto[]) {
    try {
      for (const r of rs) await mutate('POST', `/units/${r.id}/restore`);
      toast(rs.length > 1 ? `${rs.length} unità ripristinate` : 'Unità ripristinata');
      setClearTok((x) => x + 1); reload();
    } catch (e) { toast(errMsg(e) || 'Errore durante il ripristino', 'error'); }
  }
  async function onPurge(rs: UnitDto[]) {
    try {
      for (const r of rs) await mutate('DELETE', `/units/${r.id}/purge`);
      toast(rs.length > 1 ? `${rs.length} unità eliminate definitivamente` : 'Unità eliminata definitivamente');
      setClearTok((x) => x + 1); reload();
    } catch (e) { toast(errMsg(e) || 'Errore durante l\'eliminazione', 'error'); }
  }

  const cols: ListColumn<UnitDto>[] = [
    { key: 'code', header: 'Codice', value: (r) => r.code, render: (r) => <span className="cellname mono">{r.code}</span> },
    { key: 'name', header: 'Nome', value: (r) => r.name, render: (r) => <span className="cellname">{r.name}</span> },
    { key: 'system', header: 'Origine', value: (r) => (r.isSystem ? 'Sistema' : 'Tenant'), render: (r) => <span className="chip">{r.isSystem ? 'Sistema' : 'Personalizzata'}</span> },
    { key: 'active', header: 'Attiva', value: (r) => (r.active ? 'sì' : 'no'), render: (r) => <span className="chip">{r.active ? 'attiva' : 'disattivata'}</span> },
  ];
  // "+ Nuovo": sia in pick sia normale apre la CRUD nel Modal annidato.
  const rightActions: ListAction[] = canWrite ? [{ key: 'new', icon: Plus, tip: 'Nuova unità di misura', variant: 'primary', onClick: () => openNew() }] : [];

  const rows = (data?.items ?? []).filter((r) => !q.trim() || `${r.code} ${r.name}`.toLowerCase().includes(q.toLowerCase()));

  const list = (
    <EntityList<UnitDto> title={pick ? undefined : 'Unità di misura'} subtitle={pick ? undefined : 'Catalogo unità di misura — le unità di sistema sono in sola lettura'}
      search={q} onSearch={setQ} searchPlaceholder="Cerca codice, nome…"
      rightActions={rightActions}
      mode={pick ? 'pick-single' : undefined}
      selectedIds={pick ? pickProps?.selectedIds : undefined}
      onToggleSelect={pick ? pickProps?.onToggleSelect : undefined}
      onRowClick={canWrite ? openEdit : undefined}
      onEdit={!pick && canWrite ? openEdit : undefined}
      onDuplicate={!pick && canWrite ? (r) => openNew(r) : undefined}
      onDelete={!pick && canWrite ? deleteUnits : undefined}
      rowLabel={(r) => `${r.code} — ${r.name}`}
      archived={pick ? false : archived}
      clearSelectionToken={clearTok}
      onToggleArchived={pick ? undefined : (v) => { setArchived(v); setClearTok((x) => x + 1); }}
      onRestore={!pick && canWrite ? onRestore : undefined}
      onPurge={!pick && canWrite ? onPurge : undefined}
      onHistory={pick ? undefined : (row) => setAudit({ id: row.id, title: `${row.code} — ${row.name}` })}
      archivedBadge={(row) => row.archivedAt ? `Archiviato${row.archivedByName ? ' da ' + row.archivedByName : ''}` : null}
      columns={cols} rows={rows} loading={loading} error={error}
      exportName="unita-di-misura" emptyText="Nessuna unità di misura." />
  );

  const crudModal = (
    <Modal open={editing !== undefined} size="md" title={editing ? 'Modifica unità di misura' : 'Nuova unità di misura'} onClose={() => setEditing(undefined)}
      footer={<>
        <button className="btn btn-ghost" onClick={() => setEditing(undefined)} disabled={busy}>Annulla</button>
        <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>{busy ? 'Salvo…' : 'Salva'}</button>
      </>}>
      <div className="dsx">
        <div className="bgrid">
          <div className="bf c2"><span className="bl">Codice <span className="req">*</span></span>
            <input className="bi mono" autoFocus value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="pz, m, kg…" /></div>
          <div className="bf c2"><span className="bl">Nome <span className="req">*</span></span>
            <input className="bi" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Pezzo, Metro…" /></div>
          <div className="bf c2"><span className="bl">Attiva</span>
            <select className="bi" value={form.active ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === '1' }))}>
              <option value="1">Sì</option><option value="0">No</option></select></div>
        </div>
      </div>
    </Modal>
  );

  if (pick) return <>{list}{crudModal}</>;

  return (
    <Page>
      {list}
      {audit && <AuditDialog entity="unit_of_measure" entityId={audit.id} title={audit.title} onClose={() => setAudit(null)} />}
      {crudModal}
    </Page>
  );
}
