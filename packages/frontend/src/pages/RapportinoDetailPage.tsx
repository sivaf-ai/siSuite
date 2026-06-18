/**
 * RapportinoDetailPage — RAPPORTINO come archetipo DOCUMENTO (mock 48, Blocco F).
 * Testata + sezioni costi/ricavi (manodopera/attrezzature/materiali/subappalti/
 * lavorazioni) + foto + striscia totali costi/ricavi/margine. Card "Racconto AI"
 * (genera→modifica→conferma→firma; l'AI non scrive mai lo stato finale).
 */
import { useEffect, useState } from 'react';
import { useParams, useHistory } from 'react-router';
import { FileText, Sparkles, Check, PenLine, HardHat, Truck, Package, Scale, Wrench, Image } from 'lucide-react';
import type { WorkReportDto, EngagementDto } from '@sisuite/shared';
import { Page, Loading, ErrorBox } from '../components/Page';
import { StatusPill } from '../components/StatusPill';
import { ObjectPage, ObjectBox } from '../ui/ObjectPage';
import { PromptDialog } from '../ui/PromptDialog';
import { DocSectionTable, TotalsStrip, type DocSection } from '../ui/DocumentArchetype';
import { useApi, mutate } from '../api/hooks';
import { apiFetch } from '../api/client';
import { useToast } from '../ui/Toast';
import { useAuth } from '../auth/AuthContext';
import { useLookups } from '../context/Lookups';

const AUDIENCE_LABEL: Record<string, string> = { customer: 'Cliente', internal: 'Interno' };
const SECTION_ICON: Record<string, typeof HardHat> = { labor: HardHat, equipment: Truck, materials: Package, subcontract: Scale, worklines: Wrench };

interface DocResp {
  report: WorkReportDto;
  engagement: { code: string; title: string; company: string | null };
  sections: DocSection[];
  photos: { id: string; mediaUrl: string; caption: string | null; createdAt: string }[];
  totals: { cost: number; revenue: number; margin: number; marginPct: number | null };
}

