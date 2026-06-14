# siSuite — STATO DI SVILUPPO COMPLETO (documento di analisi per Claude AI)

> **Data:** 14/06/2026 (sera). **Questo è IL documento di stato corrente e autorevole.**
> Sostituisce `2026-06-14_stato_sviluppo_per_claude_ai.md` (che fotografava lo stato del *mattino*, prima delle sessioni di sviluppo descritte qui). Generato da ricognizione diretta di codice, DB e git.
>
> **Repo:** GitHub `sivaf-ai/siSuite`, branch `main`, HEAD **`ee7fa8b`** (tutto pushato, working tree pulito).
> **Schema DB:** `docs/analisi/2026-06-13_schema_db_completo.md` (aggiornato il 14/06 con `term_override` e le note migrazioni 007–010).
> **Scopo di questo doc:** fornire a Claude AI un quadro **dettagliato** per **valutare/confrontare** il lavoro svolto. Include una sezione **§11 Findings dell'analisi** (problemi trovati e corretti, scelte, rischi, debito tecnico).

---

## 0. Visione (invariata)
SaaS **multi-tenant, multi-verticale, AI-first** per la gestione di attività/commesse di PMI tecniche (fibra, software, piscine, fotovoltaico…). Spina relazionale rigida + strato `jsonb` flessibile (`field_definition`/`domain_pack`) + strato semantico (pgvector). Due archetipi commessa: **build** / **maintenance**. Due shell: **app tecnico mobile** (voce-centrica) e **pannello desktop** (pianificatore/admin). Principio: **l'AI propone, l'umano dispone**. Tesi di prodotto: **config over code** — ogni azienda personalizza *senza codice* etichette, **terminologia di dominio**, **colori**, **campi**, **modelli** di commessa.

## 1. Stack e avvio
PostgreSQL 16 + pgvector · Node 20 + **Fastify** + TS via **tsx** · Auth **GoTrue** · **Ionic + React + Vite** + **lucide** + **i18next** + **recharts** · MinIO · pg-boss · monorepo **pnpm** · tutto **Docker**.
- `docker compose up -d`. Porte: FE **5173**, BE **3010**, GoTrue **9999**, db **5433**, MinIO **9100/9101**, adminer 8082.
- Login owner di sistema: `owner@sisuite.local / Owner123!`. Demo: `owner@fibra.demo` / `owner@software.demo` / `owner@pools.demo` (`Demo123!`).
- **Vista tecnico**: `http://localhost:5173/m` (cornice telefono su PC).

### Gotcha operativi (CRITICI)
- **tsx watch su Windows** non ricarica in modo affidabile: dopo edit a `packages/backend/src` → **`docker compose restart backend`** (lo startup richiede ~5s prima che risponda).
- **Nuova dipendenza npm** → **`docker compose build <svc>`** poi `up -d` (fatto per i18next/react-i18next e recharts). `pnpm-lock.yaml` NON rigenerato sull'host: il Dockerfile usa `--no-frozen-lockfile`.
- **Bind-mount selettivi**: `package.json`/config NON montati → cambi alle dipendenze richiedono rebuild immagine.
- **AI**: serve `ANTHROPIC_API_KEY` in `.env`; senza, le funzioni AI degradano a output **deterministico** (il demo non si rompe).
- **Migrazioni**: `docker compose run --rm migrate` (idempotente, tracker `public.sisuite_migrations`; il bootstrap dopo le migrazioni fa il GRANT su `sisuite_app`).
- **DELETE senza body**: lato client `apiFetch` NON imposta `content-type` se non c'è body (altrimenti Fastify → 400 "Body cannot be empty"). Tenerne conto negli smoke test fatti a mano.
- **Test**: `docker compose run --rm --no-deps backend sh -c "cd /app/packages/backend && npx vitest run"`.
- **CLI demo**: `docker compose run --rm --no-deps backend pnpm --filter @sisuite/backend demo:load|wipe|list <pack>`.

