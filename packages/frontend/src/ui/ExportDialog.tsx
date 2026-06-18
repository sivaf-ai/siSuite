/**
 * ExportDialog — funzione STANDARD di export delle liste. Mostra TUTTI i campi
 * dell'entità (non solo le colonne a video), riordinabili, tutti selezionati di default.
 * Gestisce i PRESET per-utente: SALVA con nome (popup in-app) e CARICA da elenco
 * (precompila campi+ordine come salvati). OK esporta i campi scelti, nell'ordine.
 */
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { FieldPicker, type FieldOpt } from './FieldPicker';
import { PromptDialog } from './PromptDialog';
import { useApi, mutate } from '../api/hooks';
import { useToast } from './Toast';

interface Preset { id: string; name: string; fields: string[] }

export function ExportDialog({ open, entity, fields, onCancel, onExport }: {
  open: boolean; entity: string; fields: FieldOpt[];
  onCancel: () => void; onExport: (orderedKeys: string[]) => void;
}) {
  const toast = useToast();
  const presets = useApi<{ items: Preset[] }>(open ? `/export-presets?entity=${encodeURIComponent(entity)}` : null);
  const [value, setValue] = useState<string[]>(fields.map((f) => f.key));
  const [pickerKey, setPickerKey] = useState(0);
  const [nameOpen, setNameOpen] = useState(false);
  const [pending, setPending] = useState<string[]>([]);

  function applyPreset(p: Preset) {
    setValue(p.fields.filter((k) => fields.some((f) => f.key === k)));
    setPickerKey((k) => k + 1);
    toast(`Caricato «${p.name}»`);
  }

  function startSave(orderedKeys: string[]) { setPending(orderedKeys); setNameOpen(true); }
  async function confirmSave(name: string) {
    setNameOpen(false);
    try {
      await mutate('POST', '/export-presets', { entity, name, fields: pending });
      toast('Export salvato'); void presets.reload();
    } catch (e) { toast((e as Error).message || 'Errore salvataggio export', 'error'); }
  }
  async function delPreset(id: string) {
    try { await mutate('DELETE', `/export-presets/${id}`); void presets.reload(); } catch { /* ignore */ }
  }

  const items = presets.data?.items ?? [];
  const topExtra = items.length > 0 ? (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 6 }}>Carica un export salvato</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {items.map((p) => (
          <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <button onClick={() => applyPreset(p)} style={{ background: 'var(--neutral-wash)', color: 'var(--ink-2)', borderRadius: 'var(--r-pill)', padding: '5px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>{p.name}</button>
            <button title="Elimina" onClick={() => void delPreset(p.id)} style={{ background: 'none', color: 'var(--ink-faint)', cursor: 'pointer', display: 'inline-flex' }}><Trash2 size={13} /></button>
          </span>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <>
      <FieldPicker key={pickerKey} open={open && !nameOpen} title="Esporta — scegli e ordina i campi"
        fields={fields} value={value} confirmLabel="Esporta (OK)"
        onCancel={onCancel} onConfirm={onExport} onSave={startSave} topExtra={topExtra} />
      <PromptDialog open={nameOpen} title="Salva questo export"
        message="Dai un nome alla selezione di campi: potrai ricaricarla quando vuoi."
        label="Nome export" placeholder='es. "Anagrafica completa"'
        confirmLabel="Salva" onConfirm={confirmSave} onCancel={() => setNameOpen(false)} />
    </>
  );
}
