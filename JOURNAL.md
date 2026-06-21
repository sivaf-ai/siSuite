# JOURNAL — coordinamento sessioni/chat parallele (brief §0)

> Annotare qui migrazioni/moduli toccati per evitare collisioni tra chat.

## 2026-06-21 — SPEC v1.1 (chat 01.06): Fiscale/Magazzino/Risorse/Asset (Claude Code, autonomo A→F)
- **Migrazioni 041→046** (la SPEC diceva 038, ma 038/039/040 erano già occupate da altre chat → partito da 041; NON rinumerate le altrui). **Prossima libera: 047.**
  - 041 fiscal_localization (field_definition.country, tax_rate+seed IT/AR, company colonne+drop address, fiscal_attributes, site.address→jsonb, tenant.default_country)
  - 042 material_complete (23 colonne material, material_category/image/supplier, cleanup seed 040)
  - 043 warehouse_complete (stock_lot+FK, stock_location +code/manager/note, stock_count/purchase_order/pick_list +line)
  - 044 resources_skills (resource +code/color/avatar/email/phone, skill/resource_skill/resource_certification, cleanup seed 040)
  - 045 entity_refinements (work_order/engagement/asset/company_contact + asset anchor check)
  - 046 warehouse_entitlements_series (module.warehouse entitlement, number_series, address field_definitions IT/AR)
- **Moduli toccati**: shared/entities+fields (DTO nuovi), backend routes companies/materials/assets/resources/sites/fields/bootstrap (estesi) + NUOVE taxRates/materialCatalog/warehouse/resourceExtras (registrate in index.ts). Frontend: AddressField, ClienteDetailPage (form fiscale country-driven), MagazzinoPage (tab Lotti/Documenti/Seriali), SpecListsPages (5 liste), AppShell+nav.
- **Convenzioni**: field_definition.country valorizzato + entity='company' → fiscal_attributes; entity='address' → AddressField. CLEAN SLATE: campi material/resource/company promossi da attributes a colonne (DELETE field_definition superati di 004/040, senza toccare i file).
- **Verifiche**: migrazioni applicate OK; typecheck shared+BE+FE puliti; **79/79 test BE verdi**; smoke A/B/C/D/E/F OK (login owner@sisuite.local).
- **Docs**: DONE_A..F + DONE_TOTALE in docs/analisi/; ADR-0007 (fiscale multi-paese) e ADR-0008 (magazzino standalone) in docs/adr/; schema rigenerato in docs/analisi/2026-06-21_schema_db_completo.md.
- **Aperti** (vedi DONE_TOTALE): tab Seriali per-location (manca endpoint BE), persistenza code/note stock_location (route stock da estendere), company_contact mobile/department/note non esposti in FE/route contatti.

## 2026-06-18 — PIANO prossimi lavori: Blocchi 0, 1, 4 (Claude Code)
- **Migrazioni**: nessuna nuova. Stato: 001→035 + 007_term_override già applicate. Prossima libera: **036**.
  ⚠️ Correzione al PIANO: `term_override` esiste già come **007**, NON va creata come "036". `saved_view` (Blocco 5) sarà la 036.
- **Blocco 0 (verifica)**: mappatura stato reale vs PIANO (5 agenti). Esito: molta infra già fatta. → `docs/DONE_0_verifica.md` (tabella stato corretta per ogni blocco).
- **Blocco 1 (design system)**: era ~85% fatto. Rifinito `theme/design-system.css`: `.btn` font = body (13), `.btn-sm` 12.5, icone bottoni 16/15px, nuovo `.btn-secondary`. → `docs/DONE_1_designsystem.md`.
- **Blocco 4 (export dinamico)**: `ui/EntityList.tsx` nuova prop `entity` → unisce i `field_definition` del tenant all'export automaticamente (helper `attrExportValue`, label localizzata). Wiring: ClientiPage/MaterialiPage/AssetPage/OrdinativiPage/EngagementsPage/RisorsePage. → `docs/DONE_4_export_dinamico.md`.
- **Restano (pesanti, multi-sessione)**: Blocco 2 (retrofit i18n + propagazione glossario — il cuore), Blocco 3 (liste legacy: Foglio ore/Assenze/Magazzino), Blocco 5 (QBE type-aware + multi-sort + saved_view mig 036), Blocco 6 (dedup AI Soggetti — apply su **9** FK, incl. `subcontract_line.company_id` non nel piano).
- Typecheck frontend/shared: pulito.

