# siSuite — STATO DI SVILUPPO (documento di passaggio per Claude AI)

> **Data:** 14/06/2026. **Questo è IL documento di stato corrente**: sostituisce
> `2026-06-13_stato_sviluppo_aggiornato_per_claude_ai.md` (resta come storico).
> Generato da ricognizione diretta di codice, DB e git. Si riparte da qui.
>
> **Repo:** GitHub `sivaf-ai/siSuite`, branch `main`, HEAD **`ea9d4b1`** (tutto pushato, working tree pulito).
> **Schema DB completo e attuale:** `docs/analisi/2026-06-13_schema_db_completo.md` (struttura **invariata**).
> **Decisioni vincolanti:** `docs/decisioni/` (BRIEF MASTER + parti 1-4, incl. protocollo di fedeltà visiva).

---

## 0. Visione (invariata)
SaaS **multi-tenant, multi-verticale, AI-first** per gestione attività/commesse di PMI tecniche (fibra, piscine, software, fotovoltaico…). Spina relazionale rigida + strato `jsonb` flessibile (`field_definition`/`domain_pack`) + strato semantico (pgvector). Due archetipi commessa: **build** / **maintenance**. Due shell: **app tecnico mobile** (voce-centrica) e **pannello desktop** (pianificatore/admin). Principio AI-first: **l'AI propone, l'umano dispone** (in ingresso: estrazione NL → conferma; in uscita: racconto + proposte di riprogrammazione).

## 1. Stack e avvio
PostgreSQL16+pgvector · Node20+**Fastify**+TS via **tsx** · Auth **GoTrue** · **Ionic+React+Vite**+**lucide** · MinIO · pg-boss · monorepo **pnpm** · tutto **Docker**.
- `docker compose up -d`. Porte: FE **5173**, BE **3010**, GoTrue **9999**, db **5433**, MinIO **9100/9101**, adminer 8082.
- Login: `owner@sisuite.local / Owner123!`. DB admin: `sisuite_admin`. Backend = ruolo `sisuite_app` (NOBYPASSRLS).
- **Vista tecnico**: `http://localhost:5173/m` (cornice telefono su PC).

### Gotcha operativi (CRITICI per chi sviluppa)
- **Bind-mount Docker selettivi**: montati `packages/backend/src`, `packages/backend/test`, `packages/shared/src`, `db` (`:ro`). **NON** montati `package.json`/config → se cambi `package.json` (script) o aggiungi dipendenze npm: **`docker compose build backend`** poi `up -d`. Modifiche a `docker-compose.yml` (volumi): usa `docker compose up -d` (non basta `restart`).
- **tsx watch su Windows** non ricarica sempre: dopo aver editato `src` backend → **`docker compose restart backend`**.
- **AI**: serve `ANTHROPIC_API_KEY` in `.env` (segreto di piattaforma, solo backend; `.env` in `.gitignore`). Senza chiave le funzioni AI degradano a output **deterministico** (il demo non si rompe). On-prem (futuro): gateway cloud + token licenza.
- **Test**: `docker compose run --rm --no-deps backend sh -c "cd /app/packages/backend && npx vitest run"`.
- **CLI demo**: `docker compose run --rm --no-deps backend pnpm --filter @sisuite/backend demo:load|demo:wipe|demo:list <pack>`.

## 2. Schema DB
**Struttura INVARIATA** rispetto a `2026-06-13_schema_db_completo.md`: 28 tabelle di dominio (+ `sisuite_migrations`), 7 enum, 8 funzioni applicative, ~86 indici, ~49 policy RLS. Migrazioni applicate: `001…006`. **006 = solo seed** (campi `field_definition` fibra, nessun DDL). I Demo Pack creano dati a runtime in tenant dedicati; non toccano schema né righe di sistema (`tenant_id IS NULL`). **Nessuna migrazione pendente.**

