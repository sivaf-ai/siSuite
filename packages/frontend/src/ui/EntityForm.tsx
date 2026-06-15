import { useMemo, useState, type ReactNode } from 'react';
import {
  buildAttributesSchema, groupFields, fieldLabel, GROUP_LABEL_IT,
  type FieldDefinitionDto,
} from '@sisuite/shared';
import { Building2, Receipt, MapPin, StickyNote, Wrench, Tag, type LucideIcon } from 'lucide-react';
import { useApi } from '../api/hooks';
import { Field, type RenderableField } from './Field';
import { FormCard } from './FormPage';

export interface TypedGroup { group: string; fields: RenderableField[]; icon?: LucideIcon }

const LOCALE = 'it-IT';

/** icona lucide per i gruppi noti di field_definition (mock 33). */
const GROUP_ICON: Record<string, LucideIcon> = {
  registry: MapPin, fiscal: Receipt, notes: StickyNote, technical: Wrench, contract: Tag, catalog: Tag,
};

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

export function EntityForm({ entityKey, typedGroups, initial, busy, submitLabel, onSubmit, onCancel, layout = 'drawer', extraSections, barLeft, groupLabel }: {
  entityKey: string;
  typedGroups: TypedGroup[];
  initial?: Record<string, unknown> & { attributes?: Record<string, unknown> };
  busy?: boolean;
  submitLabel?: string;
  onSubmit: (values: Record<string, unknown>) => void;
  onCancel: () => void;
  /** 'drawer' = form breve (.form-group/.field); 'page' = pagina-form v5 (.formcard/.fgrid, mock 33). */
  layout?: 'drawer' | 'page';
  /** sezioni extra (es. contatti) rese prima della barra azioni — solo layout 'page'. */
  extraSections?: ReactNode;
  /** testo a sinistra nella barra azioni (es. "Salvato 2 min fa") — solo layout 'page'. */
  barLeft?: ReactNode;
  /** override etichetta di un gruppo field_definition (es. registry → "Indirizzo e recapiti"). */
  groupLabel?: (key: string) => string | undefined;
}) {
  const labelFor = (g: string) => groupLabel?.(g) ?? GROUP_LABEL_IT[g] ?? g;
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

  // ── layout PAGINA-FORM (mock 33) ─────────────────────────────────────────
  if (layout === 'page') {
    return (
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {typedGroups.map((g) => {
          const Icon = g.icon ?? Building2;
          return (
            <FormCard key={g.group} icon={<Icon />} title={g.group}>
              <div className="fgrid">
                {g.fields.map((f) => (
                  <Field key={f.key} field={f} value={top[f.key]} error={errors[f.key]} variant="page"
                    onChange={(v) => setTop((s) => ({ ...s, [f.key]: v }))} />
                ))}
              </div>
            </FormCard>
          );
        })}

        {attrGroups.map(({ group, fields }) => {
          const Icon = GROUP_ICON[group] ?? Building2;
          return (
            <FormCard key={group} icon={<Icon />} title={labelFor(group)}>
              <div className="fgrid">
                {fields.map((d) => {
                  const f = defToRenderable(d);
                  return (
                    <Field key={f.key} field={f} value={attrs[f.key]} error={errors[`attr_${f.key}`]} variant="page"
                      onChange={(v) => setAttrs((s) => ({ ...s, [f.key]: v }))} />
                  );
                })}
              </div>
            </FormCard>
          );
        })}

        {extraSections}

        <div className="formbar">
          {barLeft && <span className="left">{barLeft}</span>}
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Annulla</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{submitLabel ?? 'Salva'}</button>
        </div>
      </form>
    );
  }

  // ── layout DRAWER (default) ──────────────────────────────────────────────
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
          <div className="gh">{labelFor(group)}</div>
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
