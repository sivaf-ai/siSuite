/**
 * UnitSelect — select dell'unità di misura dal catalogo anagrafico (/units).
 * Salva il `code`. Se il valore corrente non è (più) in catalogo, lo mostra
 * comunque come opzione di fallback così non si perde. Stile standard `.bi`.
 */
import type { UnitDto } from '@sisuite/shared';

export function UnitSelect({ value, onChange, units, disabled }: {
  value: string | null | undefined;
  onChange: (code: string) => void;
  units: UnitDto[];
  disabled?: boolean;
}) {
  const known = units.some((u) => u.code === value);
  return (
    <select className="bi" style={{ minHeight: 32 }} value={value ?? ''} disabled={disabled}
      onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {value && !known && <option value={value}>{value}</option>}
      {units.map((u) => <option key={u.id} value={u.code}>{u.code} — {u.name}</option>)}
    </select>
  );
}
