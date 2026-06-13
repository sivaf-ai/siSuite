# siSuite — Stato di sviluppo AGGIORNATO (per Claude AI)

> **Data:** 13/06/2026. **Scopo:** dare a Claude AI il dettaglio completo dello sviluppo
> *fino a questo momento* per analizzare la continuazione del progetto. Supera, per la
> parte "stato", il documento `2026-06-13_stato_progetto_per_claude_ai.md` (resta valido
> per visione/architettura). Lo **schema DB** è in `2026-06-13_schema_db_completo.md`
> (aggiornato): **struttura invariata**; unica modifica = migrazione **006** (solo seed
> campi fibra). Verificato contro il codice e il DB reale.

---

## 0. In una riga
Dall'ultimo stato abbiamo eseguito il **BRIEF MASTER** (`docs/decisioni/`): **FASE 0** completa e **FASE 1** completa (demo fibra end-to-end), più due richieste extra del titolare (**SUPER Admin in-app** e **rifacimento Impostazioni** fedele ai mock). Tutto su GitHub (`sivaf-ai/siSuite`, branch `main`, HEAD `3bb21b3`).

---

## 1. Stack e come si avvia (invariato)
- PostgreSQL 16 + pgvector · Backend Node20+**Fastify**+TS via **tsx** · Auth **GoTrue** · Frontend **Ionic+React+Vite**+**lucide** · MinIO · pg-boss · monorepo **pnpm** · tutto **Docker**.
- `docker compose up -d`. Porte: FE **5173**, BE **3010**, GoTrue **9999**, db **5433**, MinIO **9100/9101**, adminer 8082.
- Login owner: `owner@sisuite.local / Owner123!`. DB admin: `sisuite_admin`. Backend gira come ruolo `sisuite_app` (NOBYPASSRLS).
- **Bind-mount Docker** (importante per chi sviluppa): sono montati `packages/backend/src`, `packages/backend/test`, `packages/shared/src`, `db` (`:ro`). **NON** sono montati `package.json` né altri file di config → se cambi `package.json` (script) o aggiungi dipendenze devi **`docker compose build backend`**. I `.ts` sotto le cartelle montate si vedono live (ma `tsx watch` su Windows non ricarica sempre → `docker compose restart backend`).

---

## 2. Cosa è stato costruito in questa fase (dettaglio)

### 2.1 FASE 0 — sicurezza e preparazione ✅
- **GitHub**: remote `origin` (`github.com/sivaf-ai/siSuite`) configurato; tutto committato/pushato a ogni unità di lavoro.
- **Fix documenti**: `app_user.customer_id` → **`company_id`** in `MVP_progetto.md` §9 e `BACKLOG_futuro.md` #13 (la colonna reale è `company_id`).
- **Rete di test dello scheduler** (PRIMA di toccarlo, come da regola): `packages/backend/test/scheduler.test.ts`, **7 casi** che bloccano il comportamento attuale del motore di flusso (dinamiche nei buchi, fisse come occupazioni, `earliest_start`, `due_by` segnalato, unplaceable, ordinamento priorità+created_at). **7/7 verdi**. Aggiunto il bind-mount `packages/backend/test` (prima i test nuovi non erano visibili al container).

