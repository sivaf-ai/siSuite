# JOURNAL — coordinamento sessioni/chat parallele (brief §0)

> Annotare qui migrazioni/moduli toccati per evitare collisioni tra chat.

## 2026-06-29 (5) — Fix UX: modali in portal, doppia barra titolo, maschera Etichette, indirizzo sito (chat 01.06)
- **Modali sotto la barra del titolo (bug strutturale)**: `Modal`/`TreeNodeCard`/`ConfirmDialog`/`PromptDialog` ora renderizzano in **portal su `document.body`** (z-index 1300/1400/1500) → il `position:fixed` non resta più intrappolato sotto la topbar/stacking-context. Risolve anche i picker che si infilavano sotto la barra.
- **Doppia barra del titolo** sulle schede (es. "Ordine di lavoro — nuovo" + testata ObjectPage): fix sistemico in `components/Page.tsx` — quando `bleed` è true (scheda con testata sticky di ObjectPage) la `<Page>` NON rende più la sua IonHeader. Una riga, vale per TUTTE le schede.
- **Maschera «Aggiungi etichetta»** (Stati & etichette) portata allo standard `.dsx/.bgrid/.bf/.bl/.bi` (era `<Field>`/form-group); **Sigla + Ordine + Default sulla stessa riga** (campi corti). Rimosso import `Field` morto.
- **Indirizzo Sito**: confermato che la scheda nodo del Soggetto › Siti (EntityTree) ha l'indirizzo per chi ha `site:address` (serve **re-login** se la sessione ha i permessi vecchi); aggiunto l'**Indirizzo (AddressField country-driven, gated)** anche nella lista globale `SitiPage`, con country dal cliente. Typecheck FE pulito.

## 2026-06-29 (4) — Picker a lente al posto dei select-entità (D-0) (chat 01.06)
- Convertiti tutti i `<select>` che sceglievano un'entità FK ai **picker a lente** (riuso della lista vera in popup), regola D-0. Commit documenti `a1ffb72` + tecnico.
  - **Documenti**: Ordinativi (assegna risorsa + import commessa), Magazzino (tecnico furgone + commessa movimento), Listino (ritocco per Gestore/Commessa).
  - **Tecnico**: TimeEntry (commessa + risorsa), Rapportino (commessa), Cronometro (commessa + risorsa).
- Restano per scelta: le select "Attività" (sotto-entità filtrata per commessa), "Articolo" nei movimenti (pick rapido in-context — eventuale MaterialPicker come micro-TODO). Typecheck FE pulito.

## 2026-06-29 (3) — Tipi configurabili (D-0) + indirizzo sito con field-RBAC + fix scheda Contatti (chat 01.06)
- **Scheda Contatti** (Soggetto) portata allo standard `.dsx/.bgrid/.bf/.bl/.bi` (era `<Field>`/form-group, label sopra il bordo). Rimossi CONTACT_FIELDS/import morti. Commit `37fa3b1`. Le altre schede `<Field>` (admin config + EntityForm dinamico da field_definition) restano: categoria diversa e legittima.
- **Migr 059**: lookup `site_kind` (8) e `stock_location_kind` (3) come righe di sistema rinominabili in *Stati & etichette* (regola D-0: i Tipi non più enum cablati). I CANONICI restano le chiavi logiche (warehouse=radice, van=furgone). Prossima libera **060**.
- **Frontend Tipi da lookup**: `SiteTree`/`SitiPage` (site_kind), `MagazzinoPage` lista+scheda+`UbicazioniTab` (stock_location_kind, filtri di contesto: magazzino=warehouse/van, ubicazioni=sub_location/van). `useLocationKinds()` helper. Rinominare l'etichetta si riflette ovunque.
- **Indirizzo Sito editabile + field-level RBAC**: nuovo permesso **`site:address`** (Owner/Planner/Contabile/Sola lettura; NON Tecnico). `AddressField` country-driven nella scheda nodo Sito (gated). Backend `/sites` **maschera** `address` (GET) e ignora la modifica (PATCH) senza permesso — enforcement API, non solo UI. `SiteTree` riceve `country` dal cliente. role_permission 202→206.
- **Test** 90/90, typecheck shared+BE+FE puliti, smoke OK (lookups, create kind+address, mask).

