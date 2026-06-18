# JOURNAL — coordinamento sessioni/chat parallele (brief §0)

> Annotare qui migrazioni/moduli toccati per evitare collisioni tra chat.

## 2026-06-16 — Chat POWERCOM v1.0 01.03 (Claude Code)
- **Migrazioni applicate**: 024→028 (erano pronte, non applicate) + **029_work_order_fields.sql** (nuova).
  Prossimo numero libero: **030**.
- **Fix**: `packages/backend/src/migrate.ts` (ON CONFLICT sul tracking; le 024–028 si auto-tracciano).
- **Moduli toccati**: Ordinativi FTTH (Blocco B). Backend `routes/workOrders.ts`; shared `permissions/menu/entities`;
  frontend `OrdinativiPage`, `OrdinativoDetailPage`, `MaskedField`, `ordinativi.css`, `AppShell`, `icons`.
- **Permessi RBAC nuovi**: `work_order:*`, `serial:*`, `pii:read` (in `permissions.ts`).
- **Stato**: checkpoint metro raggiunto → in attesa review Ricardo prima di replicare il pattern.
- Dettagli: `docs/DONE_B_ordinativi_ftth.md`.

## 2026-06-16 (2) — Blocco A parte 1/2 (Navigazione 2 livelli + Party) — brief v2.2
- **Migrazioni**: nessuna nuova (prossimo num libero resta **030**). 
- **Moduli toccati**: shell di navigazione (riscritta a 2 livelli), Anagrafiche/Soggetto.
  - Shared: `nav.ts` (nuovo, menu 2 livelli + helpers), `entities.ts` (+ruolo `operator`).
  - Frontend: `shell/AppShell.tsx` (AppShellNav2: rail L1 + sub-panel L2 + omnibox ⌘K + sibling tabs + preferiti/recenti + route guard RBAC), `theme/nav2.css`, `ui/icons.ts`, `pages/ClientiPage.tsx` (Soggetti + viste ruolo), `i18n/*`.
  - Backend: `routes/companies.ts` (filtro `?role=`).
- **Incongruenze risolte (banali)**: +`operator` all'enum ruoli; "Aziende"→"Soggetto/Anagrafiche" (ADR-0005); `pii:read:contact` rinviato al Blocco C col data_scope.
- Dettagli: `docs/DONE_A_menu_2livelli.md`.

## 2026-06-16 (3) — Blocco A parte 2/2 (estrazione componenti) — COMPLETO
- CSS: `pages/ordinativi.css` (.wo) → `theme/datapages.css` (.dsx riusabile); vecchio rimosso.
- Nuovi componenti riusabili: `ui/EntityList.tsx` (lista, mode manage/pick-single/pick-multi), `ui/ObjectPage.tsx` (ObjectPage/ObjectBox/RelatedTabs).
- Ri-puntati `OrdinativiPage` e `OrdinativoDetailPage` sui componenti (markup identico → parità visiva). Typecheck+compile clean.
- **Blocco A COMPLETO.** Resta solo: accentrare selettore densità (→ B-bis).
- **Prossimo: Blocco C** (Articoli & seriali, mock 45) sui componenti estratti. Migrazione libera: **030**.

## 2026-06-16 (4) — Seed pack "fibra" completo (tutte le nuove tabelle)
- Esteso `demo/runner.ts` + `demo/lib.ts`: il loader ora popola price_list(+item+override), work_order(+subject+item), stock_serial_unit (installati e a magazzino), work_line(+measure), equipment_usage, subcontract_line, work_report, phase.wbs_code, ruolo company 'operator'. Materiali con sku/track_stock/tracked_by_serial/default_cost. number_series 'work_order' creato per il tenant demo. Helper `nextWoCode`.
- `WIPE_STEPS`: aggiunte tutte le nuove tabelle + stock_* ; wipe ora fa `SET LOCAL session_replication_role=replica` (stock_movement è immutabile via trigger).
- `db/demo-packs/fiber.json` riscritto: Sirti + Open Fiber (gestori), Scavi Sud (fornitore/subappalto), commessa "Napoli Est 2026" con WBS A.1/A.2/A.3, 10 materiali, listino base 8 voci + 3 override, 14 ordinativi su tutti gli stati con intestatari fittizi + apparati + 6 seriali installati, 8 seriali a magazzino, 4 lavorazioni con libretto, 3 mezzi, 2 subappalti, 1 rapportino.
- Pulizia: rimossi 5 stock_movement orfani (tenant_id dev, material fiber) del 14/06 — bypassando il trigger immutabilità.
- Test: wipe+load OK; conteggi verificati; API ordinativi (viste 14/4/4/4/2), Gestori (2), dettaglio con seriali; job_cost_ledger popolato.
- **Ricarica demo**: da UI "Demo / Super admin" → azzera + ricarica pack `fiber` (usa wipePack/loadPack). Login owner@fibra.demo / Demo123!.

