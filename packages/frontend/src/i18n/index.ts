/**
 * i18n — impianto multilingua (parte 6 §3). i18next + react-i18next.
 * Lingue: it-IT (default), en, es-AR (lingua a sé, non spagnolo generico).
 *
 * Risoluzione lingua iniziale: localStorage `sisuite.lang` → lingua del browser
 * → it-IT. Dopo il login, se l'utente non ha scelto a mano, si allinea ad
 * `app_user.locale` (vedi syncUserLocale, chiamato dall'AuthContext lato app).
 * Le ETICHETTE DEI DATI (stati, campi) restano per-locale dal jsonb dell'API.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Locale, TermOverrideDto } from '@sisuite/shared';
import { apiFetch } from '../api/client';
import itIT from './it-IT.json';
import en from './en.json';
import esAR from './es-AR.json';

const KEY = 'sisuite.lang';
export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'it-IT', label: 'Italiano' },
  { code: 'en', label: 'English' },
  { code: 'es-AR', label: 'Español (AR)' },
];

function savedLang(): Locale | null {
  const s = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  return s === 'it-IT' || s === 'en' || s === 'es-AR' ? s : null;
}
/** Lingua iniziale: scelta esplicita salvata → it-IT (default di sistema).
 *  Dopo il login `syncUserLocale` allinea ad app_user.locale (it-IT nel demo),
 *  che VINCE sul default finché l'utente non sceglie a mano. NON usiamo la lingua
 *  del browser come default (apriva il demo italiano in inglese). */
export function initialLang(): Locale { return savedLang() ?? 'it-IT'; }

void i18n.use(initReactI18next).init({
  resources: { 'it-IT': { translation: itIT }, en: { translation: en }, 'es-AR': { translation: esAR } },
  lng: initialLang(),
  fallbackLng: 'it-IT',
  interpolation: { escapeValue: false },
});

/** Carica gli override di terminologia del tenant per la lingua corrente e li
 *  inietta nel namespace `terms` (sovrascrivono i default). Non bloccante. */
export async function refreshTerminology(): Promise<void> {
  const lng = i18n.language || 'it-IT';
  try {
    const res = await apiFetch<{ items: TermOverrideDto[] }>(`/settings/terminology?locale=${lng}`);
    for (const t of res.items) {
      if (t.valueSingular) i18n.addResource(lng, 'translation', `terms.${t.termKey}`, t.valueSingular);
      if (t.valuePlural) i18n.addResource(lng, 'translation', `terms.${t.termKey}_plural`, t.valuePlural);
    }
  } catch { /* override assenti o non autenticato: si usano i default */ }
}

/** Cambia lingua, PERSISTE la scelta (localStorage) e ricarica gli override. */
export function changeLanguage(code: Locale): void {
  localStorage.setItem(KEY, code);
  void i18n.changeLanguage(code).then(() => refreshTerminology());
}

/** Allinea ad app_user.locale SOLO se l'utente non ha già scelto a mano. */
export function syncUserLocale(locale: Locale | null | undefined): void {
  if (!locale) return;
  if (savedLang()) return; // scelta esplicita: la rispettiamo
  void i18n.changeLanguage(locale);
}

/** Locale corrente per le API Intl (date/numeri/valuta). */
export function currentLocale(): string { return i18n.language || 'it-IT'; }

export default i18n;
