# HANDOFF — siSuite / POWERCOM — nuova sessione Claude Code (18/06/2026)

> **Leggere PRIMO.** Punto di ripartenza operativo. Brief storico: `docs/analisi/BRIEF_MASTER_Claude_Code_POWERCOM_v2_4_01.03.md` (completato). Per lo STATO STRATEGICO e i prossimi lavori: `docs/analisi/2026-06-18_STATO_per_ClaudeAI.md`. Coordinamento: `JOURNAL.md`. Standard UI: `docs/STD_*.md`. Report blocchi: `docs/DONE_*.md`.

---

## 0. REGOLE DI LAVORO (tassative)
- **Autonomia totale**: non chiedere conferme, decidi, procedi, documenta a fine (regole globali utente in `~/.claude/CLAUDE.md`).
- **Lingua**: UI/testi/commenti in **italiano**; identificatori codice in **inglese**.
- **MAI popup nativi del browser** (`window.confirm/prompt/alert`): sempre dialoghi in-app (`ui/ConfirmDialog`, `ui/PromptDialog`). Vedi memory `feedback_no_native_popups`. **Regola tassativa, segnalata con forza dall'utente.**
- **Header sticky schede a filo** (`<Page bleed>` + `ObjectPage`): mai gap dove scrollano i dati. Memory `feedback_objectpage_sticky_header`.
- **Naming SQL**: tabelle/colonne lowercase concat. Memory `feedback_sql_naming`.
- **Dipendenze npm**: i container montano solo `src/` → dopo `pnpm add` nel container, aggiungere a mano la dep nel `package.json` dell'host. Memory `feedback_docker_deps_mount`.
- **NON toccare `scratch-porting/`**: la gestisce un'altra sessione (porting dati legacy).

## 1. COME AVVIARE / VERIFICARE
- Tutto in Docker. Container: `sisuite_db` (5433), `sisuite_backend` (3010, tsx watch), `sisuite_frontend` (5173, vite), `sisuite_auth` (9999, GoTrue), `sisuite_minio` (9100/9101).
- **Avvio one-click**: doppio click su `avvia-siSuite.bat` (avvia Docker se serve, `docker compose up -d --build`, attende e apre il browser). Stop: `ferma-siSuite.bat`. Demo: `carica-demo-fibra.bat`. Guida: `AVVIO.md`.
- **App**: http://localhost:5173 · **Login owner**: `owner@fibra.demo` / `Demo123!` (tenant Fibra Demo). Tecnico (PII/data_scope): `marco@fibra.demo` / `Demo123!`. **Platform admin**: `owner@sisuite.local` / `Owner123!`.
- **DB**: `docker exec sisuite_db psql -U sisuite_admin -d sisuite -c "..."`
- **Migrazioni**: file `db/migrations/NNN_nome.sql` (auto-tracking `INSERT ... ON CONFLICT`). Applicare: `docker compose run --rm migrate` (applica + ri-bootstrap permessi). **Migrazioni applicate: 001→035. Prossima libera: `036`.**
- **Typecheck**: shared `docker exec sisuite_backend sh -c "cd /app && pnpm --filter @sisuite/shared typecheck"`; backend `docker exec sisuite_backend sh -c "cd /app && npx tsc --noEmit -p packages/backend/tsconfig.json"`; frontend `docker exec sisuite_frontend sh -c "cd /app/packages/frontend && npx tsc --noEmit"`.
- **GOTCHA tsx watch**: dopo modifiche a file backend (specie route nuove, `permissions.ts`, `demo/runner.ts`) il long-running spesso NON ricarica → `docker restart sisuite_backend` (~7s). Sintomo: 404 su route nuove.
- **Permessi nuovi** in `packages/shared/src/permissions.ts`: dopo averli aggiunti, ri-esegui `docker compose run --rm migrate` (riscrive `role_permission`) + restart.
- **Ricarica demo fibra**: `carica-demo-fibra.bat` oppure UI Demo/Super admin (login platform admin).
- **AI attiva**: `ANTHROPIC_API_KEY` è valorizzata in `.env` → la pipeline AI (estrazione catture, racconto, filtro AI) usa l'LLM reale (`EXTRACTION_MODEL=claude-opus-4-8`).

## 2. STATO — FATTO (non rifare)
### Brief v2.4 COMPLETO
Blocchi A, B, B-ter, C, C-bis, D, E, **M** (tutte le liste/CRUD → EntityList/ObjectPage v2), **A-bis** (Field Builder), **F** (Rapportino-Documento + CaptureBarAI), **G** (Pivot preventivo-consuntivo + export), **H** (Magazzino/DDT), **B-bis** (rifinitura Ordini di lavoro). Dettagli nei `docs/DONE_*.md`.