## 2026-06-16 (5) — Seed "completissimo": riempite TUTTE le tabelle
- Loader esteso ancora: **ore con tariffe** (cost_rate/bill_rate/billable/approval=approved → la manodopera ora valorizza la pivot), **magazzino** (stock_location, stock_document+righe=DDT carico, stock_movement con segno per il trigger apply_stock_movement → stock_balance calcolate), **material_consumption su work_order** (`consumed`), **work_report_time_entry** (rapportino↔ore), **absence_entry**. Aggiunti a WIPE_STEPS: absence_entry/absence_balance.
- Bug risolto: il trigger `apply_stock_movement` usa il SEGNO della quantità (non il type) → il loader nega le quantità per out/transfer.
- Fix 400 UI: era codice stale nel backend long-running (tsx watch non ricaricava runner.ts) → **riavviare `sisuite_backend`** dopo modifiche al loader. wipe+load HTTP ora 200.
- Dati: +fornitore materiali "Fibre & Connettori", DDT carico 8 righe, 13 movimenti, 9 time_entry con tariffe, 2 assenze, 2 rapportini (1 AI-proposed), consumi su ordinativi. Subappalti ridotti (3500) → **pivot Napoli margine +819 (ric. 7705 / costi 6886)**.
- Stato finale: TUTTE le tabelle con dati popolate per Fibra Demo (38 tabelle). Ricaricata e verificata.

## 2026-06-16 (6) — Fix header sticky + Blocco C (Articoli & seriali)
- **Fix UI richiesto**: header sticky ObjectPage a filo dell'intestazione (no gap dove scrollavano i dati). `theme/datapages.css .dsx .op-head` margini negativi -16px (risucchia ion-padding) + opaco + z-index. Vale per tutte le schede.
- **Migrazione 030** `material_fields.sql` (field_definition material: item_type/category/supplier_code/min_stock). Applicata. Prossima libera: **031**.
- **Backend**: `routes/materials.ts` riscritto (viste/giacenza/costo/detail/CRUD esteso + GET serials per articolo con data_scope Tecnico), `routes/serials.ts` nuovo (carico, transition macchina-stati, secret set, secret reveal gated), `crypto.ts` AES-256-GCM, `workOrders.ts` PII 3 livelli (+pii:read_contact al Tecnico), loader cifra i segreti.
- **Frontend**: MaterialiPage (EntityList) + MaterialeDetailPage (ObjectPage + tab Unità seriali + reveal) su componenti estratti; rotta /materials/:id.
- **Test reali**: viste materiali (10/9/4/1/1), reveal owner 200 / tecnico 403, PII tecnico tel-chiaro+nome-mascherato, transizione legale 200 / illegale 409.
- Resta: data_scope in RLS (ora query), audit reveal, Magazzino giacenze/movimenti/DDT (Blocco H), densità in Impostazioni (B-bis). Dettagli: `docs/DONE_C_articoli_seriali.md`.

## 2026-06-16 (7) — Blocco C-bis (Siti/Località)
- **Migrazione 031** `site.sql` (entità `site` gerarchica + `asset.site_id`). Applicata. Prossima libera: **032**.
- Backend `routes/sites.ts` (albero per soggetto + CRUD), RBAC risorsa `site` (role_permission 202), Shared SiteDto/schemi, loader+WIPE_STEPS+fiber.json (7 siti Beta Logistica).
- Frontend `ui/SiteTree.tsx` (albero espandibile + add/delete) dentro scheda Soggetto (ClienteDetailPage).
- Test: 7 siti caricati gerarchia OK, CRUD 201/204, wipe+load 200. Dettagli: `docs/DONE_Cbis_siti.md`.
- **Prossimo (Parte 7)**: B-bis (rifinitura ordinativi: mapping CSV UI, azioni bulk) → D (Listino + resolvePrice) → E → F → G → H.

## 2026-06-16 (8) — Fix UX segnalati da Ricardo
- **Menu**: sezione rail con UNA sola voce naviga diretta (no sub-panel ridondante). Cruscotto→/dashboard, Impostazioni→/admin/settings (SettingsLayout mostra le sue voci). `AppShell.tsx` helper `onRail`/`sectionItems`, chevron nascosta se single.
- **Campana notifiche**: il pannello era ancorato in basso (vecchia sidebar) → off-screen nella topbar. Ora ancorato SOTTO il pulsante (`NotificationsBell.tsx`: top = r.bottom+8, right-align clampato).
- **Recharts width(0)/height(0)**: nuovo `ui/ChartBox.tsx` (ResizeObserver) renderizza i grafici solo quando il box ha dimensioni reali → niente warning quando la pagina è montata-ma-nascosta. DashboardPage usa ChartBox per i 2 grafici.
- Solo frontend, typecheck pulito.

