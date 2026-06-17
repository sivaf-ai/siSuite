# HANDOFF — siSuite / POWERCOM — per nuova sessione Claude Code (17/06/2026)

> **Leggere PRIMO.** Documento di ripartenza completo: stato, cosa resta, come farlo, gotcha. Brief vigente: **`docs/analisi/BRIEF_MASTER_Claude_Code_POWERCOM_v2_4_01.03.md`** (UNICO, ignora i precedenti). Materiale di dettaglio: mock `docs/mockup/41,42,43,44..50`, ADR `docs/adr/`, schema `docs/analisi/2026-06-16_schema_db_completo.md`, report `docs/DONE_*.md`, coordinamento `JOURNAL.md`.

---

## 0. REGOLE DI LAVORO (tassative)
- **Autonomia totale**: non chiedere conferme, decidi, procedi, documenta a fine (regole globali utente).
- **Lingua**: UI/testi/commenti in **italiano**; identificatori codice in **inglese**.
- **I mockup sono target vincolanti**: fedeltà visiva + tutti i campi prima dell'infrastruttura.
- **Ogni blocco chiude con**: test funzionale reale + `docs/DONE_<blocco>.md`. (Gli screenshot richiesti dal brief non sono producibili senza browser headless: lasciare una checklist visiva e chiederli a Ricardo.)
- **Checkpoint**: il brief impone di **fermarsi dopo Soggetti+Commesse del Blocco M** e mostrare a Ricardo prima di replicare. ⚠️ **MA Ricardo è via e ha chiesto di FARE TUTTO**: quindi **NON fermarsi ai checkpoint** — procedere fino a esaurire i blocchi, documentando ogni blocco in `DONE_*.md`.
- **REGOLA UI TASSATIVA** (già in memory `feedback_objectpage_sticky_header`): nelle schede la barra Salva/Annulla deve essere **a filo** del titolo, **mai** un gap dove scrollano i dati. Soluzione già pronta: `Page` ha la prop **`bleed`** (azzera padding-top di IonContent) + `.dsx .op-head` sticky `top:0` opaco. **Usare `<Page bleed>` in ogni nuova ObjectPage.**

## 1. COME AVVIARE / VERIFICARE
- Tutto in Docker. Container: `sisuite_db` (5433), `sisuite_backend` (3010, `pnpm dev` = tsx watch), `sisuite_frontend` (5173, vite), `sisuite_auth` (9999, GoTrue).
- **App**: http://localhost:5173 · **Login owner**: `owner@fibra.demo` / `Demo123!` (tenant "Fibra Demo", vertical=fiber). Tecnico (per PII/data_scope): `marco@fibra.demo` / `Demo123!`. **Platform admin** (per Demo/Super admin): `owner@sisuite.local` / `Owner123!`.
- **DB**: `docker exec sisuite_db psql -U sisuite_admin -d sisuite -c "..."`
- **Migrazioni**: file `db/migrations/NNN_nome.sql` (auto-tracking con `INSERT INTO sisuite_migrations ... ON CONFLICT`). Applicare con: `docker compose run --rm migrate` (applica migrazioni + ri-bootstrap permessi). **Prossima migrazione libera: `033`.**
- **Typecheck**: shared `docker exec sisuite_backend sh -c "cd /app && pnpm --filter @sisuite/shared typecheck"`; backend `docker exec sisuite_backend sh -c "cd /app && npx tsc --noEmit -p packages/backend/tsconfig.json"`; frontend `docker exec sisuite_frontend sh -c "cd /app/packages/frontend && npx tsc --noEmit"`.
- **GOTCHA tsx watch**: dopo modifiche a file backend (specie `demo/runner.ts`, nuove route, `permissions.ts`) **il backend long-running spesso NON ricarica** → `docker restart sisuite_backend` (attendi ~6s). Sintomo tipico: 404 su route nuove o 400 su wipe/load.
- **Ricaricare demo** (dopo modifiche a loader/migrazioni che toccano dati): UI Demo/Super admin, oppure via API:
  ```
  PT=$(curl -s "http://localhost:9999/token?grant_type=password" -H "Content-Type: application/json" -d '{"email":"owner@sisuite.local","password":"Owner123!"}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
  curl -s -X POST "http://localhost:3010/platform/demo/fiber/wipe" -H "Authorization: Bearer $PT"
  curl -s -X POST "http://localhost:3010/platform/demo/fiber/load" -H "Authorization: Bearer $PT"
  ```
  (Il token scade in fretta: rigeneralo se 401.) Dopo modifiche al loader, **riavvia il backend prima** del wipe/load.
