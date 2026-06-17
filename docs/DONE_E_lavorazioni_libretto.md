# DONE — Blocco E · Lavorazioni + libretto misure (mock 49)

> Data: 16/06/2026 · Chat POWERCOM v2.2 · Riferimento: `BRIEF_MASTER…v2_2` Parte 8 (Blocco E).
> Sui componenti estratti (EntityList/ObjectPage) + `resolvePrice` (Blocco D). Nessuna migrazione (tabelle `work_line*` già in 027).

## 1. Backend (`routes/workLines.ts`)
- `GET /work-lines?engagement_id=&view=&q=` — viste **Tutte / Con libretto / Da cattura / Manuali** + conteggi; ricavo = quantità × prezzo ricavo; origine voce/manuale; flag libretto/cattura.
- `GET /work-lines/:id` — lavorazione + **libretto misure**.
- `POST /work-lines` — **prezzi costo/ricavo FOTOGRAFATI** con `resolvePrice` nel contesto della commessa (gestore = `engagement.company_id`); **quantità = somma del libretto** (se presente), altrimenti quantità input; `attributes` validati da `field_definition`.
- `PATCH /work-lines/:id`; `PUT /work-lines/:id/measures` (sostituisce il libretto → ricalcola la quantità); `DELETE`.
- RBAC: lettura `report:read`, scrittura `engagement:update`. Tipo di costo **dedotto** (`production` nella vista `job_cost_ledger`) — nessun campo da compilare.

## 2. Frontend
- **`LavorazioniPage`** (EntityList): selettore **Commessa** in testa; viste; righe 2 livelli (Voce+codice / Fase·WBS+data), Quantità+unità (nota "da libretto"), Ricavo, Origine. Click → scheda.
- **`LavorazioneDetailPage`** (ObjectPage **bleed**): box **Lavorazione** (voce di capitolato select, Fase/WBS, data; **quantità read-only = totale libretto**; **prezzi costo/ricavo fotografati** mostrati; **ricavo calcolato**) + tab **Libretto misure** (descrizione · formula testuale es. "24 × 1,00" · valore; **riga totale = quantità**; aggiungi/elimina misura).
- Menu: **Finanza & Budget → Produzione → Lavorazioni** (`/work-lines`). i18n it/en/es. Icona wrench.

## 3. Verifiche (test reali, demo fibra · commessa Napoli)
- Lista: 4 lavorazioni, viste {all 4, with_libretto 4, from_capture 0, manual 0}; ricavi corretti.
- Dettaglio: **somma misure == quantità** (120 = 120) e **ricavo == quantità × prezzo** (4320).
- **Create con voce ONT (B-4.2) + libretto 5+4**: quantità **9**, prezzo ricavo **fotografato 41** (= override di commessa risolto da `resolvePrice`), ricavo **369**, origine "voce" ✅. Dimostra l'intera catena libretto→quantità + resolvePrice→ricavo.
- Typecheck pulito (shared+backend+frontend); moduli Vite 200.

### Come provare
owner@fibra.demo → **Finanza & Budget → Lavorazioni** (commessa "Napoli Est 2026"): apri una riga → tab **Libretto misure** (somma = quantità). "Nuova lavorazione" → scegli una voce, aggiungi misure → quantità e ricavo si calcolano col prezzo della commessa.

## 4. Cosa resta
- Tab "Lavorazioni che la usano" del Listino (Blocco D) ora ha la fonte dati (work_line.price_list_item_id) → si può popolare quando serve.
- `attributes` lavorazione (competenza, area_cavo) da `field_definition`: nessuna riga seed → box non mostrato; aggiungere field_definition se richiesto.
- Le lavorazioni alimentano già la **pivot** (`job_cost_ledger` cost_type=production) → visibile nel Blocco G.

## 5. File toccati
- Shared: `entities.ts` (WorkLine/WorkLineMeasure DTO+schemi), `nav.ts` (voce Lavorazioni).
- Backend: `routes/workLines.ts` (nuovo), `index.ts`.
- Frontend: `pages/LavorazioniPage.tsx`, `pages/LavorazioneDetailPage.tsx` (nuovi), `shell/AppShell.tsx`, `ui/icons.ts` (wrench), `i18n/*`.
