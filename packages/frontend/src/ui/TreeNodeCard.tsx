/**
 * TreeNodeCard — scheda CRUD di un nodo d'albero (STANDARD entità ad albero §6.9).
 * Overlay CENTRATO con BARRA AZIONI FISSA IN ALTO (Annulla sx · Salva dx, mai in fondo).
 * Niente titolo/sottotitolo: basta il campo Nome. Label nel bordo dei campi.
 * Anteprima icona/colore accanto al Nome (cartella colorata se solo colore).
 * Aspetto: linguette Libreria (icone ricercabili con traduzione) / Immagine (image_url).
 * Colore: preset HEX + ＋ che apre un popup con selettore HSL/HEX DENTRO il popup.
 * Chip «✨ AI»: dal nome propone icona+colore (traduzione IT/ES→EN, §6.9.1).
 * È lo stesso componente in manage e in pick: la scheda non cambia.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Sparkles, Image as ImageIcon, Grid3x3, Plus } from 'lucide-react';
import { IconPicker } from './IconPicker';
import { CategoryIcon } from './categoryIcons';
import { suggestAppearance } from './categoryIcons';

export interface NodeFormValue {
  name: string;
  description: string;
  color: string;   // HEX «#RRGGBB» o ''
  icon: string;    // nome icona libreria o ''
  imageUrl: string;
}

/* ── HEX ⇄ HSL (per il selettore dentro il popup, niente picker nativo flottante) ── */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { h: 200, s: 60, l: 50 };
  const n = parseInt(m[1]!, 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0; const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}
function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

const PRESET_HEX = [
  '#801E1D', '#B91620', '#E8552D', '#D9912A', '#A16207', '#13A06B', '#0D9488', '#0891B2',
  '#0284C7', '#3B82F6', '#4F46E5', '#7C3AED', '#C026D3', '#E11D48', '#57534E', '#475569',
];