## 2. Schema DB (sintesi; dettaglio in `2026-06-13_schema_db_completo.md`)
- **29 tabelle** di dominio (+ tracker migrazioni). Unica modifica strutturale del 14/06: **+`term_override`** (glossario per-tenant, migr. 007).
- La tabella **`template`** (preesistente, prima inutilizzata) è ora **usata** per i **modelli di commessa** (`scope='engagement'`, blueprint jsonb).
- **Migrazioni applicate: 001…010.** 007 = nuova tabella; 008 = seed campi economici; 009 = annullata da 010; 010 = correzioni (vedi §11).
- RLS `FORCE` su tutte le tabelle; backend connesso come ruolo `sisuite_app` (NOBYPASSRLS).

## 3. Sicurezza (3 dimensioni + piattaforma)
- **AuthN**: GoTrue (JWT) → `auth_user_id` → `app_user` → contesto via `app_resolve_context` (SECURITY DEFINER).
- **RBAC**: catalogo permessi nel codice (`shared/permissions.ts`), `requirePermission(key)` sugli endpoint.
- **RLS**: `withRls()` fa `SET LOCAL` di tenant/user/data_scope/company/is_platform_admin a inizio tx. `data_scope` own|team|tenant|customer.
- **Piattaforma**: flag `is_platform_admin` + guardia `requirePlatformAdmin`; abilitazione via env `PLATFORM_ADMIN_EMAIL`.
- **Fix sicurezza recente** (FASE 3): nel `POST /dependencies` la visibilità di **entrambe** le attività è verificata via `withRls` (la RLS di `activity_dependency` controlla solo `tenant_id`). Vedi §6.

## 4. API backend (route principali; ~26 file route)
Le novità delle sessioni 14/06 sono marcate **[NEW]**.
- **Lavoro/pianificazione**: `GET /engagements/:id/phases` · `/activities` (+`/today`,`/:id`,`/checklist`,`/resources` con anti-doppia-prenotazione 409) · `GET /engagements/:id/dependencies` · **[NEW] `POST /dependencies`** + **`DELETE /dependencies/:id`** (anti-ciclo `WITH RECURSIVE`, stessa commessa, fix visibilità) · `GET /engagements/:id/schedule` (timeline) · **`GET /schedule/week?from=`** (piano per-risorsa + **integrazione dipendenze** + scoping settimanale + narrazione AI).
- **[NEW] Modelli**: `POST /engagements/:id/save-as-template` · `GET /engagement-templates` · `DELETE /engagement-templates/:id` · `POST /engagements/from-template` (instanzia fasi/attività/dipendenze). *(persistiti in tabella `template`.)*
- **Risorse**: CRUD `/resources` · **[NEW] `GET /resources/:id`** (con working_hours+utente) · **`PATCH /resources/:id/working-hours`** · **`GET/POST/DELETE /resources/:id/availability`** (orari per-risorsa + indisponibilità, alimentano il motore).
- **AI uscita**: `GET /engagements/:id/narrative` · `GET /me/today-narrative` · `narrateWeek` (settimana + proposte).
- **AI ingresso**: `POST /captures` (testo, sincrono) · `POST /captures/voice` (async, pg-boss) · `/captures/:id/apply|reject`. **[NEW] enforcement quota** `ai_quota_month` (oltre soglia: cattura salvata, AI non gira).
- **[NEW] Notifiche**: `GET /notifications` (feed derivato: scadenze a rischio + catture da rivedere, sotto RLS).
- **Dashboard**: `GET /dashboard` — KPI + liste + **[NEW]** `orePerGiorno`, `commessePerStato`, `avanzamentoCommesse`, `marginalitaCommesse`.
- **Amministrazione/Config**: `users`, `roles`, `lookups` CRUD, `number-series` CRUD, `billing` (GET) · **field-definitions**: GET + **[NEW] `POST/PATCH/DELETE`** (campi personalizzati per-tenant, `settings:manage`) · `GET /settings` + `PATCH /settings/working-hours` · **[NEW] `GET/PUT /settings/terminology`**.
- **Piattaforma**: `GET /platform/demo`, `POST /platform/demo/:pack/{load,wipe}`.

