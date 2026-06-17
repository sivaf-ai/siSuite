/** LabelsSettings — "Stati & etichette" fedele al mock 15: segmented per categoria,
 *  righe lv-row (pallino colore + sigla + nome + canonico), aggiungi/modifica/elimina.
 *  Le righe di SISTEMA sono in sola lettura. Riusa /lookups (settings:manage). */
import { useState } from 'react';
import { Plus, Trash2, GripVertical, RotateCcw } from 'lucide-react';
import type { LookupDto } from '@sisuite/shared';
import { Loading, ErrorBox } from '../../components/Page';
import { Drawer } from '../../ui/Drawer';
import { Field, type RenderableField } from '../../ui/Field';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { useToast } from '../../ui/Toast';
import { useApi, mutate } from '../../api/hooks';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ColorSwatchPicker } from '../../ui/ColorSwatchPicker';
import { swatchColor } from '../../theme/palette';

const CATS = [
  { key: 'activity_status', label: 'Stato attività' },
  { key: 'engagement_status', label: 'Stato commessa' },
  { key: 'phase_status', label: 'Stato fase' },
  { key: 'priority', label: 'Priorità' },
  { key: 'time_typology', label: 'Tipologie ore' },
  { key: 'time_entry_status', label: 'Stato ore (approvazione)' },
  { key: 'absence_type', label: 'Tipi di assenza' },
  { key: 'billing_mode', label: 'Modalità di vendita' },
  { key: 'work_report_status', label: 'Stato rapportino' },
  { key: 'schedule_mode', label: 'Modalità pianificazione' },
  { key: 'stock_movement_type', label: 'Magazzino · tipi movimento' },
  { key: 'stock_document_type', label: 'Magazzino · tipi documento' },
];

export function LabelsSettings() {
  const toast = useToast();
  const { user } = useAuth();
  const canManage = !!user?.permissions.includes('settings:manage' as never);
  const { data, loading, error, reload } = useApi<{ items: LookupDto[] }>('/lookups');
  const [cat, setCat] = useState('activity_status');
  const [editing, setEditing] = useState<LookupDto | null | undefined>(undefined); // undefined=chiuso, null=nuovo
  const [confirm, setConfirm] = useState<LookupDto | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = (data?.items ?? []).filter((l) => l.category === cat).sort((a, b) => a.sequence - b.sequence);
  // canonici disponibili per la categoria (dai valori esistenti) — per il form di creazione
  const canonicals = Array.from(new Set((data?.items ?? []).filter((l) => l.category === cat).map((l) => l.canonical)));

  async function doDelete() {
    if (!confirm) return;
    setBusy(true);
    try { await mutate('DELETE', `/lookups/${confirm.id}`); toast('Etichetta eliminata'); setConfirm(null); void reload(); }
    catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? 'Errore') : (e as Error).message, 'error'); setConfirm(null); }
    finally { setBusy(false); }
  }

  // ripristina il default di sistema (elimina l'override del tenant)
  async function doReset(l: LookupDto) {
    try { await mutate('DELETE', `/lookups/${l.id}/override`); toast('Ripristinato il default'); void reload(); }
    catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="ph">
          <h3>{CATS.find((c) => c.key === cat)?.label ?? cat}</h3>
          <select className="txt" style={{ maxWidth: 280 }} value={cat} onChange={(e) => setCat(e.target.value)}>
            {CATS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div className="pb" style={{ padding: 0 }}>
          {loading ? <Loading /> : error ? <ErrorBox message={error} /> : rows.length === 0
            ? <div style={{ padding: 20, color: 'var(--ink-soft)' }}>Nessuna etichetta in questa categoria.</div>
            : rows.map((l) => (
              <div className="lv-row" key={l.id} style={canManage ? { cursor: 'pointer' } : undefined}
                onClick={canManage ? () => setEditing(l) : undefined}>
                <span className="drag" style={{ color: 'var(--ink-faint)' }}><GripVertical size={15} /></span>
                <span className="swatch" style={{ background: swatchColor(l.colorToken) }} />
                <span className="abbr">{l.abbreviation ?? '—'}</span>
                <span className="lvname">{l.label['it-IT'] ?? l.code}
                  {l.isSystem && <span className="chip" style={{ marginLeft: 8 }}>sistema</span>}
                  {l.isCustomized && <span className="pill pill--brand" style={{ marginLeft: 6 }}><span className="dot" />personalizzato</span>}
                </span>
                <span className="canon">→ {l.canonical}</span>
              </div>
            ))}
        </div>
        {canManage && (
          <div style={{ padding: '12px 16px' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}><Plus size={16} /> Aggiungi etichetta</button>
          </div>
        )}
      </div>
      <p className="faint" style={{ fontSize: 13, color: 'var(--ink-faint)' }}>
        Le etichette sono <b>configurabili</b> (nome, colore, sigla, ordine). Anche le voci di <b>sistema</b> sono
        personalizzabili: la tua modifica crea un <b>override</b> della tua azienda (le voci di sistema non si eliminano;
        “Ripristina” riporta al default). La logica gira sullo <b>stato canonico</b>: cambi solo come lo vedi.
      </p>

      {editing !== undefined && (
        <LabelDrawer
          category={cat} canonicals={canonicals} editing={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); void reload(); }}
          onDelete={editing && !editing.isSystem ? () => { const e = editing; setEditing(undefined); setConfirm(e); } : undefined}
          onReset={editing?.isSystem && editing.isCustomized ? () => { const e = editing; setEditing(undefined); void doReset(e); } : undefined}
          toast={toast}
        />
      )}
      <ConfirmDialog open={!!confirm} danger title="Eliminare l'etichetta?"
        message={`“${confirm?.label['it-IT'] ?? confirm?.code}” verrà rimossa.`}
        confirmLabel="Elimina" busy={busy} onConfirm={doDelete} onCancel={() => setConfirm(null)} />
    </>
  );
}