- **Permessi nuovi nel catalogo** (`packages/shared/src/permissions.ts`): dopo averli aggiunti, **ri-esegui `docker compose run --rm migrate`** (il bootstrap riscrive `role_permission` dal catalogo) e **riavvia il backend**.

## 2. STATO ATTUALE — FATTO (non rifare)
- **DB**: migrazioni 001→**032** applicate. Schema completo in `docs/analisi/2026-06-16_schema_db_completo.md` (rigenerabile con `pg_dump --schema-only -n public`; nota: 032 ha rinominato `work_order.operator_*`→`principal_*` + aggiunto `type_id`, da rigenerare).
- **Blocco A** (nav 2 livelli + estrazione componenti): `shared/nav.ts`, `frontend/shell/AppShell.tsx` (rail L1 + sub-panel L2 + omnibox ⌘K + sibling tabs + preferiti/recenti + route-guard RBAC; sezione a 1 voce naviga diretta). Componenti estratti **`ui/EntityList.tsx`** + **`ui/ObjectPage.tsx`** (ObjectPage/ObjectBox/RelatedTabs) + CSS `theme/datapages.css` (scope `.dsx`). Modello **Party**: `companyRoleEnum`+`operator`, `/companies?role=` viste.
- **Blocco B + B-ter** (Ordini di lavoro): `routes/workOrders.ts`, `OrdinativiPage`/`OrdinativoDetailPage`. PII 3 livelli (full/contact/none). Rinominato a "Ordini di lavoro" + `type_id`.
- **Blocco C** (Articoli & seriali, mock 45): `routes/materials.ts`, `routes/serials.ts` (transition+secret reveal gated), `crypto.ts` AES-GCM, `MaterialiPage`/`MaterialeDetailPage`. Migrazione 030.
- **Blocco C-bis** (Siti): migrazione 031 `site`, `routes/sites.ts`, `ui/SiteTree.tsx` in scheda Soggetto.
- **Blocco D** (Listino + resolvePrice): `shared/pricing.ts` (+test 7/7 `backend/test/resolvePrice.test.ts`), `routes/prices.ts`, `ListinoPage`/`ListinoItemDetailPage`.
- **Blocco E** (Lavorazioni + libretto): `routes/workLines.ts` (prezzi fotografati con resolvePrice; quantità=somma libretto), `LavorazioniPage`/`LavorazioneDetailPage`.
- **Seed pack fibra COMPLETO**: `db/demo-packs/fiber.json` + `demo/runner.ts` popolano TUTTE le tabelle (vedi DONE_*). 
- **Fix UI**: gap header sticky risolto (Page `bleed`); campana notifiche; recharts (`ui/ChartBox`).

## 3. DA FARE — IN QUESTO ORDINE (Ricardo vuole TUTTO)

### ⬛ Blocco M — Migrare le liste/CRUD vecchie allo standard v2 (CRITICO, brief Parte 8 Blocco M)
Le liste ancora sul pattern vecchio (`DataTable`/`CrudList`/`Drawer` + icone-azione sulle righe) vanno **rifatte** su **`EntityList`** (lista) + **`ObjectPage`** (scheda) come Ordinativi/Articoli. **Dove il vecchio `FRONTEND_SPEC.md` confligge, vince il v2** (niente drawer master-detail, niente icone-azione sulle righe).

**Checklist v2 per OGNI lista** (vedi brief Parte 8 §1-5): da `DataTable/Drawer`→`EntityList`+`ObjectPage`; **togliere le icone-azione dalle righe** (azioni nella toolbar a icone; selezione = solo numero; click riga→scheda); **viste** sulla riga titolo; ricerca; Filtri/Colonne/AI; gruppo azioni dx con **Nuovo "+" per ultimo**; righe a 2 livelli (entità ricche) o 1 (griglie); numeri a destra/tabellari, valuta contabile, durata h:mm.
**Checklist v2 per OGNI scheda** (§6-10): crea+vedi+modifica in **una `ObjectPage`** (`<Page bleed>`), header sticky con **solo Salva/Annulla**; label/titoli box nel bordo; validazione **dentro il campo**; tab correlate in fondo; campi da `field_definition` (EntityForm) dove applicabile; RBAC su UI+API; stati vuoto/caricamento/errore.

