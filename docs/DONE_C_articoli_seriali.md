# DONE — Blocco C · Articoli & seriali (mock 45) + fix header sticky

> Data: 16/06/2026 · Chat POWERCOM v2.2 · Riferimento: `BRIEF_MASTER…v2_2` Parte 8 (Blocco C) + mock 45.
> Costruito **sui componenti estratti** nel Blocco A (EntityList / ObjectPage) → la replica del pattern è provata.

## 0. Fix richiesto da Ricardo — header sticky a filo (nessun gap)
La barra Salva/Annulla della scheda (ObjectPage) lasciava uno spazio vuoto sotto la barra del titolo, dove i dati scrollavano. Causa: `IonContent.ion-padding` (16px) spingeva giù il contenuto, quindi l'header sticky si fermava 16px sotto. **Fix in `theme/datapages.css` `.dsx .op-head`**: margini negativi (`margin:-16px -16px 13px`) che risucchiano il padding → la barra tocca l'intestazione, è **opaca** e a tutta larghezza; `z-index` alzato. Essendo nel componente condiviso, vale per **tutte** le schede (Ordinativo, Articolo, e le future).

## 1. Migrazione 030 (additiva, applicata)
`030_material_fields.sql`: `field_definition` di sistema per `material` (vertical NULL = tutti i verticali): **item_type** (select Articolo/Servizio), **category**, **supplier_code**, **min_stock** (number). La tabella `material` non ha quelle colonne → stanno in `attributes`, guidate da metadati (principio §2).

## 2. Backend
- **`routes/materials.ts` (riscritto):** lista con **viste** (Tutti/A magazzino/A seriale/Servizi/Scorta bassa) + conteggi; **giacenza** e **costo medio** dalla vista `stock_balance` (LATERAL); flag `lowStock` da `min_stock`; dettaglio; CRUD con colonne estese (sku, track_stock, tracked_by_serial, tracked_by_lot, costing_method, default_cost) + `attributes` validati da `field_definition`.
- **`GET /materials/:id/serials`:** unità seriali (serial, stato, *dove/installato presso*, ordinativo, aggiornato, `hasSecret`). Password **mai** nel payload. **`data_scope`**: il Tecnico (`own`) vede solo le unità del **suo furgone** (`holder_resource_id`) o degli ordinativi della sua squadra (Decisione 6.3, applicato in query).
- **`routes/serials.ts` (nuovo):** `POST /serials` (carico→in_stock); **`POST /serials/:id/transition`** = unica via ai cambi di stato, con **macchina a stati** validata (transizioni illegali → 409) e audit leggero in `attributes.history`; **`PUT /serials/:id/secret`** (cifra lato server); **`POST /serials/:id/secret/reveal`** gated `serial:secret_read` (decifra, una-tantum, mai loggato).
- **`crypto.ts` (nuovo):** cifratura applicativa **AES-256-GCM** dei segreti (Decisione 6.5). Il chiaro non tocca mai il DB; solo il blob cifrato in `stock_serial_unit.secrets`.
- **PII `pii:read_contact` (Decisione 6.2):** nuovo permesso, granted al **Tecnico**. Il route ordinativi ora ha 3 livelli: `full` (Owner/Planner: nome+tel+CF), **`contact`** (Tecnico: **solo telefono in chiaro**, nome/CF mascherati), `none`.
- Il **loader demo** cifra i segreti seriali (come l'API), così il reveal funziona sui dati demo.

## 3. Frontend (sui componenti estratti)
- **`MaterialiPage` (riscritta):** lista articoli su **`EntityList`** — viste, righe 2 livelli (Articolo+SKU / Categoria+tracciamento), Giacenza+unità e Costo medio a destra, Stato a pill. Click → scheda.
- **`MaterialeDetailPage` (nuova):** scheda su **`ObjectPage`/`ObjectBox`/`RelatedTabs`** — box **Anagrafica** (nome, sku, unità, categoria, tipo, codice fornitore) e **Magazzino & tracciamento** (toggle a magazzino/seriale/lotto, metodo costo, costo medio, scorta minima, giacenza totale); tab **Unità seriali** con stato a pill, *dove/parco installato*, ordinativo, e **password sbloccabile** (`MaskedField`-style, gated). Tab Giacenze/Movimenti/Documenti = placeholder (Blocco H).
- Rotta `/materials/:id` aggiunta (con route-guard `material:read`).

## 4. Verifiche (test funzionali reali)
- Typecheck pulito (shared+backend+frontend); moduli compilati da Vite (200).
- `GET /materials` viste: **all 10 · stock 9 · serial 4 · service 1 · low 1**; giacenza/costo corretti; vista "Scorta bassa" → Bretella ottica.
- **Reveal password a 2 ruoli**: Owner → `Esp6601!` (200); Tecnico → **403**.
- **PII contact-level**: Tecnico su un ordinativo → telefono `3392345671` **in chiaro**, nome `P•••• F••••` e CF mascherati.
- **Transizioni seriale**: `in_stock→assigned` 200; `assigned→retired` **409** (illegale).

### Come provare (browser)
1. owner@fibra.demo → **Magazzino → Articoli & seriali** (o Anagrafiche → Articoli): viste, click su "ONT SKY_OF" → scheda con tab **Unità seriali**; "Mostra" sulla password → la vedi.
2. marco@fibra.demo (Tecnico): sulla stessa password "Mostra" è **bloccato**; sull'ordinativo il **telefono è visibile** ma nome/CF mascherati.

## 5. Deviazioni / cosa resta
- **data_scope seriali**: applicato in **query** (non ancora in RLS); il brief ammette "RLS e/o query". Hardening RLS → quando serve.
- **Reveal "tracciato"**: il valore non è mai loggato; manca una tabella audit dedicata per registrare l'evento di reveal → follow-up (audit log, Blocco amministrazione).
- **Giacenze/Movimenti/Documenti** (tab scheda + viste Magazzino del menu) = **Blocco H** (placeholder PRESTO).
- **Selettore densità** in Impostazioni: ancora da accentrare (→ B-bis), come da DONE_A.
- Lotto: hook spento (Decisione).

## 6. File toccati
- DB: `030_material_fields.sql`.
- Backend: `routes/materials.ts` (riscritto), `routes/serials.ts` (nuovo), `crypto.ts` (nuovo), `index.ts`, `routes/workOrders.ts` (PII 3 livelli), `demo/runner.ts` (segreti cifrati), `permissions.ts` (pii:read_contact).
- Shared: `entities.ts` (Material esteso + Serial DTO/schemi), `permissions.ts`.
- Frontend: `pages/MaterialiPage.tsx`, `pages/MaterialeDetailPage.tsx`, `shell/AppShell.tsx`, `theme/datapages.css` (fix header).
