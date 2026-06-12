import type { FieldDataType, FieldOption } from '@sisuite/shared';
import { fieldLabel } from '@sisuite/shared';

export type WidgetType = FieldDataType | 'fk' | 'roles';

export interface RenderableField {
  key: string;
  label: string;
  dataType: WidgetType;
  required?: boolean;
  options?: FieldOption[];     // select/multiselect
  fkOptions?: { id: string; label: string }[]; // fk
  unit?: string | null;
  help?: string;
  placeholder?: string;
}

const LOCALE = 'it-IT';

export function Field({ field, value, onChange, error }:
  { field: RenderableField; value: unknown; onChange: (v: unknown) => void; error?: string }) {
  const id = `f_${field.key}`;
  const label = (
    <label htmlFor={id}>{field.label}{field.required && <span className="req">*</span>}</label>
  );

  function control() {
    switch (field.dataType) {
      case 'textarea':
        return <textarea id={id} className="txt" value={(value as string) ?? ''} placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)} />;
      case 'boolean':
        return (
          <div className={`switch${value ? ' on' : ''}`} onClick={() => onChange(!value)}>
            <span className="track"><span className="knob" /></span>
            <span style={{ fontSize: 14, color: 'var(--ink-soft)' }}>{value ? 'Sì' : 'No'}</span>
          </div>
        );
      case 'number': case 'money': case 'integer':
        return (
          <div className="with-unit">
            <input id={id} className="txt" type="number" value={(value as number | string) ?? ''} placeholder={field.placeholder}
              onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
            {field.unit && <span className="unit">{field.unit}</span>}
          </div>
        );
      case 'date':
        return <input id={id} className="txt" type="date" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || undefined)} />;
      case 'select':
        return (
          <select id={id} className="txt" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
            <option value="">—</option>
            {(field.options ?? []).map((o) => <option key={o.value} value={o.value}>{fieldLabel(o.label, LOCALE, o.value)}</option>)}
          </select>
        );
      case 'fk':
        return (
          <select id={id} className="txt" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
            <option value="">—</option>
            {(field.fkOptions ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        );
      case 'multiselect': case 'roles': {
        const arr = Array.isArray(value) ? (value as string[]) : [];
        const opts = field.dataType === 'roles'
          ? [{ value: 'customer', label: { 'it-IT': 'Cliente' } }, { value: 'supplier', label: { 'it-IT': 'Fornitore' } }, { value: 'partner', label: { 'it-IT': 'Partner' } }]
          : (field.options ?? []);
        const toggle = (v: string) => onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
        return (
          <div className="chips-input">
            {opts.map((o) => (
              <div key={o.value} className={`chip-toggle${arr.includes(o.value) ? ' on' : ''}`} onClick={() => toggle(o.value)}>
                {fieldLabel(o.label, LOCALE, o.value)}
              </div>
            ))}
          </div>
        );
      }
      default: // text, email, phone, url
        return <input id={id} className="txt" type={field.dataType === 'email' ? 'email' : 'text'}
          value={(value as string) ?? ''} placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)} />;
    }
  }

  return (
    <div className="field">
      {label}
      {control()}
      {field.help && !error && <div className="help">{field.help}</div>}
      {error && <div className="err">{error}</div>}
    </div>
  );
}
