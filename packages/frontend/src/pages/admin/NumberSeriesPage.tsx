/** Numeratori documenti (number_series). Ogni identificativo sequenziale
 *  visibile (commessa, ricevuta, fattura…) passa da qui. Placeholder del
 *  formato: {YYYY} {YY} {MM} {SEQ:n} — es. FAT{YYYY}{SEQ:4} → FAT20260012. */
import { Hash } from 'lucide-react';
import type { NumberSeriesDto } from '@sisuite/shared';
import { CrudList } from '../../ui/CrudList';

const RESET_LABEL: Record<string, string> = { never: 'Mai', yearly: 'Annuale', monthly: 'Mensile' };
const settingsPerm = (a: 'create' | 'read' | 'update' | 'delete') => (a === 'read' ? 'settings:read' : 'settings:manage');

export function NumberSeriesPage() {
  return (
    <CrudList<NumberSeriesDto>
      title="Numeratori" icon={Hash}
      endpoint="/number-series" entityKey="number_series" resource="settings"
      permFor={settingsPerm}
      noun="numeratore" createLabel="Nuovo numeratore"
      searchPlaceholder="Cerca per chiave…" defaultSort="key"
      columns={[
        { key: 'key', header: 'Chiave', sortable: true, render: (r) => <span className="cellname mono">{r.key}</span> },
        { key: 'format', header: 'Formato', sortable: true, render: (r) => <span className="mono">{r.format}</span> },
        { key: 'resetPeriod', header: 'Reset', render: (r) => <span className="chip">{RESET_LABEL[r.resetPeriod] ?? r.resetPeriod}</span> },
        { key: 'currentPeriod', header: 'Periodo', render: (r) => r.currentPeriod || <span style={{ color: 'var(--ink-faint)' }}>—</span> },
        { key: 'lastNumber', header: 'Ultimo n.', render: (r) => <span className="mono">{r.lastNumber}</span> },
      ]}
      buildForm={(_fk, isEdit) => [{ group: 'Numeratore', fields: [
        { key: 'key', label: 'Chiave', dataType: 'text', required: !isEdit,
          help: isEdit ? 'La chiave non è modificabile.' : 'Es. engagement, receipt, invoice, ddt.' },
        { key: 'format', label: 'Formato', dataType: 'text', required: true,
          help: 'Placeholder: {YYYY} {YY} {MM} {SEQ:n}. Es. {YYYY}-{SEQ:4} → 2026-0042.' },
        { key: 'resetPeriod', label: 'Reset', dataType: 'select', required: true, options: [
          { value: 'never', label: { 'it-IT': 'Mai' } },
          { value: 'yearly', label: { 'it-IT': 'Annuale' } },
          { value: 'monthly', label: { 'it-IT': 'Mensile' } },
        ] },
      ] }]}
      toFormInitial={(r) => ({ key: r.key, format: r.format, resetPeriod: r.resetPeriod })}
      toBody={(v, isEdit) => isEdit
        ? { format: v.format, resetPeriod: v.resetPeriod }
        : { key: v.key, format: v.format, resetPeriod: v.resetPeriod }}
    />
  );
}