## 2026-06-29 (2) — Siti e Ubicazioni magazzino migrati a EntityTree (chat 01.06)
- **EntityTree esteso (additivo)** per entità ricche: `scopeQuery` (GET filtrata), `createDefaults` (campi fissi POST), `rootParentId` (alberi scoped: "radice"=genitore fisso), `defaultIcon`, `showAppearance` (off → niente icona/colore), `extraCard` (campi extra nella scheda), `rowMeta` (info accanto al nome). `TreeNodeCard` supporta `renderExtra`/`extraInitial`/`showAppearance`.
- **Siti**: `SiteTree` (scheda Soggetto) ora usa EntityTree scoped per cliente (drag&drop, Sposta in…, 3-modi, sequence). Backend `/sites` portato al contratto albero (active/sequence/isSystem/directCount=asset+ordini, ?includeArchived, PATCH move-a-radice corretto, DELETE ?mode=block|reassign|cascade, /duplicate). Lista globale `SitiPage` resta EntityList (catalogo cross-cliente). Commit `7fe7010`.
- **Ubicazioni**: `UbicazioniTab` (scheda magazzino) ora è EntityTree scoped al magazzino (`?subtreeOf=W` + `rootParentId=W`); campi extra Tipo+Codice. Backend `/stock/locations` esteso: subtreeOf (CTE ricorsiva), sequence, direct_count (giacenze qty<>0), DELETE 3-modi, /duplicate. Magazzini (radici) restano EntityList con scheda+tab.
- **Test** `tree.test.ts` → 11 (aggiunti anti-ciclo + FK RESTRICT per site e stock_location). **Suite 90/90**. Typecheck shared+BE+FE puliti. Smoke HTTP OK per entrambe.

