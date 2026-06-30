/** CustomFieldsSettings — Field Builder (Impostazioni › Campi personalizzati, Blocco A-bis).
 *  Il tenant aggiunge/edita campi alle entità senza codice: compaiono SUBITO nei form
 *  (EntityForm/AttrBoxes leggono /field-definitions). I campi di SISTEMA sono sola lettura
 *  (RLS). settings:manage per scrivere. Righe cliccabili (v2, niente icone-azione);
 *  delete + toggle attivo + anteprima live nel Modal editor. */
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { FieldDefinitionDto, FieldDataType, FieldOption } from '@sisuite/shared';
import { FIELD_DATA_TYPES, GROUP_LABEL_IT } from '@sisuite/shared';
import { Loading, ErrorBox } from '../../components/Page';
import { Modal } from '../../ui/Modal';
import { Field, type RenderableField } from '../../ui/Field';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { useToast } from '../../ui/Toast';
import { useApi, mutate } from '../../api/hooks';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useLookups, lookupLabel } from '../../context/Lookups';

const ENTITIES = [
  { key: 'engagement', label: 'Commessa' }, { key: 'work_order', label: 'Ordine di lavoro' },
  { key: 'activity', label: 'Attività' }, { key: 'asset', label: 'Asset' },
  { key: 'site', label: 'Sito' }, { key: 'resource', label: 'Risorsa' },
  { key: 'material', label: 'Materiale' }, { key: 'company', label: 'Soggetto' },
  { key: 'address', label: 'Indirizzo' },
];
// entità i cui campi dipendono dal PAESE (ISO): mostra il selettore Paese.
const COUNTRY_AWARE = new Set(['address', 'company']);
const COUNTRIES = ['IT', 'AR'];
// entità i cui campi possono dipendere dal TIPO del record → categoria lookup dei tipi.
const VARIANT_AWARE: Record<string, string> = { work_order: 'work_order_type', asset: 'asset_kind' };
const DT_LABEL: Record<FieldDataType, string> = {
  text: 'Testo', textarea: 'Testo lungo', number: 'Numero', integer: 'Intero', money: 'Valuta', date: 'Data',
  boolean: 'Sì/No', email: 'Email', phone: 'Telefono', url: 'URL', select: 'Scelta singola', multiselect: 'Scelta multipla',
};
const GROUP_KEYS = Object.keys(GROUP_LABEL_IT);

