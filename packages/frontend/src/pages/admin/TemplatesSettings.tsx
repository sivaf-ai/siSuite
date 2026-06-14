/** TemplatesSettings — MODELLI di commessa (parte: instanziazione blueprint).
 *  Lista i modelli del tenant; "Usa" istanzia una nuova commessa (scelta cliente
 *  + titolo) creando fasi/attività/dipendenze; elimina i modelli. I modelli si
 *  CREANO da una commessa esistente ("Salva come modello" nel dettaglio). */
import { useState } from 'react';
import { useHistory } from 'react-router';
import { Plus, Trash2, FileStack } from 'lucide-react';
import type { CompanyDto, EngagementTemplateDto } from '@sisuite/shared';
import { Loading, ErrorBox } from '../../components/Page';
import { Drawer } from '../../ui/Drawer';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { useToast } from '../../ui/Toast';
import { useApi, mutate } from '../../api/hooks';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

export function TemplatesSettings() {
  const toast = useToast();
  const history = useHistory();
  const { user } = useAuth();
  const canManage = !!user?.permissions.includes('engagement:create' as never);
  const { data, loading, error, reload } = useApi<{ items: EngagementTemplateDto[] }>('/engagement-templates');
  const [use, setUse] = useState<EngagementTemplateDto | null>(null);
  const [confirm, setConfirm] = useState<EngagementTemplateDto | null>(null);
  const [busy, setBusy] = useState(false);

  async function doDelete() {
    if (!confirm) return;
    setBusy(true);
    try { await mutate('DELETE', `/engagement-templates/${confirm.id}`); toast('Modello eliminato'); setConfirm(null); void reload(); }
    catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? 'Errore') : (e as Error).message, 'error'); setConfirm(null); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="panel">
        <div className="ph"><h3>Modelli di commessa</h3></div>
        <div className="pb" style={{ padding: 0 }}>
          {loading ? <Loading /> : error ? <ErrorBox message={error} /> : (data?.items.length ?? 0) === 0
            ? <div style={{ padding: 20, color: 'var(--ink-soft)' }}>Nessun modello. Aprendo una commessa, usa “Salva come modello”.</div>
            : data!.items.map((t) => (
              <div className="lv-row" key={t.id}>
                <span className="swatch" style={{ background: 'var(--brand-wash)', color: 'var(--brand)', display: 'grid', placeItems: 'center' }}><FileStack size={15} /></span>
                <span className="lvname">{t.name}<span className="chip" style={{ marginLeft: 8 }}>{t.type === 'build' ? 'Realizzazione' : 'Manutenzione'}</span></span>
                <span className="canon">{t.phaseCount} fasi · {t.activityCount} attività</span>
                {canManage && (
                  <span className="lv-acts" style={{ opacity: 1 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setUse(t)}><Plus size={14} />Usa</button>
                    <button className="act-icon danger" title="Elimina" onClick={() => setConfirm(t)}><Trash2 size={15} /></button>
                  </span>
                )}
              </div>
            ))}
        </div>
      </div>
      <p className="faint" style={{ fontSize: 13, color: 'var(--ink-faint)' }}>
        Un modello cattura <b>fasi, attività e dipendenze</b> di una commessa-tipo. “Usa” crea una nuova commessa pronta da pianificare.
      </p>

      {use && <InstantiateDrawer template={use} onClose={() => setUse(null)}
        onDone={(id) => { setUse(null); toast('Commessa creata dal modello'); history.push(`/engagements/${id}`); }} toast={toast} />}
      <ConfirmDialog open={!!confirm} danger title="Eliminare il modello?"
        message={`“${confirm?.name}” verrà rimosso. Le commesse già create non sono toccate.`}
        confirmLabel="Elimina" busy={busy} onConfirm={doDelete} onCancel={() => setConfirm(null)} />
    </>
  );
}

function InstantiateDrawer({ template, onClose, onDone, toast }: {
  template: EngagementTemplateDto; onClose: () => void; onDone: (id: string) => void; toast: (m: string, t?: 'error') => void;
}) {
  const companies = useApi<{ items: CompanyDto[] }>('/companies');
  const [companyId, setCompanyId] = useState('');
  const [title, setTitle] = useState(template.name);
  const [startedOn, setStartedOn] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    const cid = companyId || companies.data?.items[0]?.id;
    if (!cid) { toast('Seleziona un cliente', 'error'); return; }
    setBusy(true);
    try {
      const r = await mutate<{ id: string }>('POST', '/engagements/from-template', {
        templateId: template.id, companyId: cid, title: title.trim() || undefined, startedOn: startedOn || undefined,
      });
      onDone(r.id);
    } catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? 'Errore') : (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Drawer open title={`Nuova commessa da “${template.name}”`} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Annulla</button>
        <button className="btn btn-primary" onClick={create} disabled={busy}>Crea commessa</button>
      </>}>
      <div className="form-group">
        <div className="field">
          <label>Cliente<span className="req">*</span></label>
          <select className="txt" value={companyId || companies.data?.items[0]?.id || ''} onChange={(e) => setCompanyId(e.target.value)}>
            {(companies.data?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
          </select>
        </div>
        <div className="field"><label>Titolo</label><input className="txt" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="field"><label>Inizio (opz.)</label><input className="txt" type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} /></div>
        <p className="faint" style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>Verranno create {template.phaseCount} fasi e {template.activityCount} attività con le relative dipendenze.</p>
      </div>
    </Drawer>
  );
}