function ColorField({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [openPop, setOpenPop] = useState(false);
  const hsl = hexToHsl(value || '#0D9488');
  const setHsl = (p: Partial<{ h: number; s: number; l: number }>) =>
    onChange(hslToHex(p.h ?? hsl.h, p.s ?? hsl.s, p.l ?? hsl.l));
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <button type="button" title="Nessun colore" onClick={() => onChange('')}
          className="tnc-sw" style={{ background: 'var(--card)', borderStyle: 'dashed', color: 'var(--ink-faint)' }}>
          {!value && <Check size={13} />}
        </button>
        {PRESET_HEX.map((hex) => (
          <button type="button" key={hex} title={hex} onClick={() => onChange(hex)}
            className="tnc-sw" style={{ background: hex, borderColor: value?.toUpperCase() === hex ? 'var(--ink)' : 'transparent' }}>
            {value?.toUpperCase() === hex && <Check size={13} color="#fff" />}
          </button>
        ))}
        <button type="button" title="Colore personalizzato" onClick={() => setOpenPop((o) => !o)}
          className="tnc-sw" style={{ background: 'var(--paper)', color: 'var(--ink-soft)' }}><Plus size={14} /></button>
      </div>
      {openPop && (
        <>
          <div onClick={() => setOpenPop(false)} style={{ position: 'fixed', inset: 0, zIndex: 5 }} />
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 6, width: 268,
            background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: 'var(--shadow-2)', padding: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <span style={{ width: 40, height: 40, borderRadius: 9, background: value || '#0D9488', border: '1px solid var(--line)', flex: '0 0 auto' }} />
              <input value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} placeholder="#RRGGBB"
                style={{ flex: 1, height: 34, padding: '0 10px', borderRadius: 8, border: '1.5px solid var(--line)', fontFamily: 'var(--font-mono)', fontSize: 13, background: 'var(--card)', color: 'var(--ink)' }} />
            </div>
            {([['Tonalità', 'h', 360], ['Saturazione', 's', 100], ['Luminosità', 'l', 100]] as const).map(([lbl, key, max]) => (
              <label key={key} style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 8 }}>
                {lbl}
                <input type="range" min={0} max={max} value={hsl[key]} onChange={(e) => setHsl({ [key]: Number(e.target.value) })}
                  style={{ width: '100%', accentColor: value || 'var(--brand)' }} />
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function TreeNodeCard({ open, mode, initial, parentLabel, busy, showAppearance = true, extraInitial, renderExtra, onSave, onClose }: {
  open: boolean;
  mode: 'create' | 'edit';
  initial: NodeFormValue;
  parentLabel: string;            // breadcrumb del genitore (o «Radice»)
  busy?: boolean;
  showAppearance?: boolean;       // false → entità ricche (siti, ubicazioni): niente icona/colore
  extraInitial?: Record<string, unknown>;
  renderExtra?: (vals: Record<string, unknown>, set: (p: Record<string, unknown>) => void) => React.ReactNode;
  onSave: (v: NodeFormValue, extra: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState<NodeFormValue>(initial);
  const [extra, setExtra] = useState<Record<string, unknown>>(extraInitial ?? {});
  const [tab, setTab] = useState<'library' | 'image'>(initial.imageUrl ? 'image' : 'library');
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setV(initial); setExtra(extraInitial ?? {}); setTab(initial.imageUrl ? 'image' : 'library'); setTimeout(() => nameRef.current?.focus(), 40); } }, [open, initial, extraInitial]);
  if (!open) return null;

  const set = (p: Partial<NodeFormValue>) => setV((s) => ({ ...s, ...p }));
  const setEx = (p: Record<string, unknown>) => setExtra((s) => ({ ...s, ...p }));
  const save = () => { if (!v.name.trim()) { nameRef.current?.focus(); return; } onSave({ ...v, name: v.name.trim() }, extra); };
  const aiSuggest = () => { if (!v.name.trim()) { nameRef.current?.focus(); return; } const s = suggestAppearance(v.name.trim()); set({ icon: s.icon, color: v.color || s.color }); };

  return createPortal(
    <div role="dialog" aria-modal="true" onClick={onClose} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <style>{`
        .tnc{width:100%;max-width:560px;max-height:88vh;display:flex;flex-direction:column;background:var(--card);
          border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:0 20px 60px rgba(0,0,0,.30);overflow:hidden}
        .tnc-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 14px;
          border-bottom:1px solid var(--line);flex:0 0 auto;background:var(--card)}
        .tnc-body{padding:16px;overflow:auto;flex:1 1 auto;display:flex;flex-direction:column;gap:14px}
        .tnc-field{border:1.5px solid var(--line);border-radius:10px;padding:9px 11px 7px;position:relative;background:var(--card)}
        .tnc-field>label{display:block;font-size:11px;font-weight:600;color:var(--ink-faint);margin-bottom:2px}
        .tnc-field input,.tnc-field textarea{width:100%;border:0;outline:none;background:none;font:inherit;font-size:14px;color:var(--ink);resize:vertical}
        .tnc-prev{width:46px;height:46px;border-radius:11px;display:grid;place-items:center;flex:0 0 auto;border:1px solid var(--line)}
        .tnc-sw{width:26px;height:26px;border-radius:7px;border:2px solid transparent;cursor:pointer;display:grid;place-items:center;padding:0}
        .tnc-tabs{display:flex;gap:6px;margin-bottom:4px}
        .tnc-tab{display:flex;align-items:center;gap:6px;font-size:12.5px;padding:6px 11px;border-radius:8px;border:1px solid var(--line);
          background:var(--card);color:var(--ink-soft);cursor:pointer}
        .tnc-tab.on{background:var(--brand-wash);border-color:var(--brand);color:var(--brand-ink)}
        .tnc-ai{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:6px 11px;border-radius:999px;cursor:pointer;
          color:var(--flow-ink);background:var(--flow-wash);border:1px solid var(--flow)}
      `}</style>
      <div className="tnc" onClick={(e) => e.stopPropagation()}>
        {/* BARRA AZIONI FISSA IN ALTO */}
        <div className="tnc-bar">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}><X size={16} /> Annulla</button>
          <span style={{ fontSize: 12, color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{parentLabel}</span>
          <button className="btn btn-primary" onClick={save} disabled={busy}><Check size={16} /> {busy ? 'Salvo…' : 'Salva'}</button>
        </div>

        <div className="tnc-body">
          {/* Nome + anteprima icona/colore */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
            <div className="tnc-prev" style={{ color: v.color || 'var(--brand)', background: v.color ? `${v.color}1a` : 'var(--brand-wash)' }}>
              {v.imageUrl
                ? <img src={v.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
                : <CategoryIcon name={v.icon || null} size={24} color={v.color || undefined} />}
            </div>
            <div className="tnc-field" style={{ flex: 1 }}>
              <label>Nome *</label>
              <input ref={nameRef} value={v.name} onChange={(e) => set({ name: e.target.value })} placeholder="Es. Cavi, Fibra ottica…"
                onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
            </div>
          </div>

          <div className="tnc-field">
            <label>Descrizione</label>
            <textarea rows={2} value={v.description} onChange={(e) => set({ description: e.target.value })} placeholder="Opzionale" />
          </div>

          {/* Campi extra delle entità ricche (siti: tipo/indirizzo, ecc.) */}
          {renderExtra && renderExtra(extra, setEx)}

          {showAppearance && <>
            {/* Aspetto: chip AI + linguette Libreria / Immagine */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)' }}>Aspetto</span>
                <button type="button" className="tnc-ai" onClick={aiSuggest} title="Proponi icona e colore dal nome"><Sparkles size={14} /> AI</button>
              </div>
              <div className="tnc-tabs">
                <button type="button" className={`tnc-tab${tab === 'library' ? ' on' : ''}`} onClick={() => setTab('library')}><Grid3x3 size={14} /> Libreria</button>
                <button type="button" className={`tnc-tab${tab === 'image' ? ' on' : ''}`} onClick={() => setTab('image')}><ImageIcon size={14} /> Immagine</button>
              </div>
              {tab === 'library'
                ? <div style={{ border: '1.5px solid var(--line)', borderRadius: 10, padding: '12px 11px 10px' }}>
                    <IconPicker value={v.icon} onChange={(icon) => set({ icon, imageUrl: '' })} />
                  </div>
                : <div className="tnc-field">
                    <label>URL immagine</label>
                    <input value={v.imageUrl} onChange={(e) => set({ imageUrl: e.target.value })} placeholder="https://… (o chiave MinIO)" />
                  </div>}
            </div>

            {/* Colore: preset + popup HSL/HEX */}
            <div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 8 }}>Colore</span>
              <ColorField value={v.color} onChange={(color) => set({ color })} />
            </div>
          </>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
