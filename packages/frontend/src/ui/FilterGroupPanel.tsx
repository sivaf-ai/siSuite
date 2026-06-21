/**
 * FilterGroupPanel (PIANO motore §2.1, mockup 54_v1_3) — il Filtro "Gruppo": la scheda
 * dell'entità in modalità filtro, a tutta larghezza. Ogni campo resta identico alla scheda;
 * l'unica aggiunta è una freccettina ▾ che apre un pop-up galleggiante (operatore · valore ·
 * lega: E/O/NON/parentesi). In cima una frase in lingua che cresce in tempo reale; in fondo
 * Pulisci/Applica. Il filtro è applicato SERVER-SIDE (buildFilter, già esteso). Parentesi: 1 livello.
 */
import { useState } from 'react';
import { Filter, X, ChevronDown, SlidersHorizontal, Check, MoveRight, Eraser, Layers } from 'lucide-react';
import type { FilterCondition } from '../lib/listFilter';
import { SavedHeader } from './SavedHeader';
import { useListPresets } from './useListPresets';
import '../theme/engine.css';

export type FilterFieldType = 'text' | 'number' | 'enum' | 'date';
export interface FilterFieldMeta {
  key: string; label: string; type: FilterFieldType;
  section?: string; span?: 1 | 2;
  /** per enum: valore raw (per il filtro) + etichetta (display↔raw). */
  values?: { value: string; label: string }[];
}

type Cond = { op: string; v: string; v2: string; vals: string[]; join: 'and' | 'or'; neg: boolean; open: boolean; close: boolean };

const TEXT_OPS: [string, string][] = [['contains', 'contiene'], ['equals', 'è uguale a'], ['starts_with', 'inizia con'], ['ends_with', 'finisce con'], ['between', 'da–a'], ['empty', 'è vuoto']];
const NUM_OPS: [string, string][] = [['equals', '='], ['gt', 'maggiore di'], ['lt', 'minore di'], ['between', 'tra'], ['empty', 'è vuoto']];
const ENUM_OPS: [string, string][] = [['in', 'è uno di'], ['not_in', 'non è']];
const DATE_OPS: [string, string][] = [['date_today', 'oggi'], ['date_month', 'mese corr.'], ['date_year', 'anno corr.'], ['date_after', 'dopo il'], ['date_before', 'prima del'], ['between', 'intervallo'], ['date_in_year', "nell'anno"]];

function opsFor(t: FilterFieldType) { return t === 'enum' ? ENUM_OPS : t === 'date' ? DATE_OPS : t === 'number' ? NUM_OPS : TEXT_OPS; }
function defOp(t: FilterFieldType) { return t === 'enum' ? 'in' : t === 'date' ? 'date_year' : t === 'number' ? 'equals' : 'contains'; }
const blank = (t: FilterFieldType): Cond => ({ op: defOp(t), v: '', v2: '', vals: [], join: 'and', neg: false, open: false, close: false });

