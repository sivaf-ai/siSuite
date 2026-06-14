/**
 * ThemeContext — tema chiaro/scuro (mock parte 6 §2).
 * Meccanismo standard: CSS custom properties + attributo `data-theme` sul root.
 * Tutto il resto usa già `var(--token)` → il tema cambia "da solo".
 * Persistenza: localStorage `sisuite.theme`; default da `prefers-color-scheme`.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark';
const KEY = 'sisuite.theme';

/** Tema iniziale: scelta salvata → preferenza di sistema → chiaro. */
export function initialTheme(): ThemeMode {
  const s = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  if (s === 'light' || s === 'dark') return s;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Applica il tema al root (chiamato anche in main.tsx prima del render, anti-flash). */
export function applyTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode;
}

interface ThemeCtx { theme: ThemeMode; setTheme: (m: ThemeMode) => void; toggle: () => void }
const Ctx = createContext<ThemeCtx>({ theme: 'light', setTheme: () => undefined, toggle: () => undefined });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => initialTheme());
  useEffect(() => { applyTheme(theme); localStorage.setItem(KEY, theme); }, [theme]);
  const value: ThemeCtx = {
    theme,
    setTheme: (m) => setThemeState(m),
    toggle: () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx { return useContext(Ctx); }