## 2026-06-18 (2) — PIANO Blocco 2: i18n propagazione glossario (Claude Code)
- **Meccanismo**: label di dominio → `terms.*` via nesting i18next `$t(...)` nei 3 cataloghi (it/en/es). `i18n/index.ts` `refreshTerminology`: reset default bundled → applica override → emette `languageChanged` (re-render). Propagazione provata a runtime (engagement→Progetti).
- **Glossario**: `shared/admin.ts` TERM_KEYS 18→28 (+party/customer/supplier/operator/partner/masterdata/work_order/work_line/site) + `TERM_GROUPS`. Aggiunti termini `work_order`/`work_line`/`masterdata_plural` ai cataloghi.
- **UI**: `TerminologySettings.tsx` rifatta (raggruppamento + ↺ ripristina default per-termine + anteprima live).
- **Retrofit flagship** (titoli lista + label scheda → t('terms.*')): Soggetti, Commesse, Ordini di lavoro, Articoli, Risorse, Asset, Attività, Lavorazioni (lista+detail). Via 2 agenti paralleli su file disgiunti.
- **Aperto**: retrofit generico residuo (header colonne, tooltip EntityList, dialoghi, schermate minori) — incrementale, non blocca il DoD core. → `docs/DONE_2_i18n_glossario.md`.
- Migrazioni: nessuna nuova (term_override già 007). Prossima libera resta **036**.

## 2026-06-18 (3) — PIANO Blocco 3: liste legacy → EntityList v2 (Claude Code, 3 agenti paralleli)
- **Foglio ore**: `TimeEntriesPage` → EntityList + nuovo `TimeEntryDetailPage`; backend `GET /time-entries/:id`. Barra bulk approvazioni preservata.
- **Assenze**: `AssenzePage` → EntityList (Richieste + Saldi sola lettura) + nuovo `AbsenceDetailPage`; backend `GET /absences/:id`. Drawer creazione preservato. Backlog: DELETE approvata non ripristina saldo.
- **Magazzino**: `MagazzinoPage` 4 tab → EntityList; conferma documenti + drawer + transizioni stato PRESERVATI (azione in colonna custom).
- **AppShell**: route `/time-entries/:id`, `/absences/:id`. Backend riavviato (route nuove), health 200.
- Typecheck FE+BE pulito. → `docs/DONE_3_liste_legacy.md`. Nessuna migrazione.
- **Restano**: Blocco 5 (QBE type-aware + multi-sort + saved_view mig 036), Blocco 6 (dedup AI Soggetti, 9 FK).

## 2026-06-18 (4) — PIANO Blocco 5 (parziale): igiene filtri + viste salvate (Claude Code)
- **Migrazione applicata: 036_saved_view.sql** (additiva). Prossima libera: **037**.
- `filterSql.ts`: nuovo operatore **between** (numerico/testuale). Nuovo `test/filterSql.test.ts` (**19 test verdi**, incl. anti-injection).
- **saved_view**: backend `routes/savedViews.ts` (GET/POST/DELETE, registrato in index.ts). UI `EntityList` opt-in prop `savedViewKey` (chip viste salvate + Salva/ricarica/elimina, PromptDialog). Wired: ClientiPage (company), OrdinativiPage (work_order).
- Backend riavviato (route nuova), health 200. Typecheck FE+BE pulito.
- **Aperto Blocco 5**: QBE type-aware (date-picker/enum-select + chip operatore), multi-sort (ORDER BY multiplo + mascherina), indici GIN trigram, gating PII filtro, conteggi viste col filtro. → `docs/DONE_5_filtri_viste.md`.
- **Resta**: Blocco 6 (dedup AI Soggetti, 9 FK, pattern CaptureBarAI).

