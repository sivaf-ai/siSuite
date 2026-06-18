/**
 * ExportDialog — funzione STANDARD di export delle liste. Apre il FieldPicker
 * (campi riordinabili, tutti selezionati di default) e gestisce i PRESET per-utente
 * (Salva con nome → tabella export_preset). OK esporta i campi scelti, nell'ordine.
 */
import { useState } from 'react';
import { FieldPicker, type FieldOpt } from './FieldPicker';
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

  function applyPreset(id: string) {
    const p = presets.data?.items.find((x) => x.id === id);
    if (!p) return;
    setValue(p.fields.filter((k) => fields.some((f) => f.key === k)));
    setPickerKey((k) => k + 1);
  }

  async function save(orderedKeys: string[]) {
    const name = window.prompt('Nome per questo export (es. "Anagrafica base"):');
    if (!name || !name.trim()) return;
    try {
      await mutate('POST', '/export-presets', { entity, name: name.trim(), fields: orderedKeys });
      toast('Export salvato');
      void presets.reload();
    } catch (e) { toast((e as Error).message || 'Errore salvataggio export', 'error'); }
  }

  const topExtra = (presets.data?.items.length ?? 0) > 0 ? (
    <div className="field" style={{ margin: 0 }}>
      <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-soft)' }}>Preset salvati</label>
      <select className="bi" defaultValue="" onChange={(e) => { if (e.target.value) applyPreset(e.target.value); }}>
        <option value="">— scegli un preset salvato —</option>
        {presets.data!.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  ) : null;

  return (
    <FieldPicker key={pickerKey} open={open} title="Esporta — scegli e ordina i campi"
      fields={fields} value={value} confirmLabel="Esporta (OK)"
      onCancel={onCancel} onConfirm={onExport} onSave={save} topExtra={topExtra} />
  );
}
