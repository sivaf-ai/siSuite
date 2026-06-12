/** Lookups — carica stati/etichette/priorità una volta e li espone per id/categoria. */
import { createContext, useContext, type ReactNode } from 'react';
import type { LookupDto } from '@sisuite/shared';
import { useApi } from '../api/hooks';

interface LookupsApi {
  all: LookupDto[];
  byId: (id: string | null | undefined) => LookupDto | undefined;
  byCategory: (cat: string) => LookupDto[];
  labelOf: (id: string | null | undefined) => string;
}
const Ctx = createContext<LookupsApi>({ all: [], byId: () => undefined, byCategory: () => [], labelOf: () => '' });

function it(l: LookupDto): string {
  return l.label['it-IT'] ?? l.label.en ?? l.code;
}

export function LookupsProvider({ children }: { children: ReactNode }) {
  const { data } = useApi<{ items: LookupDto[] }>('/lookups');
  const all = data?.items ?? [];
  const api: LookupsApi = {
    all,
    byId: (id) => all.find((l) => l.id === id),
    byCategory: (cat) => all.filter((l) => l.category === cat),
    labelOf: (id) => {
      const l = all.find((x) => x.id === id);
      return l ? it(l) : '';
    },
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useLookups() { return useContext(Ctx); }
export function lookupLabel(l: LookupDto): string { return it(l); }