export function RapportinoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const history = useHistory();
  const toast = useToast();
  const lk = useLookups();
  const { user } = useAuth();
  const can = (a: string) => !!user?.permissions.includes(`work_report:${a}` as never);

  const doc = useApi<DocResp>(isNew ? null : `/work-reports/${id}/document`);
  const engs = useApi<{ items: EngagementDto[] }>('/engagements');

  const [finalText, setFinalText] = useState('');
  const [busy, setBusy] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  // creazione
  const [nEng, setNEng] = useState('');
  const [nAudience, setNAudience] = useState<'customer' | 'internal'>('customer');
  const [nRaw, setNRaw] = useState('');

  const r = doc.data?.report;
  useEffect(() => { if (r) setFinalText(r.finalText ?? r.aiText ?? ''); }, [r]);

  const canonicalOf = (sid: string | null) => lk.byId(sid)?.canonical ?? null;
  const status = r ? canonicalOf(r.statusId) : null;
  const signed = status === 'signed';
  const confirmed = status === 'confirmed' || signed;

  async function createReport() {
    if (!nEng) { toast('Scegli la commessa', 'error'); return; }
    setBusy(true);
    try {
      const created = await mutate<WorkReportDto>('POST', '/work-reports', { engagementId: nEng, audience: nAudience, rawText: nRaw || undefined });
      toast('Rapportino creato'); history.replace(`/work-reports/${created.id}`);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function generate() {
    if (!r) return; setBusy(true);
    try { await mutate('POST', `/work-reports/${r.id}/generate`); toast('Testo proposto'); void doc.reload(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function saveConfirm(confirm: boolean) {
    if (!r) return; setBusy(true);
    try { await mutate('PATCH', `/work-reports/${r.id}`, { finalText, confirm }); toast(confirm ? 'Rapportino confermato' : 'Testo salvato'); void doc.reload(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function doSign(signerName: string) {
    if (!r) return;
    setSignOpen(false); setBusy(true);
    try { await apiFetch(`/work-reports/${r.id}/sign`, { method: 'POST', body: JSON.stringify({ signerName }) }); toast('Rapportino firmato'); void doc.reload(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  if (isNew) {
    return (
      <Page title="Nuovo rapportino" bleed>
        <ObjectPage backLabel="Rapportini" onBack={() => history.push('/work-reports')} title="Nuovo rapportino"
          onSave={can('create') ? createReport : undefined} onCancel={() => history.push('/work-reports')} saving={busy}>
          <ObjectBox icon={FileText} title="Testata rapportino">
            <div className="bgrid">
              <div className="bf c2"><span className="bl">Commessa <span className="req">*</span></span>
                <select className="bi" value={nEng} onChange={(e) => setNEng(e.target.value)}>
                  <option value="">— seleziona —</option>
                  {(engs.data?.items ?? []).map((e) => <option key={e.id} value={e.id}>{e.code} · {e.title}</option>)}
                </select></div>
              <div className="bf c2"><span className="bl">Destinatario</span>
                <select className="bi" value={nAudience} onChange={(e) => setNAudience(e.target.value as typeof nAudience)}>
                  <option value="customer">Cliente (niente costi)</option><option value="internal">Interno (con costi)</option>
                </select></div>
              <div className="bf c4"><span className="bl">Note grezze (opzionale)</span>
                <textarea className="bi" style={{ height: 'auto', minHeight: 70, padding: '9px 11px', alignItems: 'stretch' }} value={nRaw} onChange={(e) => setNRaw(e.target.value)} /></div>
            </div>
          </ObjectBox>
        </ObjectPage>
      </Page>
    );
  }

  if (doc.loading) return <Page title="Rapportino"><Loading /></Page>;
  if (doc.error) return <Page title="Rapportino"><ErrorBox message={doc.error} /></Page>;
  if (!doc.data || !r) return <Page title="Rapportino"><ErrorBox message="Rapportino non trovato" /></Page>;

  const { engagement, sections, photos, totals } = doc.data;
  const isInternal = r.audience === 'internal';

  return (
    <Page title={`Rapportino ${engagement.code}`} bleed>
      <ObjectPage
        backLabel="Rapportini" onBack={() => history.push('/work-reports')}
        title={`Rapportino ${engagement.code}`} code={engagement.company ?? undefined}
        status={lk.byId(r.statusId) ? <StatusPill label={lk.labelOf(r.statusId)} token={lk.byId(r.statusId)?.colorToken} /> : undefined}
      >
        <ObjectBox icon={FileText} title="Testata">
          <div className="bgrid">
            <div className="bf c2"><span className="bl">Commessa</span><div className="bi">{engagement.code} · {engagement.title}</div></div>
            <div className="bf"><span className="bl">Destinatario</span><div className="bi">{AUDIENCE_LABEL[r.audience] ?? r.audience}</div></div>
            <div className="bf"><span className="bl">Periodo</span><div className="bi mono">{r.periodStart ? `${r.periodStart} → ${r.periodEnd ?? ''}` : '—'}</div></div>
          </div>
        </ObjectBox>

        {/* Racconto AI */}
        <ObjectBox icon={Sparkles} title="Racconto AI"
          action={can('create') && !signed ? { label: busy ? 'Genero…' : (r.aiText ? 'Rigenera' : 'Genera'), onClick: generate } : undefined}>
          {r.rawText && <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 8 }}><b>Note grezze:</b> {r.rawText}</div>}
          <textarea className="bi" style={{ height: 'auto', minHeight: 130, padding: '9px 11px', alignItems: 'stretch', width: '100%' }}
            value={finalText} disabled={signed} onChange={(e) => setFinalText(e.target.value)}
            placeholder="Genera una proposta o scrivi qui il testo del rapportino…" />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10, flexWrap: 'wrap' }}>
            {can('update') && !signed && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => saveConfirm(false)}>Salva testo</button>}
            {can('update') && !confirmed && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => saveConfirm(true)}><Check size={15} /> Conferma</button>}
            {can('update') && confirmed && !signed && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setSignOpen(true)}><PenLine size={15} /> Firma</button>}
            {signed && r.signerName && <span className="faint" style={{ alignSelf: 'center' }}>Firmato da {r.signerName}</span>}
          </div>
        </ObjectBox>

        {/* Striscia totali (vista back-office) */}
        <TotalsStrip cost={totals.cost} revenue={totals.revenue} margin={totals.margin} marginPct={totals.marginPct} />
        {!isInternal && <div className="faint" style={{ fontSize: 12, margin: '-8px 2px 10px' }}>Nota: i costi/margini sono visibili solo in back-office; nel documento al cliente non compaiono (audience «Cliente»).</div>}

        {/* Sezioni-righe */}
        {sections.map((s) => <DocSectionTable key={s.key} section={s} icon={SECTION_ICON[s.key]} />)}

        {/* Foto */}
        <ObjectBox icon={Image} title="Foto">
          {photos.length === 0 ? <div className="dsx-empty">Nessuna foto allegata.</div>
            : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {photos.map((p) => (
                  <a key={p.id} href={p.mediaUrl} target="_blank" rel="noreferrer" style={{ width: 120 }}>
                    <img src={p.mediaUrl} alt={p.caption ?? 'foto'} style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
                    {p.caption && <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>{p.caption}</div>}
                  </a>
                ))}
              </div>}
        </ObjectBox>
      </ObjectPage>
      <PromptDialog open={signOpen} title="Firma rapportino"
        message="Inserisci il nome di chi firma il rapportino." label="Nome del firmatario"
        placeholder="Nome e cognome" confirmLabel="Firma"
        onConfirm={(name) => void doSign(name)} onCancel={() => setSignOpen(false)} />
    </Page>
  );
}
