/** WorkingHoursEditor — editor orari settimanali a INTERVALLI con selettori ora
 *  (type=time, passi di 15') invece del testo libero (parte 8 §3). Per ogni
 *  giorno: righe-intervallo (inizio–fine) con aggiungi/rimuovi e validazione
 *  (fine > inizio, niente sovrapposizioni). Usato in Impostazioni › Generale
 *  (orario azienda) e nel Dettaglio Risorsa (orario per-risorsa, mock 20). */
import { Plus, X } from 'lucide-react';

export type WH = Record<string, [string, string][]>;
const DAYS: [string, string][] = [
  ['mon', 'Lunedì'], ['tue', 'Martedì'], ['wed', 'Mercoledì'], ['thu', 'Giovedì'],
  ['fri', 'Venerdì'], ['sat', 'Sabato'], ['sun', 'Domenica'],
];

/** Errore di un giorno, o null se valido. */
export function intervalError(iv: [string, string][]): string | null {
  const full = iv.filter(([a, b]) => a && b);
  for (const [a, b] of full) if (a >= b) return 'La fine deve essere dopo l\'inizio.';
  const sorted = [...full].sort((x, y) => x[0].localeCompare(y[0]));
  for (let i = 1; i < sorted.length; i++) if (sorted[i]![0] < sorted[i - 1]![1]) return 'Intervalli sovrapposti.';
  return null;
}
/** true se almeno un giorno ha un errore (per bloccare il salvataggio). */
export function whHasErrors(wh: WH): boolean {
  return DAYS.some(([k]) => intervalError(wh[k] ?? []) !== null);
}

export function WorkingHoursEditor({ value, onChange, disabled }:
  { value: WH; onChange: (wh: WH) => void; disabled?: boolean }) {
  const setDay = (day: string, iv: [string, string][]) => onChange({ ...value, [day]: iv });
  return (
    <div className="wh-editor">
      {DAYS.map(([k, label]) => {
        const iv = value[k] ?? [];
        const err = intervalError(iv);
        return (
          <div className="wh-day" key={k}>
            <div className="wh-day-h">
              <span className="wh-label">{label}</span>
              <button type="button" className="wh-add" disabled={disabled}
                onClick={() => setDay(k, [...iv, ['09:00', '18:00']])}><Plus size={14} />Aggiungi intervallo</button>
            </div>
            {iv.length === 0 && <span className="wh-closed">Chiuso</span>}
            {iv.map(([a, b], idx) => (
              <div className="wh-row" key={idx}>
                <input type="time" step={900} className="txt wh-time" value={a} disabled={disabled}
                  onChange={(e) => { const n = iv.slice() as [string, string][]; n[idx] = [e.target.value, b]; setDay(k, n); }} />
                <span className="wh-sep">–</span>
                <input type="time" step={900} className="txt wh-time" value={b} disabled={disabled}
                  onChange={(e) => { const n = iv.slice() as [string, string][]; n[idx] = [a, e.target.value]; setDay(k, n); }} />
                <button type="button" className="wh-del" aria-label="Rimuovi intervallo" disabled={disabled}
                  onClick={() => setDay(k, iv.filter((_, j) => j !== idx))}><X size={15} /></button>
              </div>
            ))}
            {err && <div className="wh-err">{err}</div>}
          </div>
        );
      })}
    </div>
  );
}
