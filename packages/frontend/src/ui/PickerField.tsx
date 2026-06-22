/**
 * PickerField — campo "scegli" che sostituisce i <select> nelle testate documenti.
 * Mostra il nome dell'elemento scelto (o un placeholder) + un bottone che apre il
 * relativo PickerDialog (CompanyPickerDialog / LocationPickerDialog). Coerente con lo
 * stile ObjectBox (.bi). In sola lettura mostra solo il nome.
 */
import { Search } from 'lucide-react';

export function PickerField({ value, placeholder = '—', onOpen, onClear, disabled }: {
  value: string | null | undefined;
  placeholder?: string;
  onOpen: () => void;
  onClear?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="bi" style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: value ? 'var(--ink)' : 'var(--ink-faint)' }}>
        {value || placeholder}
      </span>
      {!disabled && (
        <span style={{ display: 'inline-flex', gap: 6, flex: '0 0 auto' }}>
          {value && onClear && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClear} title="Rimuovi">×</button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onOpen} title="Scegli">
            <Search size={14} /> {value ? 'Cambia' : 'Scegli'}
          </button>
        </span>
      )}
    </div>
  );
}