## 2026-06-16 (9) — Fix DEFINITIVO gap header sticky (segnalato + volte)
- Causa vera: `position:sticky;top:0` dentro `IonContent.ion-padding` (padding-top 16px) si ancorava sotto → striscia dove scorrevano i dati. Il trucco margin-top negativo NON bastava.
- Fix strutturale: `components/Page.tsx` nuova prop **`bleed`** → IonContent con `--padding-top:0` (sides/bottom 16px). `.dsx .op-head` ora `margin:0 -16px 13px` (bleed solo orizzontale), `top:0`, opaco, z-index 8 → barra Salva/Annulla a filo del titolo, dati scorrono SOTTO. Applicato a OrdinativoDetailPage + MaterialeDetailPage (`<Page ... bleed>`).
- **Regola salvata in memory**: `feedback_objectpage_sticky_header.md` (mai più gap nelle schede).

## 2026-06-16 (10) — Blocco D (Listino + resolvePrice)
- **Standard liste/CRUD da Claude AI: NON presente nel repo** — chiesto a Ricardo di fornirlo (si applicherà 1 volta in EntityList/ObjectPage).
- `shared/pricing.ts`: **resolvePrice** (commessa›gestore›base, validità temporale) + marginPct. **Test 7/7 verdi** (`test/resolvePrice.test.ts`).
- Backend `routes/prices.ts`: /price-lists, /price-list-items (viste/margine/override-count), /:id (+overrides), CRUD voci+ritocchi (settings:manage), **/prices/resolve**.
- Frontend `ListinoPage` (EntityList) + `ListinoItemDetailPage` (ObjectPage bleed, tab Ritocchi con regola "più specifico" + add/del). Menu Anagrafiche→Produzione→Listino. icon tags. i18n.
- Test live: resolve B-4.2 in Napoli → {cost 10, rev 41, source engagement}. Niente migrazione (price_list già in 026). Dettagli: `docs/DONE_D_listino_resolveprice.md`.
- **Prossimo: E (Lavorazioni + libretto, usa resolvePrice) → F (Rapportino+CaptureBarAI) → G (Pivot) → H. B-bis (rifinitura ordinativi) quando serve per la demo.**

## 2026-06-16 (11) — Blocco E (Lavorazioni + libretto misure)
- Backend `routes/workLines.ts`: /work-lines (viste Tutte/Con libretto/Da cattura/Manuali), /:id (+misure), POST (prezzi FOTOGRAFATI con resolvePrice nel contesto commessa; quantità=somma libretto), PATCH, PUT /:id/measures (ricalcola quantità), DELETE. RBAC read=report:read, write=engagement:update.
- Frontend `LavorazioniPage` (EntityList + selettore commessa) + `LavorazioneDetailPage` (ObjectPage bleed + tab Libretto misure, riga totale=quantità). Menu Finanza&Budget→Produzione→Lavorazioni. icon wrench. Niente migrazione (work_line in 027).
- Test live: somma misure=quantità (120=120), ricavo=qty×prezzo (4320); create voce ONT+libretto 5+4 → qty 9, prezzo fotografato 41 (override commessa), ricavo 369. Dettagli: docs/DONE_E_lavorazioni_libretto.md.
- **Prossimo: F (Rapportino + CaptureBarAI, cuore AI) → G (Pivot+export) → H (magazzino/DDT). B-bis quando serve.**

## 2026-06-17 — Blocco B-ter (Ordine di lavoro generico) — brief v2.4
- **Migrazione 032**: rename work_order.operator_company_id→principal_company_id, operator_order_id→principal_order_ref (+FK/UNIQUE rinominati); nuova col type_id; seed lookup work_order_type (Attivazione default/Manutenzione/Guasto); commento tabella generico. Applicata. Prossima libera: **033**.
- Codice: shared/entities (principal_*+typeId+typeLabel), backend workOrders (rename, type_id default activation, import dedup su principal_*, type_label in select), frontend Ordini di lavoro (colonna Committente/Rif. esterno/tipo, select Tipo), menu+i18n "Ordini di lavoro" senza badge FTTH, loader demo aggiornato.
- Test: schema ok, lista mostra committente+tipo Attivazione, import dedup per committente. Demo ricaricata.
- **Resta v2.4 prima di F**: Blocco M (liste/CRUD esistenti → EntityList/ObjectPage: Soggetti+Commesse ALTA con CHECKPOINT, poi MEDIA/BASSA) e Blocco A-bis (Field Builder). Dettagli: docs/DONE_Bter_ordine_di_lavoro.md.

