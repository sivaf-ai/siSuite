/**
 * AttrFields — rende i campi da `field_definition` nello stile ObjectBox/bgrid
 * (label nel bordo, validazione dentro il campo). Riusabile per le schede del
 * Blocco M (company/asset/engagement/resource): una ObjectBox per group_key.
 */
import type { FieldDefinitionDto } from '@sisuite/shared';
import { fieldLabel, groupFields, GROUP_LABEL_IT } from '@sisuite/shared';
import { ObjectBox } from './ObjectPage';
import { Circle, type LucideIcon } from './icons';

const LOCALE = 'it-IT';

/** singolo campo da field_definition nello stile .bf/.bl/.bi. */
export function AttrField({ f, value, onChange, full }: {
  f: FieldDefinitionDto; value: unknown; onChange: (v: unknown) => void; full?: boolean;
}) {
  const label = fieldLabel(f.label, LOCALE, f.key);
  const ph = f.placeholder ? fieldLabel(f.placeholder, LOCALE, '') : undefined;
  const cls = `bf${full ? ' c2' : ''}`;
  const head = <span className="bl">{label}{f.required && <span className="req"> *</span>}</span>;

  switch (f.dataType) {
    case 'textarea':
      return (
        <div className={`bf c2`}>{head}
          <textarea className="bi" rows={3} value={(value as string) ?? ''} placeholder={ph}
            style={{ height: 'auto', minHeight: 70, padding: '9px 11px', alignItems: 'stretch', resize: 'vertical' }}
            onChange={(e) => onChange(e.target.value || undefined)} /></div>
      );
    case 'boolean':
      return (
        <div className={cls}>{head}
          <label className="bi" style={{ justifyContent: 'space-between', cursor: 'pointer' }}>
            {value ? 'Sì' : 'No'}
            <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /></label></div>
      );
    case 'select':
      return (
        <div className={cls}>{head}
          <select className="bi" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
            <option value="">—</option>
            {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{fieldLabel(o.label, LOCALE, o.value)}</option>)}
          </select></div>
      );
    case 'multiselect': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="bf c2">{head}
          <div className="bi" style={{ flexWrap: 'wrap', gap: 6, height: 'auto', minHeight: 38, padding: 6 }}>
            {(f.options ?? []).map((o) => {
              const on = arr.includes(o.value);
              return (
                <span key={o.value} className={`chip${on ? ' on' : ''}`} style={{ cursor: 'pointer', opacity: on ? 1 : 0.55 }}
                  onClick={() => onChange(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}>
                  {fieldLabel(o.label, LOCALE, o.value)}
                </span>
              );
            })}
          </div></div>
      );
    }
    case 'number': case 'integer': case 'money':
      return (
        <div className={cls}>{head}
          <input className="bi mono" style={{ textAlign: 'right' }} type="number" value={(value as number) ?? ''} placeholder={ph}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} /></div>
      );
    default:
      return (
        <div className={cls}>{head}
          <input className="bi" type={f.dataType === 'email' ? 'email' : f.dataType === 'url' ? 'url' : 'text'}
            value={(value as string) ?? ''} placeholder={ph}
            onChange={(e) => onChange(e.target.value || undefined)} /></div>
      );
  }
}

/** una ObjectBox per group_key (esclude i gruppi `exclude`, oppure solo `only`). */
export function AttrBoxes({ defs, attrs, setAttr, icons, only, exclude, fullKeys }: {
  defs: FieldDefinitionDto[];
  attrs: Record<string, unknown>;
  setAttr: (k: string, v: unknown) => void;
  icons?: Record<string, LucideIcon>;
  only?: string[];
  exclude?: string[];
  fullKeys?: string[];
}) {
  const groups = groupFields(defs).filter(
    (g) => (only ? only.includes(g.group) : true) && !(exclude?.includes(g.group)),
  );
  return (
    <>
      {groups.map((g) => (
        <ObjectBox key={g.group} icon={icons?.[g.group] ?? Circle} title={GROUP_LABEL_IT[g.group] ?? g.group}>
          <div className="bgrid">
            {g.fields.map((f) => (
              <AttrField key={f.key} f={f} value={attrs[f.key]} full={fullKeys?.includes(f.key)}
                onChange={(v) => setAttr(f.key, v)} />
            ))}
          </div>
        </ObjectBox>
      ))}
    </>
  );
}