## 2026-06-18 (5) — PIANO Blocco 6: deduplica Soggetti (Claude Code + agente)
- **FK verso company: sono 11** (non 8 del piano né 9 del Blocco 0): mancavano `site.company_id` e `stock_document.company_id` (verificato su DB live).
- Backend `routes/companyDedup.ts`: `POST /companies/dedup/scan` (proposta deterministica, no AI, gate company:read) + `POST /companies/merge` (transazionale, ri-punta 11 FK, gestisce UNIQUE company_role/work_order, archivia assorbiti, idempotente, gate company:delete). DTO in shared.
- Test `test/companyMerge.test.ts` DB-backed: **PASS 2/2** (re-point senza orfani + idempotenza).
- Frontend `ui/DedupDialog.tsx` (review: superstite/assorbiti per gruppo → fondi) wired su Soggetti (ClientiPage).
- Backend riavviato; route 401 (registrate). Typecheck BE+shared+FE pulito.
- Proposta AI-assistita + arricchimento = fast-follow. → `docs/DONE_6_dedup_soggetti.md`.
- **PIANO 0→6 completato** (Blocco 5 resta con coda: QBE type-aware + multi-sort; Blocco 2 retrofit generico incrementale).

## 2026-06-18 (6) — PIANO Blocco 5 completamento: multi-sort + between + trigram (Claude Code)
- **Migrazione applicata: 037_trgm_indexes.sql** (GIN trigram). Prossima libera: **038**.
- **Multi-sort**: nuovo `sortSql.ts` `buildOrderBy` + `test/sortSql.test.ts` (9 verdi). Wired 6 endpoint (companies/work-orders/materials/engagements/resources/assets, param `?sort=`). UI `SortDialog` in EntityList (props `sortFields`/`onSortChange`), wired su 4 pagine.
- **between**: `AiFilterPanel` due input da/a; `lib/listFilter.ts` valuta between (num/testo-data). Backend già pronto.
- **PII filtro**: verificato sicuro (nessun campo PII nelle FILTER_FIELDS).
- **Tutti i 64 test backend verdi** (8 file). Typecheck FE+BE pulito. Backend riavviato, health 200.
- **Resta solo Blocco 2 retrofit generico** (stringhe IT in tooltip/header/dialoghi) + rifiniture QBE type-aware.

## 2026-06-20 — Stato per Claude AI + schema DB rigenerato (Claude Code)
- **Schema DB rigenerato**: `docs/analisi/2026-06-20_schema_db_completo.md` (pg_dump 001→037). Delta vs 18/06: +`saved_view` (036), +`pg_trgm` + 9 indici trigram (037).
- **Stato dettagliato per decidere come procedere**: `docs/analisi/2026-06-20_STATO_per_ClaudeAI.md` (per-blocco: fatto/come/file/residuo + decisioni prese in autonomia + opzioni A/B/C).
- **⚠️ I 7 commit del PIANO sono LOCALI, non pushati** (`main...origin/main [ahead 7]`): serve `git push origin main` a mano. Residuo documentato: long-tail i18n per-pagina (B2), QBE type-aware + conteggi-col-filtro (B5), proposta dedup AI (B6).

## 2026-06-20 (2) — PIANO_motore_liste_e_magazzino: Blocchi 1,3,4 + 2-backend (Claude Code)
- **Migrazione applicata: 038_list_preset.sql** (store generico preset filter/sort/columns/export). **039 riservata a saved_report** (Blocco 5). Prossima libera dopo 039.
- **Blocco 1 (motore comune)**: `ui/FloatingPopover.tsx`, `ui/SavedHeader.tsx`, `ui/FieldChooser.tsx` (replica mockup 55) + `theme/engine.css`. → `DONE_motore_1_engine.md`.
- **Blocchi 3+4**: Ordina/Colonne/Export cablati sul motore in `EntityList` (si propagano a tutte le liste). Sostituiti SortDialog/FieldPicker/ExportDialog. Storage via `list_preset` + `useListPresets`. → `DONE_motore_3_4_*.md`.
- **Blocco 2 BACKEND**: `filterSql.buildFilter` esteso (mockup 54) — operatori starts/ends/in/not_in/date_*, join per-condizione E/O, NON, parentesi 1 livello (bilanciamento validato), retro-compatibile. +13 test (32 su filterSql). 77 test backend totali verdi.
- **RESTA (UI-heavy, prossime sessioni con verifica visiva vs mockup)**: Blocco 2 FRONTEND (QBE scheda, mockup 54), Blocco 5 (Report designer, mockup 56, + mig 039 + render), Blocco 6 (toolbar §3 rifinitura), Blocco 7 (Magazzino CRUD completi: Magazzini/Ubicazioni/Movimenti/Giacenze/Documenti), Blocco 8/9 (verifica anagrafiche identiche + residui).
- Typecheck FE+BE pulito. Commit motore: `98c9126`, `1caa2f9`, `38daba3` (+ docs).