**Pattern di riferimento già fatti da copiare**: `pages/MaterialiPage.tsx` (lista EntityList con viste/azioni) e `pages/MaterialeDetailPage.tsx` (ObjectPage `bleed` + RelatedTabs). Usa `EntityList<T>` con `columns: ListColumn<T>[]`, `views`, `leftActions`/`rightActions: ListAction[]`, `onRowClick`. Usa `ObjectPage`/`ObjectBox`/`RelatedTabs`. Numeri: `ui/Num.tsx` (`Money`, `Num`, `Dur`). Stato pill: `components/StatusPill` + `useLookups()`.

**Inventario (da `FRONTEND_SPEC §4`), in ordine di priorità:**
| Entità | Pagina vecchia da rifare | Etichetta | Priorità |
|---|---|---|---|
| `company` | `pages/ClientiPage.tsx` (ancora DataTable+MasterDetail) + `ClienteDetailPage.tsx` (FormPage→ObjectPage) | **Soggetti** (+ viste Clienti/Fornitori/Gestori via `?role=`, già supportato dal backend) | **ALTA** |
| `engagement`+`phase` | `pages/EngagementsPage.tsx` + `CommessaDetailPage.tsx` | **Commesse** (+ albero fasi/WBS, mock 24 — riusa pattern `SiteTree`/tree) | **ALTA** |
| `asset` | `pages/AssetPage.tsx` | **Asset** (aggiungi selettore **Sito** `asset.site_id`, pronto dal C-bis) | MEDIA |
| `resource` | `pages/RisorsePage.tsx` (+ `RisorsaDetailPage`) | **Risorse** | MEDIA |
| `activity` | (Agenda/Attività) | **Attività** | MEDIA |
| `app_user`+`role` | `pages/admin/UsersPage.tsx`, `RolesPage.tsx` | **Utenti e ruoli** | MEDIA |
| `capture` | `pages/CapturePage.tsx`/inbox | **Catture** | MEDIA |
| `lookup_value` | `pages/admin/LabelsSettings.tsx` | **Stati ed etichette** | BASSA |
| `number_series` | `pages/admin/NumbersSettings.tsx` | **Numerazioni** | BASSA |
| `plan/subscription` | `pages/admin/BillingPage.tsx` | **Piano** | BASSA |
> NON rifare `material` (Articoli, già v2) né `work_order` (Ordini di lavoro, già v2).
**DoD**: nessuna lista con icone-azione sulle righe; nessun CRUD con drawer master-detail; stessa `EntityList`/`ObjectPage` riusata ovunque. `DONE_M_<entità>.md` per batch. Backend per queste entità per lo più **esiste già** (companies, engagements, phases, assets, resources, users, roles, lookups, numberSeries): è soprattutto lavoro **frontend** + eventuali viste/conteggi mancanti negli endpoint lista.

