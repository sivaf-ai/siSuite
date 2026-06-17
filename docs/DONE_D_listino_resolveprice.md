# DONE — Blocco D · Listino voci di capitolato + resolvePrice (mock 46)

> Data: 16/06/2026 · Chat POWERCOM v2.2 · Riferimento: `BRIEF_MASTER…v2_2` Parte 8 (Blocco D), Principio #7, ADR-0004.
> Costruito sui componenti estratti (EntityList/ObjectPage). Nessuna migrazione (tabelle `price_list*` già in 026).

## 1. `resolvePrice` — la funzione UNICA (Principio #7)
`packages/shared/src/pricing.ts`: funzione **pura** che risolve costo/ricavo col "più specifico" = **override commessa › override gestore › prezzo base**, rispettando la **validità temporale**; i campi nulli dell'override ricadono sul base. Più `marginPct()`. Sarà riusata anche da Lavorazioni (E) e Pivot (G).
- **Test unitari** (`test/resolvePrice.test.ts`, vitest): **7/7 verdi** sui casi limite del brief — nessun override; solo gestore; commessa che vince su gestore (con campo nullo→base); override scaduto; non-ancora-valido; gestore non corrispondente; marginPct.

## 2. Backend (`routes/prices.ts`)
- `GET /price-lists` (selettore, default = is_default).
- `GET /price-list-items` — viste **Tutte / Con ritocchi / Disattivate**, ricerca, **margine %** calcolato, **conteggio ritocchi**, paginazione.
- `GET /price-list-items/:id` — voce + ritocchi (con nome gestore/commessa).
- `POST/PATCH /price-list-items`, `POST/DELETE /price-list-overrides` (gated `settings:manage`).
- `GET /prices/resolve?itemId=&engagementId=&companyId=&on=` — anteprima del prezzo risolto (usa `resolvePrice`).

## 3. Frontend
- **`ListinoPage`** (EntityList): viste, righe 2 livelli (Voce+codice / Categoria+unità), Costo/Ricavo (valuta), **Margine %** colorato, Ritocchi (conteggio). Click → scheda.
- **`ListinoItemDetailPage`** (ObjectPage **bleed**): box **Voce** (codice, descrizione, unità, categoria, costo, ricavo, **margine calcolato**); tab **Ritocchi** con la **regola "più specifico" esplicitata** (commessa › gestore › base), lista override con ambito/soggetto/validità e **aggiungi/elimina** ritocco inline; tab Storico prezzi e "Lavorazioni che la usano" = placeholder (E).
- Menu: **Anagrafiche → Produzione → Listino voci di capitolato** (`/price-list`), permesso `report:read`. i18n it/en/es.

## 4. Verifiche (test reali, demo fibra)
- `resolvePrice`: 7/7 unit test verdi.
- `GET /price-lists` → LB-FTTH (default). `GET /price-list-items` → 8 voci, viste {all 8, overrides 3, inactive 0}, margine corretto (B-1.1 = 69,2%), conteggio ritocchi.
- `GET /price-list-items/:id` (B-4.2) → base ricavo 38 + override commessa Napoli 41.
- **`GET /prices/resolve` (B-4.2 in commessa Napoli) → `{costPrice:10, revenuePrice:41, source:"engagement"}`** ✅ (commessa vince; costo nullo→base).
- Typecheck pulito (shared+backend+frontend), moduli Vite 200.

### Come provare
owner@fibra.demo → **Anagrafiche → Listino voci di capitolato**: vista "Con ritocchi" → apri **B-4.2 (ONT)** → tab **Ritocchi**: vedi l'override di commessa "Napoli Est 2026" a 41 e la nota sulla regola. Aggiungi/elimina un ritocco.

## 5. Cosa resta
- Tab **Storico prezzi** e **Lavorazioni che la usano**: con Blocco E (work_line userà `resolvePrice` per fotografare i prezzi).
- Selettore listino multiplo in UI (ora default): quando serviranno più listini.
- Editor validità (validFrom/validTo) nel form ritocco: ora si crea senza date (sempre valido); campo date da aggiungere se richiesto.

## 6. File toccati
- Shared: `pricing.ts` (nuovo, resolvePrice+marginPct), `entities.ts` (PriceList/Item/Override DTO+schemi), `index.ts`, `nav.ts` (voce Listino).
- Backend: `routes/prices.ts` (nuovo), `index.ts`, `test/resolvePrice.test.ts` (nuovo).
- Frontend: `pages/ListinoPage.tsx`, `pages/ListinoItemDetailPage.tsx` (nuovi), `shell/AppShell.tsx`, `ui/icons.ts` (tags), `i18n/*`.
