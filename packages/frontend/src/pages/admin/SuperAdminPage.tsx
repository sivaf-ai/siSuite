/** SuperAdminPage — riservata a is_platform_admin (NOI). Gestione Demo Data Pack
 *  dall'app: carica / cancella i pack inclusi nel repo, vede i tenant presenti.
 *  Invisibile ai tenant (link in sidebar solo se isPlatformAdmin; endpoint guardati). */
import { useState } from 'react';
import { ShieldAlert, Database, Trash2, Download, RefreshCw } from 'lucide-react';
import { Page, Loading, ErrorBox } from '../../components/Page';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { useToast } from '../../ui/Toast';
import { useApi, mutate } from '../../api/hooks';
import { ApiError } from '../../api/client';

interface TenantInfo { id: string; name: string; vertical: string; users: number; engagements: number; demoPack: string | null }
interface PlatformDemo { packs: string[]; tenants: TenantInfo[] }
interface LoadSummary { tenantName: string; engagements: number; activities: number; users: number }

export function SuperAdminPage() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<PlatformDemo>('/platform/demo');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState<string | null>(null);

  const loadedPacks = new Set((data?.tenants ?? []).map((t) => t.demoPack).filter(Boolean) as string[]);

  function errMsg(e: unknown) { return e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message; }

  async function doLoad(pack: string) {
    setBusy(pack);
    try {
      const s = await mutate<LoadSummary>('POST', `/platform/demo/${pack}/load`);
      toast(`Pack “${pack}” caricato: ${s.tenantName} · ${s.engagements} commesse, ${s.users} utenti`);
      void reload();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(null); }
  }
  async function doWipe() {
    if (!confirmWipe) return;
    const pack = confirmWipe; setConfirmWipe(null); setBusy(pack);
    try {
      const r = await mutate<{ found: boolean; rows: number }>('POST', `/platform/demo/${pack}/wipe`);
      toast(r.found ? `Pack “${pack}” cancellato (${r.rows} righe)` : `Nessun dato per “${pack}”`);
      void reload();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(null); }
  }
  async function doReset(pack: string) {
    setBusy(pack);
    try {
      await mutate('POST', `/platform/demo/${pack}/wipe`);
      const s = await mutate<LoadSummary>('POST', `/platform/demo/${pack}/load`);
      toast(`Pack “${pack}” azzerato e ricaricato: ${s.engagements} commesse`);
      void reload();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(null); }
  }

  return (
    <Page title="Piattaforma">
      <div className="page-head">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}><ShieldAlert size={24} /> Piattaforma · Demo Data Pack</h1>
          <div className="sub">Riservato a noi (super admin). I dati di sistema non si toccano mai; ogni pack è un tenant a sé.</div>
        </div>
      </div>

      {loading && <Loading />}
      {error && <ErrorBox message={error} />}
      {data && (
        <>
          <div className="eyebrow" style={{ margin: '4px 2px 12px' }}>Pack disponibili</div>
          <div className="table-wrap" style={{ marginBottom: 22 }}>
            <table className="t">
              <thead><tr><th>Pack</th><th>Stato</th><th style={{ textAlign: 'right' }}>Azioni</th></tr></thead>
              <tbody>
                {data.packs.map((p) => {
                  const loaded = loadedPacks.has(p);
                  const isBusy = busy === p;
                  return (
                    <tr key={p}>
                      <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Database size={16} /><span className="cellname">{p}</span></span></td>
                      <td>{loaded
                        ? <span className="pill" style={{ color: 'var(--success)', background: 'var(--success-wash)' }}><span className="dot" />caricato</span>
                        : <span className="pill" style={{ color: 'var(--ink-soft)', background: 'var(--neutral-wash)' }}>non caricato</span>}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          {!loaded && <button className="btn btn-primary btn-sm" disabled={isBusy} onClick={() => doLoad(p)}><Download size={15} /> Carica</button>}
                          {loaded && <button className="btn btn-ghost btn-sm" disabled={isBusy} onClick={() => doReset(p)}><RefreshCw size={15} /> Azzera e ricarica</button>}
                          {loaded && <button className="btn btn-ghost btn-sm" disabled={isBusy} onClick={() => setConfirmWipe(p)} style={{ color: 'var(--danger)' }}><Trash2 size={15} /> Cancella</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="eyebrow" style={{ margin: '4px 2px 12px' }}>Tenant presenti</div>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Tenant</th><th>Verticale</th><th>Utenti</th><th>Commesse</th><th>Origine</th></tr></thead>
              <tbody>
                {data.tenants.map((t) => (
                  <tr key={t.id}>
                    <td className="cellname">{t.name}</td>
                    <td className="cellsub">{t.vertical}</td>
                    <td className="mono">{t.users}</td>
                    <td className="mono">{t.engagements}</td>
                    <td>{t.demoPack
                      ? <span className="chip">demo · {t.demoPack}</span>
                      : <span className="pill" style={{ color: 'var(--ink-soft)', background: 'var(--neutral-wash)' }}>sistema/produzione</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!confirmWipe} danger
        title={`Cancellare il pack “${confirmWipe}”?`}
        message="Verrà svuotato SOLO il tenant di questo pack (utenti, commesse, dati). I dati di sistema restano intatti."
        confirmLabel="Cancella" busy={!!busy}
        onConfirm={doWipe} onCancel={() => setConfirmWipe(null)}
      />
    </Page>
  );
}
