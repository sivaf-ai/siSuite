/** CustomFieldsSettings — CAMPI PERSONALIZZATI per-tenant (parte: config over code).
 *  Il tenant aggiunge campi alle entità senza codice: compaiono SUBITO nei form
 *  (EntityForm legge /field-definitions). I campi di SISTEMA sono sola lettura
 *  (la RLS impedisce la modifica). settings:manage per scrivere. */
import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import type { FieldDefinitionDto, FieldDataType, FieldOption } from '@sisuite/shared';
import { FIELD_DATA_TYPES, GROUP_LABEL_IT } from '@sisuite/shared';
import { Loading, ErrorBox } from '../../components/Page';
import { Drawer } from '../../ui/Drawer';
import { Field, type RenderableField } from '../../ui/Field';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { useToast } from '../../ui/Toast';
import { useApi, mutate } from '../../api/hooks';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

const ENTITIES = [
  { key: 'engagement', label: 'Commessa' }, { key: 'activity', label: 'Attività' },
  { key: 'asset', label: 'Asset' }, { key: 'resource', label: 'Risorsa' },
  { key: 'material', label: 'Materiale' }, { key: 'company', label: 'Cliente' },
];
const DT_LABEL: Record<FieldDataType, string> = {
  text: 'Testo', textarea: 'Testo lungo', number: 'Numero', integer: 'Intero', money: 'Valuta', date: 'Data',
  boolean: 'Sì/No', email: 'Email', phone: 'Telefono', url: 'URL', select: 'Scelta singola', multiselect: 'Scelta multipla',
};
const GROUP_KEYS = Object.keys(GROUP_LABEL_IT);

export function CustomFieldsSettings() {
  const toast = useToast();
  const { user } = useAuth();
  const canManage = !!user?.permissions.includes('settings:manage' as never);
  const [entity, setEntity] = useState('engagement');
  const { data, loading, error, reload } = useApi<{ items: FieldDefinitionDto[] }>(`/field-definitions?entity=${entity}`);
  const [editing, setEditing] = useState<FieldDefinitionDto | null | undefined>(undefined);
  const [confirm, setConfirm] = useState<FieldDefinitionDto | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = (data?.items ?? []).slice().sort((a, b) => a.sequence - b.sequence);

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
          <div className="seg">
            {ENTITIES.map((e) => <button key={e.key} className={entity === e.key ? 'on' : ''} onClick={() => setEntity(e.key)}>{e.label}</button>)}
          </div>
        </div>
        <div className="pb" style={{ padding: 0 }}>
          {loading ? <Loading /> : error ? <ErrorBox message={error} /> : rows.length === 0
            ? <div style={{ padding: 20, color: 'var(--ink-soft)' }}>Nessun campo per questa entità.</div>
            : rows.map((d) => (
              <div className="lv-row" key={d.id}>
                <span className="lvname">{d.label['it-IT'] ?? d.key}
                  {d.isSystem
                    ? <span className="chip" style={{ marginLeft: 8 }}>sistema</span>
                    : <span className="pill pill--brand" style={{ marginLeft: 8 }}><span className="dot" />tuo</span>}
                </span>
                <span className="canon">{DT_LABEL[d.dataType]}{d.required ? ' · obbl.' : ''}</span>
                <span className="abbr">{d.key}</span>
                {canManage && !d.isSystem && (
                  <span className="lv-acts">
                    <button className="act-icon" title="Modifica" onClick={() => setEditing(d)}><Pencil size={15} /></button>
                    <button className="act-icon danger" title="Elimina" onClick={() => setConfirm(d)}><Trash2 size={15} /></button>
                  </span>
                )}
              </div>
            ))}
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
        <FieldDrawer entity={entity} editing={editing}
          onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); void reload(); }} toast={toast} />
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

function FieldDrawer({ entity, editing, onClose, onSaved, toast }: {
  entity: string; editing: FieldDefinitionDto | null;
  onClose: () => void; onSaved: () => void; toast: (m: string, t?: 'error') => void;
}) {
  const [v, setV] = useState<Record<string, unknown>>(() => ({
    key: editing?.key ?? '',
    labelIt: editing?.label['it-IT'] ?? '',
    dataType: editing?.dataType ?? 'text',
    required: editing?.required ?? false,
    unit: editing?.unit ?? '',
    groupKey: editing?.groupKey ?? 'general',
    sequence: editing?.sequence ?? 100,
    optionsText: optionsToText(editing?.options ?? null),
  }));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isChoice = v.dataType === 'select' || v.dataType === 'multiselect';

  const fields: RenderableField[] = [
    ...(editing ? [] : [{ key: 'key', label: 'Chiave (codice, minuscolo)', dataType: 'text' as const, required: true, placeholder: 'es. potenza_kw' }]),
    { key: 'labelIt', label: 'Etichetta (IT)', dataType: 'text', required: true },
    { key: 'dataType', label: 'Tipo', dataType: 'select', required: true, options: FIELD_DATA_TYPES.map((t) => ({ value: t, label: { 'it-IT': DT_LABEL[t] } })) },
    { key: 'unit', label: 'Unità (opz.)', dataType: 'text', placeholder: 'es. kW, m, €' },
    { key: 'groupKey', label: 'Gruppo', dataType: 'select', options: GROUP_KEYS.map((g) => ({ value: g, label: { 'it-IT': GROUP_LABEL_IT[g] ?? g } })) },
    { key: 'sequence', label: 'Ordine', dataType: 'integer' },
    { key: 'required', label: 'Obbligatorio', dataType: 'boolean' },
  ];

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
    const common = {
      label: { 'it-IT': v.labelIt }, dataType: v.dataType, required: !!v.required,
      unit: (v.unit as string)?.trim() || null, groupKey: (v.groupKey as string) || null,
      sequence: Number(v.sequence ?? 100), options,
    };
    try {
      if (editing) await mutate('PATCH', `/field-definitions/${editing.id}`, common);
      else await mutate('POST', '/field-definitions', { entity, key: v.key, ...common });
      toast(editing ? 'Campo aggiornato' : 'Campo creato');
      onSaved();
    } catch (e) {
      toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message, 'error');
    } finally { setBusy(false); }
  }

  return (
    <Drawer open title={editing ? 'Modifica campo' : 'Nuovo campo'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Annulla</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{editing ? 'Salva' : 'Crea'}</button>
      </>}>
      <div className="form-group">
        {fields.map((f) => <Field key={f.key} field={f} value={v[f.key]} error={errors[f.key]} onChange={(val) => setV((s) => ({ ...s, [f.key]: val }))} />)}
        {isChoice && (
          <div className="field">
            <label>Opzioni (una per riga, <span className="mono">valore=Etichetta</span>)</label>
            <textarea className="txt" style={{ minHeight: 96 }} value={v.optionsText as string} placeholder={'ftth=FTTH\nfttb=FTTB'}
              onChange={(e) => setV((s) => ({ ...s, optionsText: e.target.value }))} />
            {errors.optionsText && <div className="err">{errors.optionsText}</div>}
          </div>
        )}
      </div>
    </Drawer>
  );
}
