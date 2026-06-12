# siSuite — Brief di avvio per Claude Code

> Testo da consegnare a Claude Code. Cartella di lavoro e nome prodotto: **`siSuite`**. Questo motore AI-first **sostituisce** l'attuale siSuite a moduli: i vecchi moduli (siTask = progetti, siOre = ore, siMan = manutenzione, ecc.) diventano **viste/capacità di un unico motore**, non prodotti separati. Tienilo come unica costante di branding così, se servisse, si rinomina in un punto.

---

## 0. Cosa stiamo costruendo

Una piattaforma **AI-first, mobile-first, multi-verticale** di gestione attività su clienti e progetti/cantieri. L'AI è l'interfaccia: traduce linguaggio naturale (voce/testo) in dati strutturati e racconta in linguaggio naturale. Due superfici: **app del tecnico** (telefono, voce-centrica) e **pannello pianificatore/admin** (web). Verticale di partenza: **software house** (dogfooding).

La specifica completa è nei documenti (in italiano): `README_progetto.md`, `MVP_progetto.md`, `BACKLOG_futuro.md`. **Leggili prima di iniziare.**

---

## 1. Artefatti già pronti (input — sono la fonte di verità, non reinventarli)

| File | Cos'è | Come usarlo |
|---|---|---|
| `schema_core.sql` | Schema PostgreSQL completo **+ blocco "PATCH PRE-SVILUPPO" in coda** (orari/disponibilità risorse, updated_at+audit, soft-delete/cascate, idempotenza/offline, capture multimodale, seam auth `app_user.auth_user_id`) | Migrazione **001**. Applicalo tutto, in ordine. |
| `rls_policies.sql` | Row-Level Security completa: isolamento multi-tenant + `data_scope` (own/team/tenant/customer), helper di sessione, FORCE RLS | Migrazione **002**. Applicalo **dopo** lo schema. |
| `permissions.ts` | Catalogo permessi RBAC: `PERMISSION_CATALOG`, `SYSTEM_ROLES` (con `data_scope`), `buildRolePermissionRows()`, `PLATFORM_PERMISSIONS`, `can()` | Va nel package **shared**. Alimenta: il bootstrap (`role_permission`), il **menu** (ogni voce dichiara la sua `PermissionKey`), e il **validatore** lato API. |
| Mockup HTML `01..NN_*.html` + `base.css` | Le maschere di riferimento e il **design system** (token colore, tipografia, componenti) | Spec **visiva**. Riproducile in Ionic+React; porta i token di `base.css` nel tema dell'app. Non incollarle as-is. |

---

## 2. Principi non derogabili (rispettali in ogni scelta)