### 2.2 Chiave AI — sicurezza definita ✅
- `ANTHROPIC_API_KEY` = **segreto di piattaforma, solo server**. `.env` in `.gitignore` (verificato non tracciato), iniettata **solo** nel servizio backend in compose, **0 riferimenti nel frontend**, letta solo da `config.ts`/`ai/client.ts`.
- Documentazione completa in `.env.example` (dev/single-VPS = `.env`; prod = secrets manager; **on-prem = gateway cloud della piattaforma + token di licenza**, mai la chiave dal cliente).
- Il titolare ha inserito la chiave (da testare l'output LLM reale).

### 2.3 Pipeline AI — ora bidirezionale ✅
- **Ingresso** (già c'era): cattura NL → estrazione (tool use forzato) → validazione deterministica → conferma → commit. Operazioni: `log_time, log_material, set_activity_status, check_checklist_item, clarify`.
- **USCITA — "l'AI che racconta" (NUOVO)**: `packages/backend/src/ai/narrator.ts`
  - `narrateEngagement(db, ctx, engagementId)` → riassunto di una commessa.
  - `narrateToday(db, ctx)` → riassunto della **giornata** del tecnico.
  - Raccolgono i dati **sotto RLS** (l'AI racconta solo ciò che l'utente può vedere), li fanno riassumere all'LLM nella **lingua dell'utente** (`locale`). **Sola lettura**. Senza chiave (o su errore) → **riassunto deterministico** calcolato dai dati (il demo non si rompe mai).
  - Endpoint: `GET /engagements/:id/narrative` (`engagement:read`), `GET /me/today-narrative` (`activity:read`).
  - UI: card "Racconto AI" in `CommessaDetailPage` (on-demand) + riepilogo giornata in cima alla vista tecnico mobile.

### 2.4 Assegnazione risorse da UI ✅
- `AttivitaDetailPage` → componente `RisorseAssegnate`: assegna (select da `/resources` + orario Da/A opzionale), rimuovi, lista. Il **vincolo anti-doppia-prenotazione** (`activity_resource` EXCLUDE gist) emerge come **409** ("Risorsa già impegnata in quell'intervallo") mostrato in UI. Backend già esistente (`POST/DELETE /activities/:id/resources`, `activity:assign`).

### 2.5 Vista tecnico mobile su PC ✅ (gate visivo: 1ª iterazione fatta)
- **Rotta standalone `/m`** (fuori dalla shell desktop): `packages/frontend/src/mobile/` → `PhoneFrame` (scocca telefono: notch, status bar, scroll, tab bar), `MobileShell` (tab Oggi/Agenda/Cerca/Catture + FAB), `TodayMobile` ("Oggi" fedele al **mock 01**: intestazione, hero cattura, **riepilogo AI giornata**, flow con nodo "adesso", progress checklist).
- Cattura riusata: estratto `CaptureContent` da `CapturePage` (contenuto senza wrapper `Page`) → la tab Catture del mobile riusa il loop completo.
- **Cornice telefono responsiva** (fix dopo riscontro titolare): `height: min(830px, 100dvh-92px)` → i tab in fondo restano sempre visibili.
- Per il demo: finestra desktop (pianificatore) + seconda finestra `/m` (tecnico), stesso PC.

### 2.6 Demo Data Pack ✅ (cuore del demo fibra)
- **Loader/unloader/list** in `packages/backend/src/demo/` (`lib.ts`, `runner.ts` = core riusabile, `load.ts`/`wipe.ts`/`list.ts` = CLI sottili). Pack JSON in **`db/demo-packs/`** (chiavi logiche, no UUID).
- **Un tenant per pack**; i dati di **sistema** (`tenant_id IS NULL`) non si toccano mai; "cancella pack" = svuota solo quel tenant (ordine FK inverso) + rimozione identità **GoTrue** (best-effort via service JWT).
- Loader: tenant → subscription → number_series → risoluzione stati di sistema → **utenti GoTrue reali** (login) → insert in ordine FK → `engagement.code` dal numeratore → dipendenze `after:[{act,lag_days}]` → `activity_dependency(FS, lag=N*1440)`.
- **`fiber.json` completo**: 4 utenti (Owner/Planner/2 tecnici, password `Demo123!`), 3 clienti, 2 asset con **campi tecnici fibra** valorizzati, 6 risorse, 6 materiali, 2 commesse (build FTTH + maintenance guasto) con catena FS, **1 attività fissa**, dipendenze, ore, consumi, catture.
- **Testato end-to-end**: load → login tecnico reale → RLS `own` (il tecnico vede solo le sue attività) → wipe (77 righe + 4/4 GoTrue) → dati di sistema intatti → reload. README in `db/demo-packs/`.
- CLI: `docker compose run --rm --no-deps backend pnpm --filter @sisuite/backend demo:load|demo:wipe|demo:list <pack>` (o `npx tsx src/demo/load.ts <pack>`).

### 2.7 Campi di sistema fibra ✅
- Migrazione **006_fiber_fields.sql** (solo seed): `field_definition` `tenant_id NULL`, `vertical='fiber'` — asset `connection_point` (connection_type/socket_id/distance_m/attenuation_db/ont_serial) + engagement `work_order_ref`. `EntityForm` li disegna da solo.

### 2.8 SUPER Admin in-app ✅ (richiesta titolare; deciso: dopo le schermate demo, solo pack inclusi)
- **Gating**: flag `is_platform_admin` (NON RBAC tenant). Guardia `requirePlatformAdmin`. Tenant normali → **403** (verificato).
- **Bootstrap**: env `PLATFORM_ADMIN_EMAIL` → marca quell'utente `is_platform_admin=true` (prod-safe: vuoto = nessuno). In dev: `owner@sisuite.local`.
- **Endpoint**: `GET /platform/demo` (pack + tenant), `POST /platform/demo/:pack/load`, `POST /platform/demo/:pack/wipe`.
- **UI**: pagina nascosta `/admin/platform` (`SuperAdminPage`): per ogni pack **Carica / Azzera e ricarica / Cancella**, lista tenant (demo vs sistema). Link sidebar "Piattaforma → Demo / Super admin" **solo se** `isPlatformAdmin`.
- **Testato**: round-trip HTTP wipe→load OK.

### 2.9 Rifacimento Impostazioni ✅ (riscontro titolare: maschere desktop diverse + manca "Impostazioni")
- **Menu**: una sola voce **"Impostazioni"** (al posto di Etichette/Numeratori/Piano sparsi).
- **`SettingsLayout`** con sotto-navigazione (mock 15-18): Generale · Stati & etichette · Numerazioni · Piano & fatturazione (`settings-grid` + `set-nav`).
- **Stati & etichette** (`LabelsSettings`, mock 15): segmented per categoria (Attività/Commessa/Fase/Priorità) + righe `lv-row` (pallino colore + sigla + nome + canonico), aggiungi/modifica/elimina via Drawer; righe di sistema in sola lettura.
- **Numerazioni** (`NumbersSettings`, mock 16): tabella serie/formati + anteprima prossimo codice + CRUD.
- **Generale** (`GeneralSettings`, mock 18): righe `set-row` (lingua/fuso/orario/valuta/switch) — informative.
- **Piano** (`BillingContent` dentro il layout, mock 17): card piani + quota AI.
- CSS preso da `base.css` (settings-grid/set-nav/set-row/lv-row/swatch). Rimosse le vecchie pagine generiche `LookupsPage`/`NumberSeriesPage`.

### 2.10 Migrazione a lucide (sessione precedente, già fatto) ✅
- Tutte le schermate (Oggi/Dashboard/Pianificazione/Catture) migrate a lucide; **0 ionicons/IonIcon/emoji** residui.

---

## 3. Inventario API backend (attuale)
Tutti dietro `app.authenticate` tranne `/health`. Liste avanzate `?q=&sortBy=&sortDir=&limit=&offset=`.

- **Sistema/identità**: `GET /health` (pubblica), `GET /me`, `GET /me/today-narrative`.
- **Anagrafiche**: `companies` (+`/contacts` CRUD), `assets`, `resources`, `materials` — CRUD `:read/:create/:update/:delete`.
- **Lavoro**: `engagements` CRUD · `GET /engagements/:id/phases` · `phases` CRUD · `activities` (lista/today/:id, CRUD, `/checklist`, `/resources` assign) · `GET /engagements/:id/dependencies` (`dependency:read`, **solo lettura**) · `GET /engagements/:id/schedule` · `GET /engagements/:id/narrative`.
- **Rendicontazione**: `time-entries`, `consumptions`.
- **AI/catture**: `captures` (GET, POST, `/voice`, `/:id/apply`, `/:id/reject`).
- **Amministrazione**: `users`, `roles`, `lookups` (CRUD), `number-series` (CRUD), `billing` (GET), `field-definitions` (GET — scrittura ancora da fare), `dashboard` (GET).
- **Piattaforma (super admin)**: `GET /platform/demo`, `POST /platform/demo/:pack/{load,wipe}` (guardati da `is_platform_admin`).

Route registrate (22): health, me, lookup, engagement, company, asset, resource, material, phase, activity, timeEntry, consumption, schedule, dashboard, capture, fieldDefinition, numberSeries, role, user, billing, narrative, platform.

---

## 4. Inventario frontend (attuale)
- **Shell desktop** (`shell/AppShell.tsx`): sidebar (gruppi Il mio/Lavoro/Anagrafiche/Amministrazione, derivati dai permessi) + sezione "Piattaforma" condizionale (super admin) + tabbar mobile legacy. Routing in `App.tsx`: `Switch` → `/m` = `MobileShell` (standalone), resto = `AppShell`.
- **Vista tecnico mobile** (`mobile/`): `PhoneFrame`, `MobileShell`, `TodayMobile`.
- **Pagine** (`pages/`): Login, Today, Dashboard, Pianificazione, Engagements, **CommessaDetail** (albero/Gantt/Lista/deps/racconto AI), AttivitaDetail (checklist/risorse/ore/materiali), Clienti+ClienteDetail (con contatti), Asset, Risorse, Materiali, Capture(+CaptureContent). **admin/**: Users, Roles, **SettingsLayout** + GeneralSettings/LabelsSettings/NumbersSettings/BillingContent, **SuperAdminPage**.
- **Kit** (`ui/`): Toast, SearchBar, EmptyState, Drawer, ConfirmDialog, DataTable, Field, EntityForm, Toolbar, CrudList (config-driven), DetailLayout, icons.
- **design-system.css** allineato a `docs/mockup/base.css` (incl. classi mobile scopate sotto `.phone`, settings, piano, segmented).

---

## 5. Schema DB
**Struttura invariata** rispetto a `2026-06-13_schema_db_completo.md` (28 tabelle, 7 enum, 8 funzioni, ~86 indici, ~49 policy RLS). Unica modifica: **006** = seed `field_definition` fibra (no DDL). Vedi il doc schema (aggiornato col seed 006). I Demo Pack creano dati a runtime in tenant dedicati; non toccano schema né righe di sistema.

---

## 6. Test e verifica
- **Backend**: 3 test RLS + **7 test scheduler** (rete anti-regressione, da estendere quando si toccherà lo scheduler).
- **Typecheck**: FE+BE+shared verdi a ogni commit.
- **Smoke test manuali** (curl) su ogni endpoint nuovo: admin CRUD, contatti, dipendenze (join), billing, narrative (fallback), assegnazione+409, demo load/wipe/reload, platform 200/403.
- **Verifica visiva (gate)**: 1ª iterazione su vista tecnico mobile e Impostazioni — **serve revisione del titolare** (in corso).

---

## 7. Stato vs BRIEF MASTER
- **FASE 0** ✅ completa.
- **FASE 1** ✅ completa: AI racconta · assegnazione risorse · vista tecnico mobile su PC · demo-pack+fiber · campi fibra · chiave AI. (Fedeltà visiva: iterazione in corso col titolare.)
- **Extra titolare** ✅: SUPER Admin in-app · Impostazioni rifatte.
- **FASE 2** ⏳ da fare: (7) sottrazione `resource_availability` nello scheduler · (8) scheduling **per-risorsa** · (9) **agenda a griglia** risorse×giorni (mock 03/21).
- **FASE 3** ⏳ da fare: (10) **dipendenze parte semplice** (POST/DELETE `/dependencies`, anti-ciclo `WITH RECURSIVE`, stessa commessa, picker "Bloccata da" — *prima il fix sicurezza §5.1 del brief: nel POST verificare visibilità di entrambe le attività via `withRls`*) · (11) gestione **campi personalizzati** (scrittura `field-definitions` + UI) · (12) **template commessa** · (13) pack **software/piscine**.
- **BACKLOG** (`BACKLOG_futuro.md`, aggiornato): integrazione **dipendenze nello scheduler + soluzione proposta** (rimandata, dopo per-risorsa); solver (Timefold/OR-Tools); gateway AI on-prem; gestione campi personalizzati; SUPER Admin (fatto base); aggiornare demo-pack con la crescita dello schema.

---

## 8. Punti aperti per la continuazione (da decidere con Claude AI)
1. **Ordine FASE 2 vs FASE 3**: conviene fare prima lo **scheduling per-risorsa + availability + agenda a griglia** (credibilità) o le **dipendenze parte semplice** (profondità)? Il brief mette FASE 2 prima.
2. **Dipendenze nello scheduler**: quando integrarle davvero (richiede ordinamento topologico + soluzione-proposta, alto rischio sul motore — c'è la rete di test). Vedi BACKLOG.
3. **Fedeltà visiva**: quali schermate desktop allineare per prime ai mock (oltre Impostazioni)? Il titolare segnala differenze diffuse.
4. **Solver** (Timefold/OR-Tools): quando, per la qualità della riprogrammazione proposta.
5. **Persistenza Impostazioni generali** (lingua/fuso/orari) — oggi informative; servono al motore di flusso.
6. **Pack software/piscine**: generarli e testarli (contenuto in brief parte 2 §5/§7).
7. **Gestione campi personalizzati senza codice** (FASE 3.11): endpoint scrittura + RLS + pagina admin "Campi personalizzati".

---

## 9. Cronologia commit (questa fase)
```
3bb21b3 Impostazioni: sotto-nav + Stati&etichette/Numerazioni/Generale/Piano (mock 15-18)
fbfdc1e SUPER ADMIN in-app (load/wipe/reset, is_platform_admin)
a64ed3c Fix vista tecnico mobile: cornice responsiva (tab visibili)
3f3dca6 Vista tecnico mobile su PC (cornice telefono) + racconto giornata AI
2058991 UI assegnazione risorse (+ blocco doppia-prenotazione)
6f256db AI che racconta (lato uscita) + card commessa
a387d08 Sistema Demo Data Pack + pack fibra (testato)
56cabc4 Migration 006 campi fibra + chiave AI in .env.example
08917fe FASE 0: fix docs + suite test scheduler
5d9231c Admin entities + contatti + albero commessa + billing + lucide + docs
ed5d99b siSuite greenfield Fasi 0-3
```
HEAD = `3bb21b3` su `main` (pushato).

---

## 10. File di riferimento
- Brief: `docs/decisioni/2026-06-13_BRIEF_MASTER_per_claude_code.md` (+ parti 1/2/3).
- Schema DB: `docs/analisi/2026-06-13_schema_db_completo.md` (aggiornato).
- Analisi dipendenze: `docs/analisi/2026-06-13_dipendenze_e_roadmap.md`.
- Backend nuovo: `src/ai/narrator.ts`, `src/routes/{narrative,platform}.ts`, `src/demo/*`, `src/context/authenticate.ts` (requirePlatformAdmin), `test/scheduler.test.ts`.
- Frontend nuovo: `src/mobile/*`, `src/pages/admin/{SettingsLayout,GeneralSettings,LabelsSettings,NumbersSettings,SuperAdminPage}.tsx`.
- Dati demo: `db/demo-packs/fiber.json` (+ README).
```