## 2026-06-17 (2) — Blocco M COMPLETO (liste/CRUD vecchie → EntityList/ObjectPage v2)
> Ricardo via, NIENTE checkpoint: fatto tutto M in autonomia. Nuovo helper riusabile `ui/AttrFields.tsx` (AttrBoxes/AttrField: rende i `field_definition` nello stile ObjectBox per company/asset/engagement/resource).
- **Soggetti** (company): backend `companies` lista +`views` per ruolo; `ClientiPage`→EntityList (viste Clienti/Fornitori/Gestori/Partner, sync da `?role=`), `ClienteDetailPage`→ObjectPage (Anagrafica+box fiscali/indirizzo/note + tab Contatti/Località). `DONE_M_soggetti.md`.
- **Commesse** (engagement): backend +`views` per tipo; `EngagementsPage`→EntityList; `CommessaDetailPage`→ObjectPage (Anagrafica editabile + crea `/engagements/new`; restano tab Struttura WBS/Gantt/Risorse/Ore/Catture/Budget). `DONE_M_commesse.md`.
- **Asset**: shared AssetDto+`siteId/siteName`, backend join site + insert/update; `AssetPage`→EntityList, nuova `AssetDetailPage` (ObjectPage + selettore Sito dai siti del cliente). Rotta `/assets/:id`. `DONE_M_asset.md`.
- **Risorse**: backend +filtro `kind`+`views`; `RisorsePage`→EntityList; `RisorsaDetailPage`→ObjectPage (Anagrafica + tab orario/indisponibilità/assegnazioni; crea `/resources/new`). `DONE_M_risorse.md`.
- **Attività**: shared ActivityDto +engagementCode/Title; backend lista globale `/activities` (q/status/paginazione/views, compat `engagementId`→items-only); nuova `AttivitaPage` (EntityList) + rotta + voce nav. `DONE_M_attivita.md`.
- **Utenti e Ruoli**: backend +`GET /users/:id` e `/roles/:id`; `UsersPage`/`RolesPage`→EntityList; nuove `UserDetailPage` (ObjectPage + ruoli chip) e `RoleDetailPage` (ObjectPage + matrice permessi da PERMISSION_CATALOG, sistema=sola lettura). Rotte `/admin/users/:id`,`/admin/roles/:id`. `DONE_M_utenti_ruoli.md`.
- **Catture**: storico in `CapturePage` → EntityList (viste per stato, no row-actions). Composer invariato (cuore Blocco F). `DONE_M_catture.md`.
- **Stati & etichette + Numerazioni** (BASSA): pannelli config → righe cliccabili, azioni nel Drawer (no row-actions). `DONE_M_stati_numerazioni.md`.
- **Migrazioni**: nessuna nuova (asset.site_id già in 031). Prossima libera resta **033**. Typecheck shared+backend+frontend puliti; backend riavviato; endpoint testati via curl (viste/conteggi OK).
- **Prossimo**: A-bis (Field Builder) → F → G → H → B-bis.

