/** NumbersSettings — "Numerazioni" fedele al mock 16: tabella serie/formati con
 *  anteprima del prossimo codice. Aggiungi/modifica/elimina. Riusa /number-series. */
import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import type { NumberSeriesDto } from '@sisuite/shared';
import { Loading, ErrorBox } from '../../components/Page';
import { Drawer } from '../../ui/Drawer';
import { Field, type RenderableField } from '../../ui/Field';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { useToast } from '../../ui/Toast';
import { useApi, mutate } from '../../api/hooks';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

const RESET: Record<string, string> = { never: 'Mai', yearly: 'Annuale', monthly: 'Mensile' };

/** descrizione leggibile per chiave di numerazione (la chiave resta come sottotitolo). */
const KEY_LABEL: Record<string, string> = {
  engagement: 'Commesse', receipt: 'Ricevute', invoice: 'Fatture', quote: 'Preventivi', order: 'Ordini',
  ddt: 'Bolle / DDT', stock_receipt: 'Carichi magazzino', stock_adjustment: 'Rettifiche magazzino',
};
function keyLabel(key: string): string {
  return KEY_LABEL[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** anteprima del prossimo codice (approssimata, lato client). */
function preview(format: string, lastNumber: number): string {
  const now = new Date();
  const y = now.getUTCFullYear().toString();
  const m = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const next = lastNumber + 1;
  return format.replace(/\{YYYY\}/g, y).replace(/\{YY\}/g, y.slice(-2)).replace(/\{MM\}/g, m)
    .replace(/\{SEQ:(\d+)\}/g, (_x, n: string) => next.toString().padStart(Number(n), '0'));
}

export function NumbersSettings() {
  const toast = useToast();
  const { user } = useAuth();
  const canManage = !!user?.permissions.includes('settings:manage' as never);
  const { data, loading, error, reload } = useApi<{ items: NumberSeriesDto[] }>('/number-series?limit=200');
  const [editing, setEditing] = useState<NumberSeriesDto | null | undefined>(undefined);
  const [confirm, setConfirm] = useState<NumberSeriesDto | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = data?.items ?? [];

  async function doDelete() {
    if (!confirm) return;
    setBusy(true);
    try { await mutate('DELETE', `/number-series/${confirm.id}`); toast('Numeratore eliminato'); setConfirm(null); void reload(); }
    catch (e) { toast((e as Error).message, 'error'); setConfirm(null); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Numerazione</th><th>Formato</th><th>Azzeramento</th><th>Anteprima</th><th>Ultimo</th>{canManage && <th />}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6}><Loading /></td></tr>
              : error ? <tr><td colSpan={6}><ErrorBox message={error} /></td></tr>
                : rows.map((r) => (
                  <tr key={r.id}>
                    <td><div className="cellname">{keyLabel(r.key)}</div><div className="cellsub mono">{r.key}</div></td>
                    <td><span className="mono">{r.format}</span></td>
                    <td>{RESET[r.resetPeriod] ?? r.resetPeriod}</td>
                    <td><span className="mono" style={{ color: 'var(--brand-ink)' }}>{preview(r.format, r.lastNumber)}</span></td>
                    <td className="mono cellsub">{r.lastNumber}</td>
                    {canManage && <td onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions">
                        <div className="act-icon" title="Modifica" onClick={() => setEditing(r)}><Pencil size={15} /></div>
                        <div className="act-icon danger" title="Elimina" onClick={() => setConfirm(r)}><Trash2 size={15} /></div>
                      </div>
                    </td>}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {canManage && <div style={{ marginTop: 12 }}><button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}><Plus size={16} /> Nuovo numeratore</button></div>}
      <p className="faint" style={{ fontSize: 13, marginTop: 14, color: 'var(--ink-faint)' }}>
        Ogni identificativo visibile passa da una <b>serie numerica</b> con formato a segnaposto (<span className="mono">YYYY</span>, <span className="mono">MM</span>, <span className="mono">SEQ</span>) e reset. Gli UUID interni non si mostrano mai.
      </p>

      {editing !== undefined && (
        <NumberDrawer editing={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); void reload(); }} toast={toast} />
      )}
      <ConfirmDialog open={!!confirm} danger title="Eliminare il numeratore?"
        message={`“${confirm?.key}” verrà rimosso.`} confirmLabel="Elimina" busy={busy} onConfirm={doDelete} onCancel={() => setConfirm(null)} />
    </>
  );
}

function NumberDrawer({ editing, onClose, onSaved, toast }: {
  editing: NumberSeriesDto | null; onClose: () => void; onSaved: () => void; toast: (m: string, t?: 'error') => void;
}) {
  const [v, setV] = useState<Record<string, unknown>>(() => ({ key: editing?.key ?? '', format: editing?.format ?? '{YYYY}-{SEQ:4}', resetPeriod: editing?.resetPeriod ?? 'yearly' }));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fields: RenderableField[] = [
    { key: 'key', label: 'Chiave (entità)', dataType: 'text', required: !editing, help: editing ? 'Non modificabile.' : 'Es. engagement, receipt, invoice.' },
    { key: 'format', label: 'Formato', dataType: 'text', required: true, help: '{YYYY} {YY} {MM} {SEQ:n} — es. {YYYY}-{SEQ:4}' },
    { key: 'resetPeriod', label: 'Azzeramento', dataType: 'select', required: true, options: [
      { value: 'never', label: { 'it-IT': 'Mai' } }, { value: 'yearly', label: { 'it-IT': 'Annuale' } }, { value: 'monthly', label: { 'it-IT': 'Mensile' } },
    ] },
  ];
  async function submit() {
    const errs: Record<string, string> = {};
    if (!editing && !String(v.key ?? '').trim()) errs.key = 'Campo obbligatorio';
    if (!String(v.format ?? '').trim()) errs.format = 'Campo obbligatorio';
    setErrors(errs); if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      if (editing) await mutate('PATCH', `/number-series/${editing.id}`, { format: v.format, resetPeriod: v.resetPeriod });
      else await mutate('POST', '/number-series', { key: v.key, format: v.format, resetPeriod: v.resetPeriod });
      toast(editing ? 'Numeratore aggiornato' : 'Numeratore creato'); onSaved();
    } catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? `Errore ${e.status}`) : (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }
  return (
    <Drawer open title={editing ? 'Modifica numeratore' : 'Nuovo numeratore'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Annulla</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{editing ? 'Salva' : 'Crea'}</button>
      </>}>
      <div className="form-group">{fields.map((f) => <Field key={f.key} field={f} value={v[f.key]} error={errors[f.key]} onChange={(val) => setV((s) => ({ ...s, [f.key]: val }))} />)}</div>
    </Drawer>
  );
}
