/**
 * AiFilterPanel — FILTRO delle liste, STANDARD per tutte le maschere. Due livelli:
 *  1) AI (in alto): l'utente SCRIVE o DETTA A VOCE in linguaggio naturale → l'AI traduce in condizioni.
 *  2) BUILDER MANUALE: aggiunge condizioni campo · operatore · valore, con logica E/O.
 *  Le condizioni sono condivise (l'AI le precompila, l'utente le rifinisce).
 *  I set di filtri si SALVANO/CARICANO per-utente (filter_preset).
 */
import { useState } from 'react';
import { Sparkles, Mic, StopCircle, X, Check, Trash2, Save, Wand2 } from 'lucide-react';
import type { FieldOpt } from './FieldPicker';
import { type FilterCondition, type FilterMode, condLabel } from '../lib/listFilter';
import { PromptDialog } from './PromptDialog';
import { useApi, mutate } from '../api/hooks';
import { apiFetch } from '../api/client';
import { useToast } from './Toast';
import { useVoiceCapture } from '../voice/useVoiceCapture';

interface Preset { id: string; name: string; payload: { query?: string; conditions: FilterCondition[]; mode?: FilterMode } }

export function AiFilterPanel({ open, entity, fields, initial, onApply, onClose }: {
  open: boolean; entity: string; fields: FieldOpt[];
  initial?: { query?: string; conditions: FilterCondition[]; mode?: FilterMode };
  onApply: (conditions: FilterCondition[], description: string, mode: FilterMode) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const voice = useVoiceCapture();
  const presets = useApi<{ items: Preset[] }>(open ? `/filter-presets?entity=${encodeURIComponent(entity)}` : null);
  const [query, setQuery] = useState(initial?.query ?? '');
  const [conditions, setConditions] = useState<FilterCondition[]>(initial?.conditions ?? []);
  const [mode, setMode] = useState<FilterMode>(initial?.mode ?? 'and');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);

  if (!open) return null;

  async function interpret(text: string) {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const r = await apiFetch<{ description: string; conditions: FilterCondition[] }>('/ai/list-filter', {
        method: 'POST', body: JSON.stringify({ entity, query: text.trim(), fields: fields.map((f) => ({ key: f.key, label: f.label })) }),
      });
      setConditions(r.conditions); setDesc(r.description);
    } catch (e) { toast((e as Error).message || 'Filtro non interpretato', 'error'); }
    finally { setBusy(false); }
  }

  async function mic() {
    if (voice.recording) {
      try { const { transcript } = await voice.stop(); if (transcript) { setQuery(transcript); await interpret(transcript); } }
      catch (e) { toast((e as Error).message || 'Errore voce', 'error'); }
    } else {
      try { await voice.start(); } catch { toast('Microfono non disponibile o permesso negato', 'error'); }
    }
  }

  const fieldLabelOf = (k: string) => fields.find((f) => f.key === k)?.label ?? k;

  function save() {
    if (!conditions.length) { toast('Crea o interpreta un filtro prima di salvarlo', 'error'); return; }
    setNameOpen(true);
  }
  async function confirmSave(name: string) {
    setNameOpen(false);
    try { await mutate('POST', '/filter-presets', { entity, name, payload: { query, conditions, mode } }); toast('Filtro salvato'); void presets.reload(); }
    catch (e) { toast((e as Error).message || 'Errore salvataggio', 'error'); }
  }
  function loadPreset(p: Preset) {
    setConditions(p.payload.conditions ?? []); setQuery(p.payload.query ?? ''); setMode(p.payload.mode ?? 'and'); setDesc(p.name);
    toast(`Caricato «${p.name}»`);
  }
  async function delPreset(id: string) { try { await mutate('DELETE', `/filter-presets/${id}`); void presets.reload(); } catch { /* ignore */ } }

  return (
    <>
    <PromptDialog open={nameOpen} title="Salva questo filtro"
      message="Dai un nome al filtro: potrai ricaricarlo quando vuoi." label="Nome filtro"
      placeholder='es. "Clienti Bergamo no P.IVA"' confirmLabel="Salva"
      onConfirm={confirmSave} onCancel={() => setNameOpen(false)} />
    <div className="afp-back" onClick={onClose}>
      <div className="afp" onClick={(e) => e.stopPropagation()}>
        <div className="afp-head">
          <span className="afp-title"><Sparkles size={16} /> Filtri</span>
          <button className="afp-x" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="afp-body">
          {/* 1) AI: scrivi o detta */}
          <div className="afp-sec">
            <div className="afp-seclabel"><Sparkles size={13} /> Chiedi in linguaggio naturale (anche a voce)</div>
            <div className="afp-inputrow">
              <input className="afp-input" autoFocus placeholder="es. «clienti di Bergamo senza P.IVA»"
                value={query} onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void interpret(query); }} />
              {voice.audioSupported && (
                <button className={`afp-mic${voice.recording ? ' rec' : ''}`} title="Detta il filtro" onClick={() => void mic()}>
                  {voice.recording ? <StopCircle size={18} /> : <Mic size={18} />}
                </button>
              )}
              <button className="afp-btn primary" disabled={busy || !query.trim()} onClick={() => void interpret(query)}>
                <Wand2 size={15} /> {busy ? 'Interpreto…' : 'Interpreta'}
              </button>
            </div>
            {voice.recording && <div className="afp-hint"><span className="dot" /> Sto ascoltando… {voice.transcript || 'parla pure'}</div>}
            {desc && <div className="afp-desc">{desc}</div>}
          </div>

          {/* 2) Condizioni interpretate (sola lettura). Il filtro MANUALE è il pulsante "Gruppo". */}
          {conditions.length > 0 && (
            <div className="afp-sec">
              <div className="afp-seclabel">Condizioni interpretate ({mode === 'or' ? 'almeno una' : 'tutte'})</div>
              <div className="afp-rows">
                {conditions.map((c, i) => <span key={i} className="afp-cond" style={{ display: 'inline-flex', padding: '7px 11px', width: 'auto' }}>{condLabel(c, fieldLabelOf)}</span>)}
              </div>
              <div className="afp-none">Per costruire un filtro a mano, campo per campo, usa il pulsante <b>Gruppo</b> nella barra.</div>
            </div>
          )}

          {/* set salvati */}
          {(presets.data?.items.length ?? 0) > 0 && (
            <div className="afp-presets">
              <span className="afp-pl">Filtri salvati:</span>
              {presets.data!.items.map((p) => (
                <span key={p.id} className="afp-preset">
                  <button className="afp-load" onClick={() => loadPreset(p)}>{p.name}</button>
                  <button className="afp-del" title="Elimina" onClick={() => void delPreset(p.id)}><Trash2 size={12} /></button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="afp-foot">
          <button className="afp-btn ghost" onClick={() => { setConditions([]); setQuery(''); setDesc(''); onApply([], '', mode); }}><Trash2 size={15} /> Pulisci</button>
          <span style={{ flex: 1 }} />
          <button className="afp-btn ghost" disabled={!conditions.length} onClick={() => save()}><Save size={15} /> Salva</button>
          <button className="afp-btn primary" disabled={!conditions.length} onClick={() => { onApply(conditions, desc || query, mode); onClose(); }}><Check size={15} /> Applica</button>
        </div>

        <style>{`
          .afp-back { position: fixed; inset: 0; background: rgba(20,18,40,.34); display: grid; place-items: start center; z-index: 1000; padding: 56px 20px; }
          .afp { width: 680px; max-width: 96vw; max-height: 84vh; display: flex; flex-direction: column; overflow: hidden; background: var(--card); border-radius: 16px; box-shadow: var(--shadow-pop);
            border: 1.5px solid transparent; background-image: linear-gradient(var(--card),var(--card)), var(--flow-grad); background-origin: border-box; background-clip: padding-box, border-box; }
          .afp-head { display: flex; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--line); }
          .afp-title { display: inline-flex; align-items: center; gap: 8px; font-family: var(--font-display); font-weight: 700; font-size: 16px; }
          .afp-title svg { color: var(--brand); }
          .afp-x { margin-left: auto; background: none; color: var(--ink-soft); cursor: pointer; }
          .afp-body { padding: 14px 18px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
          .afp-sec { display: flex; flex-direction: column; gap: 9px; }
          .afp-secrow { display: flex; align-items: center; justify-content: space-between; }
          .afp-seclabel { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .3px; color: var(--ink-faint); }
          .afp-seclabel svg { color: var(--brand); }
          .afp-inputrow { display: flex; align-items: center; gap: 8px; }
          .afp-input { flex: 1; height: 40px; padding: 0 13px; border: 1.5px solid var(--line); border-radius: 10px; font-size: 14px; font-family: inherit; outline: none; background: var(--card); color: var(--ink); }
          .afp-input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-wash); }
          .afp-mic { width: 40px; height: 40px; border-radius: 10px; border: 1.5px solid var(--line); background: var(--card); color: var(--ink-soft); display: grid; place-items: center; cursor: pointer; }
          .afp-mic.rec { background: var(--danger, #d33); color: #fff; border-color: transparent; }
          .afp-btn { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid var(--line); background: var(--card); color: var(--ink); }
          .afp-btn svg { width: 15px; height: 15px; }
          .afp-btn.primary { background: var(--brand); color: #fff; border-color: transparent; }
          .afp-btn.primary:hover { background: var(--brand-press); }
          .afp-btn.ghost:hover { background: var(--paper); }
          .afp-btn:disabled { opacity: .5; cursor: not-allowed; }
          .afp-hint { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--ink-soft); }
          .afp-hint .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--danger,#d33); }
          .afp-desc { font-size: 13px; color: var(--brand-ink); background: var(--brand-wash); padding: 6px 10px; border-radius: 8px; }
          .afp-mode { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
          .afp-mode button { padding: 5px 11px; font-size: 12px; font-weight: 600; background: var(--card); color: var(--ink-soft); cursor: pointer; }
          .afp-mode button.on { background: var(--ink); color: #fff; }
          .afp-rows { display: flex; flex-direction: column; gap: 7px; }
          .afp-cond { display: grid; grid-template-columns: 1.2fr 1fr 1.4fr 32px; gap: 7px; align-items: center; }
          .afp-cond select, .afp-cond input { height: 36px; border: 1.5px solid var(--line); border-radius: 8px; padding: 0 9px; font-size: 13px; font-family: inherit; background: var(--card); color: var(--ink); outline: none; }
          .afp-cond select:focus, .afp-cond input:focus { border-color: var(--brand); }
          .afp-v.empty { color: var(--ink-faint); display: grid; place-items: center; }
          .afp-range { display: flex; gap: 6px; }
          .afp-range input { flex: 1; min-width: 0; height: 36px; border: 1.5px solid var(--line); border-radius: 8px; padding: 0 9px; font-size: 13px; font-family: inherit; background: var(--card); color: var(--ink); outline: none; }
          .afp-range input:focus { border-color: var(--brand); }
          .afp-rm { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: var(--ink-soft); display: grid; place-items: center; cursor: pointer; }
          .afp-rm:hover { color: var(--danger); }
          .afp-none { font-size: 12.5px; color: var(--ink-faint); padding: 6px 2px; }
          .afp-add { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--brand-ink); background: none; cursor: pointer; }
          .afp-presets { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding-top: 10px; border-top: 1px dashed var(--line); }
          .afp-pl { font-size: 11.5px; color: var(--ink-faint); }
          .afp-preset { display: inline-flex; align-items: center; gap: 2px; }
          .afp-load { background: var(--neutral-wash); color: var(--ink-2); border-radius: var(--r-pill); padding: 4px 11px; font-size: 12.5px; font-weight: 600; cursor: pointer; }
          .afp-del { background: none; color: var(--ink-faint); cursor: pointer; display: inline-flex; }
          .afp-foot { display: flex; align-items: center; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--line); background: var(--paper); }
        `}</style>
      </div>
    </div>
    </>
  );
}