## 2026-06-29 (1) — STANDARD entità ad albero (EntityTree) + migrazione 058 (chat 01.06, spec 01.05)
- Migr **058_tree_standard.sql** applicata (prossima libera **059**): material_category +description/image_url/sequence/is_system + FK parent RESTRICT esplicita + trigger anti-ciclo + indice fratelli; **site FK CASCADE→RESTRICT** (fix critico) + sequence + anti-ciclo; stock_location + sequence. Adattata dal V058 Flyway fornito (rimossi BEGIN/COMMIT: il runner avvolge già; footer sisuite_migrations).
- **Componente generico `ui/EntityTree.tsx`** (config-driven, ADR-0012): UN solo albero per tutte le tabelle self-FK. Clic-riga→scheda, chevron, quick-add unico in cima, **drag&drop 3 zone + "Sposta in…"** (esclude sottoalbero), ricerca con `<mark>`+potatura, conteggi ricorsivi, toggle Albero⇄Tabella e Manuale⇄Alfabetico, archiviati, **pick mode** (radio+onPick). Scheda nodo `ui/TreeNodeCard.tsx` (barra fissa in alto, anteprima icona/colore, Libreria/Immagine, colore HSL/HEX nel popup, chip AI). Ricerca/AI icone con **traduzione IT/ES→EN** (categoryIcons `ICON_SYNONYMS`/`suggestAppearance`).
- **Backend material-categories** riscritto: GET piatto+direct_count+?includeArchived, POST ritorna NodeDto+sequence, PATCH move/seq, **DELETE ?mode=block|reassign|cascade** in transazione con conteggi ricorsivi, duplicate, restore. Handler globale **P0001 (anti-ciclo)→409**.
- **Pilota Categorie articolo** completo: CategoriePage = wrapper EntityTree; CategoryPickerDialog = stesso EntityTree in pick (zero duplicazione); MaterialeDetailPage mostra breadcrumb categoria.
- **Palette C "Ponte"** recepita in variables.css (brand bordeaux #801E1D, flow ciano + flow-ink, danger corallo #E8552D, light+dark+Ionic). ⚠️ cambio colore globale, validare a video.
- **Test** `test/tree.test.ts` (7): anti-ciclo, unicità per-livello insert+update, riuso post-archivio, FK RESTRICT. **Suite 86/86**. Typecheck shared+BE+FE puliti. Smoke HTTP route OK.
- **TODO**: migrare UI Siti/Ubicazioni a EntityTree (DB già allineato 058); upload immagine categoria MinIO; AI chip via LLM. Doc: `docs/DONE_tree_standard_01_05.md`, `docs/architecture/STANDARD_entita_albero.md`, ADR 0011/0012/0013.

## 2026-06-28 (6) — Fix KO test: asset_kind/skill_category visibili in "Stati & etichette" (chat 01.06)
- **KO §6 risolto** (3 esiti correlati): le voci `asset_kind` ("Tipi di asset") e `skill_category` ("Categorie competenze") non comparivano nel combo di *Impostazioni › Stati & etichette* → l'array `CATS` in `LabelsSettings.tsx` era **hardcoded** e non le includeva. Aggiunte le 2 voci. I dati (mig 057, 8+6 righe di sistema) erano già presenti e il backend `/lookups` non filtra per categoria. Ora rinominabili/estendibili e si riflettono nelle tendine di Asset.Tipo e Competenze.Categoria.
- Solo FE (1 riga + label). Typecheck FE verde (container). Vite hot-reload, nessun rebuild.

## 2026-06-28 (5) — Cataloghi gestiti per classificazioni + picker a lente + Siti anagrafica (chat 01.06)
- Migr **057** (prossima libera **058**): lookup_value 'asset_kind' + 'skill_category' (canonical_state + system rows). Commit `21ece21`.
- **Regola alto livello D-0** (STANDARD): campi di riferimento/classificazione mai testo libero/combo ad-hoc — FK a entità con lista → **picker a lente**; classificazione → **lookup_value** (Impostazioni › Etichette) → select.
- **Asset.Tipo** e **Competenze.Categoria**: da testo libero → select da lookup configurabile.
- **SITI** promossi ad anagrafica: voce menu Anagrafiche + `pages/SitiPage` (EntityList + CRUD inline Modal + soft-delete) + `ui/SitePickerDialog`; backend GET /sites con companyName + q/sort + GET /sites/:id. `SiteTree` nel Soggetto invariato.
- **Picker a lente** sui campi FK-entità: Materiale.UM → `UnitPickerDialog` (UnitsPage pick), Materiale.Categoria → `CategoryPickerDialog` (CategoriePage albero pick), Asset.Sito → SitePicker. Tolti i combo.
- Verifica: typecheck shared+BE+FE puliti, 79/79 test, migrate idempotente.

## 2026-06-28 (4) — Soft-delete cataloghi + Competenze anagrafica + hub AI + fix toggle (chat 01.06)
- Migr **056** (prossima libera **057**): archived_at/archived_by su unit_of_measure, tax_rate, skill. Commit `d0cd616`+`3c300ba`.
- **Toggle "Mostra archiviati" EFFIMERO** (`useArchivedView`, reset su ionViewWillEnter) → rientrando in una maschera torna a "Mostra archiviati" e mostra gli attivi (fix #4); rimosso `useStickyState` per archived (risolve anche la desync di Materiali con l'istanza picker).
- **Soft-delete completo** esteso a **Unità di misura, Aliquote IVA, Competenze** (archivia+controllo d'uso+?archived+restore+purge+audit; righe di sistema UM/IVA non archiviabili).
- **Competenze (skill)**: da sola-lettura ad **anagrafica completa** (EntityList + "+ Nuova" + CRUD Modal Nome/Categoria/Attiva + soft-delete).
- **Hub AI**: l'unica icona stella apre un popup con le funzioni AI (`aiActions`); Soggetti non ha più la doppia stella → "Trova doppioni" dentro l'hub. Standard G-4-bis.
- Standard: L-7 (overflow), G-4-bis (hub AI), DB-5-bis aggiornato. Verifica: typecheck shared+BE+FE puliti, 79/79 test, smoke.

## 2026-06-28 (3) — Soft-delete esteso + menu overflow (⋮) + documenti (chat 01.06)
- Frontend + 3 route backend (nessuna migrazione nuova; prossima libera **056**). Commit `9d553a0`.
- **Menu overflow (⋮)** in `ui/EntityList`: le azioni secondarie (Esporta, Storico, Mostra archiviati) vanno nel ⋮ (MoreVertical), in toolbar restano Modifica/Duplica/Elimina (o Ripristina/Elimina-definitiva). Stesso metodo per il mobile. CSS `.tib-of-*`. Standard L-7.
- **Soft-delete completo esteso** a engagement (Commesse), work_order (Ordini di lavoro), stock_location (Magazzini): backend archived_by+audit+?archived+restore+purge, DTO archivedAt/archivedByName; frontend toggle/ripristina/storico/purge via overflow + badge + useStickyState. Ora abilitato su 8 entità.
- **Fix precedenti (commit f54ba43/5de06ce)**: AuditDialog leggeva male {items} (crash items.map) → corretto; messaggio Elimina standard senza "irreversibile"; stato vista persistito (useStickyState) → tornando dal CRUD si rientra nella stessa vista; hint su ogni icona (U-1).
- **Documenti**: `docs/analisi/GESTIONE_soft_delete_v1.md` (gestione soft-delete completa + entità incluse/escluse con motivo) e `GESTIONE_ALBERO_categorie_v1.md` (standard entità ad albero, per analisi con Claude AI).
- Verifica: typecheck shared+BE+FE puliti, 79/79 test, smoke archive/restore/purge/audit per le 3 nuove entità.

## 2026-06-28 (2) — Soft-delete gestito (A+B+C) + fix UX vari (chat 01.06)
- Migr **055** (prossima libera **056**): `archived_by` su tutte le tabelle archiviabili + tabella `audit_log` (RLS). Commit `4946ddf` (+ `9176c2d`/`5ec5b6f`/`76aaef6` per i fix UX/console).
- **Soft-delete A+B+C** su material/company/resource/site/asset: `context/audit.ts` (logAudit); archive setta archived_by+logga; lista `?archived=1`; `POST /:id/restore`; `DELETE /:id/purge` (hard, solo se archiviato, FK RESTRICT→409); DTO `archivedAt`+`archivedByName`; nuova route `GET /audit?entity=&entityId=`. FE: `ui/EntityList` toggle "Mostra archiviati" + Ripristina/Storico/Elimina-definitiva (conferma unica) + badge; nuovo `ui/AuditDialog`; cablate Materiali/Soggetti/Risorse/Asset. Standard DB-5-bis.
- **Fix console**: campi DATE → yyyy-MM-dd (stock/timeEntries/engagements); blur su click-riga (no aria-hidden Ionic). **web-client-content-script** = estensione browser, non nostro.
- **UX**: testata liste A FILO (no buco sopra la barra: Page flush per liste/schede; .dsx-head bleed) — standard L-3-bis; PickerField solo lente (D-2-bis); IconPicker ricerca full-lucide (~1500); menu entità a tendine per gruppo (siblingGroups) quando troppe.
- **Codice articolo** editabile (default number_series, override). Verifica: typecheck shared+BE+FE puliti, 79/79 test, smoke completi.

## 2026-06-28 — Fix UX/integrità + Codice articolo + STANDARD doc (chat 01.06)
- Frontend + migr **054** (prossima libera **055**). Commit `e010763`+`62e1775`+`6f6d53b`.
- **Doppia conferma cancellazione** RISOLTA (UnitsPage, TaxRatesPage passavano a EntityList un onDelete che apriva una 2ª ConfirmDialog → ora cancellazione diretta; EntityList è l'unico a confermare, col nome). Standard E-1.
- **migr 054 — unicità ignora gli ARCHIVIATI**: gli UNIQUE chiave-naturale diventano parziali `WHERE archived_at IS NULL` (material name/sku/code, company/engagement/work_order code, purchase_order number, stock_location code, saved_report, work_order principal_ref). Bug «Prova» risolto. Eccezione: stock_serial_unit. Standard DB-4.
- **Testata lista FISSA (sticky)**: header+toolbar restano fissi, scrollano solo le righe. Centrale in `ui/EntityList` (`.dsx-head` sticky, CSS `theme/datapages.css`) → tutte le liste. Standard L-3. Memoria [[feedback_list_sticky_header]].
- **Codice articolo editabile**: `code` (default number_series) ora sovrascrivibile a mano (scelta utente dopo analisi leader ERP). Shared `createMaterialSchema.code`, backend create/PATCH, FE scheda+lista. Unicità archived-aware.
- **`docs/STANDARD_siSuite.md`**: raccolta UNICA di tutte le regole tassative (A–H) per enforcement cross-sessione.
- Verifica: typecheck shared+BE+FE puliti, smoke live di tutti i casi.

## 2026-06-27 (3) — Chiusura TOTALE residui audit (chat 01.06)
- Solo frontend + 2 route backend (nessuna migrazione nuova; prossima libera resta **054**). Commit `e44d761` su `main`.
- **Picker entità** (riuso lista vera in Modal): nuovi `ui/ResourcePickerDialog` (con "+ Nuovo"), `EngagementPickerDialog`, `WorkOrderPickerDialog`. `RisorsePage`/`EngagementsPage`/`OrdinativiPage` con `pickProps`; `RisorsaDetailPage` embed. Cablati al posto dei `<select>` entità in: PickList (risorsa/commessa/WO), Ordinativo (commessa/squadra), Lavorazioni (commessa), UserDetail (risorsa), CommessaDetail (cliente in creazione).
- **Liste documenti magazzino**: backend `warehouse.ts`/`stock.ts` GET `/purchase-orders`,`/pick-lists`,`/stock/documents` con `?q/?filter/?sort` (buildFilter/buildOrderBy + SORTABLE); `SpecListsPages.tsx` cablato (filterFields/sortFields/entity) → toolbar completa.
- **AttivitaDetailPage**: rebuild da legacy Ionic a `ObjectPage` + `RelatedTabs` (Risorse/Bloccata-da/Ore/Materiali) con picker + NumInput.
- **CommessaDetailPage**: sub-CRUD Fase/Attività + SaveAsTemplate da `IonModal` a `ui/Modal` centrato; durata → NumInput; cliente(creazione) → CompanyPicker.
- **/agenda**: rimossa rotta+voce placeholder morta (`AppShell.tsx`, `shared/nav.ts`); menu mobile (`shared/menu.ts`) ripuntato a `/planning`.
- **Residuo unico documentato**: sito in AssetDetail resta `<select>` (SiteTree = albero per-cliente, popolato da endpoint reale, non lista ad-hoc). Tab `.tabs` Commessa lasciata (design-system, contenuto ricco).
- Verifica: typecheck shared+BE+FE puliti, 79/79 test BE, smoke 200 (doc-list filtri) + integrità 409 attiva, app up (5173/3010). Vedi `docs/analisi/DONE_TOTALE_3.md` §Residui-CHIUSI.

## 2026-06-27 (2) — AUDIT TOTALE + bonifica integrità + standardizzazione (chat 01.06)
- **Migrazioni 052→053 applicate** (prossima libera **054**). Vedi `docs/analisi/DONE_TOTALE_3.md` + ADR-0010 + `AUDIT_conformita_DB.md`/`AUDIT_conformita_UI.md` (FASE 0) + schema rigenerato `2026-06-27_schema_db_completo_post_audit.md` (001→053).
- **052**: 11 colonne `unit`/`weight_unit` text → `unit_id`/`weight_unit_id` **FK** `unit_of_measure(id)` `ON DELETE RESTRICT`, DROP testo (CLEAN SLATE). Vista `job_cost_ledger` ricreata. Helper `app_resolve_unit`. **Contratto DTO invariato** (join code in lettura, resolve in scrittura): frontend `UnitSelect` immutato. Backend toccato: consumptions/prices/materials/warehouse/stock/workReports/workOrders/workLines/unitsOfMeasure + ai/applier + demo/runner.
- **053**: unicità incl. righe di sistema (`unit_of_measure`/`tax_rate` indici parziali `WHERE tenant_id IS NULL`) + chiavi naturali (material_category, template, resource.code, app_user.code, numeri documento stock_document/stock_count/purchase_order/pick_list).
- **Backend**: soft-delete con controllo d'uso (`context/usageGuard.ts`) su material/company/resource/site/asset → 409 col nome+entità. tax_rate anti-dup sistema-aware (create+update). handler 23505 nomina il valore.
- **Frontend (no migrazioni)**: `useReloadOnEnter` su 10 liste; NumInput (Risorsa/Assenze/Magazzino/Ordinativo); UnitSelect (scheda Articolo); Elimina-col-nome (Ore/Assenza); picker (PO-Ricevi/Ordinativo/Asset/Template). Rimossi leftActions placeholder morti (EntityList ha già la toolbar reale).
- **`category` lasciata testo** dove è tassonomia/metadato (lookup_value/canonical_state/field_definition/skill/price_list_item.category): non cataloghi → no FK (documentato). `material` ha già `category_id` FK.
- Verifica: typecheck BE+FE puliti, **79/79 test BE verdi**, smoke canonici live (UM dup 409, articolo referenziato archive 409, UM sistema 404), migrazioni idempotenti.
- **Residui documentati** (no regressioni): pick mode su liste Risorse/Commesse/Siti; toolbar filtri liste-documenti (endpoint GET con ORDER BY fisso); rebuild AttivitaDetailPage + sub-CRUD CommessaDetailPage (richiedono verifica a video); /agenda PlaceholderPage.

## 2026-06-23 — Fix errori DDT + Duplica su tutte le anagrafiche + errori chiari (chat 01.06)
- Solo frontend + shared(zod) + backend(error handler). Nessuna migrazione.
- **Fix 400 DDT/ubicazioni**: `createStockDocumentSchema` e `createStockLocationSchema` resi `.nullable().optional()` sui campi opzionali (la UI invia null). PO/Pick erano già nullable.
- **Messaggi d'errore chiari**: `index.ts` setErrorHandler traduce gli errori zod elencando i campi (it-IT). DDT: validazione campi obbligatori con **rosso** (PickerField `invalid`) + toast chiaro.
- **Duplica STANDARD** estesa a TUTTE le anagrafiche: Aziende/Clienti/Fornitori, Risorse, Asset, Listino, Magazzini, Ruoli, Commesse (oltre a Materiali/Ordini di lavoro/Utenti già fatti). Sempre via prefill senza campi chiave.
- **Elimina con nome** verificato su tutte le liste anagrafiche.
- Memoria standard aggiornata (Duplica/Elimina/errori promossi a tassativi). Typecheck FE+BE+shared verde.

## 2026-06-22 (2) — Standard UI: selezione entità in popup esteso, Duplica, Elimina-nome, righe compatte (chat 01.06)
- Solo frontend. Nessuna migrazione/backend/shared.
- Selezione entità (popup centrato, riuso lista vera): esteso da Materiali a **Fornitori** (CompanyPickerDialog) e **Magazzini** (LocationPickerDialog) + `ui/PickerField`. Usati nelle testate PO/Pick/DDT al posto dei select. ClientiPage/ClienteDetailPage e MagazzinoPage(lista)/MagazzinoDetailPage resi pick+embeddabili.
- **Duplica STANDARD** (in collaudo): non crea subito; `useEntityActions` naviga a `${basePath}/new` (o `newPath`) con `state.prefill`; la scheda legge `location.state.prefill` in creazione e precompila SENZA chiavi. Wired: Materiali, Ordini di lavoro, Utenti.
- **Elimina**: ConfirmDialog mostra il nome (EntityList prop `rowLabel`/prima colonna `value`).
- **Righe documento compatte**: `.subt` padding ridotto + input bassi (28px).
- Memoria standard: `feedback_entity_selection_popup.md`. Typecheck FE verde.

## 2026-06-22 — Selezione entità: riuso lista vera in popup centrato (chat 01.06)
- Nessuna migrazione/backend/shared. Solo frontend. Pattern STANDARD riusabile.
- `ui/Modal.tsx` (nuovo, modale centrato). `EntityList`: in pick mode radio=seleziona, click-riga=apre CRUD (onRowClick) + radio cell stopPropagation. `MaterialeDetailPage`: modalità `embed` (CRUD in modale, no route). `MaterialiPage`: modalità `pickProps` (riusa la lista vera in selezione; "+ Nuovo"/riga aprono la CRUD modale). `MaterialPickerDialog`: riscritto = Modal centrato che ospita MaterialiPage in pick (sostituisce la vecchia lista ad-hoc). PO/Pick/DDT invariati (stessa API picker).
- Typecheck FE verde.

## 2026-06-21 (3) — Documenti master-detail PO/Pick/DDT (chat 01.06)
- **Nessuna migrazione** (prossima libera resta 050). Solo backend(code)+frontend+shared(DTO).
- Backend: `stock.ts` +GET `/stock/documents/:id` e PATCH (bozza). Shared: StockDocumentLineDto, StockDocumentDto esteso, updateStockDocumentSchema. (PO/Pick avevano già GET:id/PATCH/azioni.)
- Frontend: nuovo `ui/MaterialPickerDialog` (lista Materiali in modalità selezione, EntityList pick mode — riusabile); nuove schede master-detail `PurchaseOrderDetailPage`/`PickListDetailPage`/`DdtDetailPage` (stile Ordini di Lavoro, righe via picker, azioni Ricevi/Conferma); SpecListsPages liste cliccabili + Nuovo+ + nuova DdtPage; rotte in AppShell.
- Verifiche: typecheck shared+BE+FE puliti; 79/79 test BE; smoke DDT create/GET:id/PATCH/confirm OK.
- Doc: `docs/analisi/DONE_documenti_master_detail.md`.

## 2026-06-21 (2) — SPEC Identità&Accessi + GoTrue + Immagini + Rifiniture (chat 01.06, autonomo G→K)
- **Migrazioni 047→049** (la SPEC diceva 047→048; il provisioning-by-email del Blocco I ha richiesto la 049). **Prossima libera: 050.**
  - 047 user_lifecycle (app_user +status/invited_at/last_login_at/code, unique auth_user_id, number_series app_user UTE-)
  - 048 material_images (DROP material.primary_image_url + unique parziale una-primaria-per-articolo)
  - 049 identity_provisioning (funzione `app_link_identity_by_email` SECURITY DEFINER per il login-by-email)
- **Premessa**: G/H/I/J erano GIÀ in gran parte implementati (routes users/roles, pagine admin, GoTrue cablato dual-mode, bootstrap seed ruoli). Riempiti i GAP, non ricostruito.
- **Moduli toccati**: shared/admin (UserAdminDto+status/code/risorsa, invito, effective) + shared/entities (StockLocationDto code/note/manager, ContactDto mobile/dept/note, MaterialImageDto url, drop createMaterial.primaryImageUrl) + shared/fields. Backend: users/roles (estesi), materials/materialCatalog (immagini MinIO reali, drop primary_image_url), stock (location code/note + seriali per-magazzino), companies (contatti), context/resolve+authenticate (provisioning-by-email), storage (bucket material-images + presign pubblico), config, bootstrap, nuovo `src/demo/wipeTestData.ts`. Frontend: UserDetailPage/UsersPage/RoleDetailPage/RisorsaDetailPage/MaterialeDetailPage/MaterialiPage/ClienteDetailPage/MagazzinoPage.
- **Convenzioni**: authN GoTrue / authZ RBAC+RLS (nessuna credenziale in app_user); provisioning-by-email NON apre auto-registrazione; immagini = bucket non pubblico + URL presigned con endpoint pubblico (localhost:9100 dev). Wipe demo preserva la struttura.
- **Verifiche**: typecheck shared+BE+FE puliti; **79/79 test BE verdi**; smoke L con login GoTrue reale (manuale, invito→provisioning, token invalido 401, immagini upload/primaria/delete con URL scaricabile, location code/note, seriali per-magazzino, contatti).
- **Docs**: DONE_G..K + DONE_TOTALE_2 (docs/analisi); ADR-0009 (docs/adr); schema rigenerato 2026-06-21_schema_db_completo.md (rev.2, 001→049).
- **Aperti**: SMTP per inviti reali (staging); reset-password admin (follow-up); reorder immagini drag&drop UI; MINIO_PUBLIC_ENDPOINT in prod.

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

## 2026-06-26 — Standard UI: popup centrato ovunque, UM+Categorie, DDT, numeri (chat 01.06)
- Solo FE + 1 migrazione (050 unit_of_measure). Tutto verde (BE+shared+FE).
- Duplica: rimosso "(copia)" dal nome (standard). DDT/PO/Pick: toolbar standard + DELETE bozze (BE) + useReloadOnEnter (fix cache Ionic). Pulite le bozze di test.
- Magazzino: form anagrafica campi standard .bi (Nome largo); tab Movimenti/Ubicazioni e DocumentiPage(morta, rimossa) da Drawer → Modal centrato.
- Anagrafiche nuove: Unità di misura (050 + routes/unitsOfMeasure + UnitsPage) e Categorie articolo ad ALBERO (CategoriePage, route /material-categories già esistente); cablate nel form Articolo (select UM + select categoria albero).
- ui/NumInput (formato it-IT migliaia/decimali) nelle righe documento; colonne allineate (colgroup).
- SWEEP Drawer→Modal centrato: PurchaseOrder(Ricevi), ClienteDetail(contatto), Ordinativi(Assegna/Importa), Assenze, admin CustomFields/Numbers/Labels/Templates, ui/CrudList, MagazzinoPage. Nessun Drawer CRUD residuo nelle pagine.
- Memoria standard aggiornata (feedback_entity_selection_popup: CRUD sempre Modal centrato; Duplica no (copia); liste reload-on-enter; documenti = entità complete).

## 2026-06-27 — Regole canoniche DB + UI Categorie/UM/IVA (chat 01.06)
- Migrazione 051 (material_category.icon). Prossima libera 052.
- INTEGRITÀ: handler globale 23503 (FK)→409 con entità; 23505 (unique)→409. UM: codice univoco vs sistema+tenant; delete bloccata se usata (articoli/movimenti/righe). material_category: delete (soft) bloccata se usata (articoli/sotto-categorie). Messaggi chiari in popup.
- AUTO-REFRESH: api/cache.ts (bus invalidazione) — apiFetch/apiUpload invalidano la risorsa, useApi si ricarica → niente logout/login; risolve anche cache pagine Ionic.
- UI: Categorie modal standard + IconPicker (palette lucide, ui/categoryIcons) + icona/colore nell'albero; UM modal standard + Duplica (anche da righe sistema); Aliquote IVA CRUD completo (toolbar + modal).
- Memoria: feedback_db_integrity_canonical (regole tassative ogni app).
- Typecheck shared+BE+FE verde.
