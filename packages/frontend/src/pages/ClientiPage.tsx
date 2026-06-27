/**
 * ClientiPage — Soggetti (anagrafica unica modello Party, ADR-0005) su EntityList v2.
 * Viste per ruolo (Tutti/Clienti/Fornitori/Gestori/Partner) come filtri salvati.
 * Niente master-detail né icone-azione: click riga → scheda /companies/:id.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory, useLocation } from 'react-router';
import type { CompanyDto } from '@sisuite/shared';
import { Page } from '../components/Page';
import { EntityList, type ListColumn, type ListView, type ListAction } from '../ui/EntityList';
import { useEntityActions } from '../ui/useEntityActions';
import { DedupDialog } from '../ui/DedupDialog';
import { Sparkles, Plus } from '../ui/icons';
import { useApi, useReloadOnEnter } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { Modal } from '../ui/Modal';
import { ClienteDetailPage } from './ClienteDetailPage';

/** Props di SELEZIONE: la stessa lista soggetti richiamata in pop-up da un documento.
 *  Radio (single)/checkbox (multi); "+ Nuovo" e click-riga aprono la CRUD in modale
 *  annidato (non si lascia il documento). */
export interface CompanyPickProps {
  pick: 'single' | 'multi';
  selectedIds?: string[];
  onToggleSelect?: (c: CompanyDto) => void;
  onCreated?: (c: CompanyDto) => void;
  /** vista iniziale (es. 'supplier'); la lista mostra comunque tutte le aziende. */
  role?: string;
}

const ROLE_LABEL: Record<string, string> = { customer: 'Cliente', supplier: 'Fornitore', partner: 'Partner', operator: 'Gestore' };
const attr = (r: CompanyDto, k: string) => (r.attributes as Record<string, unknown>)[k] as string | undefined;

type ViewKey = 'all' | 'customer' | 'supplier' | 'operator' | 'partner';
const VIEW_KEYS: ViewKey[] = ['all', 'customer', 'supplier', 'operator', 'partner'];

interface ListResp {
  items: CompanyDto[]; total: number; limit: number; offset: number;
  views: Record<ViewKey, number>;
}