export function CustomFieldsSettings() {
  const toast = useToast();
  const { user } = useAuth();
  const canManage = !!user?.permissions.includes('settings:manage' as never);
  const lk = useLookups();
  const [entity, setEntity] = useState('engagement');
  const [country, setCountry] = useState('IT');
  const [variant, setVariant] = useState('');   // '' = tutti i tipi (universali)
  const countryAware = COUNTRY_AWARE.has(entity);
  const variantCat = VARIANT_AWARE[entity];
  const variantTypes = variantCat ? lk.byCategory(variantCat) : [];
  const { data, loading, error, reload } = useApi<{ items: FieldDefinitionDto[] }>(`/field-definitions?entity=${entity}&manage=1`);
  const [editing, setEditing] = useState<FieldDefinitionDto | null | undefined>(undefined);
  const [confirm, setConfirm] = useState<FieldDefinitionDto | null>(null);
  const [busy, setBusy] = useState(false);

  // per le entità country-aware mostra i campi del Paese scelto (+ universali); per le
  // variant-aware quelli del Tipo scelto (+ universali, variant null).
  const rows = (data?.items ?? [])
    .filter((d) => !countryAware || d.country == null || d.country === country)
    .filter((d) => !variantCat || !variant || d.variant == null || d.variant === variant)
    .slice().sort((a, b) => a.sequence - b.sequence);

  async function doDelete() {
    if (!confirm) return;
    setBusy(true);
    try { await mutate('DELETE', `/field-definitions/${confirm.id}`); toast('Campo eliminato'); setConfirm(null); void reload(); }
    catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? 'Errore') : (e as Error).message, 'error'); setConfirm(null); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="ph">
          <h3>Campi di {ENTITIES.find((e) => e.key === entity)?.label.toLowerCase()}</h3>
          <div className="seg" style={{ flexWrap: 'wrap' }}>
            {ENTITIES.map((e) => <button key={e.key} className={entity === e.key ? 'on' : ''} onClick={() => { setEntity(e.key); setVariant(''); }}>{e.label}</button>)}
          </div>
          {countryAware && (
            <select className="txt" style={{ maxWidth: 150, marginLeft: 'auto' }} value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((c) => <option key={c} value={c}>Paese: {c}</option>)}
            </select>
          )}
          {variantCat && (
            <select className="txt" style={{ maxWidth: 220, marginLeft: 'auto' }} value={variant} onChange={(e) => setVariant(e.target.value)}>
              <option value="">Tutti i tipi (universali)</option>
              {variantTypes.map((t) => <option key={t.code} value={t.code}>Tipo: {lookupLabel(t)}</option>)}
            </select>
          )}
        </div>
        {countryAware && <p className="faint" style={{ fontSize: 12.5, color: 'var(--ink-faint)', padding: '0 16px', margin: '8px 0 0' }}>
          I campi di <b>{ENTITIES.find((e) => e.key === entity)?.label}</b> dipendono dal <b>Paese</b> (es. l'Italia ha Via/Civico/CAP, l'Argentina Calle/Número/CPA…). Scegli il Paese e aggiungi/modifica i suoi campi.
        </p>}
        {variantCat && <p className="faint" style={{ fontSize: 12.5, color: 'var(--ink-faint)', padding: '0 16px', margin: '8px 0 0' }}>
          I campi di <b>{ENTITIES.find((e) => e.key === entity)?.label}</b> possono dipendere dal <b>Tipo</b> del record. «Tutti i tipi» = campi sempre presenti; scegli un Tipo per i campi dedicati (es. un Ordine "FTTH" può avere Seriale ONT, Potenza ottica…). I Tipi si gestiscono in <b>Stati & etichette</b>.
        </p>}
        <div className="pb" style={{ padding: 0 }}>
          {loading ? <Loading /> : error ? <ErrorBox message={error} /> : rows.length === 0
            ? <div style={{ padding: 20, color: 'var(--ink-soft)' }}>Nessun campo per questa entità.</div>
            : (
              <>
                <div className="fd-row fd-head">
                  <span>Campo</span><span>Tipo</span><span>Obbl.</span><span>Chiave</span><span />
                </div>
                {rows.map((d) => {
                  const editable = canManage;   // i campi di sistema sono cliccabili per PERSONALIZZARLI (override)
                  return (
                    <div className="fd-row" key={d.id} style={editable ? { cursor: 'pointer' } : undefined}
                      onClick={editable ? () => setEditing(d) : undefined}>
                      <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className="cellname" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label['it-IT'] ?? d.key}</span>
                        {d.isSystem
                          ? <span className="chip">sistema</span>
                          : <span className="pill pill--brand"><span className="dot" />tuo</span>}
                        {d.isCustomized && <span className="pill pill--brand" style={{ marginLeft: 0 }}><span className="dot" />personalizzato</span>}
                        {/* scope: chiarisce a quale Tipo/Paese appartiene (o se è universale) */}
                        {variantCat && (d.variant
                          ? <span className="chip" style={{ background: 'var(--brand-wash)', color: 'var(--brand-ink)' }}>Tipo: {(variantTypes.find((t) => t.code === d.variant) && lookupLabel(variantTypes.find((t) => t.code === d.variant)!)) ?? d.variant}</span>
                          : <span className="chip" style={{ color: 'var(--ink-faint)' }}>Tutti i tipi</span>)}
                        {countryAware && d.country && <span className="chip" style={{ background: 'var(--brand-wash)', color: 'var(--brand-ink)' }}>Paese: {d.country}</span>}
                        {!d.active && <span className="chip" style={{ opacity: 0.7 }}>disattivato</span>}
                      </span>
                      <span className="chip" style={{ justifySelf: 'start' }}>{DT_LABEL[d.dataType]}</span>
                      <span className="cellsub" style={{ textAlign: 'center' }}>{d.required ? 'sì' : '—'}</span>
                      <span className="mono cellsub" style={{ whiteSpace: 'nowrap' }}>{d.key}</span>
                      <span />
                    </div>
                  );
                })}
              </>
            )}
        </div>
        {canManage && (
          <div style={{ padding: '12px 16px' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}><Plus size={16} /> Aggiungi campo</button>
          </div>
        )}
      </div>
      <p className="faint" style={{ fontSize: 13, color: 'var(--ink-faint)' }}>
        I campi che aggiungi compaiono <b>subito</b> nei form di creazione/modifica dell'entità (sezione attributi).
        I campi di <b>sistema</b> non sono modificabili. La logica resta invariata: sono dati flessibili su <span className="mono">attributes</span>.
      </p>

      {editing !== undefined && (
        <FieldModal entity={entity} country={countryAware ? country : null} variant={variantCat ? (variant || null) : null} editing={editing}
          onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); void reload(); }}
          onDelete={editing ? () => { const e = editing; setEditing(undefined); setConfirm(e); } : undefined} toast={toast} />
      )}
      <ConfirmDialog open={!!confirm} danger title="Eliminare il campo?"
        message={`“${confirm?.label['it-IT'] ?? confirm?.key}” verrà rimosso dai form. I valori già salvati restano nei dati.`}
        confirmLabel="Elimina" busy={busy} onConfirm={doDelete} onCancel={() => setConfirm(null)} />
    </>
  );
}

