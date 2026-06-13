/** GeneralSettings — "Generale" (mock 18). Valori dell'organizzazione; l'ORARIO
 *  DI LAVORO è editabile e PERSISTENTE (alimenta il motore di pianificazione). */
import { useEffect, useState } from 'react';
import type { TenantSettingsDto } from '@sisuite/shared';
import { Loading, ErrorBox } from '../../components/Page';
import { useToast } from '../../ui/Toast';
import { useApi, mutate } from '../../api/hooks';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

const DAYS: { key: string; label: string }[] = [
  { key: 'mon', label: 'Lunedì' }, { key: 'tue', label: 'Martedì' }, { key: 'wed', label: 'Mercoledì' },
  { key: 'thu', label: 'Giovedì' }, { key: 'fri', label: 'Venerdì' }, { key: 'sat', label: 'Sabato' }, { key: 'sun', label: 'Domenica' },
];
type WH = Record<string, [string, string][]>;
const toText = (iv: [string, string][] | undefined) => (iv ?? []).map(([a, b]) => `${a}-${b}`).join(', ');
function parseText(s: string): [string, string][] {
  return s.split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
    const [a, b] = x.split('-').map((t) => t.trim());
    return [a ?? '', b ?? ''] as [string, string];
  }).filter(([a, b]) => /^([01]\d|2[0-3]):[0-5]\d$/.test(a) && /^([01]\d|2[0-3]):[0-5]\d$/.test(b));
}

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return <div className={`switch${on ? ' on' : ''}`} onClick={onToggle} role="switch" aria-checked={on} />;
}

export function GeneralSettings() {
  const { user } = useAuth();
  const toast = useToast();
  const canManage = !!user?.permissions.includes('settings:manage' as never);
  const { data, loading, error, reload } = useApi<TenantSettingsDto>('/settings');
  const [wh, setWh] = useState<WH>({});
  const [busy, setBusy] = useState(false);
  const [dark, setDark] = useState(false);
  const [push, setPush] = useState(true);
  const [portal, setPortal] = useState(false);
  useEffect(() => { if (data) setWh(data.workingHours ?? {}); }, [data]);

  async function saveHours() {
    setBusy(true);
    try {
      const cleaned: WH = {};
      for (const d of DAYS) cleaned[d.key] = wh[d.key] ?? [];
      await mutate('PATCH', '/settings/working-hours', { workingHours: cleaned });
      toast('Orario di lavoro salvato');
      void reload();
    } catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? 'Errore') : (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <>
      {loading && <Loading />}
      {error && <ErrorBox message={error} />}
      {data && (
        <>
          <div className="panel">
            <div className="set-row"><div className="st"><b>Lingua dell'organizzazione</b><span>Lingua predefinita dell'interfaccia</span></div><span className="selv">{data.defaultLocale}</span></div>
            <div className="set-row"><div className="st"><b>Fuso orario</b><span>Usato per pianificazione e scadenze</span></div><span className="selv">{data.timezone}</span></div>
            <div className="set-row"><div className="st"><b>Verticale</b><span>Dominio di lavoro (domain pack)</span></div><span className="selv">{data.vertical}</span></div>
            <div className="set-row"><div className="st"><b>Tema scuro</b><span>Segui le impostazioni di sistema</span></div><Switch on={dark} onToggle={() => setDark((x) => !x)} /></div>
            <div className="set-row"><div className="st"><b>Notifiche push</b><span>Avvisi su scadenze e nuove catture</span></div><Switch on={push} onToggle={() => setPush((x) => !x)} /></div>
            <div className="set-row"><div className="st"><b>Portale cliente</b><span>Abilita l'accesso esterno ai referenti</span></div><Switch on={portal} onToggle={() => setPortal((x) => !x)} /></div>
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <div className="ph"><h3>Orario di lavoro</h3>{canManage && <button className="btn btn-primary btn-sm" disabled={busy} onClick={saveHours}>Salva orario</button>}</div>
            <div className="pb">
              {DAYS.map((d) => (
                <div className="set-row" key={d.key}>
                  <div className="st"><b>{d.label}</b><span>Intervalli, es. 08:00-13:00, 14:00-18:00 (vuoto = chiuso)</span></div>
                  <input className="txt" style={{ maxWidth: 280 }} disabled={!canManage}
                    defaultValue={toText(wh[d.key])}
                    onBlur={(e) => setWh((s) => ({ ...s, [d.key]: parseText(e.target.value) }))} />
                </div>
              ))}
            </div>
          </div>
          <p className="faint" style={{ fontSize: 13, marginTop: 14, color: 'var(--ink-faint)' }}>
            L'<b>orario di lavoro</b> alimenta il motore di pianificazione: le attività dinamiche si collocano solo nelle fasce disponibili (meno ferie/indisponibilità delle risorse).
          </p>
        </>
      )}
    </>
  );
}