export function ClientiPage({ pickProps }: { pickProps?: CompanyPickProps } = {}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const history = useHistory();
  const can = (a: string) => !!user?.permissions.includes(`company:${a}` as never);
  const pick = pickProps?.pick;
  const [crud, setCrud] = useState<{ id: string } | null>(null);   // CRUD soggetto in modale (pick mode)

  const viewLabel = (k: ViewKey): string => {
    switch (k) {
      case 'all': return 'Tutti';
      case 'customer': return t('terms.customer_plural');
      case 'supplier': return t('terms.supplier_plural');
      case 'operator': return t('terms.operator_plural');
      case 'partner': return t('terms.partner_plural');
    }
  };

  // la vista iniziale arriva dal menu (?role=…) o, in pick, da pickProps.role
  const search = useLocation().search;
  const roleParam = pick ? (pickProps?.role ?? null) : new URLSearchParams(search).get('role');
  const initialView: ViewKey = (roleParam && (['customer', 'supplier', 'operator', 'partner'] as string[]).includes(roleParam)) ? roleParam as ViewKey : 'all';
  const [view, setView] = useState<ViewKey>(initialView);
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [filterParam, setFilterParam] = useState<string | null>(null);
  const [sortParam, setSortParam] = useState<string | null>(null);
  const limit = 25;
  useEffect(() => { setView(initialView); setOffset(0); }, [initialView]);

  const params = new URLSearchParams({ limit: String(limit), offset: String(offset), sortBy: 'displayName', sortDir: 'asc' });
  if (view !== 'all') params.set('role', view);
  if (q.trim()) params.set('q', q.trim());
  if (filterParam) params.set('filter', filterParam);
  if (sortParam) params.set('sort', sortParam);
  const { data, loading, error, reload } = useApi<ListResp>(`/companies?${params.toString()}`);
  useReloadOnEnter(reload);

  const { onDelete, onDuplicate } = useEntityActions<CompanyDto>({
    basePath: '/companies', reload, noun: t('terms.party'),
    // niente taxId (può essere chiave/duplicato) né code (auto): si reinseriscono.
    duplicateBody: (r) => ({
      displayName: r.displayName, type: r.type, country: r.country,
      email: r.email ?? null, phone: r.phone ?? null, website: r.website ?? null,
      iban: r.iban ?? null, paymentTerms: r.paymentTerms ?? null,
      legalAddress: r.legalAddress ?? null, operationalAddress: r.operationalAddress ?? null,
      fiscalAttributes: r.fiscalAttributes ?? null, attributes: r.attributes,
      roles: r.roles.map((role) => ({ role })),
    }),
  });

  const views: ListView[] = VIEW_KEYS.map((k) => ({ key: k, label: viewLabel(k), count: data?.views?.[k] ?? 0 }));

  const columns: ListColumn<CompanyDto>[] = [
    { key: 'name', header: t('cols.nome'), sub: t('cols.tipo'), value: (r) => r.displayName, render: (r) => (
      <div className="two"><span className="a">{r.displayName}</span><span className="b">{r.type === 'organization' ? 'Organizzazione' : 'Privato'}</span></div>) },
    { key: 'roles', header: t('cols.ruoli'), value: (r) => r.roles.map((x) => ROLE_LABEL[x] ?? x).join(', '), render: (r) => (r.roles.length
      ? <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{r.roles.map((x) => <span key={x} className="chip">{ROLE_LABEL[x] ?? x}</span>)}</span>
      : <span className="faint">—</span>) },
    { key: 'vat', header: t('cols.piva'), sub: t('cols.codFiscale'), value: (r) => attr(r, 'vat_number') ?? '', render: (r) => (
      <div className="two"><span className="a mono">{attr(r, 'vat_number') ?? '—'}</span><span className="b mono">{attr(r, 'tax_code') ?? '—'}</span></div>) },
    { key: 'city', header: t('cols.citta'), sub: t('cols.provincia'), value: (r) => attr(r, 'city') ?? '', render: (r) => (
      <div className="two"><span className="a">{attr(r, 'city') ?? '—'}</span><span className="b">{attr(r, 'province') ?? ''}</span></div>) },
    { key: 'created', header: t('cols.creato'), num: true, value: (r) => new Date(r.createdAt).toLocaleDateString('it-IT'), render: (r) => <span className="mono faint">{new Date(r.createdAt).toLocaleDateString('it-IT')}</span> },
  ];

  // TUTTI i campi del Soggetto per l'export (non solo le colonne a video)
  const exportFields = [
    { key: 'displayName', label: 'Nome / Ragione sociale', value: (r: CompanyDto) => r.displayName },
    { key: 'type', label: 'Tipo', value: (r: CompanyDto) => (r.type === 'organization' ? 'Organizzazione' : 'Privato') },
    { key: 'roles', label: 'Ruoli', value: (r: CompanyDto) => r.roles.map((x) => ROLE_LABEL[x] ?? x).join(', ') },
    { key: 'vat_number', label: 'P.IVA', value: (r: CompanyDto) => attr(r, 'vat_number') ?? '' },
    { key: 'tax_code', label: 'Codice fiscale', value: (r: CompanyDto) => attr(r, 'tax_code') ?? '' },
    { key: 'pec', label: 'PEC', value: (r: CompanyDto) => attr(r, 'pec') ?? '' },
    { key: 'sdi_code', label: 'Codice SDI', value: (r: CompanyDto) => attr(r, 'sdi_code') ?? '' },
    { key: 'street', label: 'Indirizzo', value: (r: CompanyDto) => attr(r, 'street') ?? '' },
    { key: 'city', label: 'Città', value: (r: CompanyDto) => attr(r, 'city') ?? '' },
    { key: 'province', label: 'Provincia', value: (r: CompanyDto) => attr(r, 'province') ?? '' },
    { key: 'postal_code', label: 'CAP', value: (r: CompanyDto) => attr(r, 'postal_code') ?? '' },
    { key: 'website', label: 'Sito web', value: (r: CompanyDto) => attr(r, 'website') ?? '' },
    { key: 'notes', label: 'Note', value: (r: CompanyDto) => attr(r, 'notes') ?? '' },
    { key: 'createdAt', label: 'Creato il', value: (r: CompanyDto) => new Date(r.createdAt).toLocaleDateString('it-IT') },
  ];

  const [dedupOpen, setDedupOpen] = useState(false);
  const leftActions: ListAction[] = [
    ...(can('delete') ? [{ key: 'dedup', icon: Sparkles, tip: 'Trova doppioni', variant: 'ai' as const, onClick: () => setDedupOpen(true) }] : []),
  ];
  // "+ Nuovo": in pick apre la CRUD in modale (resti nel documento); altrimenti naviga.
  const rightActions: ListAction[] = [
    ...(can('create') ? [{ key: 'new', icon: Plus, tip: 'Nuovo soggetto', variant: 'primary' as const,
      onClick: () => (pick ? setCrud({ id: 'new' }) : history.push('/companies/new')) }] : []),
  ];
  // click riga: in pick apre la CRUD per modificare (poi si seleziona col radio); altrimenti naviga.
  const onRowClick = (r: CompanyDto) => (pick ? setCrud({ id: r.id }) : history.push(`/companies/${r.id}`));

  const list = (
      <EntityList<CompanyDto>
        title={pick ? undefined : t('terms.party_plural')} subtitle={pick ? undefined : 'Anagrafica unica: clienti, fornitori, gestori, partner'}
        views={views} activeView={view} onView={(k) => { setView(k as ViewKey); setOffset(0); }}
        search={q} onSearch={(v) => { setQ(v); setOffset(0); }} searchPlaceholder="Cerca nome, P.IVA, città…"
        leftActions={pick ? [] : leftActions} rightActions={rightActions}
        mode={pick ? (pick === 'multi' ? 'pick-multi' : 'pick-single') : undefined}
        selectedIds={pick ? pickProps?.selectedIds : undefined}
        onToggleSelect={pick ? pickProps?.onToggleSelect : undefined}
        columns={columns} rows={data?.items ?? []} loading={loading} error={error}
        onRowClick={onRowClick}
        onDelete={!pick && can('delete') ? onDelete : undefined}
        onDuplicate={!pick && can('create') ? onDuplicate : undefined}
        exportName="soggetti" exportFields={exportFields} entity="company" savedViewKey="company"
        sortFields={[{ key: 'displayName', label: 'Nome' }, { key: 'type', label: 'Tipo' }, { key: 'createdAt', label: 'Creato' }]}
        filterFields={[
          { key: 'displayName', label: 'Ragione sociale', type: 'text', section: 'Anagrafica', span: 2 },
          { key: 'type', label: 'Tipo', type: 'enum', section: 'Anagrafica', values: [{ value: 'organization', label: 'Organizzazione' }, { value: 'private', label: 'Privato' }] },
          { key: 'createdAt', label: 'Creato il', type: 'date', section: 'Anagrafica' },
          { key: 'vat_number', label: 'P.IVA', type: 'text', section: 'Dati fiscali' },
          { key: 'tax_code', label: 'Codice fiscale', type: 'text', section: 'Dati fiscali' },
          { key: 'pec', label: 'PEC', type: 'text', section: 'Dati fiscali', span: 2 },
          { key: 'sdi_code', label: 'Codice SDI', type: 'text', section: 'Dati fiscali' },
          { key: 'street', label: 'Indirizzo', type: 'text', section: 'Indirizzo e recapiti', span: 2 },
          { key: 'city', label: 'Città', type: 'text', section: 'Indirizzo e recapiti' },
          { key: 'province', label: 'Provincia', type: 'text', section: 'Indirizzo e recapiti' },
          { key: 'postal_code', label: 'CAP', type: 'text', section: 'Indirizzo e recapiti' },
          { key: 'website', label: 'Sito web', type: 'text', section: 'Indirizzo e recapiti', span: 2 },
          { key: 'notes', label: 'Note', type: 'text', section: 'Note', span: 2 },
        ]}
        onSortChange={(s) => { setSortParam(s.length ? JSON.stringify(s) : null); setOffset(0); }}
        onFilterChange={(s) => { setFilterParam(s ? JSON.stringify(s) : null); setOffset(0); }}
        total={data?.total} limit={limit} offset={offset} onPage={setOffset}
        emptyText="Nessun soggetto in questa vista."
      />
  );

  // CRUD soggetto in modale centrato (solo in pick: "+ Nuovo" o modifica riga)
  const crudModal = crud && (
    <Modal open size="xl" title={crud.id === 'new' ? 'Nuovo soggetto' : 'Modifica soggetto'} onClose={() => setCrud(null)}>
      <ClienteDetailPage embed={{
        id: crud.id,
        onClose: () => setCrud(null),
        onSaved: (c, wasNew) => { void reload(); if (wasNew) pickProps?.onCreated?.(c); },
      }} />
    </Modal>
  );

  if (pick) return <>{list}{crudModal}</>;
  return (
    <Page>
      {list}
      {crudModal}
      <DedupDialog open={dedupOpen} onClose={() => setDedupOpen(false)} onMerged={() => void reload()} />
    </Page>
  );
}
