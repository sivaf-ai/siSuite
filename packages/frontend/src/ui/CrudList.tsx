import { useEffect, useState } from 'react';
import { useHistory } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { Pencil, Trash2, ChevronRight } from 'lucide-react';
import { Page } from '../components/Page';
import { useApi, mutate } from '../api/hooks';
import { apiFetch, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { DataTable, type Column } from './DataTable';
import { Toolbar } from './Toolbar';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { EmptyState } from './EmptyState';
import { EntityForm, type TypedGroup } from './EntityForm';
import { useToast } from './Toast';

export interface FkSource { endpoint: string; toOption: (item: Record<string, unknown>) => { id: string; label: string } }
export type FkData = Record<string, { id: string; label: string }[]>;

export interface CrudListProps<T extends { id: string }> {
  title: string;
  icon: LucideIcon;
  endpoint: string;          // '/companies'
  entityKey: string;         // 'company' (field_definition)
  resource: string;          // permesso RBAC 'company'
  columns: Column<T>[];
  searchPlaceholder?: string;
  defaultSort?: string;
  createLabel?: string;
  fkSources?: Record<string, FkSource>;
  buildForm: (fk: FkData, isEdit: boolean) => TypedGroup[];
  toFormInitial?: (row: T) => Record<string, unknown>;
  /** trasforma i valori del form nel payload API (es. roles string[] → oggetti). */
  toBody?: (values: Record<string, unknown>, isEdit: boolean) => unknown;
  detailPath?: (row: T) => string;
  /** etichetta singolare per i messaggi (es. "cliente"). */
  noun?: string;
  /** mappa azione→PermissionKey. Default `${resource}:${action}`. Le entità
   *  admin usano `${resource}:manage` per create/update/delete e `:read` per read. */
  permFor?: (action: 'create' | 'read' | 'update' | 'delete') => string;
  /** disabilita le azioni modifica/elimina su righe specifiche (es. di sistema). */
  rowLocked?: (row: T) => boolean;
}

interface ListResp<T> { items: T[]; total: number; limit: number; offset: number }

export function CrudList<T extends { id: string }>(p: CrudListProps<T>) {
  const { user } = useAuth();
  const toast = useToast();
  const history = useHistory();
  const can = (a: 'create' | 'read' | 'update' | 'delete') =>
    !!user?.permissions.includes((p.permFor ? p.permFor(a) : `${p.resource}:${a}`) as never);

  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState(p.defaultSort ?? '');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const url = `${p.endpoint}?limit=${limit}&offset=${offset}` +
    (q ? `&q=${encodeURIComponent(q)}` : '') +
    (sortBy ? `&sortBy=${sortBy}&sortDir=${sortDir}` : '');
  const list = useApi<ListResp<T>>(url);

  const [fk, setFk] = useState<FkData>({});
  useEffect(() => {
    if (!p.fkSources) return;
    Object.entries(p.fkSources).forEach(([key, src]) => {
      void apiFetch<{ items: Record<string, unknown>[] }>(src.endpoint)
        .then((r) => setFk((prev) => ({ ...prev, [key]: r.items.map(src.toOption) })))
        .catch(() => undefined);
    });
  }, [p.fkSources]);

  // drawer: undefined = chiuso, null = crea, row = modifica
  const [editing, setEditing] = useState<T | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<T | null>(null);

  function onSort(key: string) {
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(key); setSortDir('asc'); }
    setOffset(0);
  }

  async function save(values: Record<string, unknown>) {
    setBusy(true);
    const body = p.toBody ? p.toBody(values, !!editing) : values;
    try {
      if (editing) await mutate('PATCH', `${p.endpoint}/${editing.id}`, body);
      else await mutate('POST', p.endpoint, body);
      toast(editing ? 'Modifiche salvate' : `${p.noun ?? 'Elemento'} creato`);
      setEditing(undefined);
      void list.reload();
    } catch (e) {
      const msg = e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message;
      toast(msg, 'error');
    } finally { setBusy(false); }
  }

  async function doDelete() {
    if (!confirming) return;
    setBusy(true);
    try {
      await mutate('DELETE', `${p.endpoint}/${confirming.id}`);
      toast(`${p.noun ?? 'Elemento'} eliminato`);
      setConfirming(null);
      void list.reload();
    } catch (e) {
      const msg = e instanceof ApiError ? ((e.body as { message?: string })?.message ?? 'Impossibile eliminare') : (e as Error).message;
      toast(msg, 'error');
      setConfirming(null);
    } finally { setBusy(false); }
  }

  const locked = (r: T) => !!p.rowLocked?.(r);
  const actions = [
    ...(can('update') ? [{ icon: Pencil, label: 'Modifica', onClick: (r: T) => setEditing(r), hidden: locked }] : []),
    ...(p.detailPath ? [{ icon: ChevronRight, label: 'Apri', onClick: (r: T) => history.push(p.detailPath!(r)) }] : []),
    ...(can('delete') ? [{ icon: Trash2, label: 'Elimina', danger: true, onClick: (r: T) => setConfirming(r), hidden: locked }] : []),
  ];

  return (
    <Page title={p.title} action={null}>
      <div className="page-head">
        <div><h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}><p.icon size={24} /> {p.title}</h1></div>
      </div>

      <Toolbar
        search={q} onSearch={(v) => { setQ(v); setOffset(0); }} searchPlaceholder={p.searchPlaceholder}
        onNew={() => setEditing(null)} newLabel={p.createLabel} canNew={can('create')}
      />

      <DataTable<T>
        columns={p.columns}
        rows={list.data?.items ?? []}
        loading={list.loading}
        sortBy={sortBy} sortDir={sortDir} onSort={onSort}
        actions={actions}
        onRowClick={p.detailPath ? (r) => history.push(p.detailPath!(r)) : undefined}
        total={list.data?.total} limit={limit} offset={offset} onPage={setOffset}
        empty={<EmptyState icon={p.icon} title={q ? 'Nessun risultato' : `Nessun ${p.noun ?? 'elemento'}`}
          hint={q ? 'Prova un altro termine di ricerca.' : undefined}
          onNew={can('create') && !q ? () => setEditing(null) : undefined} newLabel={p.createLabel} />}
      />

      <Modal open={editing !== undefined} size="md" title={editing ? `Modifica ${p.noun ?? ''}` : `Nuovo ${p.noun ?? ''}`} onClose={() => setEditing(undefined)}>
        {editing !== undefined && (
          <EntityForm
            entityKey={p.entityKey}
            typedGroups={p.buildForm(fk, !!editing)}
            initial={editing ? (p.toFormInitial ? p.toFormInitial(editing) : (editing as Record<string, unknown>)) : undefined}
            busy={busy}
            submitLabel={editing ? 'Salva modifiche' : 'Crea'}
            onSubmit={save}
            onCancel={() => setEditing(undefined)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirming}
        danger
        title={`Eliminare ${p.noun ?? 'l\'elemento'}?`}
        message="L'elemento verrà archiviato. Le voci legate a storia fatturabile restano protette."
        confirmLabel="Elimina"
        busy={busy}
        onConfirm={doDelete}
        onCancel={() => setConfirming(null)}
      />
    </Page>
  );
}