1. **L'LLM propone, un livello deterministico dispone.** L'AI non scrive **mai** diretta nel DB: emette un intento strutturato che un validatore controlla e applica. (Vale per la Fase 2; in Fase 0-1 non c'è ancora AI.)
2. **Autorizzazione al livello DATI (RLS) e API, mai solo in UI.** Tre dimensioni distinte che filtrano insieme: **RBAC** (azione, da `permissions.ts`) ≠ **entitlement** (piano, `plan`/`subscription`) ≠ **data_scope** (visibilità, RLS). Nascondere bottoni in UI è solo UX.
3. **Auth = solo "chi sei".** Provider: **Supabase Auth (GoTrue)** self-hosted. L'authZ resta nostra. L'identità esterna si lega a `app_user.auth_user_id` (UNIQUE). **Nessuna credenziale in `app_user`.**
4. **Tutto in Docker** (sviluppo, test, esecuzione). **Postgres + pgvector** ovunque. Multi-tenant via RLS.
5. **Numerazioni:** ogni identificativo visibile passa da `number_series`; gli **UUID non si mostrano mai** in UI.
6. **Design token, mai colori cablati** (così tema chiaro/scuro è banale dopo).

---

## 3. Stack (deciso)

- **DB:** PostgreSQL 16 + `pgvector` + `btree_gist` + `pgcrypto`. Immagine consigliata: `pgvector/pgvector:pg16` (garantisce l'estensione).
- **Backend:** Node 20 LTS + **TypeScript strict**. Framework: **Fastify** (leggero, TS-first; alternativa strutturata: NestJS). Validazione: **zod**.
- **Accesso DB:** **Drizzle ORM** + `node-postgres` (pool). *(Lo schema resta SQL scritto a mano — la fonte di verità; i tipi Drizzle lo rispecchiano.)*
- **Auth:** **GoTrue** (Supabase Auth) come servizio; JWT **asimmetrico** (validabile offline). Il backend verifica il JWT (JWKS/chiave pubblica).
- **Coda/worker (Fase 2):** **pg-boss** (coda su Postgres — niente Redis: "Postgres ovunque").
- **Object storage (Fase 2-3):** **MinIO** (S3-compatibile) in container per i media delle `capture`.
- **Frontend:** **Ionic + Capacitor + React + Vite** + TypeScript. PWA + iOS/Android, massimo riuso. Tema dai token di `base.css`.
- **Monorepo:** **pnpm workspaces**.

---

## 4. RLS — il punto tecnico da non sbagliare

La RLS funziona **solo** se la sessione DB è impostata a ogni richiesta. Schema operativo:

1. Crea un **ruolo DB applicativo** `sisuite_app` **NOSUPERUSER NOBYPASSRLS**. Il backend si connette **con questo ruolo** (le migrazioni/bootstrap girano con il ruolo proprietario/privilegiato). `FORCE ROW LEVEL SECURITY` è già nelle policy: garantisce che nessuno bypassi.
2. Per ogni richiesta autenticata, il backend apre **una transazione** e fa `SET LOCAL` (scoped alla tx, pool-safe — **non** `SET`):
   ```sql
   SET LOCAL app.current_tenant    = '<tenant uuid>';
   SET LOCAL app.current_user      = '<app_user uuid>';
   SET LOCAL app.data_scope        = '<own|team|tenant|customer>';
   SET LOCAL app.current_company   = '<company uuid o vuoto>';
   SET LOCAL app.is_platform_admin = '<true|false>';
   ```
   Le query della richiesta girano dentro questa tx. Gli helper di `rls_policies.sql` leggono quei valori.
3. **`data_scope` effettivo** = il più ampio tra i ruoli dell'utente (own < team < tenant). Calcolalo a partire da `user_role`→`role.data_scope`.

> Test di sicurezza obbligatori già in Fase 0: un test d'integrazione che prova che (a) un tenant **non** vede i dati di un altro, (b) un Tecnico (`own`) **non** vede le ore/catture di un collega. Se questi due passano, l'impianto regge.

---

## 5. Sequenza di lavoro — le cose più importanti per prime

### FASE 0 — Fondamenta (obiettivo: `docker compose up` e tutto vive)

1. **Monorepo + Docker Compose.** Struttura proposta:
   ```
   siSuite/
     docker-compose.yml          # dev
     docker-compose.prod.yml     # override build/prod
     .env.example
     packages/
       shared/      # permissions.ts, tipi condivisi, definizione MENU, zod schemas
       backend/     # Fastify API
       frontend/    # Ionic + React + Vite
     db/
       migrations/  # 001_schema_core.sql, 002_rls_policies.sql, 003_seed.sql
       bootstrap/   # script TS: grants da permissions.ts, number_series, tenant+owner
     docs/          # i .md di specifica + i mockup HTML
   ```
   Servizi compose:
   - **db** — `pgvector/pgvector:pg16`, volume persistente, healthcheck (`pg_isready`).
   - **migrate** — one-shot: applica `db/migrations/*.sql` in ordine, poi esegue il bootstrap TS. `depends_on: db (healthy)`.
   - **auth** — `supabase/gotrue`, puntato allo stesso Postgres (schema `auth`), JWT asimmetrico, SMTP opzionale.
   - **backend** — Node, hot reload (`tsx watch`), connesso come ruolo `sisuite_app`, env con URL DB + URL/JWKS GoTrue. `depends_on: db, auth`.
   - **frontend** — Vite/Ionic dev server. `depends_on: backend`.
   - *(opzionali ora, predisposti)* **minio**, **pgweb/adminer** per ispezione DB.

   > Nota ambiente: avete già **Docker attivo** e **Postgres installato**. Usa comunque il servizio `db` con immagine `pgvector/pgvector:pg16` per garantire le estensioni; se preferite riusare il Postgres esistente, assicuratevi che `pgvector`, `btree_gist`, `pgcrypto` siano installati e puntate `DATABASE_URL` lì. Tutto deve girare in Docker: **dev, test, run**.

2. **DB su.** `migrate` applica 001 (schema+patch) → 002 (RLS) → 003 (seed). Il **bootstrap TS** poi: crea il ruolo `sisuite_app`, scrive i `role_permission` da `buildRolePermissionRows()`, crea i `number_series` di default (key `engagement` = `{YYYY}-{SEQ:4}`, reset annuale), crea il **primo tenant** + un **utente Owner** (con `auth_user_id` collegato all'utente GoTrue seed). Idempotente.

3. **Backend skeleton.** Fastify + TS strict; `/health`; pool DB come `sisuite_app`; **middleware di contesto** (§4): verifica JWT GoTrue → risolve `app_user` via `auth_user_id` → calcola permessi + `data_scope` + entitlement → apre tx + `SET LOCAL`. Una **guard** `requirePermission('engagement:read')` che usa `can()` da `permissions.ts`.

4. **Auth wiring.** GoTrue configurato; flusso login; provisioning `app_user` al primo login (per ora basta l'Owner seed). Validazione JWT asimmetrica.

5. **Frontend skeleton.** Ionic+React+Vite; porta i **token** di `base.css` nel tema (CSS variables → variabili Ionic); routing; **le due shell** (tab bar mobile + sidebar desktop) e il **menu derivato da `permissions.ts`** (ogni voce mostrata solo se l'utente ha la `PermissionKey`); login.

**Definition of Done Fase 0:** `docker compose up` → db+auth+backend+frontend verdi; migrazioni+seed applicati; login come Owner; il menu si renderizza dai permessi; **un'entità (engagement) creata e listata end-to-end con RLS attiva**; i due test RLS passano.

### FASE 1 — Core deterministico (l'app già usabile)

1. CRUD via API di tutte le entità core (engagement, phase, activity, company/contact, asset, resource, material, time_entry, material_consumption) — sempre dietro RBAC + RLS.
2. Le schermate dai mockup: **Tecnico** (Oggi, Agenda, Dettaglio attività+checklist), **Pianificazione**, **Dashboard**, **Commesse + Dettaglio commessa**, **Asset + timeline**, liste anagrafiche, **area Amministrazione**.
3. Rendicontazione via **form** (il percorso deterministico — scrive diretto nelle tabelle).
4. Motore di flusso "leggero" (collocazione dinamica delle attività rispettando orari/disponibilità risorse) + rilevamento conflitti (il vincolo anti-doppia-prenotazione è già nel DB).

### FASE 2+ (non ora, solo per contesto)
Estrazione da testo NL (la prova della tesi: capture→contesto→estrazione→validazione→commit), poi voce. Coda con pg-boss, MinIO per i media, `pgvector` per il contesto. Vedi `BACKLOG_futuro.md` e `MVP_progetto.md §4`.

---

## 6. Convenzioni

- TypeScript **strict**; ESLint + Prettier; `.env` da `.env.example` (mai segreti nel repo).
- Identificatori/codici tabella in **inglese**; commenti e UI in **italiano** (i18n pronto: `it-IT` attivo, `en`/`es-AR` abilitabili).
- Test backend: **vitest**, con i due test RLS critici fin da subito. I test girano in container: `docker compose run --rm backend pnpm test` (usa un `db_test` effimero o testcontainers).
- Commit piccoli e descrittivi; un README per dev (`docker compose up` e via).

---

## 7. Primo blocco di task (in quest'ordine)

1. Scaffolding monorepo (pnpm workspaces) + `docker-compose.yml` con **db (pgvector)** + **migrate**.
2. Migrazioni `001` (schema+patch) e `002` (RLS) + `003` seed; bootstrap TS (ruolo app, grants da `permissions.ts`, number_series, tenant+Owner).
3. Ruolo DB `sisuite_app` + pool backend + middleware contesto/`SET LOCAL` (§4).
4. GoTrue + verifica JWT + risoluzione `app_user`.
5. Backend: **engagement** end-to-end (guard RBAC + RLS) come entità pilota.
6. Frontend: skeleton Ionic+React, token dal design system, le due shell + menu-dai-permessi, login, e la lista "Oggi"/engagement collegata.
7. I due **test RLS** (isolamento tenant + scope `own` del tecnico).

Quando la Fase 0 è "done", fermati e fammi vedere: `docker compose up`, login, menu, una commessa creata, test verdi. Poi proseguiamo con la Fase 1 maschera per maschera.
