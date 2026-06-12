# siSuite

Piattaforma di gestione attività **AI-first, mobile-first, multi-verticale**. Un solo motore: i moduli storici (progetti, ore, manutenzione) sono viste/capacità, non prodotti separati.

> Specifica completa in [docs/](docs/): `README_progetto.md`, `MVP_progetto.md`, `BACKLOG_futuro.md`. Brief tecnico: [BRIEF_Claude_Code.md](BRIEF_Claude_Code.md).

## Stack

- **DB** PostgreSQL 16 + pgvector (multi-tenant via RLS) · **Backend** Node 20 + Fastify + TypeScript strict + Drizzle/pg · **Auth** Supabase GoTrue (solo authN) · **Frontend** Ionic + React + Vite · **Monorepo** pnpm workspaces · **Tutto in Docker**.

## Avvio rapido (sviluppo)

Prerequisiti: Docker Desktop attivo.

```bash
cp .env.example .env        # i default vanno bene per il locale
docker compose up           # build + avvio di tutto
```

Servizi e porte host (scelte per non collidere col Postgres già installato):

| Servizio  | URL                          | Note |
|-----------|------------------------------|------|
| frontend  | http://localhost:5173        | Vite dev server |
| backend   | http://localhost:3010/health | Fastify API |
| auth      | http://localhost:9999/health | GoTrue |
| db        | localhost:**5433** → 5432    | pgvector (porta host 5433) |
| adminer   | http://localhost:8082        | profilo `tools` |
| minio     | http://localhost:**9101** (console), API 9100 | object storage media vocali (Fase 3) |

Profilo opzionale: `docker compose --profile tools up` (aggiunge Adminer).

### Credenziali seed

L'utente Owner del primo tenant (da `.env`):

- **email** `owner@sisuite.local` · **password** `Owner123!`

Apri http://localhost:5173 e accedi: il menu si costruisce dai permessi del ruolo.

## Architettura — i punti che NON vanno sbagliati

- **Autorizzazione a tre dimensioni, mai solo in UI.** RBAC (azione, `packages/shared/src/permissions.ts`) ≠ entitlement (piano) ≠ `data_scope` (visibilità, RLS Postgres). Nascondere bottoni è solo UX.
- **RLS sempre attiva.** Il backend si connette come ruolo `sisuite_app` (NOSUPERUSER, NOBYPASSRLS). Ogni richiesta autenticata apre una transazione e fa `SET LOCAL app.current_tenant/current_user/data_scope/...` (vedi `packages/backend/src/context/rls.ts`). La risoluzione identità→contesto usa la funzione SECURITY DEFINER `app_resolve_context` (`db/migrations/003_app_functions.sql`) per evitare il chicken-and-egg con la RLS.
- **Numerazioni.** Ogni codice visibile passa da `number_series` (gapless, in transazione). Gli UUID non si mostrano mai in UI.
- **Auth = solo "chi sei".** GoTrue emette il JWT; il backend lo verifica (`packages/backend/src/auth/verifier.ts`, dual-mode: HS256 dev / JWKS asimmetrico). L'identità esterna si lega a `app_user.auth_user_id`.

## Funzionalità (Fase 1 — core deterministico)

- **API CRUD** dietro RBAC + RLS per: commesse (engagement), fasi, attività (+checklist +assegnazione risorse con rilevamento doppia-prenotazione dal vincolo DB), clienti (+contatti, ruoli multipli), asset, risorse, materiali; più i lookup (stati/etichette/priorità).
- **Rendicontazione via form** (percorso deterministico, scrive diretto): ore (`time_entry`) e consumi materiali (`material_consumption`).
- **Motore di flusso "leggero"** (`/engagements/:id/schedule`): colloca le attività *dinamiche* fluendo da oggi dentro l'orario di lavoro, attorno alle *fisse* (ancore), e segnala i conflitti di scadenza (`due_by`) invece di violarli. Limiti dichiarati: timezone "naive", non sottrae ancora `resource_availability` né risolve il grafo dipendenze (solver ottimizzante = post-MVP).
- **Frontend**: due shell (sidebar desktop / tab mobile), menu dai permessi; Dashboard (conteggi), Commesse + dettaglio (fasi, attività, agenda calcolata), Attività + checklist + rendicontazione, Oggi (tecnico), Clienti + dettaglio, Risorse, Materiali, Asset, Pianificazione. Le sezioni non ancora coperte mostrano un placeholder.

## Fase 2 — pipeline AI (estrazione da linguaggio naturale)

La prova della tesi: un tecnico racconta in linguaggio naturale, l'AI estrae operazioni strutturate, un livello **deterministico** valida e applica. **L'AI non scrive mai diretta nel DB.**

Catena (`packages/backend/src/ai/` + `routes/captures.ts`): **cattura** immutabile (`POST /captures`) → **contesto** (agenda/attività, materiali, tipologie — assemblato *dentro la RLS dell'utente*) → **estrazione** (Claude via SDK ufficiale, *tool use forzato*: il modello risolve la frase sugli **ID forniti**, non genera testo libero) → **validazione** deterministica (referenziale + **RBAC per-operazione** + business rules) → **conferma** (`POST /captures/:id/apply`, l'utente sceglie; le high-confidence sono auto-applicabili) → **commit** in transazione, ogni riga legata a `source_capture_id`.

