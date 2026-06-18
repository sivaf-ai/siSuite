/** TerminologySettings (parte 8 §1, Blocco 2) — glossario di dominio per-tenant.
 *  Per la lingua scelta, ~28 termini di dominio (singolare/plurale) editabili,
 *  RAGGRUPPATI; vuoto = usa il default di sistema. Salva su term_override; al
 *  salvataggio ricarica gli override → menu/titoli/etichette cambiano subito
 *  (le label di dominio referenziano `terms.*` via nesting `$t(...)`).
 *  Anteprima LIVE: un riquadro mostra menu/lista/scheda che cambiano mentre digiti. */
import { useEffect, useState } from 'react';
import type { Locale, TermOverrideDto, TermKey } from '@sisuite/shared';
import { TERM_KEYS, TERM_GROUPS } from '@sisuite/shared';
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

  // default di sistema dal catalogo i18n (per la lingua selezionata)
  const def = (key: string, plural = false) => i18n.t(`terms.${key}${plural ? '_plural' : ''}`, { lng: locale });
  const set = (key: string, field: 's' | 'p', val: string) =>
    setDraft((s) => ({ ...s, [key]: { s: s[key]?.s ?? '', p: s[key]?.p ?? '', [field]: val } }));
  const reset = (key: string) => setDraft((s) => ({ ...s, [key]: { s: '', p: '' } }));
  const overridden = (key: string) => !!(draft[key]?.s?.trim());

  // valore "effettivo" per l'anteprima: draft (anche non salvato) → default
  const pv = (key: TermKey) => draft[key]?.s?.trim() || (def(key) as string);
  const pvPl = (key: TermKey) => draft[key]?.p?.trim() || (def(key, true) as string);

  async function save() {
    setBusy(true);
    try {
      const terms = TERM_KEYS.map((k) => ({ termKey: k, valueSingular: draft[k]?.s ?? '', valuePlural: draft[k]?.p || null }));
      await mutate('PUT', '/settings/terminology', { locale, terms });
      toast('Terminologia salvata');
      await refreshTerminology(); // se è la lingua corrente, menu/titoli cambiano parole subito
      void reload();
    } catch (e) { toast(e instanceof ApiError ? ((e.body as { message?: string })?.message ?? 'Errore') : (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="term-layout">
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
              TERM_GROUPS.map((g) => (
                <div key={g.group} className="term-group">
                  <div className="term-grouph">{g.label}</div>
                  <div className="term-grid">
                    <div className="term-h">Termine</div><div className="term-h">Singolare</div><div className="term-h">Plurale</div><div className="term-h" />
                    {g.keys.map((k) => (
                      <div className="term-row" key={k} style={{ display: 'contents' }}>
                        <div className="term-key"><b>{def(k)}</b><span className="mono">{k}</span></div>
                        <input className="txt" disabled={!canManage} value={draft[k]?.s ?? ''} placeholder={def(k) as string} onChange={(e) => set(k, 's', e.target.value)} />
                        <input className="txt" disabled={!canManage} value={draft[k]?.p ?? ''} placeholder={def(k, true) as string} onChange={(e) => set(k, 'p', e.target.value)} />
                        <button className="term-reset" title="Ripristina default" disabled={!canManage || !overridden(k)} onClick={() => reset(k)}>↺</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Anteprima LIVE: come cambiano menu/lista/scheda mentre digiti */}
        <aside className="term-preview">
          <div className="tp-h">Anteprima</div>
          <div className="tp-sub">Cambia mentre digiti (prima di salvare)</div>
          <div className="tp-card">
            <div className="tp-card-h">Menu</div>
            <ul className="tp-menu">
              <li>{pvPl('engagement')}</li>
              <li>{pvPl('work_order')}</li>
              <li>{pvPl('party')}</li>
              <li>{pvPl('material')}</li>
              <li>{pvPl('resource')}</li>
            </ul>
          </div>
          <div className="tp-card">
            <div className="tp-card-h">Titolo lista</div>
            <div className="tp-title">{pvPl('party')}</div>
            <div className="tp-faint">Anagrafica unica</div>
          </div>
          <div className="tp-card">
            <div className="tp-card-h">Scheda</div>
            <div className="tp-title">{pv('engagement')} · ENG-2026-001</div>
            <div className="tp-faint">Nuova {pv('work_order')}</div>
          </div>
        </aside>
      </div>

      <p className="faint" style={{ fontSize: 13, color: 'var(--ink-faint)' }}>
        Cambia solo i <b>nomi di dominio</b> (es. “Commessa” → “Cantiere”): si riflettono in menu, titoli ed etichette.
        Lascia vuoto (o premi ↺) per usare il default. Le scritte generiche dell’interfaccia (Salva, Annulla…) non sono toccate.
        L’override è <b>per-lingua</b>: personalizza ogni lingua dal selettore in alto.
      </p>

      <style>{`
        .term-layout { display: grid; grid-template-columns: 1fr 280px; gap: 16px; align-items: start; }
        @media (max-width: 900px) { .term-layout { grid-template-columns: 1fr; } .term-preview { position: static !important; } }
        .term-group { margin-bottom: 18px; }
        .term-grouph { font-size: var(--fs-eyebrow); text-transform: uppercase; letter-spacing: .04em; color: var(--ink-faint); font-weight: 700; margin: 6px 0 8px; }
        .term-grid { display: grid; grid-template-columns: 1.2fr 1fr 1fr 34px; gap: 8px 12px; align-items: center; }
        .term-h { font-size: var(--fs-th); color: var(--ink-faint); font-weight: 600; }
        .term-key { display: flex; flex-direction: column; }
        .term-key .mono { font-family: var(--font-mono); font-size: 11px; color: var(--ink-faint); }
        .term-reset { width: 30px; height: 32px; border: 1px solid var(--line); background: var(--card); border-radius: var(--r-sm); color: var(--ink-soft); cursor: pointer; }
        .term-reset:disabled { opacity: .35; cursor: default; }
        .term-reset:not(:disabled):hover { border-color: var(--brand); color: var(--brand); }
        .term-preview { position: sticky; top: 12px; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-lg); padding: 14px; box-shadow: var(--shadow-1); }
        .tp-h { font-weight: 700; font-size: var(--fs-card); }
        .tp-sub { font-size: 12px; color: var(--ink-faint); margin-bottom: 10px; }
        .tp-card { border: 1px solid var(--line-2); border-radius: var(--r-sm); padding: 10px; margin-bottom: 10px; }
        .tp-card-h { font-size: var(--fs-eyebrow); text-transform: uppercase; letter-spacing: .04em; color: var(--ink-faint); font-weight: 700; margin-bottom: 6px; }
        .tp-menu { list-style: none; margin: 0; padding: 0; }
        .tp-menu li { padding: 4px 8px; border-radius: 6px; font-size: 13px; color: var(--ink); }
        .tp-menu li:hover { background: var(--brand-wash); color: var(--brand-ink); }
        .tp-title { font-weight: 600; font-size: 14px; color: var(--ink); }
        .tp-faint { font-size: 12px; color: var(--ink-faint); }
      `}</style>
    </>
  );
}