function parseOptions(text: string): FieldOption[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [value, ...rest] = l.split('=');
    const v = (value ?? '').trim();
    const label = rest.join('=').trim() || v;
    return { value: v, label: { 'it-IT': label } };
  }).filter((o) => o.value);
}
const optionsToText = (opts: FieldOption[] | null) => (opts ?? []).map((o) => `${o.value}=${o.label['it-IT'] ?? o.value}`).join('\n');

function FieldModal({ entity, country, variant, editing, onClose, onSaved, onDelete, toast }: {
  entity: string; country: string | null; variant: string | null; editing: FieldDefinitionDto | null;
  onClose: () => void; onSaved: () => void; onDelete?: () => void; toast: (m: string, t?: 'error') => void;
}) {
  const [v, setV] = useState<Record<string, unknown>>(() => ({
    key: editing?.key ?? '',
    labelIt: editing?.label['it-IT'] ?? '',
    labelEn: editing?.label['en'] ?? '',
    labelEs: editing?.label['es-AR'] ?? '',
    helpIt: editing?.help?.['it-IT'] ?? '',
    placeholderIt: editing?.placeholder?.['it-IT'] ?? '',
    dataType: editing?.dataType ?? 'text',
    required: editing?.required ?? false,
    active: editing?.active ?? true,
    unit: editing?.unit ?? '',
    groupKey: editing?.groupKey ?? 'general',
    sequence: editing?.sequence ?? 100,
    optionsText: optionsToText(editing?.options ?? null),
  }));
  const [preview, setPreview] = useState<unknown>(undefined);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isChoice = v.dataType === 'select' || v.dataType === 'multiselect';
  const isSystem = !!editing?.isSystem;   // campo di sistema: struttura fissa, si personalizza l'override
  const set = (p: Record<string, unknown>) => setV((s) => ({ ...s, ...p }));
  async function resetOverride() {
    if (!editing) return; setBusy(true);
    try { await mutate('DELETE', `/field-definitions/${editing.id}/override`); toast('Ripristinato il default'); onSaved(); }
    catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? 'Errore') : (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  async function submit() {
    const errs: Record<string, string> = {};
    if (!String(v.labelIt ?? '').trim()) errs.labelIt = 'Campo obbligatorio';
    if (!editing) {
      const k = String(v.key ?? '').trim();
      if (!k) errs.key = 'Campo obbligatorio';
      else if (!/^[a-z][a-z0-9_]*$/.test(k)) errs.key = 'Minuscolo, lettere/numeri/underscore, inizia con lettera';
    }
    if (isChoice && parseOptions(String(v.optionsText ?? '')).length === 0) errs.optionsText = 'Inserisci almeno un\'opzione';
    setErrors(errs); if (Object.keys(errs).length) return;
    setBusy(true);
    const options = isChoice ? parseOptions(String(v.optionsText ?? '')) : null;
    const label: Record<string, string> = { 'it-IT': String(v.labelIt).trim() };
    if (String(v.labelEn ?? '').trim()) label.en = String(v.labelEn).trim();
    if (String(v.labelEs ?? '').trim()) label['es-AR'] = String(v.labelEs).trim();
    const help = String(v.helpIt ?? '').trim() ? { 'it-IT': String(v.helpIt).trim() } : null;
    const placeholder = String(v.placeholderIt ?? '').trim() ? { 'it-IT': String(v.placeholderIt).trim() } : null;
    const common = {
      label, dataType: v.dataType, required: !!v.required, active: !!v.active,
      unit: (v.unit as string)?.trim() || null, groupKey: (v.groupKey as string) || null,
      sequence: Number(v.sequence ?? 100), options, help, placeholder,
    };
    try {
      if (editing?.isSystem) {
        // personalizza un campo di SISTEMA: override di label/obbligatorio/attivo/ordine/segnaposto/aiuto/unità
        await mutate('PUT', `/field-definitions/${editing.id}/override`, {
          label, required: !!v.required, active: !!v.active, sequence: Number(v.sequence ?? 100),
          placeholder, help, unit: (v.unit as string)?.trim() || null,
        });
      } else if (editing) await mutate('PATCH', `/field-definitions/${editing.id}`, common);
      else await mutate('POST', '/field-definitions', { entity, key: v.key, country: country ?? null, variant: variant ?? null, ...common });
      toast(editing ? 'Campo aggiornato' : 'Campo creato');
      onSaved();
    } catch (e) {
      toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message, 'error');
    } finally { setBusy(false); }
  }

  // anteprima live: costruisce un campo renderizzabile dallo stato corrente
  const previewField: RenderableField = {
    key: 'preview', label: String(v.labelIt || 'Anteprima'), dataType: v.dataType as FieldDataType,
    required: !!v.required,
    help: String(v.helpIt ?? '') || undefined,
    placeholder: String(v.placeholderIt ?? '') || undefined,
    unit: (v.unit as string) || undefined,
    options: isChoice ? parseOptions(String(v.optionsText ?? '')) : undefined,
  };

  return (
    <Modal open title={isSystem ? 'Personalizza campo di sistema' : (editing ? 'Modifica campo' : 'Nuovo campo')} size="md" onClose={onClose}
      footer={<>
        {onDelete && !isSystem && <button className="btn btn-ghost" onClick={onDelete} disabled={busy} style={{ color: 'var(--danger)', marginRight: 'auto' }}><Trash2 size={15} /> Elimina</button>}
        {isSystem && editing?.isCustomized && <button className="btn btn-ghost" onClick={() => void resetOverride()} disabled={busy} style={{ marginRight: 'auto' }}>Ripristina default</button>}
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Annulla</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{editing ? 'Salva' : 'Crea'}</button>
      </>}>
      <div className="dsx">
        {isSystem && <p className="faint" style={{ fontSize: 12.5, color: 'var(--ink-faint)', margin: '0 0 10px' }}>
          Campo di <b>sistema</b>: puoi personalizzare etichetta, obbligatorietà, attivo, ordine, segnaposto e aiuto. Chiave e tipo restano fissi (la logica non cambia). «Ripristina default» annulla le tue modifiche.
        </p>}
        <div className="bgrid">
          {!editing && <div className="bf c2"><span className="bl">Chiave (codice) <span className="req">*</span></span>
            <input className="bi mono" value={String(v.key ?? '')} onChange={(e) => set({ key: e.target.value })} placeholder="es. potenza_kw"
              style={errors.key ? { borderColor: 'var(--danger)' } : undefined} />
            {errors.key && <span style={{ fontSize: 11.5, color: 'var(--danger)' }}>{errors.key}</span>}</div>}
          <div className="bf c2"><span className="bl">Etichetta (IT) <span className="req">*</span></span>
            <input className="bi" autoFocus value={String(v.labelIt ?? '')} onChange={(e) => set({ labelIt: e.target.value })}
              style={errors.labelIt ? { borderColor: 'var(--danger)' } : undefined} placeholder="es. Potenza" />
            {errors.labelIt && <span style={{ fontSize: 11.5, color: 'var(--danger)' }}>{errors.labelIt}</span>}</div>
          <div className="bf c1"><span className="bl">Etichetta (EN)</span>
            <input className="bi" value={String(v.labelEn ?? '')} onChange={(e) => set({ labelEn: e.target.value })} /></div>
          <div className="bf c1"><span className="bl">Etichetta (ES)</span>
            <input className="bi" value={String(v.labelEs ?? '')} onChange={(e) => set({ labelEs: e.target.value })} /></div>
          <div className="bf c2"><span className="bl">Tipo dato</span>
            <select className="bi" value={String(v.dataType)} onChange={(e) => set({ dataType: e.target.value })} disabled={isSystem}>
              {FIELD_DATA_TYPES.map((dt) => <option key={dt} value={dt}>{DT_LABEL[dt]}</option>)}</select></div>
          <div className="bf c1"><span className="bl">Unità</span>
            <input className="bi" value={String(v.unit ?? '')} onChange={(e) => set({ unit: e.target.value })} placeholder="kW, m, €" /></div>
          <div className="bf c1"><span className="bl">Ordine</span>
            <input className="bi" type="number" value={Number(v.sequence ?? 100)} onChange={(e) => set({ sequence: Number(e.target.value) })} /></div>
          <div className="bf c2"><span className="bl">Segnaposto (IT)</span>
            <input className="bi" value={String(v.placeholderIt ?? '')} onChange={(e) => set({ placeholderIt: e.target.value })} /></div>
          <div className="bf c2"><span className="bl">Testo di aiuto (IT)</span>
            <input className="bi" value={String(v.helpIt ?? '')} onChange={(e) => set({ helpIt: e.target.value })} /></div>
          <div className="bf c2"><span className="bl">Gruppo</span>
            <select className="bi" value={String(v.groupKey ?? 'general')} onChange={(e) => set({ groupKey: e.target.value })} disabled={isSystem}>
              {GROUP_KEYS.map((g) => <option key={g} value={g}>{GROUP_LABEL_IT[g] ?? g}</option>)}</select></div>
          <div className="bf c1"><span className="bl">Obbligatorio</span>
            <select className="bi" value={v.required ? '1' : '0'} onChange={(e) => set({ required: e.target.value === '1' })}>
              <option value="0">No</option><option value="1">Sì</option></select></div>
          <div className="bf c1"><span className="bl">Attivo</span>
            <select className="bi" value={v.active === false ? '0' : '1'} onChange={(e) => set({ active: e.target.value === '1' })}>
              <option value="1">Sì</option><option value="0">No</option></select></div>
          {isChoice && <div className="bf c4"><span className="bl">Opzioni (una per riga: <span className="mono">valore=Etichetta</span>)</span>
            <textarea className="bi" rows={3} value={String(v.optionsText ?? '')} placeholder={'ftth=FTTH\nfttb=FTTB'}
              onChange={(e) => set({ optionsText: e.target.value })} style={errors.optionsText ? { borderColor: 'var(--danger)' } : undefined} />
            {errors.optionsText && <span style={{ fontSize: 11.5, color: 'var(--danger)' }}>{errors.optionsText}</span>}</div>}
        </div>
        <div style={{ marginTop: 12, padding: 12, background: 'var(--neutral-wash)', borderRadius: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ink-faint)' }}>Anteprima live</label>
          <div style={{ marginTop: 8 }}><Field field={previewField} value={preview} onChange={setPreview} /></div>
        </div>
      </div>
    </Modal>
  );
}