## 2026-06-17 (3) — A-bis + F + G + H + B-bis COMPLETI (tutto il piano v2.4 chiuso)
> Tutti i blocchi richiesti fatti in autonomia (Ricardo via). Nessuna migrazione nuova: prossima libera resta **033**. Typecheck shared+backend+frontend puliti; backend riavviato; ogni blocco testato via curl.
- **A-bis Field Builder**: backend già completo; aggiunti `placeholder`+`active` (schema/DTO), `loadAllFieldDefs` + GET `?manage=1` (mostra inattivi). `CustomFieldsSettings`: +entità **work_order**/**site**, righe cliccabili (no row-actions), label IT/EN/ES + help + placeholder + toggle attivo + **anteprima live** + elimina nel drawer. Permesso: usato `settings:manage` (no nuovo `field_definition:manage`, niente migrazione). `DONE_Abis_field_builder.md`.
- **F Rapportino-Documento**: nuovo `GET /work-reports/:id/document` (5 sezioni costi/ricavi + foto + totali). Nuovi `ui/DocumentArchetype.tsx` (DocSectionTable+TotalsStrip, riusabile in H) e `RapportinoDetailPage` (ObjectPage: testata+Racconto AI genera/conferma/firma+striscia totali+sezioni+foto). `RapportiniPage`→EntityList. **CaptureBarAI già completo** (extractor→validator→propose→applier deterministico con source_capture_id), verificato. `DONE_F_*`.
- **G Pivot**: nuovo `routes/finance.ts` `GET /finance/pivot` (aggrega job_cost_ledger per Commessa›Fase/WBS›Voce + KPI). `PivotPage` (albero espandibile, barre margine, export Excel/CSV). Nav `pivot` attivata. `DONE_G_*`.
- **H Magazzino**: schermate `/stock` già complete (Giacenze/Movimenti/Documenti DDT/Ubicazioni). Riempiti i tab placeholder: **Articolo** (Giacenze/Movimenti/Documenti reali) e **Ordine di lavoro** (Materiali scaricati). `GET /stock/movements` +filtro `workOrderId` + `workOrderId`/`documentRef` nel DTO. `DONE_H_*`.
- **B-bis Ordini**: `OrdinativiPage` +selezione multipla (pick-multi) + **assegna bulk** (`/work-orders/assign`) + **esporta selezionati** + **import CSV con editor di mapping** colonna→campo (`/work-orders/import`). Densità accentrata in Impostazioni (rimossa da ClientiPage in M). `DONE_Bbis_*`.
- **Nuovi componenti riusabili**: `ui/AttrFields.tsx` (M), `ui/DocumentArchetype.tsx` (F/H).
- **Resta da fare a Ricardo**: verifica visiva a video (screenshot non producibili headless).

## 2026-06-17 (4) — Debiti tecnici chiusi + seed scarichi su ordine
- **Migrazione 033** `serial_security.sql` applicata (prossima libera: **034**): RLS `stock_serial_unit` con `data_scope='own'` per-comando (Tecnico vede solo le sue unità) + tabella audit `serial_secret_reveal_log` (reveal segreto: chi/quale/quando, mai il valore). `routes/serials.ts` logga il reveal.
- **Listino**: nuovo `GET /price-list-items/:id/usage`; tab "Lavorazioni che la usano" + "Storico prezzi" (snapshot da work_line) ora reali.
- **Export .xlsx nativo**: +dep `exceljs`, helper `lib/xlsx.ts`; Pivot e "Esporta selezionati" Ordini ora producono .xlsx (no più CSV).
- **Schema doc** rigenerato: `docs/analisi/2026-06-17_schema_db_completo.md` (pg_dump dopo 001-033).
- **Demo H**: `demo/runner.ts` ora seeda stock_movement 'out' con work_order_id (tab "Materiali scaricati" popolato). Demo ricaricata.
- Dettagli: `docs/DONE_debiti_2026-06-17.md`. Typecheck shared+backend+frontend puliti. Tutto pushato su GitHub main.

## 2026-06-18 — UI standard (lista v3, export, filtro AI+manuale server-side) + handoff
- **Script avvio** one-click (avvia/ferma/carica-demo-fibra .bat/.ps1 + AVVIO.md).
- **EntityList v3**: testata 1 riga (viste a dx), selezione checkbox + toolbar standard (modifica/duplica/elimina/esporta, regole per nº selezione), toolbar tutta a dx con "+" ultimo, ricerca larga. `useEntityActions`.
- **Export**: FieldPicker (TUTTI i campi via `exportFields`, drag, preset per-utente save/load), ExportDialog, `export_preset` (mig **034**), `.xlsx` exceljs. **Colonne** (mostra/nascondi/riordina, localStorage).
- **Filtro AI-first**: AiFilterPanel (NL + **voce**) + **builder manuale** (campo·operatore·valore, **E/O**), set salvabili `filter_preset` (mig **035**), endpoint `POST /ai/list-filter` + `/filter-presets`. **SERVER-SIDE** via `filterSql.buildFilter` + FIELD_MAP su companies/resources/materials/assets/engagements/activities/work-orders/users/roles/price-list-items/work-lines; pagine passano `?filter=`.
- **MAI window.\***: nuovi ConfirmDialog/PromptDialog; sostituiti ovunque. Regola in memory `feedback_no_native_popups`.
- **Migrazioni 033-035** applicate. Prossima libera: **036**. Tutto typecheck pulito, pushato su main (ultimo `e4ca4b9`).
- **Handoff**: `docs/analisi/2026-06-18_HANDOFF_nuova_sessione.md`. **Stato+prossimi passi per Claude AI**: `docs/analisi/2026-06-18_STATO_per_ClaudeAI.md` (proposta P1-P7 da valutare → poi piano operativo).
- **scratch-porting/**: gestita da altra sessione, NON toccare.
