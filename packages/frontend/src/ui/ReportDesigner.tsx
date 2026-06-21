/**
 * ReportDesigner (PIANO motore §2.5, mockup 56 — rivisto su richiesta titolare 20/06):
 * Campi da mostrare / Totali / Raggruppa per usano il SELETTORE A LISTA (`FieldChooser`)
 * con check + ordinamento (non chip: con tanti campi i chip diventano enormi). I Totali
 * mostrano i campi con una FUNZIONE per riga (somma/media/min/max/conteggio) secondo il tipo.
 * Raggruppa = più livelli ordinati. Anteprima HTML live (gruppi annidati, subtotali per
 * livello, totale generale). Stampa / PDF. Salvataggio su saved_report.
 */
import { useMemo, useState } from 'react';
import { FileText, X, Sparkles, Wand2, Table2, Sigma, Layers, SlidersHorizontal, RotateCcw, Eye, Printer, FileDown, Trash2, Save } from 'lucide-react';
import { useApi, mutate } from '../api/hooks';
import { PromptDialog } from './PromptDialog';
import { FieldChooser, type ChooserField, type ChosenItem, AGG_FNS } from './FieldChooser';
import '../theme/engine.css';

export interface ReportField<T> { key: string; label: string; numeric?: boolean; value: (row: T) => string | number | null | undefined }
interface Options { griglia: boolean; hideRep: boolean; subtot: boolean; grandtot: boolean; pagine: boolean }
interface ReportCfg { show: ChosenItem[]; sum: ChosenItem[]; group: ChosenItem[]; options: Options; layout: 'elenco' | 'scheda' }
interface SavedReport { id: string; name: string; payload: ReportCfg }

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtNum = (n: number) => (Number.isFinite(n) ? n.toLocaleString('it-IT', { maximumFractionDigits: 2 }) : '');
const aggLabel = (fn?: string) => AGG_FNS.find((a) => a.fn === fn)?.label ?? 'Somma';

