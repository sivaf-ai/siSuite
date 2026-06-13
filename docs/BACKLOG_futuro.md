# Backlog del futuro — catalogo dei moduli e funzionalità rimandati

*Registro vivo di tutto ciò che abbiamo deciso di NON fare nell'MVP, perché nulla vada perso.*
*Da aggiornare ogni volta che rimandiamo qualcosa. Versione 0.1.*

## Come leggere questo documento

Ogni voce ha:
- **Stato**: rimandato / macchina pronta / da confermare.
- **Perché rimandato**: la ragione della scelta.
- **Aggancio ora**: cosa è già predisposto perché domani sia facile (è la garanzia anti-dimenticanza).
- **Costo di retrofit**: quanto costerà aggiungerlo *dato* l'aggancio attuale.

Principio guida: si mettono agganci *solo* per ciò che è insieme **probabile** e **costoso da rifare** (no over-engineering). La maggior parte delle voci qui sotto è già a basso rischio, perché abbiamo predisposto strada facendo.

---

## Catalogo

| # | Modulo / Funzionalità | Stato | Perché rimandato | Aggancio ora (già presente, salvo nota) | Retrofit |
|---|---|---|---|---|---|
| 1 | **Input vocale (STT)** | Rimandato a Fase 3 | È lo strato fragile; il testo in linguaggio naturale prova già la tesi AI | Pronto: tabella `capture`, campo `channel`, design *cattura-prima/elabora-dopo* | Basso |
| 2 | **Foto / OCR materiali** (canale input) — *pipeline* | Rimandato | Canale d'ingresso secondario; il mercato però lo segnala forte (AI che analizza la foto al momento della cattura) | **Aggancio rafforzato ORA (v0.2)**: `capture` resa multimodale — `media_url` (ex `audio_url`), `media_type`, `raw_text` nullable (testo da vision async), `channel='photo'`. Resta da costruire solo la pipeline vision | Basso |
| 3 | **Solver di pianificazione** (OR-Tools / Timefold) | Rimandato a v2; scelta tool aperta | Enhancement, non blocca l'adozione | Pronto: `activity_dependency` (grafo), `activity_resource` (vincoli), campi `geo` | Medio (servizio separato) |
| 4 | **Riprogrammazione proattiva** (meteo, scorte, scadenze) | Rimandato | Dipende dal solver + trigger su eventi | Dati pronti; servono i trigger | Medio |
| 5 | **Domain pack altri verticali** (piscine, fotovoltaico) + **mezzi pesanti** | Rimandato dopo il dogfood software | Validiamo prima il verticale interno | Pronto: `resource_kind`, `jsonb` attributi, `domain_pack` | Basso |
| 6 | **Fatturazione** | Rimandato | Non serve a validare la tesi | Base dati pronta: `time_entry`, `material_consumption`, unità esplicite, costi in `attributes` | Medio |
| 7 | **Integrazioni esterne** (Git/ticketing; inverter FV; GSE/ENEA; fornitori) | Rimandato | Per-verticale, additive | Per-integrazione (additivo) | Medio |
| 8 | **Deployment on-premise** | Rimandato (SaaS first) | Onere gestionale delle versioni "in libertà" | Pronto: Docker, multi-tenant = deployment a tenant singolo, AI come gateway cloud, stack no-lock-in | Basso-Medio |
| 9 | **Dark mode / temi / colori utente** | Rimandato | Presentazione, economico da aggiungere dopo | Pronto: disciplina design token, `lookup_value.color_token` (ruolo, non hex) | Basso |
| 10 | **Lingue `en` ed `es-AR` attive** | Macchina pronta, lingue dopo | Spedire leggero (parte in italiano) | Pronto: `default_locale`/`timezone`/`app_user.locale`, label `jsonb` per-locale, libreria i18n | Basso |
| 11 | **Domain pack `es-AR`** (traduzione vocabolari di *dominio*, non solo UI) | Rimandato all'ingresso in Argentina | Non blocca l'MVP | `domain_pack` locale-aware predisposto | Basso-Medio |
| 12 | **Ruoli custom per tenant** (RBAC) | Ruoli di sistema ora, custom dopo | Spedire leggero | Pronto: `role` / `role_permission` / `user_role` | Basso |
| 13 | **Portale cliente esterno** (avanzamento read-only + riassunto AI, **senza costi**) | Rimandato post-core | Alto valore per il verticale software, ma è superficie di sicurezza | **Agganci aggiunti ORA**: `app_user.company_id`, ruolo "Cliente esterno" (`data_scope='customer'`), `customer↔engagement` già presente. **Da costruire dopo**: la *proiezione client-safe* (API/vista che non restituisce mai i campi finanziari) | Medio-Alto senza agganci → **Basso-Medio con gli agganci** |
| 14 | **Richieste di modifica dal cliente** (es. priorità) gestite da noi | Rimandato post-portale | Sostituisce l'edit diretto del cliente, **abbandonato** per sicurezza | Futura entità leggera `client_request` | Basso-Medio |
| 15 | **Workflow di approvazione** engagement | Rimandato (per ora solo campi minimi `approved_by`/`approved_at`) | Scope creep | Campi minimi | Medio |
| 16 | **Documenti allegati** (contratti, permessi, collaudi) | Rimandato | Non MVP | Futura tabella `document` o link in `jsonb` | Basso-Medio |
| 17 | **Vincoli temporali ricchi** (scadenza/deadline, earliest-start, "data fissa ora libera") | ✓ Implementato | Anticipato su richiesta: campi `earliest_start` e `due_by` su `activity` (formano una finestra); il motore li rispetta e segnala le scadenze non raggiungibili | — | — |
| 18 | **Generazione/estrazione AI dei template** (genera da NL, adatta, estrae dallo storico) | Fast-follow dopo l'applicazione manuale | È il differenziatore, ma poggia sulla tabella `template` già pronta | Tabella `template` (blueprint jsonb) già presente | Basso |
| 19 | **Integrazione fatturazione/incasso** — Italia: pagamenti (Stripe/SEPA) + fattura elettronica SDI; Argentina (dopo): Mercado Pago + AFIP | Fast-follow al primo cliente pagante | Non blocca il dogfooding; modello dati pronto e provider-agnostico | `subscription` (provider, provider_ref) già presenti | Basso-Medio |
| 20 | **Fatturazione a consumo / ibrida** (overage AI oltre la quota, crediti) | Rimandato | All'avvio si usa il flat con quota-tetto | Metering già disponibile dagli eventi `capture` | Basso-Medio |
| 21 | **Sottosistema notifiche** (su cui poggiano gli avvisi di scadenza e altri alert) | Rimandato | Cross-cutting; per ora avvisi minimi | Le date stanno su `subscription`; serve il canale notifiche | Medio |
| 22 | **Licenza on-prem firmata** (token entitlements+scadenza, check-in via gateway AI) | Rimandato con l'on-prem | Parte dell'on-prem (voce 8) | `subscription.current_period_end` come validità | Basso-Medio |
| 23 | **Manutenzione ricorrente** (piani/accordi che generano attività nel tempo) — *confine nominato* | Rimandato all'ingresso piscine/FV | Metà della proposta di valore per i verticali che vendono build+manutenzione, ma marginale per il dogfood software. Additivo, non costoso da retrofittare → non si anticipa | **Disegno-target**: entità `maintenance_plan` (legata ad `asset`+`engagement`) con regola di ricorrenza tipo RRULE; un job *deterministico* genera righe `activity` (normali) con `source_plan_id`; l'AI può *proporre* il piano da NL. Pattern confermato dai leader (Dynamics "agreements", Salesforce "maintenance plan"). Numerazione e fatturazione ricorrente separabili | Basso (tabella + job, nessuna migrazione del passato) |
| 24 | **Preventivi → job → fattura** (entità `quote`/`estimate`) — *confine nominato* | Rimandato | Cuore degli FSM, ma noi sediamo apposta tra FSM e PM, leggeri sul pre-vendita. Per il dogfood (vendita a tempo/corpo) marginale; serve a piscine/FV alla vendita della build | **Disegno-target**: entità `quote` con righe e stato canonico (`draft`/`sent`/`accepted`/`rejected`); all'accettazione *istanzia* un engagement (come un template). **Numerazione già agganciata**: `number_series` con `key='quote'` (progettato generico apposta) | Basso-Medio |
| 25 | **Commenti / feed interno** (thread + @menzioni su entità) — *confine nominato* | Rimandato | Coordinamento umano-umano, non MVP. In parte coperto da note + notifiche (#21) | **Disegno-target**: tabella `comment` polimorfa (`entity_type`+`entity_id`, autore, corpo). **Principio fissato: un commento NON è una `capture`** (la capture è intento-dato per la pipeline di estrazione; il commento è coordinamento e non passa dall'AI). Le @menzioni alimenteranno il sottosistema notifiche | Basso |

---

## Implementato (era "da confermare")

- **`engagement.code` (auto-numerazione) e `engagement.manager_id` (responsabile).** ✓ Implementati. Il `manager_id` è singolo e opzionale. Il `code` è generato dalla nuova tabella generica **`number_series`** (vedi regola sotto).

### Revisione pre-sviluppo (patch schema v0.2) — ✓ Implementato

Chiusi i buchi di *impianto* (cheap ora, cari dopo) prima del via a Claude Code. Tutto nel blocco "PATCH PRE-SVILUPPO" in coda a `schema_core.sql`:

1. **Disponibilità e orari delle risorse.** `tenant.working_hours` (template settimanale), `resource.working_hours` (override), nuova tabella **`resource_availability`** (ferie/fermi/straordinari). Sblocca il motore di flusso, che deve collocare le attività dentro l'orario e saltando le indisponibilità.
2. **`updated_at` + audit.** `updated_at` con trigger su tutte le tabelle mutabili; `created_by`/`updated_by` sulle tabelle di business; `capture.applied_by` (chi ha applicato l'estrazione, ≠ chi l'ha creata). Il log d'audit *completo* resta rimandato; le colonne no.
3. **Soft-delete/archive + cascate sicure.** `archived_at` su company/asset/engagement/resource/material/template; cascate pericolose (`engagement.company_id`, `asset.company_id`) rese `RESTRICT`, `app_user.company_id` reso `SET NULL`. I dati fatturabili non si cancellano, si archiviano.
4. **Idempotenza / offline.** Contratto ID generati dal client per le entità nate sul campo; idempotenza scritture (`ON CONFLICT (id)`) e operazioni (`capture.status`); `client_created_at` su capture/time_entry/material_consumption.
- **(F) `capture` multimodale.** `audio_url`→`media_url`, `media_type`, `raw_text` nullable, `channel` ammette `'photo'`. Aggancio foto preso ora che si toccava già la cardine (pipeline vision in #2).
- **(D) Timeline/storico dell'asset ("il libretto").** ✓ In scope MVP come **vista in lettura** (nessuna tabella nuova: dati già legati via `asset_id`/`engagement.asset_id`). Seme della manutenzione predittiva.
- **(E) Ricerca semantica sul lavoro passato.** Infrastruttura **già nell'MVP** (`capture.embedding` + `pgvector` + HNSW, usata per il contesto dell'estrazione). Ricerca lato utente come fast-follow leggero, nessuno schema.


### Regola fissata — numerazioni visibili

> **Ogni identificativo sequenziale visibile all'utente passa da `number_series`. Gli UUID non si mostrano mai in interfaccia.** I numeratori sono configurabili per `key` (cosa si numera) con formato personalizzabile (`{YYYY}`, `{YY}`, `{MM}`, `{SEQ:n}`), reset `never`/`yearly`/`monthly` e numerazione senza buchi. Default: `{YYYY}-{SEQ:4}`, reset annuale. Quando arriveranno ricevute, fatture e DDT, useranno questa stessa tabella.

---

## Da produrre / decidere PRIMA dello sviluppo (radar pre-sviluppo)

Non sono feature rimandate: sono artefatti e decisioni necessari per partire con la Fase 0-1. Tenuti qui per non perderli di vista.

- **Catalogo permessi** ✓ **FATTO (v0.2.1)**: `permissions.ts` — `PERMISSION_CATALOG` (18 risorse × azioni), `SYSTEM_ROLES` con grant e `data_scope`, `buildRolePermissionRows()` per il bootstrap, `PLATFORM_PERMISSIONS` separati. Fonte unica per RBAC, menu-dai-permessi e validatore AI.
- **Autenticazione / login** ✓ **DECISO (v0.2.1): Supabase Auth (GoTrue)**, open-source e self-hostable (gira on-prem con le stesse immagini Docker). Provider = solo authN ("chi sei"); authZ (RBAC + RLS + entitlement) resta nostro. Seam nello schema: `app_user.auth_user_id` (UNIQUE, nullable) — nessuna credenziale in `app_user`. JWT asimmetrico = validabile offline. **Via di fuga**: Keycloak, se servirà SSO enterprise (SAML/SCIM); il seam pulito rende lo switch a basso costo. *Resta da costruire*: il wiring (deploy GoTrue in Compose, callback, provisioning `app_user` al primo login).
- **RLS completa su tutte le tabelle** ✓ **FATTA (v0.2.1)**: `rls_policies.sql` — isolamento multi-tenant + `data_scope` (own/team/tenant/customer) su ogni tabella, helper di sessione, FORCE RLS. Da applicare dopo `schema_core.sql`. *Scelte documentate*: 'team'→'tenant' (manca modello team), customer-scope sulle entità del portale, proiezione client-safe a livello API (backlog #13).
- **Routine di bootstrap del tenant** (artefatto). Alla creazione di un tenant: seed dei `number_series` di default, grant ruolo→permessi dal catalogo, eventuali `lookup_value` per-tenant.
- **Tassonomia delle operazioni di estrazione** (artefatto, prep Fase 2). Il formato tipizzato dell'intento che l'LLM emette (es. `create_time_entry`, `close_activity`, `consume_material`...) con confidenza. Non serve a Fase 0-1, ma è la prova della tesi.
- **Eval harness dell'estrazione** (artefatto, Fase 4). Banco di prova per misurare accuratezza e raccogliere correzioni (le metriche del §12).

---

## Decisioni ancora aperte (riferimento)

Vedi la sezione 13 di `MVP_progetto.md`. **v0.2.1 — stato decisioni:** #1 verticale di partenza ✓ DECISO (dogfood software house + piscinaio primo pilota pagante); #2 ordine di costruzione ✓ DECISO (core → testo NL → voce); #8 autenticazione ✓ DECISO (Supabase Auth/GoTrue). **Restano parcheggiate, post-MVP:** #3 motore di sync (PowerSync vs ElectricSQL) e #4 solver (Timefold vs OR-Tools) — tecnologie in rapida evoluzione, verificare lo stato attuale prima di bloccarle. Non bloccano la partenza.

---

*Regola operativa: ogni volta che diciamo "lo facciamo dopo", aggiungiamo una riga qui. Questo file, nel repo e versionato, è la fonte di verità — non la memoria di un'AI.*
