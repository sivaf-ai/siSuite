/** StockAssistModal — WMS Fase D: assistente documenti di magazzino.
 *  L'utente scrive in linguaggio naturale → l'AI + il resolver deterministico
 *  propongono una bozza (tipo, articoli, quantità, ubicazioni) che l'utente
 *  APRE in modifica sulla scheda documento (rivede e conferma). */
import { useEffect, useState } from 'react';
import { useHistory } from 'react-router';
import { Sparkles, AlertTriangle, ArrowRight, Mic, Square } from 'lucide-react';
import type { StockDocAiProposal } from '@sisuite/shared';
import { Modal } from '../ui/Modal';
import { apiFetch, ApiError } from '../api/client';
import { useToast } from '../ui/Toast';
import { useVoiceCapture } from '../voice/useVoiceCapture';

const TYPE_LABEL: Record<string, string> = { receipt: 'Carico', transfer: 'Trasferimento', adjustment: 'Rettifica' };
const EXAMPLES = [
  'Trasferisci 10 ONT Huawei da Scaffale A al Furgone Ahmed',
  'Carico 50 bretelle ottiche da Fibra SpA nel Magazzino centrale',
  'Sposta 5 borchie ottiche dal Magazzino centrale allo Scaffale DEMO',
];

export function StockAssistModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [prop, setProp] = useState<StockDocAiProposal | null>(null);
  const toast = useToast();
  const history = useHistory();
  const voice = useVoiceCapture();
  // dettatura live: mentre registra, la trascrizione riempie il riquadro
  useEffect(() => { if (voice.recording) setText(voice.transcript); }, [voice.recording, voice.transcript]);
  if (!open) return null;

  const close = () => { setText(''); setProp(null); onClose(); };
  async function toggleMic() {
    if (voice.recording) { const r = await voice.stop(); if (r.transcript) setText(r.transcript); }
    else { setProp(null); try { await voice.start(); } catch { toast('Microfono non disponibile', 'error'); } }
  }

  async function generate() {
    if (!text.trim()) return;
    setBusy(true); setProp(null);
    try {
      const p = await apiFetch<StockDocAiProposal>('/ai/stock-document', { method: 'POST', body: JSON.stringify({ text: text.trim() }) });
      setProp(p);
    } catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }
  function openDraft() {
    if (!prop) return;
    close();
    history.push('/stock/documents/new', { aiProposal: prop });
  }

  return (
    <Modal open size="lg" title="Assistente documenti (AI)" onClose={close} footer={
      <>
        <button className="btn btn-ghost" onClick={close}>Chiudi</button>
        {prop
          ? <button className="btn btn-primary" disabled={!prop.lines.length} onClick={openDraft}>Apri bozza in modifica <ArrowRight size={15} /></button>
          : <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={generate}><Sparkles size={15} /> {busy ? 'Elaboro…' : 'Genera bozza'}</button>}
      </>
    }>
      <div className="dsx">
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
          Descrivi il movimento a parole: l'assistente riconosce <b>tipo</b>, <b>articoli</b>, <b>quantità</b> e <b>ubicazioni</b> del tuo magazzino e prepara la bozza. Poi la rivedi e la confermi tu.
        </p>
        <div style={{ position: 'relative' }}>
          <textarea className="txt" style={{ width: '100%', minHeight: 84, resize: 'vertical', fontSize: 14, paddingRight: 46 }} value={text}
            placeholder="es. Trasferisci 10 ONT Huawei da Scaffale A al Furgone Ahmed"
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void generate(); }} />
          {voice.audioSupported && (
            <button type="button" onClick={() => void toggleMic()} title={voice.recording ? 'Ferma dettatura' : 'Detta a voce'}
              style={{ position: 'absolute', top: 8, right: 8, width: 34, height: 34, borderRadius: 8, border: 0, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: voice.recording ? 'var(--danger)' : 'var(--brand)', color: '#fff' }}>
              {voice.recording ? <Square size={15} /> : <Mic size={16} />}
            </button>
          )}
        </div>
        {voice.recording && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}><Mic size={12} /> In ascolto… parla, poi premi ■ per fermare.{!voice.sttSupported && ' (trascrizione non supportata da questo browser)'}</div>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {EXAMPLES.map((ex) => (
            <button key={ex} className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => setText(ex)}>{ex}</button>
          ))}
        </div>

        {prop && (
          <div style={{ marginTop: 14, border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 700 }}>Bozza proposta</span>
              <span className="chip">{TYPE_LABEL[prop.typeCode] ?? prop.typeCode}</span>
              {prop.supplierName && <span className="chip">Fornitore: {prop.supplierName}</span>}
            </div>
            {prop.lines.length > 0 ? (
              <table className="subt">
                <thead><tr><th>Articolo</th><th className="num">Qtà</th><th>Preleva da</th><th>Versa in</th></tr></thead>
                <tbody>
                  {prop.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="cellname">{l.materialName}</td>
                      <td className="num mono">{l.quantity} {l.unit}</td>
                      <td className="cellsub">{l.sourceLocationPath ?? prop.sourceLocationName ?? <span className="muted">—</span>}</td>
                      <td className="cellsub">{l.destLocationPath ?? prop.destLocationName ?? <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="dsx-empty" style={{ padding: 14 }}>Nessun articolo riconosciuto.</div>}
            {prop.warnings.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {prop.warnings.map((w, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: 'var(--warning, #b45309)' }}>
                    <AlertTriangle size={13} /> {w}
                  </div>
                ))}
              </div>
            )}
            <p className="faint" style={{ fontSize: 12, color: 'var(--ink-faint)', margin: '8px 2px 0' }}>
              Apri la bozza per rivederla e completare gli eventuali dati mancanti prima di confermarla.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