export function FilterGroupPanel({ title, presetEntity, fields, initial, onApply, onClose }: {
  title: string;
  presetEntity: string | undefined;
  fields: FilterFieldMeta[];
  initial?: FilterCondition[];
  onApply: (conditions: FilterCondition[]) => void;
  onClose: () => void;
}) {
  const presets = useListPresets(presetEntity, 'filter');
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const [st, setSt] = useState<Record<string, Cond>>(() => fromConditions(fields, initial));
  const [pop, setPop] = useState<{ key: string; top: number; left: number } | null>(null);
  const cur = (k: string) => st[k] ?? blank(byKey.get(k)!.type);
  const setCur = (k: string, patch: Partial<Cond>) => setSt((s) => ({ ...s, [k]: { ...cur(k), ...patch } }));

  const labelOf = (f: FilterFieldMeta, raw: string) => f.values?.find((o) => o.value === raw)?.label ?? raw;
  function condText(f: FilterFieldMeta): string | null {
    const s = cur(f.key);
    if (f.type === 'enum') { if (!s.vals.length) return null; return (s.op === 'not_in' ? 'non è ' : 'è ') + s.vals.map((v) => labelOf(f, v)).join(' / '); }
    if (f.type === 'date') {
      if (s.op === 'date_today') return 'è oggi';
      if (s.op === 'date_month') return 'nel mese corrente';
      if (s.op === 'date_year') return "nell'anno corrente";
      if (s.op === 'date_after') return s.v ? 'dopo il ' + s.v : null;
      if (s.op === 'date_before') return s.v ? 'prima del ' + s.v : null;
      if (s.op === 'date_in_year') return s.v ? "nell'anno " + s.v : null;
      if (s.op === 'between') return (s.v || s.v2) ? 'da ' + (s.v || '…') + ' a ' + (s.v2 || '…') : null;
      return null;
    }
    if (s.op === 'empty') return 'è vuoto';
    if (s.op === 'between') return (s.v || s.v2) ? `da "${s.v || '…'}" a "${s.v2 || '…'}"` : null;
    if (!s.v) return null;
    const lab = (opsFor(f.type).find((o) => o[0] === s.op) ?? opsFor(f.type)[0])![1];
    return `${lab} "${s.v}"`;
  }
  const active = fields.filter((f) => condText(f) !== null);

  function clearField(k: string) { setSt((s) => ({ ...s, [k]: blank(byKey.get(k)!.type) })); }
  function clearAll() { setSt(Object.fromEntries(fields.map((f) => [f.key, blank(f.type)]))); }

  function openPop(key: string) {
    // SEMPRE centrato (il pop-up ha il titolo del campo): non si taglia mai ai bordi.
    // Top sotto la frase dei filtri (condbar sticky in alto), così non la copre.
    const W = 312;
    const left = Math.max(8, Math.round((window.innerWidth - W) / 2));
    const top = Math.min(Math.max(96, Math.round((window.innerHeight - 360) / 2)), window.innerHeight - 360);
    setPop({ key, top, left });
  }

  function buildConditions(): FilterCondition[] {
    return active.map((f) => {
      const s = cur(f.key);
      const c: FilterCondition = { field: f.key, op: s.op, value: null, join: s.join, neg: s.neg, open: s.open, close: s.close };
      if (f.type === 'enum') c.values = s.vals;
      else if (s.op === 'between') { c.value = s.v; c.value2 = s.v2; }
      else if (s.op === 'empty' || s.op === 'date_today' || s.op === 'date_month' || s.op === 'date_year') c.value = null;
      else c.value = s.v;
      return c;
    });
  }

  // ── render sentence ──
  const sentence = active.length === 0
    ? <><span className="lab">{title} dove…</span><span className="engqbe-emptycond">nessuna condizione — scrivi nei campi o usa la ▾</span></>
    : <><span className="lab">{title} dove…</span><span className="engqbe-sentence">{active.map((f, i) => {
        const s = cur(f.key);
        return (
          <span key={f.key}>
            {i > 0 && <span className="engqbe-join">{s.join === 'or' ? 'O' : 'E'}</span>}
            {s.open && <span className="engqbe-brk">(</span>}
            <span className="engqbe-cond">{s.neg && <span className="ng">NON</span>}<b>{f.label}</b> {condText(f)} <button className="x" title="Togli" onClick={() => clearField(f.key)}><X size={12} /></button></span>
            {s.close && <span className="engqbe-brk">)</span>}
          </span>
        );
      })}</span></>;

  // ── render form (sezioni + campi) ──
  const sections = new Map<string, FilterFieldMeta[]>();
  for (const f of fields) { const g = f.section ?? 'Campi'; if (!sections.has(g)) sections.set(g, []); sections.get(g)!.push(f); }

  function fieldNode(f: FilterFieldMeta) {
    const s = cur(f.key); const act = condText(f) !== null;
    const caret = <button className={`caret${act ? ' set' : ''}`} title="Opzioni filtro" onClick={() => openPop(f.key)}><ChevronDown /></button>;
    let inner;
    if (f.type === 'text' || f.type === 'number') {
      const ro = s.op === 'empty' || s.op === 'between';
      inner = (
        <div className={`bi${act ? ' act' : ''}`}>
          <input className="flin" value={s.v} readOnly={ro}
            placeholder={s.op === 'empty' ? '(senza valore)' : s.op === 'between' ? '(intervallo — apri ▾)' : 'filtra…'}
            onChange={(e) => setCur(f.key, { v: e.target.value })} />
          {caret}
        </div>
      );
    } else {
      const t = condText(f);
      inner = (
        <div className={`bi seld${act ? ' act' : ''}`}>
          <span className="flval">{t ?? <span className="ph">{f.type === 'date' ? 'qualsiasi data' : 'tutti'}</span>}</span>
          {caret}
        </div>
      );
    }
    return <div key={f.key} className={`bf${f.span === 2 ? ' c2' : ''}`}><span className="bl">{f.label}</span>{inner}</div>;
  }

  // ── floating popover per campo ──
  const popField = pop ? byKey.get(pop.key) : null;
  function popoverNode(f: FilterFieldMeta) {
    const s = cur(f.key); const ops = opsFor(f.type);
    return (
      <div className="engqbe-fpop" style={{ top: pop!.top, left: pop!.left }} onClick={(e) => e.stopPropagation()}>
        <div className="ft"><SlidersHorizontal size={16} /> {f.label}</div>
        <div className="engqbe-fpl">Operatore</div>
        <div className="engqbe-oppills">{ops.map(([v, l]) => <button key={v} className={`engqbe-oppill${s.op === v ? ' on' : ''}`} onClick={() => setCur(f.key, { op: v })}>{l}</button>)}</div>
        {f.type === 'enum' ? (
          <>
            <div className="engqbe-fpl">Valori</div>
            <div className="engqbe-echips">{(f.values ?? []).map((o) => {
              const on = s.vals.includes(o.value);
              return <button key={o.value} className={`engqbe-echip${on ? ' on' : ''}`} onClick={() => setCur(f.key, { vals: on ? s.vals.filter((x) => x !== o.value) : [...s.vals, o.value] })}>{o.label}</button>;
            })}</div>
          </>
        ) : f.type === 'date' ? (
          (s.op === 'date_after' || s.op === 'date_before') ? <><div className="engqbe-fpl">Data</div><div className="engqbe-valrow"><input className="engqbe-vin" type="date" value={s.v} onChange={(e) => setCur(f.key, { v: e.target.value })} /></div></>
          : s.op === 'date_in_year' ? <><div className="engqbe-fpl">Anno</div><div className="engqbe-valrow"><input className="engqbe-vin small" type="number" value={s.v} placeholder="2026" onChange={(e) => setCur(f.key, { v: e.target.value })} /></div></>
          : s.op === 'between' ? <><div className="engqbe-fpl">Intervallo (da → a)</div><div className="engqbe-valrow"><input className="engqbe-vin" type="date" value={s.v} onChange={(e) => setCur(f.key, { v: e.target.value })} /><span className="engqbe-arrowto"><MoveRight size={15} /></span><input className="engqbe-vin" type="date" value={s.v2} onChange={(e) => setCur(f.key, { v2: e.target.value })} /></div></>
          : <div className="engqbe-fpl" style={{ color: 'var(--ink-faint)' }}>Nessun valore da inserire per questo operatore.</div>
        ) : (
          s.op === 'empty' ? <div className="engqbe-fpl" style={{ color: 'var(--ink-faint)' }}>Filtra i record che non hanno valore.</div>
          : s.op === 'between' ? <><div className="engqbe-fpl">Intervallo (da → a)</div><div className="engqbe-valrow"><input className="engqbe-vin" value={s.v} placeholder="da…" onChange={(e) => setCur(f.key, { v: e.target.value })} /><span className="engqbe-arrowto"><MoveRight size={15} /></span><input className="engqbe-vin" value={s.v2} placeholder="…a" onChange={(e) => setCur(f.key, { v2: e.target.value })} /></div></>
          : <><div className="engqbe-fpl">Valore</div><div className="engqbe-valrow"><input className="engqbe-vin" value={s.v} placeholder="testo da cercare…" onChange={(e) => setCur(f.key, { v: e.target.value })} /></div></>
        )}
        <div className="engqbe-fpl">Lega alle altre condizioni</div>
        <div className="engqbe-combina">
          <div className="engqbe-jseg"><button className={s.join === 'and' ? 'on' : ''} onClick={() => setCur(f.key, { join: 'and' })}>E</button><button className={s.join === 'or' ? 'on' : ''} onClick={() => setCur(f.key, { join: 'or' })}>O</button></div>
          <button className={`engqbe-tgl neg${s.neg ? ' on' : ''}`} onClick={() => setCur(f.key, { neg: !s.neg })}>NON</button>
          <button className={`engqbe-tgl${s.open ? ' on' : ''}`} onClick={() => setCur(f.key, { open: !s.open })}>apri (</button>
          <button className={`engqbe-tgl${s.close ? ' on' : ''}`} onClick={() => setCur(f.key, { close: !s.close })}>chiudi )</button>
        </div>
        <div className="ff"><button className="btn btn-ghost" onClick={() => setPop(null)}>Chiudi</button></div>
      </div>
    );
  }

  return (
    <div className="engqbe-overlay" onClick={() => setPop(null)}>
      <div className="engqbe" onClick={(e) => e.stopPropagation()}>
        <div className="engqbe-head">
          <span className="ctx">{title}</span><span className="mode">Filtro · Gruppo</span>
          <div style={{ marginLeft: 'auto' }}>
            <SavedHeader items={presets.items} placeholder="Filtro salvato…"
              onLoad={(id) => { const pr = presets.items.find((x) => x.id === id); if (pr) setSt(fromConditions(fields, pr.payload as FilterCondition[])); }}
              onSave={(name) => void presets.save(name, buildConditions())} onDelete={(id) => void presets.remove(id)} />
          </div>
          <button className="x" title="Chiudi" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="engqbe-condbar">{sentence}</div>

        {[...sections.entries()].map(([g, fs]) => (
          <div key={g} className="obox"><span className="obox-t"><Layers /> {g}</span><div className="bgrid">{fs.map(fieldNode)}</div></div>
        ))}
      </div>

      {pop && popField && popoverNode(popField)}

      <div className="engqbe-opbar"><div className="inner">
        <span className="left">{active.length ? `${active.length} condizion${active.length === 1 ? 'e' : 'i'}` : ''}</span>
        <button className="btn btn-ghost" onClick={clearAll}><Eraser size={16} /> Pulisci</button>
        <button className="btn btn-primary" onClick={() => onApply(buildConditions())}><Filter size={16} /> Applica</button>
      </div></div>
    </div>
  );
}

/** ricostruisce lo stato per-campo da una lista di condizioni salvate. */
function fromConditions(fields: FilterFieldMeta[], conds?: FilterCondition[]): Record<string, Cond> {
  const out: Record<string, Cond> = {};
  for (const f of fields) out[f.key] = blank(f.type);
  for (const c of conds ?? []) {
    const f = fields.find((x) => x.key === c.field); if (!f) continue;
    out[f.key] = {
      op: c.op,
      v: c.value != null && !Array.isArray(c.value) ? String(c.value) : '',
      v2: c.value2 != null ? String(c.value2) : '',
      vals: Array.isArray(c.values) ? c.values : [],
      join: c.join ?? 'and', neg: !!c.neg, open: !!c.open, close: !!c.close,
    };
  }
  return out;
}
