/**
 * RapportiniPage — RAPPORTINO AI (§5). Lista dei rapportini + cassetto di
 * lavorazione: genera (AI o deterministico) → l'uomo modifica il testo finale
 * → conferma → firma. La regola billing_mode/audience (niente costi al cliente)
 * è applicata lato API; qui mostriamo solo il testo prodotto.
 */
import { useMemo, useState } from 'react';
import { FileText, Plus, Sparkles, Check, PenLine } from 'lucide-react';
import type { WorkReportDto, EngagementDto, PermissionKey } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { DataTable, type Column } from '../ui/DataTable';
import { EmptyState } from '../ui/EmptyState';
import { Drawer } from '../ui/Drawer';
import { useApi, mutate } from '../api/hooks';
import { useLookups } from '../context/Lookups';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';

const AUDIENCE_LABEL: Record<string, string> = { customer: 'Cliente', internal: 'Interno' };

export function RapportiniPage() {
  const lk = useLookups();
  const toast = useToast();
  const { user } = useAuth();
  const perms = new Set<PermissionKey>((user?.permissions ?? []) as PermissionKey[]);
  const canCreate = perms.has('work_report:create');
  const canUpdate = perms.has('work_report:update');

  const wr = useApi<{ items: WorkReportDto[] }>('/work-reports');
  const engs = useApi<{ items: EngagementDto[] }>('/engagements');
  const engById = useMemo(() => new Map((engs.data?.items ?? []).map((e) => [e.id, e])), [engs.data]);

  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<WorkReportDto | null>(null);
  const [finalText, setFinalText] = useState('');

  // nuovo rapportino
  const [newOpen, setNewOpen] = useState(false);
  const [nEng, setNEng] = useState('');
  const [nAudience, setNAudience] = useState<'customer' | 'internal'>('customer');
  const [nRaw, setNRaw] = useState('');

  const canonicalOf = (id: string | null) => lk.byId(id)?.canonical ?? null;

  function openReport(r: WorkReportDto) {
    setSel(r);
    setFinalText(r.finalText ?? r.aiText ?? '');
  }

  async function createReport() {
    if (!nEng) { toast('Scegli la commessa', 'error'); return; }
    setBusy(true);
    try {
      const created = await mutate<WorkReportDto>('POST', '/work-reports', {
        engagementId: nEng, audience: nAudience, rawText: nRaw || undefined,
      });
      toast('Rapportino creato', 'success');
      setNewOpen(false); setNEng(''); setNAudience('customer'); setNRaw('');
      await wr.reload();
      openReport(created);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  async function generate() {
    if (!sel) return;
    setBusy(true);
    try {
      const r = await mutate<WorkReportDto>('POST', `/work-reports/${sel.id}/generate`);
      setSel(r); setFinalText(r.finalText ?? r.aiText ?? '');
      toast(r.generatedByAi ? 'Testo generato dall\'AI' : 'Testo proposto', 'success');
      await wr.reload();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  async function saveConfirm(confirm: boolean) {
    if (!sel) return;
    setBusy(true);
    try {
      const r = await mutate<WorkReportDto>('PATCH', `/work-reports/${sel.id}`, { finalText, confirm });
      setSel(r);
      toast(confirm ? 'Rapportino confermato' : 'Testo salvato', 'success');
      await wr.reload();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  async function sign() {
    if (!sel) return;
    const signerName = window.prompt('Nome del firmatario:');
    if (!signerName) return;
    setBusy(true);
    try {
      const r = await mutate<WorkReportDto>('POST', `/work-reports/${sel.id}/sign`, { signerName });
      setSel(r);
      toast('Rapportino firmato', 'success');
      await wr.reload();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  const cols: Column<WorkReportDto>[] = [
    { key: 'eng', header: 'Commessa', render: (r) => <span className="cellname">{engById.get(r.engagementId)?.code ?? '—'}</span> },
    { key: 'audience', header: 'Destinatario', render: (r) => <span className="chip">{AUDIENCE_LABEL[r.audience] ?? r.audience}</span> },
    { key: 'period', header: 'Periodo', render: (r) => <span className="cellsub">{r.periodStart ? `${r.periodStart} → ${r.periodEnd ?? ''}` : '—'}</span> },
    { key: 'status', header: 'Stato', render: (r) => { const l = lk.byId(r.statusId); return l ? <StatusPill label={lk.labelOf(r.statusId)} token={l.colorToken} /> : '—'; } },
    { key: 'ai', header: 'AI', render: (r) => (r.generatedByAi ? <Sparkles size={15} style={{ color: 'var(--c-info, #2d7ef7)' }} /> : '') },
  ];

  if (wr.error) return <Page title="Rapportini"><ErrorBox message={wr.error} /></Page>;

  const status = sel ? canonicalOf(sel.statusId) : null;
  const signed = status === 'signed';
  const confirmed = status === 'confirmed' || signed;

  return (
    <Page title="Rapportini">
      {canCreate && (
        <div className="toolbar" style={{ marginBottom: 10 }}>
          <span className="spacer" style={{ flex: 1 }} />
          <button className="btn btn-primary btn-sm" onClick={() => setNewOpen(true)}><Plus size={16} /> Nuovo rapportino</button>
        </div>
      )}
      {wr.loading ? <Loading /> : <DataTable columns={cols} rows={wr.data?.items ?? []} onRowClick={openReport}
        empty={<EmptyState icon={FileText} title="Nessun rapportino" hint="Crea un rapportino da una commessa." />} />}

      {/* nuovo */}
      <Drawer open={newOpen} title="Nuovo rapportino" onClose={() => setNewOpen(false)} footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => setNewOpen(false)}>Annulla</button>
          <button className="btn btn-primary" disabled={busy} onClick={createReport}>Crea</button>
        </div>
      }>
        <div className="field"><label>Commessa<span className="req">*</span></label>
          <select className="txt" value={nEng} onChange={(e) => setNEng(e.target.value)}>
            <option value="">—</option>
            {(engs.data?.items ?? []).map((e) => <option key={e.id} value={e.id}>{e.code} · {e.title}</option>)}
          </select></div>
        <div className="field"><label>Destinatario</label>
          <select className="txt" value={nAudience} onChange={(e) => setNAudience(e.target.value as typeof nAudience)}>
            <option value="customer">Cliente (niente costi)</option>
            <option value="internal">Interno (con costi)</option>
          </select></div>
        <div className="field"><label>Note grezze (opzionale)</label>
          <textarea className="txt" value={nRaw} onChange={(e) => setNRaw(e.target.value)} placeholder="Cosa è stato fatto…" /></div>
      </Drawer>

      {/* lavorazione */}
      <Drawer open={!!sel} title={sel ? `Rapportino ${engById.get(sel.engagementId)?.code ?? ''}` : ''} onClose={() => setSel(null)}
        footer={sel && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {canCreate && !signed && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={generate}><Sparkles size={15} /> Genera</button>}
            {canUpdate && !signed && <button className="btn btn-sm" disabled={busy} onClick={() => saveConfirm(false)}>Salva</button>}
            {canUpdate && !confirmed && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => saveConfirm(true)}><Check size={15} /> Conferma</button>}
            {canUpdate && confirmed && !signed && <button className="btn btn-primary btn-sm" disabled={busy} onClick={sign}><PenLine size={15} /> Firma</button>}
          </div>
        )}>
        {sel && (
          <>
            <div className="field"><label>Stato</label>
              <div>{lk.byId(sel.statusId) ? <StatusPill label={lk.labelOf(sel.statusId)} token={lk.byId(sel.statusId)?.colorToken} /> : '—'}
                {signed && sel.signerName && <span className="cellsub" style={{ marginLeft: 8 }}>firmato da {sel.signerName}</span>}</div>
            </div>
            {sel.rawText && <div className="field"><label>Note grezze</label><div className="cellsub">{sel.rawText}</div></div>}
            {sel.aiText && <div className="field"><label>Proposta AI</label><div className="cellsub" style={{ whiteSpace: 'pre-wrap' }}>{sel.aiText}</div></div>}
            <div className="field"><label>Testo finale</label>
              <textarea className="txt" style={{ minHeight: 160 }} value={finalText} disabled={signed}
                onChange={(e) => setFinalText(e.target.value)} placeholder="Genera una proposta o scrivi qui il testo del rapportino…" /></div>
          </>
        )}
      </Drawer>
    </Page>
  );
}
