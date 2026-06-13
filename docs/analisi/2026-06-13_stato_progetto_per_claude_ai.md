# siSuite — Stato del progetto (briefing completo per Claude AI)

> Documento di **stato preciso** al **13/06/2026**. Scopo: dare a un altro modello
> (Claude AI) tutto il contesto per ragionare e decidere sui prossimi passi, senza
> dover leggere il codice. Generato da ricognizione diretta del repo (endpoint,
> tabelle, file), non da memoria. Le righe marcate ✅ sono verificate in questa
> sessione (typecheck verde + smoke test API).

---

## 1. Cos'è siSuite (visione)

Piattaforma SaaS **multi-tenant, multi-verticale, AI-first** per la **gestione di attività/commesse** di PMI tecniche (es. piscine, fotovoltaico, software house). Principio architetturale: **spina relazionale rigida** (entità universali) + **strato flessibile in jsonb** (specifici di verticale, via `field_definition` e `domain_pack`) + **strato semantico** (pgvector per recupero contestuale).

Due archetipi di commessa (`engagement`): **build** (realizzazione, produce un asset) e **maintenance** (manutenzione su asset esistente). Due "shell" d'uso: **app tecnico mobile** (voce-centrica) e **pannello pianificatore/admin desktop**.

L'**AI-first** significa: l'input grezzo in linguaggio naturale (`capture`) si salva **prima** di qualunque interpretazione; un LLM **propone** operazioni tipizzate; un livello **deterministico** valida (RBAC+RLS) e applica. **L'AI non scrive mai diretta nel DB.**

Fonti di verità nel repo: `BRIEF_Claude_Code_OLD.md`, **`docs/FRONTEND_SPEC.md`** (vincolante UI, precede il brief), `docs/MVP_progetto.md`, `docs/BACKLOG_futuro.md`, `docs/mockup/01..26_*.html` + `base.css` (target visivo).

---

## 2. Stack tecnico

| Strato | Tecnologia |
|---|---|
| DB | PostgreSQL 16 + **pgvector** + btree_gist + pgcrypto |
| Backend | Node 20 + **Fastify** + TypeScript, gira via **tsx** (anche in prod, no build step) |
| Auth (solo authN) | **GoTrue** (Supabase Auth), self-hostable; sostituibile |
| Frontend | **Ionic + React + Vite** + **lucide-react** (icone) |
| Media | **MinIO** (S3-compatibile) per audio/foto delle catture |
| Coda async | **pg-boss** (su Postgres) — worker estrazione voce |
| AI | SDK **@anthropic-ai/sdk**, tool use forzato; modello `EXTRACTION_MODEL` (default `claude-opus-4-8`) |
| Monorepo | **pnpm** workspace: `packages/shared`, `packages/backend`, `packages/frontend` |
| Orchestrazione | **tutto in Docker** (docker compose) |

`@sisuite/shared` è risolto **direttamente da sorgente** (`main: ./src/index.ts`), quindi né backend (tsx) né frontend (vite) richiedono un build dello shared.

---

## 3. Come si avvia, porte, credenziali

```bash
cd c:\Users\Ricardo\Sivaf\siSuite
docker compose up -d   # db, auth, migrate (one-shot), backend, frontend, minio
```

**Porte host**: frontend **5173**, backend **3010**, GoTrue **9999**, db **5433**→5432, MinIO **9100/9101**, adminer **8082** (profilo `tools`).
**Login Owner**: `owner@sisuite.local` / `Owner123!`.
**Servizi compose**: `db, auth, migrate, backend, frontend, adminer, minio`.
**DB admin**: utente `sisuite_admin` / db `sisuite` (per psql diretto). Il backend si connette come ruolo **`sisuite_app`** (NOSUPERUSER, **NOBYPASSRLS**).

