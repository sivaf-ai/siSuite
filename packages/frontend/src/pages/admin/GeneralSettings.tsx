/** GeneralSettings — "Generale" (mock 18). Valori dell'organizzazione; l'ORARIO
 *  DI LAVORO è editabile e PERSISTENTE (alimenta il motore di pianificazione). */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale, TenantSettingsDto } from '@sisuite/shared';
import { Loading, ErrorBox } from '../../components/Page';
import { useToast } from '../../ui/Toast';
import { useApi, mutate } from '../../api/hooks';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { changeLanguage, currentLocale, LOCALES } from '../../i18n';
import { WorkingHoursEditor, whHasErrors, type WH } from '../../ui/WorkingHoursEditor';

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <div className={`switch${on ? ' on' : ''}`} onClick={onToggle} role="switch" aria-checked={on}>
      <span className="track"><span className="knob" /></span>
    </div>
  );
}

export function GeneralSettings() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const canManage = !!user?.permissions.includes('settings:manage' as never);
  const { data, loading, error, reload } = useApi<TenantSettingsDto>('/settings');
  const [wh, setWh] = useState<WH>({});
  const [busy, setBusy] = useState(false);
  const dark = theme === 'dark';
  const [push, setPush] = useState(true);
  const [portal, setPortal] = useState(false);
  useEffect(() => { if (data) setWh(data.workingHours ?? {}); }, [data]);

  async function saveHours() {
    if (whHasErrors(wh)) { toast('Correggi gli intervalli orari (fine dopo inizio, niente sovrapposizioni)', 'error'); return; }
    setBusy(true);
    try {
      const cleaned: WH = {};
      for (const k of WEEK) cleaned[k] = wh[k] ?? [];
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
            <div className="set-row">
              <div className="st"><b>{t('settings.general.myLanguage')}</b><span>{t('settings.general.myLanguageDesc')}</span></div>
              <select className="txt" style={{ width: 'auto', minWidth: 160, height: 38 }} value={currentLocale()}
                onChange={(e) => changeLanguage(e.target.value as Locale)}>
                {LOCALES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>
            <div className="set-row"><div className="st"><b>{t('settings.general.orgLanguage')}</b><span>{t('settings.general.orgLanguageDesc')}</span></div><span className="selv">{data.defaultLocale}</span></div>
            <div className="set-row"><div className="st"><b>{t('settings.general.timezone')}</b><span>{t('settings.general.timezoneDesc')}</span></div><span className="selv">{data.timezone}</span></div>
            <div className="set-row"><div className="st"><b>{t('settings.general.vertical')}</b><span>{t('settings.general.verticalDesc')}</span></div><span className="selv">{data.vertical}</span></div>
            <div className="set-row"><div className="st"><b>{t('settings.general.darkTheme')}</b><span>{t('settings.general.darkThemeDesc')}</span></div><Switch on={dark} onToggle={() => setTheme(dark ? 'light' : 'dark')} /></div>
            <div className="set-row"><div className="st"><b>{t('settings.general.push')}</b><span>{t('settings.general.pushDesc')}</span></div><Switch on={push} onToggle={() => setPush((x) => !x)} /></div>
            <div className="set-row"><div className="st"><b>{t('settings.general.portal')}</b><span>{t('settings.general.portalDesc')}</span></div><Switch on={portal} onToggle={() => setPortal((x) => !x)} /></div>
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <div className="ph"><h3>Orario di lavoro</h3>{canManage && <button className="btn btn-primary btn-sm" disabled={busy} onClick={saveHours}>Salva orario</button>}</div>
            <div className="pb" style={{ paddingTop: 14 }}>
              <WorkingHoursEditor value={wh} onChange={setWh} disabled={!canManage} />
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
