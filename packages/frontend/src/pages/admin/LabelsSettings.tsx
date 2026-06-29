/** LabelsSettings — "Stati & etichette" fedele al mock 15: segmented per categoria,
 *  righe lv-row (pallino colore + sigla + nome + canonico), aggiungi/modifica/elimina.
 *  Le righe di SISTEMA sono in sola lettura. Riusa /lookups (settings:manage). */
import { useState } from 'react';
import { Plus, Trash2, GripVertical, RotateCcw } from 'lucide-react';
import type { LookupDto } from '@sisuite/shared';
import { Loading, ErrorBox } from '../../components/Page';
import { Modal } from '../../ui/Modal';
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
  { key: 'asset_kind', label: 'Tipi di asset' },
  { key: 'skill_category', label: 'Categorie competenze' },
  { key: 'site_kind', label: 'Tipi di sito/località' },
  { key: 'stock_location_kind', label: 'Tipi di ubicazione' },
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
        <LabelModal
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

function LabelModal({ category, canonicals, editing, onClose, onSaved, onDelete, onReset, toast }: {
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
  const set = (p: Record<string, unknown>) => setV((s) => ({ ...s, ...p }));

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
    <Modal open title={editing ? 'Modifica etichetta' : 'Nuova etichetta'} size="md" onClose={onClose}
      footer={<>
        {onDelete && <button className="btn btn-ghost" onClick={onDelete} disabled={busy} style={{ color: 'var(--danger)', marginRight: 'auto' }}><Trash2 size={15} /> Elimina</button>}
        {onReset && <button className="btn btn-ghost" onClick={onReset} disabled={busy} style={{ marginRight: 'auto' }}><RotateCcw size={15} /> Ripristina default</button>}
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Annulla</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{editing ? 'Salva' : 'Crea'}</button>
      </>}>
      <div className="dsx">
        <div className="bgrid">
          {!editing && (<>
            <div className="bf c2"><span className="bl">Stato canonico <span className="req">*</span></span>
              <select className="bi" value={String(v.canonical ?? '')} onChange={(e) => set({ canonical: e.target.value })}
                style={errors.canonical ? { borderColor: 'var(--danger)' } : undefined}>
                {canonicals.map((c) => <option key={c} value={c}>{c}</option>)}
              </select></div>
            <div className="bf c2"><span className="bl">Codice <span className="req">*</span></span>
              <input className="bi mono" value={String(v.code ?? '')} onChange={(e) => set({ code: e.target.value })}
                style={errors.code ? { borderColor: 'var(--danger)' } : undefined} placeholder="es. pianificata" /></div>
          </>)}
          <div className="bf c4"><span className="bl">Etichetta (IT) <span className="req">*</span></span>
            <input className="bi" autoFocus value={String(v.labelIt ?? '')} onChange={(e) => set({ labelIt: e.target.value })}
              style={errors.labelIt ? { borderColor: 'var(--danger)' } : undefined} placeholder="es. Pianificata" /></div>
          {/* Sigla + Ordine (corti) sulla stessa riga, + eventuale Default */}
          <div className="bf c1"><span className="bl">Sigla</span>
            <input className="bi" value={String(v.abbreviation ?? '')} onChange={(e) => set({ abbreviation: e.target.value })} placeholder="PIA" /></div>
          <div className="bf c1"><span className="bl">Ordine</span>
            <input className="bi" type="number" value={Number(v.sequence ?? 0)} onChange={(e) => set({ sequence: Number(e.target.value) })} /></div>
          {!isSystemEdit && (
            <div className="bf c2"><span className="bl">Default categoria</span>
              <select className="bi" value={v.isDefault ? '1' : '0'} onChange={(e) => set({ isDefault: e.target.value === '1' })}>
                <option value="0">No</option><option value="1">Sì</option></select></div>
          )}
          <div className="bf c4"><span className="bl">Colore</span>
            <ColorSwatchPicker includeSemantic value={(v.colorToken as string) ?? 'neutral'} onChange={(key) => set({ colorToken: key })} /></div>
        </div>
      </div>
    </Modal>
  );
}
