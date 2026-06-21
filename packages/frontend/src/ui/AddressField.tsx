/**
 * AddressField — indirizzo strutturato COUNTRY-DRIVEN (SPEC v1.1, criterio A).
 * Carica le field_definition entity='address' filtrate per `country` (groupKey
 * 'address') e rende un input per ciascuna, in stile ObjectBox/AttrField (.bf/.bl/.bi).
 * Salva un oggetto piatto con chiave interna `country` (es. {country:'IT', street, civic, cap, ...}).
 * Fallback: se non ci sono def per il country, mostra un input generico 'street'.
 */
import { useMemo } from 'react';
import type { FieldDefinitionDto } from '@sisuite/shared';
import { fieldLabel } from '@sisuite/shared';
import { ObjectBox } from './ObjectPage';
import { useApi } from '../api/hooks';
import { MapPin } from 'lucide-react';

const LOCALE = 'it-IT';

export function AddressField({ label, country, value, onChange }: {
  label: string;
  country: string;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const { data } = useApi<{ items: FieldDefinitionDto[] }>('/field-definitions?entity=address');
  const defs = useMemo(
    () => (data?.items ?? [])
      .filter((d) => d.country === country)
      .sort((a, b) => a.sequence - b.sequence),
    [data, country],
  );

  const set = (k: string, v: unknown) =>
    onChange({ ...value, country, [k]: v === '' || v == null ? undefined : v });

  return (
    <ObjectBox icon={MapPin} title={label} subtitle={country}>
      <div className="bgrid">
        {defs.length === 0 ? (
          <div className="bf c2">
            <span className="bl">Indirizzo</span>
            <input className="bi" value={(value.street as string) ?? ''} placeholder="Via / indirizzo"
              onChange={(e) => set('street', e.target.value)} />
          </div>
        ) : (
          defs.map((d) => {
            const lbl = fieldLabel(d.label, LOCALE, d.key);
            const ph = d.placeholder ? fieldLabel(d.placeholder, LOCALE, '') : undefined;
            // i campi indirizzo lunghi (via/calle) occupano 2 colonne
            const full = d.key === 'street' || d.key === 'calle' || d.dataType === 'textarea';
            const head = <span className="bl">{lbl}{d.required && <span className="req"> *</span>}</span>;
            if (d.dataType === 'select') {
              return (
                <div className={`bf${full ? ' c2' : ''}`} key={d.key}>{head}
                  <select className="bi" value={(value[d.key] as string) ?? ''} onChange={(e) => set(d.key, e.target.value)}>
                    <option value="">—</option>
                    {(d.options ?? []).map((o) => <option key={o.value} value={o.value}>{fieldLabel(o.label, LOCALE, o.value)}</option>)}
                  </select>
                </div>
              );
            }
            return (
              <div className={`bf${full ? ' c2' : ''}`} key={d.key}>{head}
                <input className="bi" type={d.dataType === 'number' || d.dataType === 'integer' ? 'number' : 'text'}
                  value={(value[d.key] as string) ?? ''} placeholder={ph}
                  onChange={(e) => set(d.key, e.target.value)} />
              </div>
            );
          })
        )}
      </div>
    </ObjectBox>
  );
}