function LabelDrawer({ category, canonicals, editing, onClose, onSaved, onDelete, onReset, toast }: {
  category: string; canonicals: string[]; editing: LookupDto | null;
  onClose: () => void; onSaved: () => void; onDelete?: () => void; onReset?: () => void; toast: (m: string, t?: 'error') => void;
}) {
  const [v, setV] = useState<Record<string, unknown>>(() => ({
    canonical: editing?.canonical ?? canonicals[0] ?? '',
    code: editing?.code ?? '',
    labelIt: editing?.label['it-IT'] ?? '',
    abbreviation: editing?.abbreviation ?? '',
    colorToken: editing?.colorToken ?? 'neutral',
    sequence: editing?.sequence ?? 0,
    isDefault: editing?.isDefault ?? false,
  }));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isSystemEdit = !!editing?.isSystem;
  const fields: RenderableField[] = [
    ...(editing ? [] : [
      { key: 'canonical', label: 'Stato canonico', dataType: 'select' as const, required: true, options: canonicals.map((c) => ({ value: c, label: { 'it-IT': c } })) },
      { key: 'code', label: 'Codice', dataType: 'text' as const, required: true },
    ]),
    { key: 'labelIt', label: 'Etichetta (IT)', dataType: 'text', required: true },
    { key: 'abbreviation', label: 'Sigla', dataType: 'text' },
    { key: 'sequence', label: 'Ordine', dataType: 'integer' },
    // "Default della categoria" non si applica alle voci di sistema (override solo estetico)
    ...(isSystemEdit ? [] : [{ key: 'isDefault', label: 'Default della categoria', dataType: 'boolean' as const }]),
  ];

  async function submit() {
    const errs: Record<string, string> = {};
    if (!String(v.labelIt ?? '').trim()) errs.labelIt = 'Campo obbligatorio';
    if (!editing && !String(v.code ?? '').trim()) errs.code = 'Campo obbligatorio';
    if (!editing && !String(v.canonical ?? '').trim()) errs.canonical = 'Campo obbligatorio';
    setErrors(errs); if (Object.keys(errs).length) return;
    setBusy(true);
    const common = { label: { 'it-IT': v.labelIt }, abbreviation: (v.abbreviation as string) || null, colorToken: (v.colorToken as string) || null, sequence: v.sequence ?? 0, isDefault: !!v.isDefault };
    try {
      if (editing?.isSystem) await mutate('PUT', `/lookups/${editing.id}/override`, common); // personalizza voce di sistema
      else if (editing) await mutate('PATCH', `/lookups/${editing.id}`, common);
      else await mutate('POST', '/lookups', { category, canonical: v.canonical, code: v.code, ...common });
      toast(editing ? 'Etichetta aggiornata' : 'Etichetta creata');
      onSaved();
    } catch (e) {
      toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message, 'error');
    } finally { setBusy(false); }
  }

  return (
    <Drawer open title={editing ? 'Modifica etichetta' : 'Nuova etichetta'} onClose={onClose}
      footer={<>
        {onDelete && <button className="btn btn-ghost" onClick={onDelete} disabled={busy} style={{ color: 'var(--danger)', marginRight: 'auto' }}><Trash2 size={15} /> Elimina</button>}
        {onReset && <button className="btn btn-ghost" onClick={onReset} disabled={busy} style={{ marginRight: 'auto' }}><RotateCcw size={15} /> Ripristina default</button>}
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Annulla</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{editing ? 'Salva' : 'Crea'}</button>
      </>}>
      <div className="form-group">
        {fields.map((f) => <Field key={f.key} field={f} value={v[f.key]} error={errors[f.key]} onChange={(val) => setV((s) => ({ ...s, [f.key]: val }))} />)}
        <div className="field">
          <label>Colore</label>
          <ColorSwatchPicker includeSemantic value={(v.colorToken as string) ?? 'neutral'} onChange={(key) => setV((s) => ({ ...s, colorToken: key }))} />
        </div>
      </div>
    </Drawer>
  );
}
