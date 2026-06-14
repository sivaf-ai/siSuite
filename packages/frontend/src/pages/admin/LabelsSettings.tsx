/** LabelsSettings — "Stati & etichette" fedele al mock 15: segmented per categoria,
 *  righe lv-row (pallino colore + sigla + nome + canonico), aggiungi/modifica/elimina.
 *  Le righe di SISTEMA sono in sola lettura. Riusa /lookups (settings:manage). */
import { useState } from 'react';
import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react';
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
  { key: 'activity_status', label: 'Attività' },
  { key: 'engagement_status', label: 'Commessa' },
  { key: 'phase_status', label: 'Fase' },
  { key: 'priority', label: 'Priorità' },
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

  return (
    <>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="ph">
          <h3>Stato {CATS.find((c) => c.key === cat)?.label.toLowerCase()}</h3>
          <div className="seg">
            {CATS.map((c) => <button key={c.key} className={cat === c.key ? 'on' : ''} onClick={() => setCat(c.key)}>{c.label}</button>)}
          </div>
        </div>
        <div className="pb" style={{ padding: 0 }}>
          {loading ? <Loading /> : error ? <ErrorBox message={error} /> : rows.length === 0
            ? <div style={{ padding: 20, color: 'var(--ink-soft)' }}>Nessuna etichetta in questa categoria.</div>
            : rows.map((l) => (
              <div className="lv-row" key={l.id}>
                <span className="drag" style={{ color: 'var(--ink-faint)' }}><GripVertical size={15} /></span>
                <span className="swatch" style={{ background: swatchColor(l.colorToken) }} />
                <span className="abbr">{l.abbreviation ?? '—'}</span>
                <span className="lvname">{l.label['it-IT'] ?? l.code}{l.isSystem && <span className="chip" style={{ marginLeft: 8 }}>sistema</span>}</span>
                <span className="canon">→ {l.canonical}</span>
                {canManage && !l.isSystem && (
                  <span className="lv-acts">
                    <button className="act-icon" title="Modifica" onClick={() => setEditing(l)}><Pencil size={15} /></button>
                    <button className="act-icon danger" title="Elimina" onClick={() => setConfirm(l)}><Trash2 size={15} /></button>
                  </span>
                )}
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
        Le etichette sono <b>configurabili</b> (nome, colore, sigla, ordine) ma ognuna è mappata a uno <b>stato canonico</b> di sistema:
        la logica gira sul canonico, l'utente vede l'etichetta. Più etichette possono puntare allo stesso canonico.
      </p>

      {editing !== undefined && (
        <LabelDrawer
          category={cat} canonicals={canonicals} editing={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); void reload(); }}
          toast={toast}
        />
      )}
      <ConfirmDialog open={!!confirm} danger title="Eliminare l'etichetta?"
        message={`“${confirm?.label['it-IT'] ?? confirm?.code}” verrà rimossa.`}
        confirmLabel="Elimina" busy={busy} onConfirm={doDelete} onCancel={() => setConfirm(null)} />
    </>
  );
}

function LabelDrawer({ category, canonicals, editing, onClose, onSaved, toast }: {
  category: string; canonicals: string[]; editing: LookupDto | null;
  onClose: () => void; onSaved: () => void; toast: (m: string, t?: 'error') => void;
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

  const fields: RenderableField[] = [
    ...(editing ? [] : [
      { key: 'canonical', label: 'Stato canonico', dataType: 'select' as const, required: true, options: canonicals.map((c) => ({ value: c, label: { 'it-IT': c } })) },
      { key: 'code', label: 'Codice', dataType: 'text' as const, required: true },
    ]),
    { key: 'labelIt', label: 'Etichetta (IT)', dataType: 'text', required: true },
    { key: 'abbreviation', label: 'Sigla', dataType: 'text' },
    { key: 'sequence', label: 'Ordine', dataType: 'integer' },
    { key: 'isDefault', label: 'Default della categoria', dataType: 'boolean' },
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
      if (editing) await mutate('PATCH', `/lookups/${editing.id}`, common);
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
