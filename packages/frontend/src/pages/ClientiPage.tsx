/**
 * ClientiPage — lista clienti (DataTable v5) con pannello master-detail persistente
 * (standard 7): la lista resta, cliccando una riga si apre un riepilogo a destra;
 * "Apri scheda" porta alla pagina-form ricca (mock 33). Crea → /companies/new.
 */
import { useState } from 'react';
import { useHistory } from 'react-router';
import { Building2, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import type { CompanyDto } from '@sisuite/shared';
import { Page } from '../components/Page';
import { DataTable, type Column } from '../ui/DataTable';
import { SearchBar } from '../ui/SearchBar';
import { DensityToggle } from '../ui/DensityToggle';
import { MasterDetail, DetailPanel } from '../ui/MasterDetail';
import { EmptyState } from '../ui/EmptyState';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { useApi, mutate } from '../api/hooks';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const ROLE_LABEL: Record<string, string> = { customer: 'Cliente', supplier: 'Fornitore', partner: 'Partner' };
const attr = (r: CompanyDto, k: string) => (r.attributes as Record<string, unknown>)[k] as string | undefined;

interface ListResp { items: CompanyDto[]; total: number; limit: number; offset: number }

export function ClientiPage() {
  const { user } = useAuth();
  const toast = useToast();
  const history = useHistory();
  const can = (a: string) => !!user?.permissions.includes(`company:${a}` as never);

  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState('displayName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [offset, setOffset] = useState(0);
  const [sel, setSel] = useState<CompanyDto | null>(null);
  const [confirming, setConfirming] = useState<CompanyDto | null>(null);
  const [busy, setBusy] = useState(false);
  const limit = 25;

  const url = `/companies?limit=${limit}&offset=${offset}` +
    (q ? `&q=${encodeURIComponent(q)}` : '') + `&sortBy=${sortBy}&sortDir=${sortDir}`;
  const list = useApi<ListResp>(url);

  function onSort(key: string) {
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(key); setSortDir('asc'); }
    setOffset(0);
  }

  async function doDelete() {
    if (!confirming) return;
    setBusy(true);
    try {
      await mutate('DELETE', `/companies/${confirming.id}`);
      toast('Cliente archiviato');
      if (sel?.id === confirming.id) setSel(null);
      setConfirming(null);
      void list.reload();
    } catch (e) {
      toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? 'Impossibile eliminare') : (e as Error).message, 'error');
      setConfirming(null);
    } finally { setBusy(false); }
  }

  const columns: Column<CompanyDto>[] = [
    {
      key: 'displayName', header: 'Nome', sortable: true,
      render: (r) => (
        <div>
          <div className="cellname">{r.displayName}</div>
          <div className="cellsub">{r.type === 'organization' ? 'Azienda' : 'Privato'}</div>
        </div>
      ),
    },
    {
      key: 'roles', header: 'Ruoli',
      render: (r) => r.roles.length
        ? r.roles.map((x) => <span key={x} className="chip" style={{ marginRight: 4 }}>{ROLE_LABEL[x] ?? x}</span>)
        : <span style={{ color: 'var(--ink-faint)' }}>—</span>,
    },
    { key: 'vat', header: 'P.IVA', render: (r) => <span className="mono">{attr(r, 'vat_number') ?? '—'}</span> },
    { key: 'city', header: 'Città', render: (r) => attr(r, 'city') ?? <span style={{ color: 'var(--ink-faint)' }}>—</span> },
    { key: 'createdAt', header: 'Creato', sortable: true, render: (r) => new Date(r.createdAt).toLocaleDateString('it-IT') },
  ];

  const panel = sel && (
    <DetailPanel
      code={sel.id.slice(0, 8).toUpperCase()}
      title={sel.displayName}
      sub={sel.type === 'organization' ? 'Azienda' : 'Privato'}
      onClose={() => setSel(null)}
      footer={
        <>
          {can('delete') && <button className="btn btn-ghost" onClick={() => setConfirming(sel)} style={{ flex: '0 0 auto', color: 'var(--danger)' }}><Trash2 size={15} /></button>}
          <button className="btn btn-primary" onClick={() => history.push(`/companies/${sel.id}`)}>Apri scheda <ChevronRight size={15} /></button>
        </>
      }
    >
      <div className="kvline"><span className="k">Ruoli</span><span className="v">{sel.roles.map((x) => ROLE_LABEL[x] ?? x).join(', ') || '—'}</span></div>
      <div className="kvline"><span className="k">P.IVA</span><span className="v mono">{attr(sel, 'vat_number') ?? '—'}</span></div>
      <div className="kvline"><span className="k">Città</span><span className="v">{attr(sel, 'city') ?? '—'}</span></div>
      <div className="kvline"><span className="k">PEC</span><span className="v" style={{ fontSize: 12.5 }}>{attr(sel, 'pec') ?? '—'}</span></div>
      <div className="kvline"><span className="k">Creato</span><span className="v">{new Date(sel.createdAt).toLocaleDateString('it-IT')}</span></div>
    </DetailPanel>
  );

  return (
    <Page title="Clienti">
      <div className="page-head">
        <div><h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Building2 size={22} /> Clienti</h1></div>
      </div>

      <div className="toolbar">
        <SearchBar value={q} onChange={(v) => { setQ(v); setOffset(0); }} placeholder="Cerca per nome, P.IVA, città…" />
        <div className="spacer" />
        <DensityToggle />
        {can('create') && (
          <button className="btn btn-primary" onClick={() => history.push('/companies/new')}><Building2 size={16} /> Nuovo cliente</button>
        )}
      </div>

      <MasterDetail
        open={!!sel}
        panel={panel}
        list={
          <DataTable<CompanyDto>
            columns={columns}
            rows={list.data?.items ?? []}
            loading={list.loading}
            sortBy={sortBy} sortDir={sortDir} onSort={onSort}
            onRowClick={(r) => setSel(r)}
            selectedId={sel?.id}
            total={list.data?.total} limit={limit} offset={offset} onPage={setOffset}
            empty={<EmptyState icon={Building2} title={q ? 'Nessun risultato' : 'Nessun cliente'}
              hint={q ? 'Prova un altro termine di ricerca.' : undefined}
              onNew={can('create') && !q ? () => history.push('/companies/new') : undefined} newLabel="Nuovo cliente" />}
          />
        }
      />

      <ConfirmDialog
        open={!!confirming} danger
        title="Archiviare il cliente?"
        message={`“${confirming?.displayName}” verrà archiviato. Le voci legate a storia fatturabile restano protette.`}
        confirmLabel="Archivia" busy={busy}
        onConfirm={doDelete} onCancel={() => setConfirming(null)}
      />
    </Page>
  );
}