### ⬛ Blocco A-bis — Field Builder (Impostazioni → Campi personalizzati) (brief Parte 8 A-bis)
- **Backend**: estendere `routes/fieldDefinitions.ts` con **`POST/PATCH/DELETE`** (oggi c'è solo GET + un POST parziale) **solo righe del tenant** (le righe di sistema `tenant_id NULL` sono read-only; "sovrascrivere" = creare riga tenant con stesso `entity`+`key`). Validazione: `key` univoco per `(tenant,entity,key)`, `data_type` in set, `options` obbligatorio se select/multiselect. Nuovo permesso **`field_definition:manage`** (in `permissions.ts`, grant Owner) → poi `docker compose run --rm migrate` + restart.
- **Frontend**: nuova pagina in Impostazioni "Campi personalizzati": selettore Entità (work_order/material/company/asset/site/engagement…) + verticale; lista campi per `group_key` con badge sistema/personalizzato + toggle active + riordino (sequence); drawer editor campo (key, label i18n it/en/es, help, data_type, required, options, validation, unit, group_key, placeholder, sequence); **anteprima live** con `EntityForm`. Aggiungere voce menu in `nav.ts` (sezione Impostazioni) + rotta in `AppShell.tsx`.
- **DoD**: l'admin apre Campi personalizzati → seleziona "Ordine di lavoro" → vede i 5 campi fibra (di sistema, read-only) → aggiunge un campo tenant → compare nella scheda Ordine di lavoro.

### ⬛ Blocco F — Rapportino + CaptureBarAI (mock 48) — il cuore AI
- Testata **`work_report`** (esiste) + `work_report_time_entry`; archetipo **Documento** (`DocumentPage` da creare): testata + sezioni righe (Manodopera `time_entry` · Attrezzature `equipment_usage` · Materiali `material_consumption` · Subappalti `subcontract_line` · Lavorazioni `work_line` · Foto `capture`). Striscia totali costi/ricavi/margine (tipo dedotto per sezione).
- **CaptureBarAI end-to-end**: cattura (`capture`) → endpoint server chiama LLM (chiave server-side, quota per tenant — c'è già infra AI in `backend/src/ai`, verificare `ANTHROPIC_API_KEY`) → **diff di operazioni candidate** (MAI scrivere nel DB qui) → UI review (accetta/modifica/rifiuta) → **apply deterministico** (Zod+Drizzle, audit, `source_capture_id`, idempotente). Nessun PII nei log; quota prima della chiamata.
- C'è già `voice/useVoiceCapture.ts` e `routes/captures.ts`/`narrative.ts` da riusare.

### ⬛ Blocco G — Pivot preventivo-consuntivo + export (mock 47)
- Fonte: vista **`job_cost_ledger`** (già popolata). KPI (ricavi/costi/margine/%); **`PivotTable`** ad albero Commessa › Fase/WBS › Voce con sottototali + barre margine; etichette/colori tipo da `lookup_value('cost_type')`. **Esporta Excel** (incluso) e "Esporta per CPM" (add-on, placeholder). Backend: endpoint che aggrega `job_cost_ledger` per commessa/fase/voce/tipo. Nota: la manodopera è valorizzata (time_entry con cost_rate/bill_rate nel seed).

### ⬛ Blocco H — Magazzino/DDT + seed completo (mock 42)
- Documenti magazzino archetipo **Documento**: DDT carico/scarico/trasferimento/rettifica (varianti `stock_document`); scarico su ordinativo → `stock_movement` con `work_order_id`. Schermate Giacenze/Movimenti/Inventario (dati già seedati). Completa il tab "Materiali scaricati" della scheda Ordine di lavoro e i tab Giacenze/Movimenti/Documenti della scheda Articolo (oggi placeholder).

### ⬛ Blocco B-bis — rifinitura Ordini di lavoro
- Editor **mapping CSV** in toolbar (colonna→campo, poi POST `/work-orders/import`); **azioni bulk** (assegna/esporta selezionati, `/work-orders/assign` esiste); selezione multipla righe (EntityList ha già `mode pick-multi`). Accentrare il **selettore densità** solo in Impostazioni (oggi ancora in qualche toolbar).

## 4. DEBITI TECNICI APERTI (annotati nei DONE)
- `data_scope` seriali: applicato in **query**, non ancora in **RLS** (brief lo ammette).
- Reveal segreto seriale: valore mai loggato, ma **manca tabella audit** dell'evento reveal.
- Tab "Lavorazioni che la usano" (Listino) e "Storico prezzi": fonte dati pronta, UI da popolare.
- Selettore densità da accentrare in Impostazioni (B-bis).
- Rigenerare `docs/analisi/<data>_schema_db_completo.md` dopo le prossime migrazioni.

## 5. CONVENZIONI DI CODICE (per coerenza)
- Route backend: `app.get/post(... { preHandler:[app.authenticate, requirePermission('x:y')] }, ...)` + `withRls(request.ctx, db=>...)`. DTO/schemi Zod in `packages/shared/src/entities.ts` (o file dedicato), esportati da `index.ts`. Attributi validati con `validateAttributes(db, tenantId, entity, attrs)` (field_definition).
- Frontend: `useApi<T>(path)` / `mutate(method,path,body)` da `api/hooks`; `useAuth()`, `useLookups()`, `useToast()`. Rotte in `shell/AppShell.tsx` (con `perm`). Voci menu in `shared/nav.ts` + i18n in `frontend/src/i18n/{it-IT,en,es-AR}.json` + icona in `ui/icons.ts` (`iconByName`).
- Ogni nuova scheda: `<Page bleed>` + `ObjectPage` (regola header sticky).
```
