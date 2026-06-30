/**
 * AssetDetailPage — scheda Asset su ObjectPage v2 (<Page bleed>). Crea+vedi+modifica.
 * Anagrafica (etichetta/tipo/cliente/sito/installazione) + box da field_definition.
 * Selettore Sito popolato dai siti del cliente (entità site, Blocco C-bis).
 */
import { useEffect, useState } from 'react';
import { useParams, useHistory, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Box, Trash2 } from 'lucide-react';
import type { AssetDto, FieldDefinitionDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { ObjectPage, ObjectBox } from '../ui/ObjectPage';
import { AttrBoxes } from '../ui/AttrFields';
import { CompanyPickerDialog } from '../ui/CompanyPickerDialog';
import { SitePickerDialog } from '../ui/SitePickerDialog';
import { PickerField } from '../ui/PickerField';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useLookups, lookupLabel } from '../context/Lookups';
import { useToast } from '../ui/Toast';
import { useApi, mutate } from '../api/hooks';
import { apiFetch, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const { user } = useAuth();
  const toast = useToast();
  const history = useHistory();
  const { t } = useTranslation();
  const can = (a: string) => !!user?.permissions.includes(`asset:${a}` as never);

  const detail = useApi<AssetDto>(isNew ? null : `/assets/${id}`);
  const companies = useApi<{ items: { id: string; displayName: string }[] }>('/companies?limit=200');

  const [form, setForm] = useState({ label: '', kind: '', companyId: '', siteId: '', installedOn: '' });
  // campi personalizzati PER TIPO (variant = asset.kind): mostra universali + del Tipo scelto
  const fieldDefs = useApi<{ items: FieldDefinitionDto[] }>(`/field-definitions?entity=asset${form.kind ? `&variant=${encodeURIComponent(form.kind)}` : ''}`);
  const [attrs, setAttrs] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const [companyPick, setCompanyPick] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [sitePick, setSitePick] = useState(false);
  const [siteName, setSiteName] = useState('');
  const lk = useLookups();
  const assetKinds = lk.byCategory('asset_kind');

  // Duplica (standard): "nuovo" precompilato da location.state.prefill (senza seriali/identificativi).
  const location = useLocation();
  const prefill = isNew ? (location.state as { prefill?: Record<string, unknown> } | null)?.prefill : undefined;

  const d = detail.data;
  useEffect(() => {
    if (!d) {
      if (isNew && prefill) {
        setForm({
          label: (prefill.label as string) ?? '',
          kind: (prefill.kind as string) ?? '',
          companyId: (prefill.companyId as string) ?? '',
          siteId: (prefill.siteId as string) ?? '',
          installedOn: (prefill.installedOn as string) ?? '',
        });
        if (prefill.attributes) setAttrs(prefill.attributes as Record<string, unknown>);
      }
      return;
    }
    setForm({ label: d.label, kind: d.kind, companyId: d.companyId ?? '', siteId: d.siteId ?? '', installedOn: d.installedOn ?? '' });
    setSiteName(d.siteName ?? '');
    setAttrs(d.attributes ?? {});
  }, [d, isNew, prefill]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // risolvi il nome del cliente dalla lista già caricata (modalità nuovo)
  useEffect(() => {
    if (isNew && form.companyId) {
      const c = companies.data?.items.find((x) => x.id === form.companyId);
      if (c) setCompanyName(c.displayName);
    }
  }, [isNew, form.companyId, companies.data]);
  const setAttr = (k: string, v: unknown) => setAttrs((a) => ({ ...a, [k]: v }));

  async function save() {
    if (!form.label.trim() || !form.kind.trim()) { toast('Etichetta e tipo sono obbligatori', 'error'); return; }
    if (isNew && !form.companyId) { toast('Seleziona il cliente', 'error'); return; }
    setBusy(true);
    const body = {
      ...(isNew ? { companyId: form.companyId } : {}),
      label: form.label.trim(), kind: form.kind.trim(),
      siteId: form.siteId || null, installedOn: form.installedOn || undefined, attributes: attrs,
    };
    try {
      if (isNew) { const c = await apiFetch<AssetDto>('/assets', { method: 'POST', body: JSON.stringify(body) }); toast('Asset creato'); history.replace(`/assets/${c.id}`); }
      else { await mutate('PATCH', `/assets/${id}`, body); toast('Modifiche salvate'); void detail.reload(); }
    } catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }
  async function doDelete() {
    setBusy(true);
    try { await mutate('DELETE', `/assets/${id}`); toast('Asset archiviato'); history.replace('/assets'); }
    catch (e) { toast((e as Error).message || 'Impossibile eliminare', 'error'); setDel(false); }
    finally { setBusy(false); }
  }

  if (!isNew && detail.loading) return <Page title={t('terms.asset')}><Loading /></Page>;
  if (!isNew && detail.error) return <Page title={t('terms.asset')}><ErrorBox message={detail.error} /></Page>;

  const title = isNew ? `Nuovo ${t('terms.asset')}` : (form.label || t('terms.asset'));

  return (
    <Page title={title} bleed>
      <ObjectPage
        backLabel={t('terms.asset_plural')} onBack={() => history.push('/assets')}
        title={title} code={!isNew && d ? d.id.slice(0, 8).toUpperCase() : undefined}
        onSave={(isNew ? can('create') : can('update')) ? save : undefined}
        onCancel={() => history.push('/assets')} saving={busy}
      >
        <ObjectBox icon={Box} title="Anagrafica asset">
          <div className="bgrid">
            <div className="bf c2"><span className="bl">Etichetta <span className="req">*</span></span>
              <input className="bi" value={form.label} onChange={(e) => set('label', e.target.value)} /></div>
            <div className="bf"><span className="bl">Tipo <span className="req">*</span></span>
              <select className="bi" value={form.kind} onChange={(e) => set('kind', e.target.value)}>
                <option value="">— seleziona —</option>
                {assetKinds.map((k) => <option key={k.code} value={k.code}>{lookupLabel(k)}</option>)}
                {form.kind && !assetKinds.some((k) => k.code === form.kind) && <option value={form.kind}>{form.kind}</option>}
              </select></div>
            <div className="bf"><span className="bl">Installato il</span>
              <input className="bi" type="date" value={form.installedOn ? form.installedOn.slice(0, 10) : ''} onChange={(e) => set('installedOn', e.target.value)} /></div>
            <div className="bf c2"><span className="bl">Cliente {isNew && <span className="req">*</span>}</span>
              {isNew
                ? <PickerField value={companyName} placeholder="Scegli il cliente…"
                    onOpen={() => setCompanyPick(true)}
                    onClear={() => { set('companyId', ''); set('siteId', ''); setCompanyName(''); }} />
                : <div className="bi">{d?.companyName ?? '—'}</div>}</div>
            <div className="bf c2"><span className="bl">Sito / Località</span>
              <PickerField value={siteName} placeholder={form.companyId ? 'Scegli il sito…' : 'Scegli prima il cliente'}
                disabled={!form.companyId}
                onOpen={() => setSitePick(true)}
                onClear={form.siteId ? () => { set('siteId', ''); setSiteName(''); } : undefined} /></div>
          </div>
        </ObjectBox>

        <AttrBoxes defs={fieldDefs.data?.items ?? []} attrs={attrs} setAttr={setAttr} />

        {!isNew && can('delete') && (
          <div style={{ padding: '6px 2px 4px' }}>
            <button className="btn btn-ghost" onClick={() => setDel(true)} style={{ color: 'var(--danger)' }}><Trash2 size={15} /> Archivia asset</button>
          </div>
        )}
      </ObjectPage>

      <ConfirmDialog open={del} danger title="Archiviare l'asset?"
        message={`“${form.label}” verrà archiviato.`} confirmLabel="Archivia" busy={busy}
        onConfirm={doDelete} onCancel={() => setDel(false)} />
      <CompanyPickerDialog open={companyPick} onClose={() => setCompanyPick(false)}
        onPick={(cs) => { const c = cs[0]; if (c) { set('companyId', c.id); set('siteId', ''); setSiteName(''); setCompanyName(c.displayName); } }} />
      {sitePick && form.companyId && (
        <SitePickerDialog open companyId={form.companyId} onClose={() => setSitePick(false)}
          onPick={(ss) => { const s = ss[0]; if (s) { set('siteId', s.id); setSiteName(s.name); } setSitePick(false); }} />
      )}
    </Page>
  );
}
