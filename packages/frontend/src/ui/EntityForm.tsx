import { useMemo, useState } from 'react';
import {
  buildAttributesSchema, groupFields, fieldLabel, GROUP_LABEL_IT,
  type FieldDefinitionDto,
} from '@sisuite/shared';
import { useApi } from '../api/hooks';
import { Field, type RenderableField } from './Field';

export interface TypedGroup { group: string; fields: RenderableField[] }

const LOCALE = 'it-IT';

function defToRenderable(d: FieldDefinitionDto): RenderableField {
  return {
    key: d.key,
    label: fieldLabel(d.label, LOCALE, d.key),
    dataType: d.dataType,
    required: d.required,
    options: d.options ?? undefined,
    unit: d.unit,
    help: d.help ? fieldLabel(d.help, LOCALE, '') : undefined,
    placeholder: d.placeholder ? fieldLabel(d.placeholder, LOCALE, '') : undefined,
  };
}

export function EntityForm({ entityKey, typedGroups, initial, busy, submitLabel, onSubmit, onCancel }: {
  entityKey: string;
  typedGroups: TypedGroup[];
  initial?: Record<string, unknown> & { attributes?: Record<string, unknown> };
  busy?: boolean;
  submitLabel?: string;
  onSubmit: (values: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const { data } = useApi<{ items: FieldDefinitionDto[] }>(`/field-definitions?entity=${entityKey}`);
  const defs = data?.items ?? [];
  const attrGroups = useMemo(() => groupFields(defs), [defs]);

  const [top, setTop] = useState<Record<string, unknown>>(() => {
    const o: Record<string, unknown> = {};
    for (const g of typedGroups) for (const f of g.fields) o[f.key] = (initial as Record<string, unknown> | undefined)?.[f.key];
    return o;
  });
  const [attrs, setAttrs] = useState<Record<string, unknown>>(() => ({ ...(initial?.attributes ?? {}) }));
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit() {
    const errs: Record<string, string> = {};
    for (const g of typedGroups) for (const f of g.fields) {
      if (f.required && (top[f.key] == null || top[f.key] === '')) errs[f.key] = 'Campo obbligatorio';
    }
    const cleanAttrs: Record<string, unknown> = {};
    for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)) cleanAttrs[k] = v;
    }
    const res = buildAttributesSchema(defs).safeParse(cleanAttrs);
    if (!res.success) {
      for (const issue of res.error.issues) errs[`attr_${issue.path[0]}`] = issue.message === 'Invalid' ? 'Valore non valido' : issue.message;
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSubmit({ ...top, attributes: cleanAttrs });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {typedGroups.map((g) => (
        <div className="form-group" key={g.group}>
          {typedGroups.length > 1 && <div className="gh">{g.group}</div>}
          {g.fields.map((f) => (
            <Field key={f.key} field={f} value={top[f.key]} error={errors[f.key]}
              onChange={(v) => setTop((s) => ({ ...s, [f.key]: v }))} />
          ))}
        </div>
      ))}

      {attrGroups.map(({ group, fields }) => (
        <div className="form-group" key={group}>
          <div className="gh">{GROUP_LABEL_IT[group] ?? group}</div>
          {fields.map((d) => {
            const f = defToRenderable(d);
            return (
              <Field key={f.key} field={f} value={attrs[f.key]} error={errors[`attr_${f.key}`]}
                onChange={(v) => setAttrs((s) => ({ ...s, [f.key]: v }))} />
            );
          })}
        </div>
      ))}

      <div className="drawer-foot" style={{ position: 'sticky', bottom: 0, margin: '0 -22px -20px', borderRadius: 0 }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Annulla</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{submitLabel ?? 'Salva'}</button>
      </div>
    </form>
  );
}