### Lavori sessione 17-18/06 (oltre al brief)
- **Script di avvio** one-click (`avvia/ferma/carica-demo-fibra` .bat/.ps1 + `AVVIO.md`).
- **Debiti chiusi**: RLS `data_scope` seriali + audit reveal (mig **033**), tab Listino (lavorazioni/storico prezzi), export `.xlsx` nativo (`exceljs`), schema doc rigenerato (`docs/analisi/2026-06-17_schema_db_completo.md`), seed scarichi magazzino su ordine.
- **EntityList v3** (il componente lista, riusato da TUTTE le liste):
  - testata su UNA riga (titolo a sx, viste a dx); **niente riga-titolo duplicata** (`Page.title` opzionale).
  - **selezione** con checkbox per riga + testata; **toolbar standard** dipendente dalla selezione: 1 sel = Modifica/Duplica/Esporta/Elimina; >1 = Esporta/Elimina. Toolbar **tutta a destra** con "+" per ultimo, ricerca larga a sx. Helper `ui/useEntityActions.ts`.
  - **Esporta**: popup `ui/FieldPicker` (TUTTI i campi entità via prop `exportFields`, riordinabili drag, bottoni in alto) + **preset per-utente** (`ui/ExportDialog`, tabella **export_preset** mig **034**, carica/salva). `lib/xlsx`.
  - **Colonne**: stesso picker per mostrare/nascondere e riordinare (persistito localStorage per-utente).
  - **Filtro AI-first** (pulsante ✨): `ui/AiFilterPanel` con (1) linguaggio naturale + **voce**, (2) **builder manuale** (campo·operatore·valore, logica **E/O**). Set di filtri salvabili (tabella **filter_preset** mig **035**). Backend `POST /ai/list-filter` (LLM + fallback) e `/filter-presets`.
  - **Filtro SERVER-SIDE**: `backend/src/filterSql.ts` `buildFilter()` + `FIELD_MAP` per endpoint; le pagine passano `?filter=<json>`; `EntityList` con prop `onFilterChange` = modalità server. Wired: companies, resources, materials, assets, engagements, activities, work-orders, users, roles, price-list-items, work-lines.
  - **MAI window.\***: nuovi `ui/PromptDialog`/`ConfirmDialog`; sostituiti ovunque (export/filtro/firma rapportino/foglio ore/elimina).

## 3. ARCHITETTURA — file chiave
- **Lista**: `frontend/src/ui/EntityList.tsx` (cuore: testata, selezione, toolbar, export, colonne, filtro). Pattern di riferimento pagina lista: `pages/ClientiPage.tsx` (Soggetti, ha `exportFields` + `onFilterChange`).
- **Scheda**: `frontend/src/ui/ObjectPage.tsx` (ObjectPage/ObjectBox/RelatedTabs) + `ui/AttrFields.tsx` (rende `field_definition`). Riferimento: `pages/MaterialeDetailPage.tsx`, `pages/ClienteDetailPage.tsx`.
- **Documento** (rapportino/DDT): `ui/DocumentArchetype.tsx` (sezioni + totali).
- **Dialoghi**: `ui/ConfirmDialog.tsx`, `ui/PromptDialog.tsx`, `ui/FieldPicker.tsx`, `ui/ExportDialog.tsx`, `ui/AiFilterPanel.tsx`.
- **Backend filtri/preset**: `routes/exportPresets.ts`, `routes/listFilter.ts` (AI + filter_preset), `src/filterSql.ts`, `routes/finance.ts` (pivot).
- **Convenzioni**: route `app.get(... { preHandler:[app.authenticate, requirePermission('x:y')] }, ...)` + `withRls(request.ctx, db=>...)`. DTO/schemi Zod in `packages/shared/src/entities.ts`. Attributi validati con `validateAttributes`. Frontend: `useApi`/`mutate`, `useAuth`, `useLookups`, `useToast`. Rotte in `shell/AppShell.tsx`. Menu in `shared/nav.ts`.

## 4. DEBITI/LIMITI APERTI (vedi doc strategico per i prossimi passi)
- **Design-system globale**: font/pulsanti troppo grandi (l'utente lo farà sistemare a Claude AI a livello globale `.btn`/variabili).
- **Filtro server-side**: campi calcolati (giacenza, conteggi), PII (intestatario) e alcuni enum (filtrano sul valore RAW colonna) non mappati. Conteggi viste/chip non riflettono il filtro attivo. Manca operatore "between"/date-picker e gruppi annidati.
- **Export tutti-i-campi**: definito a mano per pagina (`exportFields`); non include ancora i `field_definition` custom del tenant in modo dinamico.
- **Saved views** (mockup "Salva") non implementate (= filtro + colonne + ordinamento salvati con nome).
- **Liste ancora su DataTable vecchio** (non EntityList v3): Foglio ore, Assenze, Magazzino (giacenze/movimenti/documenti/ubicazioni).
- **Rigenerare** `docs/analisi/<data>_schema_db_completo.md` dopo 034/035.

## 5. GIT
- Repo: `https://github.com/sivaf-ai/siSuite.git`, branch `main` (commit diretti su main, come lo storico). Tutto il lavoro di questa sessione è già pushato (ultimo commit `e4ca4b9`).
- Commit: chiudere ogni unità con commit + push; firma `Co-Authored-By: Claude Opus 4.8`.
- **NON committare/ignorare `scratch-porting/`** (altra sessione). Usare `git add packages docs db` o path mirati, evitando `git add -A` indiscriminato.