## 2026-06-20 (3) — motore: Blocco 2 frontend + Magazzino backend + PUSH (Claude Code)
- **PUSH FATTO**: tutto su GitHub `origin/main` (fino a `1488e67`). Il titolare fa i test in locale; il push è backup.
- **Blocco 2 FRONTEND (Filtro Gruppo, mockup 54)**: `ui/FilterGroupPanel.tsx` (scheda QBE a tutta larghezza, freccettina+pop-up per campo, operatori type-aware, frase in lingua, parentesi 1 livello, SavedHeader). `EntityList` prop `filterFields` + azione toolbar "Gruppo" (list-filter). Composizione campi = filterFields + field_definition (enum display↔raw). **Wired su 6 liste**: Soggetti/Articoli/Commesse/Ordini/Risorse/Asset. → `DONE_motore_2_filtro_gruppo.md`.
- **Blocco 7 BACKEND (Magazzino)**: `POST /stock/movements/:id/reverse` (rettifica = movimento compensativo, rispetta immutabilità) + `DELETE /stock/locations/:id` (soft archived_at) + GET locations filtra archiviati.
- 77 test backend verdi. Typecheck FE+BE pulito.
## 2026-06-20 (4) — motore COMPLETATO: Magazzino CRUD + Report + Blocco 6 (Claude Code)
- **Migrazione applicata: 039_saved_report.sql**. Migrazioni 001→039. Tutto pushato su GitHub.
- **Blocco 7 Magazzino CRUD**: backend reverse+soft-delete (commit prec.) + frontend `MagazzinoPage` (Nuovo movimento, Rettifica/Storna, Ubicazioni crea/modifica/elimina, Giacenze drill-down).
- **Blocco 5 Report designer** (mockup 56): `ui/ReportDesigner.tsx` + `routes/savedReports.ts` + mig 039. Azione toolbar "Report" su tutte le liste. Anteprima HTML live + Stampa/PDF + barra AI (euristica) + SavedHeader.
- **Blocco 6**: toolbar completa (Gruppo·Ordina·Colonne·Report·Esporta·AI, badge); `AiFilterPanel` ridotto a NL/voce (builder manuale → sostituito dal Gruppo).
- 77 test backend verdi. Typecheck FE+BE pulito. → `DONE_motore_5_7_report_magazzino.md`.
- **PIANO_motore COMPLETO (blocchi 1→8).**

## 2026-06-20 (5) — residui §9 chiusi (Claude Code)
- **Saldo assenze DELETE**: ripristina `absence_balance.used` se l'assenza era approvata.
- **Conteggi viste col filtro**: companies/materials/resources/work-orders/engagements applicano buildFilter ai chip; fix injection engagementId in work-orders (param-bind).
- **i18n header colonne**: namespace `cols.*` (it/en/es) + cablaggio su Soggetti/Articoli/Commesse/Ordini/Risorse/Asset.
- **Non-blocking documentati** (alternativa funzionante): Documenti magazzino DetailPage-archetipo (drawer ok), Report render server-side/PDF (stampa browser ok).
- 77 test verdi, typecheck pulito, tutto pushato. → `DONE_motore_9_residui.md`.
- **FINE PIANO_motore.** Unica voce con possibile revisione tua: terminologia traduzioni (cols.*/glossario).

### (riferimento precedente)
- **RESTAVA**: Blocco 7 FRONTEND, Blocco 5, Blocco 6 — ora FATTI.

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