**Gotcha operativi (importanti)**:
- `tsx watch` **non ricarica in modo affidabile** sui bind-mount Windows → dopo aver editato `src` backend: `docker compose restart backend`.
- Nuova dipendenza npm → `docker compose build <svc>` **poi** `up -d <svc>` (il solo `restart` usa l'immagine vecchia).
- Frontend in Vite dev (HMR) → di norma le modifiche FE si vedono subito.
- **AI**: l'estrazione si attiva SOLO con `ANTHROPIC_API_KEY` in `.env`. Senza chiave: la cattura si salva ma non viene estratta (resta il percorso form). La chiave la mette l'utente, non l'AI.

---

## 4. Modello dati (28 tabelle, 5 migrazioni)

Migrazioni applicate via servizio `migrate` (idempotente, tracciate in `public.sisuite_migrations`):
`001_schema_core.sql` · `002_rls_policies.sql` · `003_app_functions.sql` · `004_field_definition.sql` · `005_field_definition_rls.sql`.

**Tabelle** (`db/migrations/`):

- **Piattaforma/tenancy**: `tenant`, `plan`, `subscription`.
- **Identità & RBAC**: `app_user`, `role`, `role_permission`, `user_role`.
- **Configurazione**: `canonical_state` (stati che il sistema riconosce), `lookup_value` (etichette configurabili mappate su un canonico), `number_series` (numeratori gapless), `template` (blueprint jsonb), `field_definition` (campi dinamici per (entità, verticale)).
- **Anagrafiche**: `company` (anagrafica unica con ruoli multipli), `company_role`, `company_contact`, `asset`, `resource` (persone/mezzi/attrezzature), `resource_availability`, `material`.
- **Lavoro**: `engagement` (commessa), `phase` (fase/ramo, annidabile via `parent_phase_id`), `activity` (unità schedulabile — l'unica che porta ore/risorse/materiali), `activity_dependency` (grafo DAG), `activity_resource` (assegnazioni, con vincolo **anti-doppia-prenotazione** gist).
- **AI & rendicontazione**: `capture` (input grezzo NL, con `embedding vector(1536)`), `time_entry`, `material_consumption`.

**Convenzioni chiave**:
- Stato di un'attività/fase/commessa = FK a `lookup_value` (categoria `activity_status`/`phase_status`/`engagement_status`/`priority`); ogni lookup mappa su un `canonical_state` (il sistema ragiona sul canonico, l'utente vede l'etichetta).
- **FISSA vs DINAMICA**: `activity.scheduled_start` valorizzato = fissa (ancora); NULL = dinamica (la colloca il motore di flusso, ha solo `estimated_minutes` + vincoli `earliest_start`/`due_by`).
- **Soft-delete**: `company/asset/engagement/resource/material/template` hanno `archived_at`; le cascate pericolose sono RESTRICT (storia fatturabile protetta).
- **Audit**: `created_by/updated_by/updated_at` su tabelle operative (trigger `set_updated_at`).
- **Offline-ready**: ID generati dal client per `capture/time_entry/material_consumption/activity`, idempotenza ON CONFLICT.

---

## 5. Modello di sicurezza (3 dimensioni separate)

1. **AuthN (chi sei)** — GoTrue emette JWT; il backend verifica (HS256 dev / JWKS prod), ricava `auth_user_id` → risolve `app_user` → contesto. Nessuna credenziale in `app_user` (solo `auth_user_id`).
2. **RBAC (cosa puoi fare)** — catalogo permessi **nel codice** (`packages/shared/src/permissions.ts`), versionato. Un permesso è `risorsa:azione`. Nel DB stanno solo ruoli e assegnazioni. Guardia `requirePermission(key)` su ogni endpoint mutante.
3. **RLS (cosa puoi vedere)** — Postgres Row-Level Security, `FORCE` su tutte le tabelle; il backend è `sisuite_app` NOBYPASSRLS. A inizio transazione `withRls()` fa `SET LOCAL` di `app.current_tenant/current_user/data_scope/current_company/is_platform_admin`.
4. (**Entitlement** — gating del piano, **separato** dall'RBAC; oggi mostrato ma non *imposto*, vedi §10.)

**`data_scope`** (banda di visibilità del ruolo): `own | team | tenant | customer`. MVP: `team` trattato come `tenant`. Il tecnico `own` vede/tocca solo i propri dati operativi (activity create da lui o assegnate via `activity_resource`, capture/time_entry propri). Le anagrafiche/contesto restano tenant-wide in lettura. `customer` (portale esterno) predisposto in RLS ma il portale non è costruito.

**Ruoli di sistema** (seed, `tenant_id NULL`): **Owner** (tutti i permessi), **Planner**, **Tecnico** (`own`, no delete), **Contabile** (lettura+export), **Sola lettura**, **Cliente esterno** (`customer`, read-only). Un tenant admin può creare ruoli custom componendo i permessi.

**Catalogo permessi (risorse → azioni)**:
`engagement, phase, activity(+assign), dependency(read/manage), capture(+apply), time_entry, material_consumption, company, contact, asset, resource, material, template, report(read/export), user(read/manage), role(read/manage), settings(read/manage), billing(read/manage)`.
Permessi di **piattaforma** (fuori RBAC tenant, per `is_platform_admin`): `tenant:*, plan:manage, platform:access`.

---

## 6. API backend (endpoint reali, raggruppati)

Tutti dietro `app.authenticate` tranne `/health`. Forma errori standard `{error,message,statusCode}`; `ZodError → 400`. Liste "avanzate" = `?q=&sortBy=&sortDir=&limit=&offset=` con `{items,total,limit,offset}`.

**Sistema/identità**: `GET /health` (pubblica) · `GET /me`.

**Anagrafiche** (pattern: list/detail=`:read`, create=`:create`, update=`:update`, delete=`:delete`):
- `companies` — GET list/`:id`, POST, PATCH, DELETE (soft) — `company:*`. + **contatti**: `POST/PATCH/DELETE /contacts` — `contact:*`. ✅ (contatti CRUD aggiunto)
- `assets` — GET list/`:id`, POST, PATCH, DELETE — `asset:*`.
- `resources` — GET list/`:id`, POST, PATCH, DELETE — `resource:*`.
- `materials` — GET list, POST, PATCH, DELETE — `material:*`.

**Lavoro / commessa**:
- `engagements` — GET list/`:id`, POST, PATCH, DELETE — `engagement:*`.
- `GET /engagements/:id/phases` (`phase:read`) · `phases` POST/PATCH/DELETE — `phase:*`.
- `activities` — GET list (filtri engagementId/phaseId), `GET /activities/today`, `GET /:id`, POST, PATCH, `PATCH /:id/checklist`, DELETE — `activity:*`. Assegnazione risorse: `POST/DELETE /activities/:id/resources` — `activity:assign`.
- `GET /engagements/:id/dependencies` — `dependency:read`. ✅ (solo lettura; **manca** create/delete)
- `GET /engagements/:id/schedule` — `activity:read` (agenda calcolata dal motore di flusso).

**Rendicontazione**: `time-entries` GET/POST/DELETE — `time_entry:*` · `consumptions` GET/POST/DELETE — `material_consumption:*`.

**AI / catture**: `GET /captures`, `GET /captures/:id`, `POST /captures` (testo), `POST /captures/voice` (multipart→MinIO, async), `POST /captures/:id/apply`, `POST /captures/:id/reject` — `capture:read/create/apply`.

**Amministrazione** (aggiunte in questa tornata) ✅:
- `users` GET/POST/PATCH/DELETE — `user:read` (GET) / `user:manage` (mutazioni). Create provisiona identità GoTrue; delete = disattiva.
- `roles` GET/POST/PATCH/DELETE — `role:read`/`role:manage`. Ruoli di sistema in sola lettura (RLS).
- `lookups` GET (+`/:category`) / POST/PATCH/DELETE — `settings:read`/`settings:manage`. Righe di sistema read-only.
- `number-series` GET/POST/PATCH/DELETE — `settings:read`/`settings:manage` (PK = key).
- `billing` GET — `billing:read` (subscription + entitlement effettivi + catalogo piani + quota AI del mese).

**Altro**: `GET /dashboard` (conteggi sintetici), `GET /field-definitions?entity=` (campi dinamici).

---

## 7. Pipeline AI (Fase 2+3) — come funziona

File: `packages/backend/src/ai/` (`client, context, extractionSchema, extractor, validator, applier, process`) + `packages/shared/src/captures.ts` (tipi/schemi).

**Flusso** (cattura immutabile → proposta → conferma → commit):
1. **Cattura** (`POST /captures`): salva il testo grezzo *prima* di interpretarlo (`capture.raw_text`, status `pending`).
2. **Contesto**: si raccoglie il contesto (attività/materiali della commessa) per ancorare l'estrazione.
3. **Estrazione** (`extractor`): chiamata all'LLM con **tool use forzato** (schema in `extractionSchema`); l'LLM propone **operazioni tipizzate** risolte sugli ID forniti.
4. **Validazione deterministica** (`validator`): per ogni operazione controlla RBAC + RLS + esistenza/coerenza; arricchisce con `valid/reason/confidence/autoApplicable`. **L'AI non scrive mai diretta.**
5. **Conferma** (`POST /captures/:id/apply` con indici selezionati) → **commit** (`applier`) scrive le righe reali (time_entry, material_consumption, set status, check checklist).

**Tipi di operazione** (insieme chiuso): `log_time`, `log_material`, `set_activity_status`, `check_checklist_item`, `clarify`.

**Voce** (Fase 3): `useVoiceCapture` (MediaRecorder + Web Speech API on-device) → `POST /captures/voice` (audio→MinIO) → job **pg-boss** `extract-capture` (cattura-prima/elabora-dopo) → il frontend fa **polling** finché la proposta è pronta.

**Stato**: attiva solo con `ANTHROPIC_API_KEY`. Soglia auto-apply `AI_AUTOAPPLY_THRESHOLD=0.85`.

---

## 8. Motore di flusso (scheduler) — stato e limiti dichiarati

File: `packages/backend/src/flow/scheduler.ts` + `routes/schedule.ts`.

È un **passaggio in avanti leggero** (non un solver): le **fisse** diventano occupazioni; le **dinamiche** si "versano" nei buchi dell'orario di lavoro (`tenant.working_hours`), da `now`, ordinate per **priorità poi data di creazione**. Rispetta `earliest_start`; se `due_by` non è raggiungibile lo **segnala** (`conflict: due_by_missed`/`unplaceable`) invece di violarlo.

**Limiti dichiarati nel codice (raffinamenti futuri)**:
- **NON risolve il grafo dipendenze** (oggi `activity_dependency` non ha alcun effetto sull'agenda).
- **NON sottrae `resource_availability`** (ferie/indisponibilità).
- **Non è resource-aware** (un'unica timeline, non per-risorsa).
- Orari interpretati come tempo locale "naive" (`tenant.timezone` non applicato puntualmente).
- Il solver ottimizzante (livellamento, critical path) è post-MVP.

> Implicazione: l'**agenda a griglia** (mock 03/21) e l'effetto reale delle **dipendenze** dipendono dall'evoluzione di questo file.

---

## 9. Frontend (stato del rifacimento FRONTEND_SPEC)

**Kit componenti** (`packages/frontend/src/ui/`, icone **lucide**): `Toast, SearchBar, EmptyState, Drawer, ConfirmDialog, DataTable, Field, EntityForm (da field_definition), Toolbar, CrudList (config-driven), DetailLayout` + `icons.ts`. Componenti base `components/`: `Page, StatusPill`. Design system in `theme/design-system.css` (allineato a `docs/mockup/base.css`).
`CrudList` supporta: ricerca/ordina/paginazione server-side, Drawer crea/modifica, conferma elimina, `permFor(action)` (per entità con permessi `:read`/`:manage`), `rowLocked(row)` (nasconde azioni su righe di sistema), `buildForm(fk,isEdit)`.

**Shell** (`shell/AppShell.tsx`): `IonSplitPane` con **sidebar desktop** (menu raggruppato lavoro/anagrafiche/amministrazione, derivato dai permessi via `visibleMenu`) + **tabbar mobile** + FAB cattura. Menu in `shared/src/menu.ts`.

**Pagine** e stato kit:
| Rotta | Pagina | Stato |
|---|---|---|
| `/today` | TodayPage | ✅ migrata lucide |
| `/dashboard` | DashboardPage | ✅ migrata lucide (4 KPI) |
| `/planning` | PianificazionePage | ✅ migrata lucide (lista agenda calcolata) |
| `/engagements` `/engagements/:id` | EngagementsPage, **CommessaDetailPage** | ✅ albero + viste Gantt/Lista + tag dipendenze |
| `/activities/:id` | AttivitaDetailPage | kit precedente (Ionic) |
| `/companies` `/companies/:id` | ClientiPage, **ClienteDetailPage** | ✅ CRUD + **contatti CRUD** |
| `/assets` `/resources` `/materials` | Asset/Risorse/Materiali | ✅ CrudList |
| `/captures` | CapturePage | ✅ icone lucide, no emoji (form voce resta Ion) |
| `/admin/users` `/roles` `/settings` `/number-series` `/billing` | admin/* | ✅ tutte funzionali |
| `/agenda` | PlaceholderPage | placeholder (mobile agenda non fatta) |

**Audit migrazione**: **zero** `ionicons`/`IonIcon`/emoji residui in `packages/frontend/src` (verificato).

**Albero commessa** (`CommessaDetailPage`): treeview ricorsivo fasi→sotto-fasi→attività, rollup per fase (fatte/totali · ore), espandi/collassa, azioni inline; **3 viste** (Albero / Gantt a barre proporzionali / Lista tabellare); tag «dopo X» sulle foglie (latente finché non si creano dipendenze). Modali fase/attività ancora **Ionic** (non kit Drawer).

---

## 10. ✅ FATTO (per fase / sessione)

- **Fase 0**: fondamenta, RLS completa, bootstrap idempotente (ruolo `sisuite_app`, tenant, Owner su GoTrue, seed ruoli/stati/etichette/piani), login, 3 test RLS verdi.
- **Fase 1**: CRUD entità core + rendicontazione (`time_entry`, `material_consumption`) + motore di flusso leggero (`/schedule`).
- **Fase 2**: pipeline AI estrazione NL da **testo** (tool use forzato → validazione deterministica → conferma → commit).
- **Fase 3**: **voce** (MediaRecorder + Web Speech + MinIO + pg-boss worker, cattura-prima/elabora-dopo, polling).
- **Rifacimento FE (FRONTEND_SPEC)**: `field_definition` (mig. 004/005) + liste avanzate + libreria componenti lucide + Clienti benchmark replicato a Risorse/Materiali/Asset/Commesse + shell.
- **Sessioni 12-13/06/2026** (tutte con typecheck FE+BE verde + smoke test API):
  - **Entità amministrative**: utenti (+GoTrue provisioning, +user_role), ruoli (+role_permission), etichette/lookup, numeratori — backend + pagine `CrudList`.
  - **Contatti**: CRUD nel dettaglio cliente.
  - **Albero commessa** (mock 24) + viste **Gantt/Lista** + **tag dipendenze** (endpoint lettura).
  - **Billing**: `GET /billing` + pagina (piani, quota AI, abbonamento).
  - **Migrazione lucide** delle 4 schermate ricche.
  - **Bug fix latente**: `apiFetch` impostava sempre `content-type: application/json` → Fastify rifiutava le DELETE senza body (400). Ora il content-type si imposta solo se c'è un body. **Riguardava tutte le delete dell'app.**
- **Git**: repo inizializzato, commit locale `ed5d99b`. Working tree con le modifiche di queste sessioni **non ancora committate** (da fare). Nessun remote/push.

---

## 11. ❌ MANCA (roadmap dettagliata, con esempi e stima S/M/L)

### Dipendenze tra attività *(vedi documento dedicato `2026-06-13_dipendenze_e_roadmap.md`)*
- **[M] CRUD + integrazione scheduler**: oggi c'è solo la lettura. Serve POST/DELETE, **guardia cicli**, e — per dare valore — far rispettare le dipendenze allo **scheduler** (oggi le ignora). Lo schema (FS/SS/FF/SF + lag) è già completo. *Es.: «posa dopo getto +2 giorni» deve spostare l'agenda.*

### Lavoro / pianificazione
- **[M] Agenda a griglia risorse×giorni** (mock 03/21) con drag&drop — oggi `/planning` è una lista. Dipende dallo scheduler resource-aware.
- **[M] Assegnazione risorse da UI** — `activity_resource` ha backend + vincolo anti-doppia-prenotazione; manca la UI «assegna tecnico/mezzo». *Es.: trascina Mario su «Scavo».*
- **[S] Edit attività nel kit Drawer** — oggi modale Ionic.
- **[S] Rendicontazione manuale nel dettaglio attività** — ore/materiali/checklist (backend pronto), UI da rifinire.

### Motore di flusso (raffinamenti dichiarati nel codice)
- **[M] Sottrazione `resource_availability`** (ferie/malattie/mezzo in officina).
- **[M] Scheduling resource-aware** (per-risorsa, prerequisito dell'agenda a griglia).
- **[S] Timezone puntuale** (`tenant.timezone`).
- **[L] Solver ottimizzante** (livellamento risorse, critical path).

### Entità / amministrazione
- **[M] Template commessa** — `template.blueprint` (jsonb) esiste; manca «applica template → crea fasi/attività/(dipendenze)/date relative». Si lega alle dipendenze. *Es.: «Nuova piscina standard» genera 12 attività concatenate.*
- **[S] Liste standalone** activity / time_entry / material_consumption (oggi vivono nei dettagli) — utile al Contabile.
- **[L] Billing self-service** — `/admin/billing` è informativo; l'upgrade reale richiede integrazione provider pagamenti (Stripe/Lemon Squeezy) + webhook.
- **[S] Plan/subscription editing** (admin) — oggi sola lettura.

### AI
- **[M] AI propone dipendenze** e **template** dallo storico (operazione `create_dependency` nel validatore).
- **[S] Gating quota AI** — la quota è *mostrata* (billing) ma **non imposta** (non blocca oltre soglia).
- **[S] Capture multimodale (foto)** — schema predisposto (`media_url/media_type`, channel `photo`), pipeline vision in backlog.

### Trasversali / piattaforma
- **[M] Notifiche** — scadenze `due_by`, conflitti agenda, scadenza `subscription` (30/7/1 giorni). Nessun canale oggi.
- **[L] Portale cliente esterno** — RLS `customer` predisposta; manca proiezione client-safe (nascondere costi) + pagine. Backlog #13.
- **[M] App mobile tecnico** (mock 21 agenda, 22 catture, 23 cerca) — oggi placeholder/parziali.
- **[S] i18n attivazione en/es-AR** — infrastruttura per-locale presente, UI solo it-IT.
- **[M] Audit log completo** — ci sono `created_by/updated_by/updated_at`; manca lo storico modifiche su dati fatturabili.
- **[S] Gestione dipendenze cross-commessa** — oggi non gestita (da vietare o gestire esplicitamente).

### Qualità / verifica
- **[S] Item 5 — verifica visiva pixel vs `docs/mockup/`** — fatta solo a livello strutturale (classi/layout); manca il confronto a occhio (gate DoD spec §7).
- **[M] Test automatici** — esistono 3 test RLS; copertura su CRUD/AI/scheduler da ampliare.

---

## 12. Decisioni aperte principali (per la discussione)

1. **Dipendenze**: modello *temporale* (lo scheduler le rispetta) vs *relazionale* (solo tag/avviso)? Quando il predecessore si sposta: avviso o auto-shift? *(dettaglio nel doc dedicato).*
2. **Priorità roadmap**: dipendenze → assegnazione risorse + availability → agenda a griglia → template → notifiche? (mia proposta)
3. **Scheduler**: evolvere il forward-pass leggero o introdurre un vero solver?
4. **Billing**: restare informativo o integrare un provider di pagamento?
5. **Mobile vs Desktop**: dove investire prima (l'app tecnico mobile è la più indietro)?
6. **Multi-verticale**: quando attivare un secondo verticale (domain_pack/field_definition) per validare l'astrazione?

---

## 13. Mappa file di riferimento (per la sessione tecnica)

- Schema/RLS/funzioni: `db/migrations/00{1,2,3}_*.sql` · field_definition: `004/005`.
- Permessi (fonte di verità RBAC): `packages/shared/src/permissions.ts` · Menu: `menu.ts` · DTO/schemi: `entities.ts`, `admin.ts`, `schemas.ts`, `captures.ts`, `fields.ts`.
- Contesto/RLS/auth backend: `src/context/` (`authenticate, resolve, rls`), `src/auth/` (`verifier, gotrueAdmin`).
- Endpoint: `src/routes/*.ts` · AI: `src/ai/*.ts` · Flow: `src/flow/scheduler.ts` · Bootstrap: `src/bootstrap.ts` · Coda: `src/queue.ts` · Storage: `src/storage.ts` · Numeratori (generatore): `src/numberSeries.ts`.
- Frontend: `src/shell/AppShell.tsx`, `src/pages/**`, `src/ui/**`, `src/theme/design-system.css`, `src/api/{client,hooks}.ts`, `src/auth/AuthContext.tsx`, `src/context/Lookups.tsx`, `src/voice/useVoiceCapture.ts`.
- Memoria di progetto (per ripartire): `~/.claude/projects/.../memory/MEMORY.md` + `project_handoff.md`.
```