export function ReportDesigner<T>({ title, presetEntity, fields, rows, onClose }: {
  title: string; presetEntity: string | undefined; fields: ReportField<T>[]; rows: T[]; onClose: () => void;
}) {
  const byKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const chooserFields: ChooserField[] = fields.map((f) => ({ key: f.key, label: f.label, numeric: f.numeric }));
  const reports = useApi<{ items: SavedReport[] }>(presetEntity ? `/saved-reports?entity=${encodeURIComponent(presetEntity)}` : null);
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [selReport, setSelReport] = useState('');
  const [aiText, setAiText] = useState('');

  const defaults = (): ReportCfg => ({
    show: fields.slice(0, 6).map((f) => ({ key: f.key })),
    sum: fields.filter((f) => f.numeric).map((f) => ({ key: f.key, fn: 'sum' })),
    group: [],
    options: { griglia: false, hideRep: true, subtot: true, grandtot: true, pagine: false },
    layout: 'elenco',
  });
  const [cfg, setCfg] = useState<ReportCfg>(defaults);
  const set = (patch: Partial<ReportCfg>) => setCfg((c) => ({ ...c, ...patch }));

  function aiGenerate() {
    const q = aiText.toLowerCase(); if (!q.trim()) return;
    const matched = fields.filter((f) => q.includes(f.label.toLowerCase()));
    const show = (matched.length ? matched : fields.slice(0, 6)).map((f) => ({ key: f.key } as ChosenItem));
    const sum = matched.filter((f) => f.numeric).map((f) => ({ key: f.key, fn: 'sum' } as ChosenItem));
    const group: ChosenItem[] = [];
    const m = q.match(/per\s+([a-zàèéìòù ]+)/);
    if (m) { const g = fields.find((f) => m[1]!.includes(f.label.toLowerCase()) && !f.numeric); if (g) group.push({ key: g.key }); }
    set({ show, sum: sum.length ? sum : cfg.sum, group });
  }

  // ── calcolo anteprima ──
  const groupKeys = cfg.group.map((g) => g.key);
  const cols = cfg.show.map((s) => s.key).filter((k) => !groupKeys.includes(k));
  const aggValue = (rs: T[], item: ChosenItem): number => {
    const f = byKey.get(item.key);
    if (item.fn === 'count') return rs.length;
    const nums = rs.map((r) => Number(f?.value(r))).filter((n) => Number.isFinite(n));
    if (!nums.length) return item.fn === 'min' || item.fn === 'max' ? NaN : 0;
    if (item.fn === 'avg') return nums.reduce((a, b) => a + b, 0) / nums.length;
    if (item.fn === 'min') return Math.min(...nums);
    if (item.fn === 'max') return Math.max(...nums);
    return nums.reduce((a, b) => a + b, 0); // sum
  };
  const fmtCell = (k: string, r: T) => { const f = byKey.get(k)!; const v = f.value(r); return f.numeric ? fmtNum(Number(v) || 0) : esc(v); };
  // valore aggregato per la colonna k (se c'è un totale su k); altrimenti ''
  const totCellFor = (k: string, rs: T[]) => { const it = cfg.sum.find((s) => s.key === k); return it ? fmtNum(aggValue(rs, it)) : ''; };

  function totalsRow(rs: T[], label: string, cls: string): string {
    return `<tr class="${cls}">` + cols.map((k, i) => i === 0 ? `<td>${esc(label)}</td>` : `<td class="${byKey.get(k)?.numeric ? 'num' : ''}">${totCellFor(k, rs)}</td>`).join('') + '</tr>';
  }
  function groupBy(rs: T[], k: string): Map<string, T[]> {
    const f = byKey.get(k)!; const m = new Map<string, T[]>();
    for (const r of rs) { const g = String(f.value(r) ?? '—'); if (!m.has(g)) m.set(g, []); m.get(g)!.push(r); }
    return m;
  }
  function renderLevel(rs: T[], level: number): string {
    if (level >= groupKeys.length) {
      let prev: Record<string, unknown> = {}; let body = '';
      for (const r of rs) {
        body += '<tr>' + cols.map((k) => { const f = byKey.get(k)!; let cell = fmtCell(k, r); if (cfg.options.hideRep && !f.numeric && prev[k] === f.value(r)) cell = ''; return `<td class="${f.numeric ? 'num' : ''}">${cell}</td>`; }).join('') + '</tr>';
        prev = Object.fromEntries(cols.map((k) => [k, byKey.get(k)!.value(r)]));
      }
      return body;
    }
    const gk = groupKeys[level]!; const gf = byKey.get(gk);
    let html = '';
    for (const [g, sub] of groupBy(rs, gk)) {
      html += `<tr class="engrep-grouphdr"><td colspan="${cols.length}" style="padding-left:${9 + level * 14}px">${esc(gf?.label)}: ${esc(g)} &nbsp;·&nbsp; ${sub.length}</td></tr>`;
      html += renderLevel(sub, level + 1);
      if (cfg.options.subtot && cfg.sum.length) html += totalsRow(sub, `Subtotale ${g}`, 'engrep-subtot');
    }
    return html;
  }

  function buildDocHtml(): string {
    const head = `<div class="rhead"><h2>${esc(title)}</h2><div class="meta">${groupKeys.length ? 'Raggruppato per ' + groupKeys.map((k) => esc(byKey.get(k)?.label)).join(' › ') : 'Elenco'}<br>${rows.length} record</div></div>`;
    if (cfg.layout === 'scheda') {
      const titleKey = cols[0];
      return head + rows.map((r) => {
        const h = titleKey ? fmtCell(titleKey, r) : '';
        const kv = cols.filter((k) => k !== titleKey).map((k) => `<div><span class="k">${esc(byKey.get(k)?.label)}:</span> ${fmtCell(k, r)}</div>`).join('');
        return `<div class="engrep-rcard"><div class="h">${h}</div><div class="kv">${kv}</div></div>`;
      }).join('');
    }
    const thead = '<tr>' + cols.map((k) => `<th class="${byKey.get(k)?.numeric ? 'num' : ''}">${esc(byKey.get(k)?.label)}</th>`).join('') + '</tr>';
    let body = renderLevel(rows, 0);
    if (cfg.options.grandtot && cfg.sum.length) body += totalsRow(rows, 'Totale generale', 'engrep-grandtot');
    return head + `<table class="engrep-rtable${cfg.options.griglia ? ' grid' : ''}"><thead>${thead}</thead><tbody>${body}</tbody></table>`;
  }
  const docHtml = buildDocHtml();

  function printDoc() {
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      body{font-family:Inter,system-ui,sans-serif;color:#1B1D24;padding:24px}
      .rhead{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1B1D24;padding-bottom:10px;margin-bottom:4px}.rhead h2{font-size:20px;margin:0}.rhead .meta{font-size:11px;color:#8A8F9B;text-align:right}
      .engrep-rtable{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:10px}.engrep-rtable th{text-align:left;font-size:10px;text-transform:uppercase;color:#8A8F9B;padding:7px 9px;border-bottom:1.5px solid #E5E8EE}.engrep-rtable th.num,.engrep-rtable td.num{text-align:right;font-family:monospace}.engrep-rtable td{padding:7px 9px}.engrep-rtable.grid th,.engrep-rtable.grid td{border:1px solid #EEF0F4}
      .engrep-grouphdr td{background:#ECEAFE;color:#3B2EC0;font-weight:700;padding:8px 9px}.engrep-subtot td{font-weight:700;border-top:1px solid #E5E8EE;background:#FAFAFD}.engrep-grandtot td{font-weight:800;border-top:2px solid #1B1D24}
      .engrep-rcard{border:1px solid #E5E8EE;border-radius:12px;padding:12px;margin-bottom:9px}.engrep-rcard .h{font-weight:700;font-size:14px;margin-bottom:6px}.engrep-rcard .kv{display:grid;grid-template-columns:1fr 1fr;gap:5px 14px;font-size:12.5px}.engrep-rcard .kv .k{color:#8A8F9B}
      </style></head><body>${docHtml}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 250);
  }

  async function saveReport(name: string) {
    if (!presetEntity || !name.trim()) { setSavePromptOpen(false); return; }
    await mutate('POST', '/saved-reports', { entity: presetEntity, name: name.trim(), payload: cfg });
    setSavePromptOpen(false); void reports.reload();
  }
  function loadReport(id: string) { const r = reports.data?.items.find((x) => x.id === id); if (r) { setCfg(r.payload); setSelReport(id); } }
  async function delReport(id: string) { await mutate('DELETE', `/saved-reports/${id}`); setSelReport(''); void reports.reload(); }

  const optionDefs: [keyof Options, string][] = [['griglia', 'Linee griglia'], ['hideRep', 'Nascondi valori ripetuti'], ['subtot', 'Subtotali per gruppo'], ['grandtot', 'Totale generale'], ['pagine', 'Dividi in pagine']];

  return (
    <div className="engrep-overlay">
      <div className="engrep">
        <div className="engrep-head">
          <span style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--flow-grad)', display: 'grid', placeItems: 'center', color: '#fff' }}><FileText size={15} /></span>
          <span className="nm">Report — {title}</span>
          <div className="eng-saver" style={{ marginLeft: 'auto', border: 0, padding: 0, background: 'none' }}>
            <select value={selReport} onChange={(e) => e.target.value && loadReport(e.target.value)} style={{ height: 34, border: '1px solid var(--line)', borderRadius: 9, padding: '0 9px', background: 'var(--card)' }}>
              <option value="">Report salvato…</option>
              {(reports.data?.items ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <button className="ib danger" disabled={!selReport} onClick={() => selReport && void delReport(selReport)}><Trash2 size={15} /></button>
            <button className="ib pri" onClick={() => setSavePromptOpen(true)}><Save size={15} /></button>
          </div>
          <button className="x" title="Chiudi" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="engrep-aibar">
          <div className="spark"><Sparkles size={16} /></div>
          <input value={aiText} onChange={(e) => setAiText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') aiGenerate(); }}
            placeholder="Descrivi il report… es. «fatturato e numero commesse per paese, con i totali»" />
          <button className="btn btn-primary" onClick={aiGenerate}><Wand2 size={16} /> Genera</button>
        </div>

        <div className="engrep-cols">
          <div className="engrep-panel">
            <div className="engrep-seclbl"><Table2 /> Campi da mostrare</div>
            <div className="engrep-fc"><FieldChooser mode="report-show" fields={chooserFields} value={cfg.show} onChange={(v) => set({ show: v })} /></div>
            <div className="engrep-seclbl"><Sigma /> Totali</div>
            <div className="engrep-fc"><FieldChooser mode="report-sum" fields={chooserFields} value={cfg.sum} onChange={(v) => set({ sum: v })} /></div>
            <div className="engrep-seclbl"><Layers /> Raggruppa per</div>
            <div className="engrep-fc"><FieldChooser mode="report-group" fields={chooserFields} value={cfg.group} onChange={(v) => set({ group: v })} /></div>
            <div className="engrep-seclbl"><SlidersHorizontal /> Opzioni</div>
            <div className="engrep-opts">
              {optionDefs.map(([k, l]) => (
                <div key={k} className="engrep-optrow"><div className={`engrep-sw${cfg.options[k] ? ' on' : ''}`} onClick={() => set({ options: { ...cfg.options, [k]: !cfg.options[k] } })}><i /></div> {l}</div>
              ))}
              <div className="engrep-optrow">Layout <div className="engrep-layseg"><button className={cfg.layout === 'elenco' ? 'on' : ''} onClick={() => set({ layout: 'elenco' })}>Elenco</button><button className={cfg.layout === 'scheda' ? 'on' : ''} onClick={() => set({ layout: 'scheda' })}>Scheda</button></div></div>
            </div>
            <div className="engrep-gen"><button className="btn btn-ghost" onClick={() => set({ show: [], sum: [], group: [] })}><RotateCcw size={16} /> Azzera</button><button className="btn btn-primary" onClick={printDoc}><FileDown size={16} /> Genera HTML / PDF</button></div>
          </div>

          <div className="engrep-previewwrap">
            <div className="engrep-pvtop"><span className="t"><Eye size={14} /> Anteprima live</span><div className="acts">
              <button className="btn btn-ghost btn-sm" onClick={printDoc}><Printer size={14} /> Stampa</button>
              <button className="btn btn-ghost btn-sm" onClick={printDoc}><FileDown size={14} /> PDF</button>
            </div></div>
            <div className="engrep-sheet"><div className="engrep-doc" dangerouslySetInnerHTML={{ __html: docHtml }} /></div>
          </div>
        </div>
      </div>

      <PromptDialog open={savePromptOpen} title="Salva report" message="Dai un nome al report: potrai ricaricarlo quando vuoi."
        label="Nome report" placeholder="Es. Fatturato per paese" confirmLabel="Salva"
        onConfirm={(name) => void saveReport(name)} onCancel={() => setSavePromptOpen(false)} />
    </div>
  );
}
