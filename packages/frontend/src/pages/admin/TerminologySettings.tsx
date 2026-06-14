/** TerminologySettings (parte 8 §1) — glossario di dominio per-tenant.
 *  Per la lingua scelta, ~20 termini di dominio (singolare/plurale) editabili;
 *  vuoto = usa il default di sistema. Salva su term_override; al salvataggio
 *  ricarica gli override → la UI (menu, titoli) cambia parole subito. */
import { useEffect, useState } from 'react';
import type { Locale, TermOverrideDto } from '@sisuite/shared';
import { TERM_KEYS } from '@sisuite/shared';
import { Loading, ErrorBox } from '../../components/Page';
import { useApi, mutate } from '../../api/hooks';
import { ApiError } from '../../api/client';
import { useToast } from '../../ui/Toast';
import { useAuth } from '../../auth/AuthContext';
import i18n, { LOCALES, refreshTerminology } from '../../i18n';

export function TerminologySettings() {
  const { user } = useAuth();
  const toast = useToast();
  const canManage = !!user?.permissions.includes('settings:manage' as never);
  const [locale, setLocale] = useState<Locale>((user?.locale as Locale) ?? 'it-IT');
  const { data, loading, error, reload } = useApi<{ items: TermOverrideDto[] }>(`/settings/terminology?locale=${locale}`);
  const [draft, setDraft] = useState<Record<string, { s: string; p: string }>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const m: Record<string, { s: string; p: string }> = {};
    for (const o of data?.items ?? []) m[o.termKey] = { s: o.valueSingular, p: o.valuePlural ?? '' };
    setDraft(m);
  }, [data]);

  const def = (key: string, plural = false) => i18n.t(`terms.${key}${plural ? '_plural' : ''}`, { lng: locale });
  const set = (key: string, field: 's' | 'p', val: string) =>
    setDraft((s) => ({ ...s, [key]: { s: s[key]?.s ?? '', p: s[key]?.p ?? '', [field]: val } }));

  async function save() {
    setBusy(true);
    try {
      const terms = TERM_KEYS.map((k) => ({ termKey: k, valueSingular: draft[k]?.s ?? '', valuePlural: draft[k]?.p || null }));
      await mutate('PUT', '/settings/terminology', { locale, terms });
      toast('Terminologia salvata');
      await refreshTerminology(); // se è la lingua corrente, il menu cambia parole subito
      void reload();
    } catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? 'Errore') : (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="panel">
        <div className="ph">
          <h3>Glossario di dominio</h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <select className="txt" style={{ width: 'auto', height: 36 }} value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
              {LOCALES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            {canManage && <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>Salva</button>}
          </div>
        </div>
        <div className="pb" style={{ paddingTop: 12 }}>
          {loading ? <Loading /> : error ? <ErrorBox message={error} /> : (
            <div className="term-grid">
              <div className="term-h">Termine</div><div className="term-h">Singolare</div><div className="term-h">Plurale</div>
              {TERM_KEYS.map((k) => (
                <div className="term-row" key={k} style={{ display: 'contents' }}>
                  <div className="term-key"><b>{def(k)}</b><span className="mono">{k}</span></div>
                  <input className="txt" disabled={!canManage} value={draft[k]?.s ?? ''} placeholder={def(k)} onChange={(e) => set(k, 's', e.target.value)} />
                  <input className="txt" disabled={!canManage} value={draft[k]?.p ?? ''} placeholder={def(k, true)} onChange={(e) => set(k, 'p', e.target.value)} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="faint" style={{ fontSize: 13, color: 'var(--ink-faint)' }}>
        Cambia solo i <b>nomi di dominio</b> (es. “Commessa” → “Cantiere”): si riflettono in menu, titoli ed etichette.
        Lascia vuoto per usare il default. Le scritte generiche dell’interfaccia (Salva, Annulla…) non sono toccate.
      </p>
    </>
  );
}
