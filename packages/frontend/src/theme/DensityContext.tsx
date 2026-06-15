/**
 * DensityContext — densità in 3 versioni (standard 1, base.css v5).
 * Commuta <html data-density="compact|comfortable|spacious">; i componenti
 * usano le variabili --row-pad/--cell-fs/--ctrl-h/--input-h → si adattano da soli.
 * Default: comfortable. Persistenza per utente: localStorage `sisuite.density`
 * (stesso pattern del tema; una persistenza server-side richiederebbe una colonna
 * su app_user — rimandata: la scelta è del singolo dispositivo dell'utente).
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Density = 'compact' | 'comfortable' | 'spacious';
const KEY = 'sisuite.density';
const VALUES: Density[] = ['compact', 'comfortable', 'spacious'];

export function initialDensity(): Density {
  const s = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  return VALUES.includes(s as Density) ? (s as Density) : 'comfortable';
}

/** Applica al root (chiamato anche in main.tsx prima del render, anti-flash). */
export function applyDensity(d: Density): void {
  document.documentElement.dataset.density = d;
}

interface DensityCtx { density: Density; setDensity: (d: Density) => void }
const Ctx = createContext<DensityCtx>({ density: 'comfortable', setDensity: () => undefined });

export function DensityProvider({ children }: { children: ReactNode }) {
  const [density, setState] = useState<Density>(() => initialDensity());
  useEffect(() => { applyDensity(density); localStorage.setItem(KEY, density); }, [density]);
  return <Ctx.Provider value={{ density, setDensity: setState }}>{children}</Ctx.Provider>;
}

export function useDensity(): DensityCtx { return useContext(Ctx); }
