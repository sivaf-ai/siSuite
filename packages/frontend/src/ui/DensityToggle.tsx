/**
 * DensityToggle — segmented Compatta / Comoda / Spaziosa (standard 1).
 * Setta data-density e salva per utente (DensityContext).
 */
import { useDensity, type Density } from '../theme/DensityContext';

const OPTS: { value: Density; label: string }[] = [
  { value: 'compact', label: 'Compatta' },
  { value: 'comfortable', label: 'Comoda' },
  { value: 'spacious', label: 'Spaziosa' },
];

export function DensityToggle() {
  const { density, setDensity } = useDensity();
  return (
    <div className="seg dens" role="group" aria-label="Densità">
      {OPTS.map((o) => (
        <button key={o.value} className={density === o.value ? 'on' : ''}
          aria-pressed={density === o.value} onClick={() => setDensity(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