Operazioni supportate: `log_time`, `log_material`, `set_activity_status`, `check_checklist_item`, `clarify` (astensione su ambiguità).

**Attivazione:** la pipeline è **disattivata se `ANTHROPIC_API_KEY` è vuota** (la cattura si salva comunque; resta il percorso form). Per attivarla:

```bash
# in .env
ANTHROPIC_API_KEY=sk-ant-...
# EXTRACTION_MODEL=claude-opus-4-8   # default; l'MVP suggerisce un modello piccolo (es. claude-haiku-4-5) per la frequenza
docker compose up -d backend
```

Test rapido (con chiave attiva), come Owner:
```bash
curl -s -X POST http://localhost:3010/captures -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"rawText":"ho lavorato 2 ore sulla raccolta requisiti e usato una licenza server"}'
# → propone log_time(120m) + log_material(1 licenza), con confidenza; POST /captures/:id/apply per committare
```

Dalla UI: voce **Catture** (barra di cattura testo → proposta operazioni con confidenza → conferma/applica → storico).

## Fase 3 — voce (cattura-prima / elabora-dopo)

Lo strato vocale sopra la pipeline di estrazione: il tecnico parla, l'audio si **conserva subito** (provenienza), l'elaborazione avviene **dopo**, in background.

- **Registrazione + STT on-device** (frontend, `useVoiceCapture`): `MediaRecorder` per l'audio + **Web Speech API** per la trascrizione locale (gratis; Chrome/Edge). Se lo STT non c'è, l'audio si registra comunque.
- **Object storage** (`MinIO`): l'audio grezzo va in `s3://captures/...` (`POST /captures/voice`, multipart). La cattura nasce `channel=voice`, `status=pending`, ritorna **subito** (202).
- **Coda asincrona** (`pg-boss` su Postgres, niente Redis): un **worker** estrae in background (stesso `runExtraction` della Fase 2: contesto → estrazione → validazione → proposta). Il client fa **polling** su `GET /captures/:id` finché lo stato passa a `proposed`.
- **Degrado morbido**: senza `ANTHROPIC_API_KEY` l'audio + trascrizione si salvano lo stesso (niente proposta); se MinIO è giù la cattura resta salvata con una nota.

Dalla UI: pagina **Catture** → pulsante microfono → parla → l'AI propone le operazioni (con chiave attiva).

*Rimandati (Fase 4+):* STT cloud per accuratezza, hint di vocabolario STT dal domain pack (oggi gli anchor di vocabolario passano dal contesto di estrazione), recupero semantico dei precedenti via `pgvector`, sync offline (PowerSync/ElectricSQL), riproduzione audio dei media.

## Migrazioni e bootstrap

Il servizio one-shot `migrate` applica `db/migrations/*.sql` in ordine (tracker `public.sisuite_migrations`, idempotente) poi esegue il bootstrap TS (`packages/backend/src/bootstrap.ts`): ruolo `sisuite_app` + grants, `role_permission` dai ruoli di sistema, `number_series`, primo tenant + Owner (creato su GoTrue) + subscription trial + cliente demo. Re-eseguibile senza danni.

```bash
docker compose up migrate          # ri-applica (idempotente)
```

## Test

I due test RLS critici (isolamento tenant + scope `own` del tecnico):

```bash
docker compose run --rm --no-deps backend pnpm --filter @sisuite/backend test
```

## Struttura

```
packages/shared/    permessi (fonte di verità RBAC), MENU, zod, tipi condivisi
packages/backend/   Fastify: auth, contesto/RLS, guard, number_series, routes, migrate+bootstrap
packages/frontend/  Ionic+React+Vite: token dal design system, due shell, menu dai permessi
db/migrations/      001 schema+patch · 002 RLS · 003 funzioni applicative
db/init/            schema `auth` per GoTrue (solo prima inizializzazione del volume)
docs/               specifica + mockup HTML + base.css
```

## Note operative (Fase 0)

- **Auth in modalità HS256** per il bring-up locale. Per la modalità asimmetrica (JWKS/RS256, offline-capable) valorizzare `AUTH_JWKS_URL` e svuotare `AUTH_JWT_SECRET` (`.env`).
- GoTrue interroga relazioni non qualificate: il suo DSN usa `search_path=public,auth` (il runner di migrazione resta in `public`, le query runtime cadono su `auth.*`).
- Su un volume DB già esistente, lo schema `auth` per GoTrue va creato a mano (`db/init` rigira solo su volume vuoto). Per ripartire puliti: `docker compose down -v && docker compose up`.

## Qualità

```bash
docker compose run --rm --no-deps backend pnpm --filter @sisuite/shared typecheck
docker compose run --rm --no-deps backend pnpm --filter @sisuite/backend typecheck
docker compose run --rm --no-deps frontend pnpm typecheck
```

## Produzione

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
Backend e migrate girano via **tsx** (TypeScript eseguito direttamente, nessuno step di compilazione: evita l'attrito monorepo `rootDir`/paths); il frontend è buildato da Vite e servito statico da nginx. Niente hot-reload.