## 3. Sicurezza (3 dimensioni + piattaforma)
- **AuthN**: GoTrue (JWT) → `auth_user_id` → `app_user` → contesto.
- **RBAC**: catalogo permessi nel codice (`shared/permissions.ts`), `requirePermission(key)` sugli endpoint.
- **RLS**: FORCE su tutte le tabelle; `withRls()` fa `SET LOCAL` di tenant/user/data_scope/company/is_platform_admin a inizio tx. `data_scope` own|team|tenant|customer (team≡tenant in MVP).
- **Piattaforma (super admin)**: flag `is_platform_admin` (NON RBAC tenant), guardia `requirePlatformAdmin`. Si abilita con env `PLATFORM_ADMIN_EMAIL` (prod-safe: vuoto = nessuno; in dev = owner).
- Ruoli di sistema: Owner/Planner/Tecnico/Contabile/Sola lettura/Cliente esterno.

## 4. API backend (84 handler, 23 route file)
Route registrate: health, me, lookup, engagement, company, asset, resource, material, phase, activity, timeEntry, consumption, **schedule**, dashboard, capture, fieldDefinition, numberSeries, role, user, billing, **narrative**, **platform**, **settings**.

Endpoint chiave (oltre ai CRUD anagrafiche/lavoro già descritti nello schema doc):
- **Lavoro/pianificazione**: `GET /engagements/:id/phases`, `/activities` (+`/today`,`/:id`,`/checklist`,`/resources` assign con vincolo anti-doppia-prenotazione → 409), `GET /engagements/:id/dependencies` (solo lettura), `GET /engagements/:id/schedule` (timeline commessa), **`GET /schedule/week?from=YYYY-MM-DD`** (piano PER-RISORSA settimanale + conflitti + narrazione/proposte AI).
- **AI uscita**: `GET /engagements/:id/narrative` (racconto commessa), `GET /me/today-narrative` (giornata tecnico). Entrambi sotto RLS, deterministico senza chiave.
- **Rendicontazione**: `time-entries` (filtro engagementId/activityId), `consumptions` (filtro activityId/**engagementId**).
- **Amministrazione**: `users`, `roles`, `lookups` CRUD, `number-series` CRUD, `billing` (GET), `field-definitions` (GET — scrittura DA FARE), `dashboard` (GET, KPI+liste), **`GET /settings`** + **`PATCH /settings/working-hours`** (settings:manage).
- **Piattaforma**: `GET /platform/demo`, `POST /platform/demo/:pack/{load,wipe}` (is_platform_admin).

## 5. Frontend (allineato a `docs/mockup/base.css`)
- **Routing** (`App.tsx`): `Switch` → `/m` = `MobileShell` (standalone), resto = `AppShell` (sidebar desktop).
- **Shell desktop**: sidebar a gruppi (Il mio/Lavoro/Anagrafiche/Amministrazione) + voce **"Piattaforma"** condizionale (super admin).
- **Vista tecnico** (`mobile/`): `PhoneFrame` (cornice telefono responsiva), `MobileShell` (tab Oggi/Agenda/Cerca/Catture + FAB), `TodayMobile` (mock 01: hero cattura + riepilogo AI giornata + flow).
- **Pagine** (`pages/`):
  - Dashboard (mock 05: KPI + grid2), **Pianificazione** (mock 03: griglia risorse×giorni + rail AI), Engagements (lista mock 06, pill colorati), **CommessaDetail** (mock 07/24: **4 tab** Struttura[Albero `.xtree` colorato/Gantt/Lista]/Risorse/Ore & materiali/Catture + Racconto AI card), AttivitaDetail (checklist/risorse/ore/materiali), Clienti+ClienteDetail (contatti CRUD), Asset/Risorse/Materiali (CrudList), Capture (+`CaptureContent` riusato dal mobile), Today.
  - **admin/**: Users, Roles, **SettingsLayout** (sotto-nav) → GeneralSettings(mock 18, **editor orari persistente**)/LabelsSettings(mock 15)/NumbersSettings(mock 16)/BillingContent(mock 17), **SuperAdminPage** (demo pack).
- **Kit** (`ui/`): Toast, SearchBar, EmptyState, Drawer, ConfirmDialog, DataTable, Field, EntityForm (da `field_definition`), Toolbar, CrudList (config-driven), DetailLayout, icons (lucide). **0 ionicons/emoji**.
- **design-system.css** allineato a base.css classe-per-classe: `pill--<token>`, tabs, xtree+ticon, kpi/trend, grid2, row-li, ava, dep, settings-grid/set-nav/lv-row/swatch, ag-grid/block/narr/mini/week-switch/alert, cornice `.phone` (scopata).

## 6. Motore di flusso (scheduler) — stato attuale
`flow/scheduler.ts`:
- **`schedule()`** (classica): timeline unica per commessa (usata da `/engagements/:id/schedule` e dal Gantt). **Intatta** (rete di test).
- **`scheduleResources()`** (FASE 2, NUOVA): piano **PER-RISORSA**. Calendario effettivo = `resource.working_hours ?? tenant.working_hours` **meno** `resource_availability`(unavailable). Fisse=occupazioni; dinamiche nei buchi **comuni a TUTTE le risorse assegnate** (intersezione → persona+mezzo insieme), ordine priorità poi `created_at`, rispetta `earliest_start`/`due_by`; marca `at_risk`/`unplaceable`. È un **forward-pass greedy multi-risorsa** (il meglio senza solver).
- **Layer AI** (`ai/narrator.narrateWeek`): racconta la settimana e, sui conflitti, **propone** la riprogrammazione (deterministico senza chiave, LLM con chiave) — principio "proponi, non forzare".
- **Test** (`test/scheduler.test.ts`): **14/14** (7 classica + 7 per-risorsa: fallback azienda, override risorsa, sottrazione ferie, multi-risorsa intersezione, parallelo, due_by at_risk, no doppia prenotazione).
- **Limiti dichiarati**: orari interpretati UTC-naive (timezone tenant non applicato puntualmente — la UI Pianificazione mostra le ore in UTC per coerenza); **le dipendenze NON entrano ancora nello scheduler** (solo tag "dopo X" in UI); il **solver ottimizzante** (Timefold/OR-Tools) è il tier successivo (BACKLOG).

## 7. AI (in/out)
- **Ingresso** (`ai/`): cattura NL → contesto (sotto RLS) → estrazione (tool use forzato) → validazione deterministica (RBAC+RLS) → conferma → commit. Voce: MediaRecorder + MinIO + pg-boss worker.
- **Uscita** (`ai/narrator.ts`): `narrateEngagement` (commessa), `narrateToday` (giornata), `narrateWeek` (settimana + proposte). Modello `EXTRACTION_MODEL` (default claude-opus-4-8).
- **Quota**: mostrata in billing; **enforcement NON ancora implementato**.

## 8. Demo Data Pack + SUPER Admin
- `db/demo-packs/fiber.json` (FTTH/FTTB: 4 utenti con login `Demo123!`, 3 clienti, 2 asset con campi fibra, 6 risorse, 6 materiali, 2 commesse build+maintenance, catena FS, 1 fissa, dipendenze, ore, consumi, catture). README incluso.
- Loader/unloader/list in `src/demo/` (core in `runner.ts`). Un tenant per pack; mai tocca i dati di sistema; wipe rimuove anche le identità GoTrue (best-effort).
- **SUPER Admin** (`/admin/platform`, solo is_platform_admin): carica/azzera+ricarica/cancella pack + lista tenant.
- **Da generare**: `pools.json`, `software.json` (contenuto in brief parte 2 §5/§7).

## 9. Stato vs BRIEF (cosa è FATTO / cosa MANCA)
**FATTO**
- FASE 0 (test scheduler, fix docs, GitHub) · Chiave AI sicura.
- FASE 1: AI racconta (commessa+giornata) · assegnazione risorse UI · vista tecnico mobile su PC · demo-pack+fiber · campi fibra · chiave AI.
- Extra: SUPER Admin in-app · Impostazioni rifatte (sotto-nav + 4 sezioni fedeli ai mock).
- Fedeltà schermate: Dashboard (05), Lista commesse (06), Dettaglio commessa+4 tab (07/24), Impostazioni (15/16/17/18), vista tecnico Oggi (01).
- **FASE 2 (parziale, grosso pezzo fatto)**: scheduler **per-risorsa** + `resource_availability` + griglia **Pianificazione** (03) + orari **azienda** editabili/persistenti + 14 test.

**MANCA / PROSSIMI PASSI**
1. **FASE 2 residuo**: **override orari PER-RISORSA in UI** — serve una **pagina dettaglio risorsa** (oggi le risorse sono solo lista CrudList; mock 20 ha la striscia `.avail`). Il motore già usa `resource.working_hours` se valorizzato (impostabile via API/loader).
2. **FASE 3 — dipendenze (parte semplice)**: `POST /dependencies` + `DELETE` con **anti-ciclo** (`WITH RECURSIVE`), **stessa commessa**, picker "Bloccata da" nel dettaglio attività. **Prima** il fix sicurezza: nel POST verificare la **visibilità di entrambe le attività** via `withRls` (la RLS di `activity_dependency` controlla solo `tenant_id`).
3. **Integrazione dipendenze nello scheduler + soluzione proposta** (BACKLOG): ordinamento topologico FS, `earliest(succ)=max(earliest_start, fine(pred)+lag)`; conflitto → riprogrammazione proposta. Alto rischio sul motore (c'è la rete di test).
4. **Gestione campi personalizzati senza codice**: `POST/PATCH/DELETE /field-definitions` (settings:manage) + RLS scrittura solo tenant + pagina admin "Campi personalizzati".
5. **Template commessa** (instanziazione blueprint → fasi/attività/dipendenze).
6. **Pack software/piscine** (generare + testare).
7. **Solver** (Timefold/OR-Tools) per la qualità della riprogrammazione.
8. **Persistenza switch** Generale (tema/notifiche/portale oggi solo locali) e **enforcement quota AI**.
9. **Timezone** puntuale nello scheduler (oggi UTC-naive); **portale cliente**; **notifiche** (scadenze/conflitti); **i18n** en/es-AR; **audit log**.
10. **Mobile tecnico**: completare Agenda/Cerca (oggi placeholder); migrare l'edit attività al kit Drawer (oggi modale Ionic).

## 10. Metodo di lavoro confermato (per la nuova sessione)
- **Fedeltà visiva = il mockup HTML è specifica letterale**: confronta il componente col `<body>` di `docs/mockup/NN_*.html` (stessa struttura/classi); colori solo da token e `pill--<color_token>`; allinea `design-system.css` a `base.css` classe-per-classe. Il titolare fa solo il colpo d'occhio finale.
- **Prima di toccare `flow/scheduler.ts`**: la rete di test deve restare verde (estendila prima/insieme).
- **Conferma** prima di interventi delicati (scheduler) e su scelte di **prodotto**.
- **GitHub**: commit+push a fine di ogni unità e di ogni sessione.

## 11. Cronologia commit (questa sessione, su `main`)
```
ea9d4b1 FASE 2: orari azienda editabili/persistenti
9a7fc10 FASE 2: scheduler per-risorsa + Pianificazione griglia + AI
ef1ff1a fix crash cattura raw_text NULL
dcc8591 Fedeltà schermate (dettaglio commessa 4 tab, lista pill, dashboard)
7aa7f47 docs stato + schema allineato
3bb21b3 Impostazioni: sotto-nav + sezioni (mock 15-18)
fbfdc1e SUPER ADMIN in-app (demo pack)
a64ed3c fix cornice telefono (tab visibili)
3f3dca6 vista tecnico mobile su PC + racconto giornata AI
2058991 UI assegnazione risorse (+ blocco doppia prenotazione)
6f256db AI che racconta (commessa)
a387d08 Demo Data Pack + fiber.json
56cabc4 migration 006 campi fibra + chiave AI doc
08917fe FASE 0: fix docs + test scheduler
5d9231c admin entities + contatti + albero + billing + lucide + docs
```

## 12. File di riferimento per ripartire
- Brief/decisioni: `docs/decisioni/2026-06-13_BRIEF_MASTER_per_claude_code.md` (+ parti 1-4).
- Schema DB: `docs/analisi/2026-06-13_schema_db_completo.md`.
- Analisi dipendenze: `docs/analisi/2026-06-13_dipendenze_e_roadmap.md`.
- Scheduler: `packages/backend/src/flow/scheduler.ts` + `routes/schedule.ts` + `test/scheduler.test.ts`.
- AI uscita: `packages/backend/src/ai/narrator.ts`.
- Demo: `packages/backend/src/demo/*` + `db/demo-packs/`.
- Memoria di progetto (ripartenza rapida): `~/.claude/projects/.../memory/project_handoff.md`.
