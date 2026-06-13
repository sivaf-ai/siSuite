/** Etichette / stati configurabili (lookup_value). Le righe di SISTEMA sono in
 *  sola lettura (badge). Si possono creare etichette custom su uno stato
 *  canonico esistente e rinominare/ricolorare quelle del tenant. */
import { Settings } from 'lucide-react';
import type { LookupDto } from '@sisuite/shared';
import { CrudList } from '../../ui/CrudList';

const COLOR_OPTIONS = [
  { value: 'neutral', label: { 'it-IT': 'Neutro' } },
  { value: 'info', label: { 'it-IT': 'Info' } },
  { value: 'success', label: { 'it-IT': 'Successo' } },
  { value: 'warning', label: { 'it-IT': 'Attenzione' } },
  { value: 'danger', label: { 'it-IT': 'Pericolo' } },
];

const settingsPerm = (a: 'create' | 'read' | 'update' | 'delete') => (a === 'read' ? 'settings:read' : 'settings:manage');

export function LookupsPage() {
  return (
    <CrudList<LookupDto>
      title="Etichette e stati" icon={Settings}
      endpoint="/lookups" entityKey="lookup_value" resource="settings"
      permFor={settingsPerm}
      rowLocked={(r) => !!r.isSystem}
      noun="etichetta" createLabel="Nuova etichetta"
      searchPlaceholder="Cerca per categoria, codice, etichetta…" defaultSort="category"
      columns={[
        { key: 'category', header: 'Categoria', sortable: true, render: (r) => <span className="mono">{r.category}</span> },
        { key: 'label', header: 'Etichetta', render: (r) => (
          <div><div className="cellname">{r.label['it-IT'] ?? r.code}</div><div className="cellsub">{r.canonical}</div></div>
        ) },
        { key: 'code', header: 'Codice', sortable: true, render: (r) => <span className="mono">{r.code}</span> },
        { key: 'abbreviation', header: 'Sigla', render: (r) => r.abbreviation ?? <span style={{ color: 'var(--ink-faint)' }}>—</span> },
        { key: 'colorToken', header: 'Colore', render: (r) => r.colorToken
          ? <span className="chip">{r.colorToken}</span> : <span style={{ color: 'var(--ink-faint)' }}>—</span> },
        { key: 'sequence', header: 'Ordine', sortable: true, render: (r) => r.sequence },
        { key: 'isSystem', header: '', render: (r) => r.isSystem
          ? <span className="pill" style={{ color: 'var(--ink-soft)', background: 'var(--neutral-wash)' }}>Sistema</span> : null },
      ]}
      buildForm={() => [{ group: 'Etichetta', fields: [
        { key: 'category', label: 'Categoria', dataType: 'text', required: true,
          help: "Es. activity_status, engagement_status, phase_status, priority. Deve esistere come stato canonico." },
        { key: 'canonical', label: 'Stato canonico', dataType: 'text', required: true,
          help: 'A cosa corrisponde per il sistema (es. done, planned, urgent).' },
        { key: 'code', label: 'Codice', dataType: 'text', required: true, help: 'Identificativo stabile, univoco nella categoria.' },
        { key: 'labelIt', label: 'Etichetta (IT)', dataType: 'text', required: true },
        { key: 'abbreviation', label: 'Sigla', dataType: 'text' },
        { key: 'colorToken', label: 'Colore', dataType: 'select', options: COLOR_OPTIONS },
        { key: 'sequence', label: 'Ordine', dataType: 'integer' },
        { key: 'isDefault', label: 'Default della categoria', dataType: 'boolean' },
      ] }]}
      toFormInitial={(r) => ({
        category: r.category, canonical: r.canonical, code: r.code,
        labelIt: r.label['it-IT'] ?? '', abbreviation: r.abbreviation ?? '',
        colorToken: r.colorToken ?? '', sequence: r.sequence, isDefault: r.isDefault,
      })}
      toBody={(v, isEdit) => isEdit
        ? {
          label: { 'it-IT': v.labelIt },
          abbreviation: (v.abbreviation as string) || null,
          colorToken: (v.colorToken as string) || null,
          sequence: v.sequence ?? 0,
          isDefault: v.isDefault ?? false,
        }
        : {
          category: v.category, canonical: v.canonical, code: v.code,
          label: { 'it-IT': v.labelIt },
          abbreviation: (v.abbreviation as string) || null,
          colorToken: (v.colorToken as string) || null,
          sequence: v.sequence ?? 0,
          isDefault: v.isDefault ?? false,
        }}
    />
  );
}
