/**
 * AiFilterPanel — FILTRO AI-first delle liste (standard). L'utente scrive O DETTA A VOCE
 * in linguaggio naturale; l'AI traduce in condizioni (POST /ai/list-filter), che si
 * applicano subito alla lista. I set di filtri si SALVANO/CARICANO per-utente.
 */
import { useState } from 'react';
import { Sparkles, Mic, StopCircle, X, Check, Trash2, Save, Wand2 } from 'lucide-react';
import type { FieldOpt } from './FieldPicker';
import { type FilterCondition, condLabel } from '../lib/listFilter';
import { PromptDialog } from './PromptDialog';
import { useApi, mutate } from '../api/hooks';
import { apiFetch } from '../api/client';
import { useToast } from './Toast';
import { useVoiceCapture } from '../voice/useVoiceCapture';

interface Preset { id: string; name: string; payload: { query?: string; conditions: FilterCondition[] } }

export function AiFilterPanel({ open, entity, fields, initial, onApply, onClose }: {
  open: boolean; entity: string; fields: FieldOpt[];
  initial?: { query?: string; conditions: FilterCondition[] };
  onApply: (conditions: FilterCondition[], description: string) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const voice = useVoiceCapture();
  const presets = useApi<{ items: Preset[] }>(open ? `/filter-presets?entity=${encodeURIComponent(entity)}` : null);
  const [query, setQuery] = useState(initial?.query ?? '');
  const [conditions, setConditions] = useState<FilterCondition[]>(initial?.conditions ?? []);
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);

  if (!open) return null;
  const labelOf = (k: string) => fields.find((f) => f.key === k)?.label ?? k;

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

  function save() {
    if (!conditions.length) { toast('Interpreta o crea un filtro prima di salvarlo', 'error'); return; }
    setNameOpen(true);
  }
  async function confirmSave(name: string) {
    setNameOpen(false);
    try { await mutate('POST', '/filter-presets', { entity, name, payload: { query, conditions } }); toast('Filtro salvato'); void presets.reload(); }
    catch (e) { toast((e as Error).message || 'Errore salvataggio', 'error'); }
  }
  function loadPreset(id: string) {
    const p = presets.data?.items.find((x) => x.id === id); if (!p) return;
    setConditions(p.payload.conditions ?? []); setQuery(p.payload.query ?? ''); setDesc(p.name);
  }
  async function delPreset(id: string) {
    try { await mutate('DELETE', `/filter-presets/${id}`); void presets.reload(); } catch { /* ignore */ }
  }

  return (
    <>
    <PromptDialog open={nameOpen} title="Salva questo filtro"
      message="Dai un nome al filtro: potrai ricaricarlo quando vuoi." label="Nome filtro"
      placeholder='es. "Clienti Bergamo no P.IVA"' confirmLabel="Salva"
      onConfirm={confirmSave} onCancel={() => setNameOpen(false)} />
    <div className="afp-back" onClick={onClose}>
      <div className="afp" onClick={(e) => e.stopPropagation()}>
        <div className="afp-head">
          <span className="afp-title"><Sparkles size={16} /> Filtro intelligente</span>
          <button className="afp-x" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="afp-body">
          <div className="afp-inputrow">
            <input className="afp-input" autoFocus placeholder="Scrivi o detta: es. «clienti di Bergamo senza P.IVA»"
              value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void interpret(query); }} />
            {voice.audioSupported && (
              <button className={`afp-mic${voice.recording ? ' rec' : ''}`} title="Detta il filtro" onClick={() => void mic()}>
                {voice.recording ? <StopCircle size={18} /> : <Mic size={18} />}
              </button>
            )}
            <button className="btn btn-primary btn-sm" disabled={busy || !query.trim()} onClick={() => void interpret(query)}>
              <Wand2 size={15} /> {busy ? 'Interpreto…' : 'Interpreta'}
            </button>
          </div>
          {voice.recording && <div className="afp-hint"><span className="dot" /> Sto ascoltando… {voice.transcript || 'parla pure'}</div>}

          {conditions.length > 0 && (
            <>
              {desc && <div className="afp-desc">{desc}</div>}
              <div className="afp-chips">
                {conditions.map((c, i) => (
                  <span key={i} className="afp-chip">{condLabel(c, labelOf)}
                    <button onClick={() => setConditions((cs) => cs.filter((_, j) => j !== i))}><X size={12} /></button>
                  </span>
                ))}
              </div>
            </>
          )}

          {(presets.data?.items.length ?? 0) > 0 && (
            <div className="afp-presets">
              <span className="afp-pl">Filtri salvati:</span>
              {presets.data!.items.map((p) => (
                <span key={p.id} className="afp-preset">
                  <button className="afp-load" onClick={() => loadPreset(p.id)}>{p.name}</button>
                  <button className="afp-del" title="Elimina" onClick={() => void delPreset(p.id)}><Trash2 size={12} /></button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="afp-foot">
          <button className="btn btn-ghost btn-sm" onClick={() => { setConditions([]); setQuery(''); setDesc(''); onApply([], ''); }}><Trash2 size={15} /> Pulisci filtro</button>
          <span style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" disabled={!conditions.length} onClick={() => void save()}><Save size={15} /> Salva</button>
          <button className="btn btn-primary btn-sm" disabled={!conditions.length} onClick={() => { onApply(conditions, desc || query); onClose(); }}><Check size={15} /> Applica</button>
        </div>

        <style>{`
          .afp-back { position: fixed; inset: 0; background: rgba(20,18,40,.34); display: grid; place-items: start center; z-index: 1000; padding: 64px 20px; }
          .afp { width: 620px; max-width: 96vw; background: var(--card); border-radius: 16px; box-shadow: var(--shadow-pop); overflow: hidden;
            border: 1.5px solid transparent; background-image: linear-gradient(var(--card),var(--card)), var(--flow-grad); background-origin: border-box; background-clip: padding-box, border-box; }
          .afp-head { display: flex; align-items: center; padding: 13px 16px; border-bottom: 1px solid var(--line); }
          .afp-title { display: inline-flex; align-items: center; gap: 8px; font-family: var(--font-display); font-weight: 700; font-size: 15px; }
          .afp-title svg { color: var(--brand); }
          .afp-x { margin-left: auto; background: none; color: var(--ink-soft); cursor: pointer; }
          .afp-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
          .afp-inputrow { display: flex; align-items: center; gap: 8px; }
          .afp-input { flex: 1; height: 42px; padding: 0 14px; border: 1.5px solid var(--line); border-radius: 11px; font-size: 14.5px; font-family: inherit; outline: none; background: var(--card); color: var(--ink); }
          .afp-input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-wash); }
          .afp-mic { width: 42px; height: 42px; border-radius: 11px; border: 1.5px solid var(--line); background: var(--card); color: var(--ink-soft); display: grid; place-items: center; cursor: pointer; }
          .afp-mic.rec { background: var(--danger, #d33); color: #fff; border-color: transparent; }
          .afp-hint { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--ink-soft); }
          .afp-hint .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--danger,#d33); }
          .afp-desc { font-size: 13px; color: var(--ink-2); }
          .afp-chips { display: flex; flex-wrap: wrap; gap: 7px; }
          .afp-chip { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 6px 0 11px; border-radius: var(--r-pill); background: var(--brand-wash); color: var(--brand-ink); font-size: 12.5px; font-weight: 600; }
          .afp-chip button { background: none; color: inherit; opacity: .7; cursor: pointer; display: inline-flex; }
          .afp-presets { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding-top: 4px; border-top: 1px dashed var(--line); }
          .afp-pl { font-size: 11.5px; color: var(--ink-faint); }
          .afp-preset { display: inline-flex; align-items: center; gap: 2px; }
          .afp-load { background: var(--neutral-wash); color: var(--ink-2); border-radius: var(--r-pill); padding: 4px 11px; font-size: 12.5px; font-weight: 600; cursor: pointer; }
          .afp-del { background: none; color: var(--ink-faint); cursor: pointer; display: inline-flex; }
          .afp-foot { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--line); background: var(--paper); }
        `}</style>
      </div>
    </div>
    </>
  );
}
