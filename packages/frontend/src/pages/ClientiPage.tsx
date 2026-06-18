/**
 * ClientiPage — Soggetti (anagrafica unica modello Party, ADR-0005) su EntityList v2.
 * Viste per ruolo (Tutti/Clienti/Fornitori/Gestori/Partner) come filtri salvati.
 * Niente master-detail né icone-azione: click riga → scheda /companies/:id.
 */
import { useEffect, useState } from 'react';
import { useHistory, useLocation } from 'react-router';
import type { CompanyDto } from '@sisuite/shared';
import { Page } from '../components/Page';
import { EntityList, type ListColumn, type ListView, type ListAction } from '../ui/EntityList';
import { useEntityActions } from '../ui/useEntityActions';
import { SlidersHorizontal, Columns3, Sparkles, Plus } from '../ui/icons';
import { useApi } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';

const ROLE_LABEL: Record<string, string> = { customer: 'Cliente', supplier: 'Fornitore', partner: 'Partner', operator: 'Gestore' };
const attr = (r: CompanyDto, k: string) => (r.attributes as Record<string, unknown>)[k] as string | undefined;

type ViewKey = 'all' | 'customer' | 'supplier' | 'operator' | 'partner';
const VIEW_LABEL: Record<ViewKey, string> = {
  all: 'Tutti', customer: 'Clienti', supplier: 'Fornitori', operator: 'Gestori', partner: 'Partner',
};

interface ListResp {
  items: CompanyDto[]; total: number; limit: number; offset: number;
  views: Record<ViewKey, number>;
}

export function ClientiPage() {
  const { user } = useAuth();
  const history = useHistory();
  const can = (a: string) => !!user?.permissions.includes(`company:${a}` as never);

  // la vista iniziale arriva dal menu (?role=customer/supplier/operator/partner)
  const search = useLocation().search;
  const roleParam = new URLSearchParams(search).get('role');
  const initialView: ViewKey = (roleParam && (['customer', 'supplier', 'operator', 'partner'] as string[]).includes(roleParam)) ? roleParam as ViewKey : 'all';
  const [view, setView] = useState<ViewKey>(initialView);
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [filterParam, setFilterParam] = useState<string | null>(null);
  const limit = 25;
  useEffect(() => { setView(initialView); setOffset(0); }, [initialView]);

  const params = new URLSearchParams({ limit: String(limit), offset: String(offset), sortBy: 'displayName', sortDir: 'asc' });
  if (view !== 'all') params.set('role', view);
  if (q.trim()) params.set('q', q.trim());
  if (filterParam) params.set('filter', filterParam);
  const { data, loading, error, reload } = useApi<ListResp>(`/companies?${params.toString()}`);

  const { onDelete, onDuplicate } = useEntityActions<CompanyDto>({
    basePath: '/companies', reload, noun: 'soggetto',
    duplicateBody: (r) => ({ displayName: `${r.displayName} (copia)`, type: r.type, roles: r.roles.map((role) => ({ role })), attributes: r.attributes }),
  });

  const views: ListView[] = (Object.keys(VIEW_LABEL) as ViewKey[]).map((k) => ({ key: k, label: VIEW_LABEL[k], count: data?.views?.[k] ?? 0 }));

  const columns: ListColumn<CompanyDto>[] = [
    { key: 'name', header: 'Nome', sub: 'tipo', value: (r) => r.displayName, render: (r) => (
      <div className="two"><span className="a">{r.displayName}</span><span className="b">{r.type === 'organization' ? 'Organizzazione' : 'Privato'}</span></div>) },
    { key: 'roles', header: 'Ruoli', value: (r) => r.roles.map((x) => ROLE_LABEL[x] ?? x).join(', '), render: (r) => (r.roles.length
      ? <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{r.roles.map((x) => <span key={x} className="chip">{ROLE_LABEL[x] ?? x}</span>)}</span>
      : <span className="faint">—</span>) },
    { key: 'vat', header: 'P.IVA', sub: 'cod. fiscale', value: (r) => attr(r, 'vat_number') ?? '', render: (r) => (
      <div className="two"><span className="a mono">{attr(r, 'vat_number') ?? '—'}</span><span className="b mono">{attr(r, 'tax_code') ?? '—'}</span></div>) },
    { key: 'city', header: 'Città', sub: 'provincia', value: (r) => attr(r, 'city') ?? '', render: (r) => (
      <div className="two"><span className="a">{attr(r, 'city') ?? '—'}</span><span className="b">{attr(r, 'province') ?? ''}</span></div>) },
    { key: 'created', header: 'Creato', num: true, value: (r) => new Date(r.createdAt).toLocaleDateString('it-IT'), render: (r) => <span className="mono faint">{new Date(r.createdAt).toLocaleDateString('it-IT')}</span> },
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

  const leftActions: ListAction[] = [
    { key: 'filters', icon: SlidersHorizontal, tip: 'Filtri', disabled: true },
    { key: 'cols', icon: Columns3, tip: 'Colonne', disabled: true },
    { key: 'ai', icon: Sparkles, tip: 'Azioni AI (presto)', variant: 'ai', disabled: true },
  ];
  const rightActions: ListAction[] = [
    ...(can('create') ? [{ key: 'new', icon: Plus, tip: 'Nuovo soggetto', variant: 'primary' as const, onClick: () => history.push('/companies/new') }] : []),
  ];

  return (
    <Page>
      <EntityList<CompanyDto>
        title="Soggetti" subtitle="Anagrafica unica: clienti, fornitori, gestori, partner"
        views={views} activeView={view} onView={(k) => { setView(k as ViewKey); setOffset(0); }}
        search={q} onSearch={(v) => { setQ(v); setOffset(0); }} searchPlaceholder="Cerca nome, P.IVA, città…"
        leftActions={leftActions} rightActions={rightActions}
        columns={columns} rows={data?.items ?? []} loading={loading} error={error}
        onRowClick={(r) => history.push(`/companies/${r.id}`)}
        onDelete={can('delete') ? onDelete : undefined}
        onDuplicate={can('create') ? onDuplicate : undefined}
        exportName="soggetti" exportFields={exportFields} entity="company"
        onFilterChange={(s) => { setFilterParam(s ? JSON.stringify(s) : null); setOffset(0); }}
        total={data?.total} limit={limit} offset={offset} onPage={setOffset}
        emptyText="Nessun soggetto in questa vista."
      />
    </Page>
  );
}
