/**
 * AssetDetailPage — scheda Asset su ObjectPage v2 (<Page bleed>). Crea+vedi+modifica.
 * Anagrafica (etichetta/tipo/cliente/sito/installazione) + box da field_definition.
 * Selettore Sito popolato dai siti del cliente (entità site, Blocco C-bis).
 */
import { useEffect, useState } from 'react';
import { useParams, useHistory } from 'react-router';
import { Box, Trash2 } from 'lucide-react';
import type { AssetDto, FieldDefinitionDto, SiteDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { ObjectPage, ObjectBox } from '../ui/ObjectPage';
import { AttrBoxes } from '../ui/AttrFields';
import { ConfirmDialog } from '../ui/ConfirmDialog';
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
  const can = (a: string) => !!user?.permissions.includes(`asset:${a}` as never);

  const detail = useApi<AssetDto>(isNew ? null : `/assets/${id}`);
  const fieldDefs = useApi<{ items: FieldDefinitionDto[] }>('/field-definitions?entity=asset');
  const companies = useApi<{ items: { id: string; displayName: string }[] }>('/companies?limit=200');

  const [form, setForm] = useState({ label: '', kind: '', companyId: '', siteId: '', installedOn: '' });
  const [attrs, setAttrs] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);

  const d = detail.data;
  useEffect(() => {
    if (!d) return;
    setForm({ label: d.label, kind: d.kind, companyId: d.companyId, siteId: d.siteId ?? '', installedOn: d.installedOn ?? '' });
    setAttrs(d.attributes ?? {});
  }, [d]);

  const sites = useApi<{ items: SiteDto[] }>(form.companyId ? `/sites?company_id=${form.companyId}` : null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
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

  if (!isNew && detail.loading) return <Page title="Asset"><Loading /></Page>;
  if (!isNew && detail.error) return <Page title="Asset"><ErrorBox message={detail.error} /></Page>;

  const companyOpts = companies.data?.items ?? [];
  const siteOpts = sites.data?.items ?? [];
  const title = isNew ? 'Nuovo asset' : (form.label || 'Asset');

  return (
    <Page title={title} bleed>
      <ObjectPage
        backLabel="Asset" onBack={() => history.push('/assets')}
        title={title} code={!isNew && d ? d.id.slice(0, 8).toUpperCase() : undefined}
        onSave={(isNew ? can('create') : can('update')) ? save : undefined}
        onCancel={() => history.push('/assets')} saving={busy}
      >
        <ObjectBox icon={Box} title="Anagrafica asset">
          <div className="bgrid">
            <div className="bf c2"><span className="bl">Etichetta <span className="req">*</span></span>
              <input className="bi" value={form.label} onChange={(e) => set('label', e.target.value)} /></div>
            <div className="bf"><span className="bl">Tipo <span className="req">*</span></span>
              <input className="bi" value={form.kind} onChange={(e) => set('kind', e.target.value)} placeholder="pv_plant, pool, software_system…" /></div>
            <div className="bf"><span className="bl">Installato il</span>
              <input className="bi" type="date" value={form.installedOn ? form.installedOn.slice(0, 10) : ''} onChange={(e) => set('installedOn', e.target.value)} /></div>
            <div className="bf c2"><span className="bl">Cliente</span>
              {isNew
                ? <select className="bi" value={form.companyId} onChange={(e) => { set('companyId', e.target.value); set('siteId', ''); }}><option value="">— seleziona —</option>{companyOpts.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}</select>
                : <div className="bi">{d?.companyName ?? '—'}</div>}</div>
            <div className="bf c2"><span className="bl">Sito / Località</span>
              <select className="bi" value={form.siteId} onChange={(e) => set('siteId', e.target.value)} disabled={!form.companyId}>
                <option value="">— nessuno —</option>
                {siteOpts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
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
    </Page>
  );
}