## 5. Frontend
- **Routing** (`App.tsx`): `/m` = `MobileShell`; resto = `AppShell`. **`ThemeProvider`** (tema), i18n init in `main.tsx`.
- **Shell desktop** (`AppShell`): **[NEW] sidebar richiudibile** (248↔64, toggle, solo-icone+tooltip, persist `sisuite.sidebar`, collassata <1024); **[NEW] campanella notifiche** + **scorciatoia tema** (sole/luna); `max-width` ai contenuti. Voci di menu usano i **termini di dominio** override-abili.
- **[NEW] Tema scuro**: `data-theme` sul root, token `:root[data-theme=dark]` (WCAG), persist `sisuite.theme`, default da `prefers-color-scheme`, token dedicato `--sidebar`.
- **[NEW] i18n** (i18next): it-IT/en/es-AR in `src/i18n/`; risoluzione localStorage→`app_user.locale`→it-IT; namespace `terms` con override tenant (`refreshTerminology`); date via `Intl`.
- **Pagine**:
  - Dashboard (mock 05) **[NEW] configurabile**: catalogo widget (KPI, ore/giorno **chart**, commesse/stato **donut**, avanzamento, **marginalità**, attività oggi, catture) con mostra/nascondi + ordine per-utente (localStorage); grafici **recharts**.
  - Pianificazione (mock 03): griglia risorse×giorni + rail AI; ora con **dipendenze nel motore** e **scoping settimanale** coerente.
  - Engagements (lista) + **CommessaDetail** (4 tab + Racconto AI + **[NEW] "Salva come modello"**).
  - AttivitaDetail (checklist/risorse/ore/materiali + **[NEW] picker "Bloccata da"**).
  - Clienti+ClienteDetail · **[NEW] RisorsaDetail (mock 20)**: tab Disponibilità (editor orari a **intervalli** con selettori 15' + indisponibilità) / Assegnazioni / Ore · Asset/Materiali (CrudList) · Capture · Today.
  - **admin/** (Impostazioni, sotto-nav): Generale (tema+lingua+orari) · Stati&etichette (**[NEW] swatch picker palette**) · **[NEW] Terminologia** · **[NEW] Campi personalizzati** · **[NEW] Modelli commessa** · Numerazioni · Piano/Billing · SuperAdmin.
- **[NEW] Mobile** (`/m`): Agenda (settimana del tecnico) + Cerca (commesse/clienti) reali (non più placeholder).
- **Kit** (`ui/`): + **[NEW]** `WorkingHoursEditor`, `ColorSwatchPicker`, `NotificationsBell`. **0 ionicons/emoji**.

## 6. Motore di flusso (scheduler) — stato
`flow/scheduler.ts` (**INTATTO**, 14 test verdi): `schedule()` (timeline commessa) + `scheduleResources()` (per-risorsa, FASE 2). **Non modificato** in queste sessioni (gate "conferma prima di toccare lo scheduler" rispettato).
- **[NEW] `flow/weekView.ts`** (`scopeWeek`): ritaglia il piano alla settimana richiesta → mini/griglia/rail dallo **stesso** insieme (fix bug "griglia vuota/mini divergente"). Espone `suggestedFrom` (prima settimana piena). **+5 test**.
- **[NEW] `flow/dependencyPlan.ts`** (`scheduleWithDependencies`): integra le **dipendenze FS** SENZA toccare lo scheduler — propaga iterativamente `earliest(succ)=max(earliest_start, fine(pred)+lag)` richiamando `scheduleResources` fino a stabilizzazione (DAG → converge). Un successore oltre scadenza diventa `at_risk`/conflitto. **+5 test**.
- **Limiti dichiarati**: orari **UTC-naive** (timezone tenant non applicato puntualmente — BACKLOG, gated); **solver ottimizzante** (Timefold/OR-Tools) è il tier successivo (non avviato).
- **Test totali: 27/27 verdi** (`scheduler` 14, `weekView` 5, `dependencyPlan` 5, `rls` 3).

## 7. AI (in/out)
- **Ingresso** (`ai/`): cattura NL → contesto (RLS) → estrazione (tool use forzato) → validazione deterministica (RBAC+RLS) → conferma → commit. Voce: MediaRecorder + MinIO + pg-boss worker.
- **Uscita** (`ai/narrator.ts`): `narrateEngagement`/`narrateToday`/`narrateWeek`. Modello `EXTRACTION_MODEL` (default claude-opus-4-8).
- **[NEW] Quota**: enforcement su `ai_quota_month` (entitlement piano): uso = catture/mese; oltre soglia la cattura si salva ma l'AI non gira (nessuna perdita dati, nessuna spesa oltre quota).

## 8. Personalizzazione "config over code" (il cuore vendibile) — COMPLETA
Ogni azienda personalizza **senza codice**, con default di sistema + override tenant e RLS:
- **Stati & etichette** (`lookup_value`): nome/colore/sigla/ordine; logica sui canonici.
- **[NEW] Terminologia** (`term_override`): ~20 termini di dominio (singolare+plurale, per lingua) — es. "Commessa"→"Cantiere" cambia menu/titoli.
- **[NEW] Colori** (palette curata 16, chiaro/scuro): `lookup_value.color_token` = chiave palette; swatch picker.
- **[NEW] Campi personalizzati** (`field_definition` CRUD tenant): nuovi campi su entità → compaiono **subito** nei form (EntityForm).
- **[NEW] Modelli di commessa** (`template`): "salva da commessa" + "istanzia".

## 9. Demo Data Pack + SUPER Admin
- **3 pack**: `fiber.json` (FTTH/FTTB), **[NEW] `software.json`** (e-commerce + manutenzione gestionale), **[NEW] `pools.json`** (piscina + manutenzione hotel). Tutti con fasi/attività/**dipendenze FS**/budget/costi (per marginalità).
- **[NEW] Date relative**: `reference_date` nel pack + `rebaseDates()` nel loader → ogni `demo:load` produce un calendario **attuale** (Pianificazione sempre piena).
- **SUPER Admin** (`/admin/platform`): load/wipe/reset pack + lista tenant.

## 10. Stato vs MVP/BRIEF
**FATTO** (oltre alla base Fasi 0→2): FASE 3 **dipendenze** (CRUD + fix sicurezza + **integrazione nel motore**); Dettaglio Risorsa (mock 20) con editor orari; input data/ora assistiti; **personalizzazione completa** (terminologia/colori/campi/modelli); **Dashboard** grafici + configurabile + **marginalità**; **notifiche**; **quota AI**; **mobile** Agenda/Cerca; **i18n** + **tema scuro** + **sidebar** richiudibile; **3 demo pack**.

**MANCA / PROSSIMI PASSI** (priorità suggerita):
1. **Solver ottimizzante** (Timefold/OR-Tools) — il greedy + propagazione dipendenze c'è; il solver è il tier qualità. *(grande, libreria esterna)*
2. **Timezone puntuale** nello scheduler — **gated** (conferma prima di toccare `scheduler.ts`).
3. **Audit log** (interceptor centrale sulle mutazioni). **Portale cliente** (RLS `customer` predisposta, UI assente).
4. **Persistenza cross-device** delle preferenze UI su `app_user.attributes` (oggi localStorage) — tocca `app_resolve_context`/RLS, da fare con cura.
5. Rifiniture: esternalizzazione i18n completa (oltre alle schermate del demo); notifiche con stato "letto"; terminologia genere/articolo; mobile edit attività al kit Drawer.

## 11. Findings dell'analisi (problemi trovati e corretti, debito, rischi)
Verifica esplicita delle modifiche DB introdotte nelle sessioni 14/06. **Due problemi trovati e corretti** (migr. 010, commit `ee7fa8b`):
1. **Doppioni `field_definition`** — la migr. 008 aveva re-inserito `engagement.budget` e `resource.hourly_cost`, **già** di sistema dalla 004. Con `vertical NULL` l'UNIQUE parziale `field_definition_system_uniq (vertical, entity, key) WHERE tenant_id IS NULL` **non li intercetta** (in SQL i NULL sono distinti) → i campi comparivano **doppi** nei form. **Corretto** (010 rimuove i doppioni; `material.unit_cost` era davvero nuovo e resta).
2. **Tabella `engagement_template` ridondante** — la migr. 009 l'aveva creata, ma esisteva già **`template`** (`scope`, `blueprint`) pensata per lo scopo. **Riconciliato**: i modelli usano `template` (`scope='engagement'`, `type` nel blueprint); 010 fa `DROP engagement_template` (era vuota, rischio nullo). `routes/templates.ts` riscritto di conseguenza.

**Lezione/insight per la valutazione**: prima di aggiungere tabelle/campi conviene interrogare lo schema esistente (`template`, e i seed `field_definition` in 004) — c'erano già strutture per template e per budget/hourly_cost.

**Scelte deliberate (non fatte, motivate)**: solver (troppo grande/libreria esterna); timezone scheduler (gate esplicito); persistenza cross-device (tocca il path auth, non testabile in sessione non presidiata); audit log (architetturale).

**Rischi/limiti noti**: scheduler UTC-naive; quota AI misurata come n. catture/mese (proxy, non token reali); notifiche e mobile-search di sola lettura (no navigazione dal frame telefono); i18n esternalizzato solo per le schermate del demo.

## 12. Cronologia commit (sessioni 14/06, su `main`)
```
ee7fa8b fix(db): dedup field_definition + riconcilia modelli sulla tabella template
e4ec662 feat(mobile): Agenda e Cerca reali (vista tecnico)
d678d73 feat(billing): enforcement quota AI mensile (ai_quota_month)
0b0b68a feat: notifiche (scadenze/catture) + demo pack software e pools
9e917b3 fix(commessa): budget/attributi editabili e persistenti nel form
b639a32 feat(templates): modelli di commessa (salva + istanzia blueprint)
cf28903 feat(config): campi personalizzati per-tenant (field_definition CRUD)
ec4cdd0 feat(dashboard): widget marginalità + costo orario/unitario editabili
8c9140a feat(scheduler): integrazione dipendenze FS (layer non invasivo)
12d1c92 feat(parte8 §4): Dashboard grafici (recharts) + configurabile + campi costo
5eabc7d feat(parte8 §1): terminologia di dominio per-tenant (glossario)
589cac9 feat(parte8 §2): palette colori curata (16, chiaro/scuro) + swatch picker
6537250 feat(FASE3): dipendenze attività (parte semplice) + fix sicurezza visibilità
d040874 feat(parte8 §0+§3): lingua default it-IT, liste Dashboard ellissi, input orari
593d774 feat(FASE2): Dettaglio Risorsa (mock 20) + orari per-risorsa + indisponibilità
0767fad feat(parte6): multilingua i18next (it-IT/en/es-AR) + selettore lingua
d2a5e9c feat(parte6): sidebar richiudibile/responsive + tema scuro persistente
d791678 fix(pianificazione): griglia vuota + mini divergente; date demo relative a oggi
```
*(18 commit; ~65 file, +3215/−178 righe rispetto al punto di partenza `edbf488`.)*

## 13. File di riferimento per ripartire
- Schema DB: `docs/analisi/2026-06-13_schema_db_completo.md` (agg. 14/06).
- Decisioni/brief: `docs/decisioni/` (BRIEF MASTER + parti 1-8).
- Scheduler: `packages/backend/src/flow/{scheduler,weekView,dependencyPlan}.ts` + `routes/schedule.ts` + `test/*.test.ts`.
- Config/personalizzazione: `routes/{fieldDefinitions,settings,templates,lookups}.ts`; FE `pages/admin/*`.
- Demo: `db/demo-packs/{fiber,software,pools}.json` + `src/demo/*`.
- Memoria di progetto (ripartenza rapida): `~/.claude/projects/.../memory/project_handoff.md`.

## 14. Metodo di lavoro (confermato)
- **Fedeltà visiva = il mockup HTML è specifica letterale** (`docs/mockup/NN_*.html` + `base.css`); colori solo da token/palette.
- **Prima di toccare `flow/scheduler.ts`**: rete di test verde + **conferma del titolare** (gate).
- **Verifica**: typecheck FE+BE + `vitest` + smoke test via API ad ogni unità; **GitHub** commit+push a fine di ogni unità/sessione.
