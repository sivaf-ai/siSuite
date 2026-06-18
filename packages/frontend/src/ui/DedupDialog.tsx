/** DedupDialog — deduplica Soggetti (Blocco 6). Pattern propone→review→apply:
 *  POST /companies/dedup/scan propone gruppi di doppioni (deterministico, no AI);
 *  l'utente sceglie superstite + assorbiti per gruppo; POST /companies/merge applica
 *  in transazione (ri-punta le FK, archivia gli assorbiti). L'AI non scrive mai. */
import { useEffect, useState } from 'react';
import { X, Check } from 'lucide-react';
import type { DedupGroupDto, MergeResultDto } from '@sisuite/shared';
import { mutate } from '../api/hooks';
import { useToast } from './Toast';

interface GroupState { survivorId: string; absorbed: Set<string> }

export function DedupDialog({ open, onClose, onMerged }: { open: boolean; onClose: () => void; onMerged: () => void }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<DedupGroupDto[]>([]);
  const [st, setSt] = useState<Record<string, GroupState>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    mutate<{ groups: DedupGroupDto[] }>('POST', '/companies/dedup/scan')
      .then((r) => {
        setGroups(r.groups);
        const s: Record<string, GroupState> = {};
        for (const g of r.groups) s[g.normalizedKey] = { survivorId: g.suggestedSurvivorId, absorbed: new Set(g.absorbedIds) };
        setSt(s);
      })
      .catch((e) => toast((e as Error).message, 'error'))
      .finally(() => setLoading(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const setSurvivor = (g: DedupGroupDto, id: string) =>
    setSt((s) => ({ ...s, [g.normalizedKey]: { survivorId: id, absorbed: new Set(g.members.map((m) => m.id).filter((x) => x !== id)) } }));
  const toggleAbsorbed = (key: string, id: string) =>
    setSt((s) => { const cur = s[key]!; const n = new Set(cur.absorbed); n.has(id) ? n.delete(id) : n.add(id); return { ...s, [key]: { ...cur, absorbed: n } }; });

  async function mergeGroup(g: DedupGroupDto) {
    const gs = st[g.normalizedKey]!;
    const absorbedIds = [...gs.absorbed];
    if (!absorbedIds.length) { toast('Seleziona almeno un soggetto da fondere', 'error'); return; }
    setBusyKey(g.normalizedKey);
    try {
      const r = await mutate<MergeResultDto>('POST', '/companies/merge', { survivorId: gs.survivorId, absorbedIds });
      toast(`Fusi ${r.absorbed} soggetti nel superstite`);
      setGroups((gg) => gg.filter((x) => x.normalizedKey !== g.normalizedKey));
      onMerged();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusyKey(null); }
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} style={{ zIndex: 1200 }} />
      <div role="dialog" aria-modal="true" style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1201,
        width: 'min(680px, 95vw)', maxHeight: '85vh', overflow: 'auto', background: 'var(--card)',
        borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-2)', padding: 22,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, fontFamily: 'var(--font-display)' }}>Trova doppioni — Soggetti</h3>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13, margin: '6px 0 14px' }}>
          Proposte per nome simile. Scegli il <b>superstite</b> (resta) e i soggetti da <b>fondere</b> (vengono archiviati; commesse, ordini, seriali passano al superstite).
        </p>

        {loading ? <div className="dsx-empty">Analisi in corso…</div>
          : groups.length === 0 ? <div className="dsx-empty">Nessun doppione evidente trovato.</div>
            : groups.map((g) => {
              const gs = st[g.normalizedKey]!;
              return (
                <div key={g.normalizedKey} style={{ border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginBottom: 8 }}>{g.reason}</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ color: 'var(--ink-faint)', fontSize: 11.5, textAlign: 'left' }}>
                        <th style={{ padding: '4px 6px', width: 70 }}>Superstite</th>
                        <th style={{ padding: '4px 6px', width: 60 }}>Fondi</th>
                        <th style={{ padding: '4px 6px' }}>Soggetto</th>
                        <th style={{ padding: '4px 6px', width: 90, textAlign: 'right' }}>Relazioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.members.map((m) => {
                        const isSurvivor = gs.survivorId === m.id;
                        return (
                          <tr key={m.id} style={{ borderTop: '1px solid var(--line-2)' }}>
                            <td style={{ padding: '6px' }}><input type="radio" name={`sv-${g.normalizedKey}`} checked={isSurvivor} onChange={() => setSurvivor(g, m.id)} /></td>
                            <td style={{ padding: '6px' }}><input type="checkbox" disabled={isSurvivor} checked={!isSurvivor && gs.absorbed.has(m.id)} onChange={() => toggleAbsorbed(g.normalizedKey, m.id)} /></td>
                            <td style={{ padding: '6px' }}>{m.displayName}{isSurvivor && <span className="chip" style={{ marginLeft: 6 }}>superstite</span>}</td>
                            <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}>{m.relations}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                    <button className="btn btn-primary btn-sm" disabled={busyKey === g.normalizedKey || gs.absorbed.size === 0} onClick={() => void mergeGroup(g)}>
                      <Check size={15} /> Fondi {gs.absorbed.size} nel superstite
                    </button>
                  </div>
                </div>
              );
            })}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </>
  );
}
