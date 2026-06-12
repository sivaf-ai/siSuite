# README — Punto della situazione e handoff

*Documento di orientamento per riprendere il progetto in una nuova conversazione. Leggere questo per primo, poi gli altri tre file del progetto.*

Versione 1.0.

---

## Cos'è il progetto

**siSuite** è una piattaforma di gestione attività **AI-first, mobile-first, multi-verticale** per aziende che lavorano su clienti e cantieri/progetti diversi (riferimento iniziale: software house — dogfooding; poi piscine, fotovoltaico). L'AI è l'interfaccia, non una funzione: traduce il linguaggio naturale (voce/testo) in dati strutturati e racconta in linguaggio naturale. Un solo motore, adattato ai verticali via *domain pack* interpretati dall'AI, non per parametrizzazione. siSuite **sostituisce** l'attuale suite a moduli: i moduli storici (siTask = progetti, siOre = ore, siMan = manutenzione…) diventano **viste/capacità di un unico motore**, non prodotti separati.

La specifica completa è in `MVP_progetto.md`.

---

## I documenti del progetto (ordine di lettura)

1. **`README_progetto.md`** (questo) — orientamento, metodo, stato, prossimi passi.
2. **`MVP_progetto.md`** — la specifica completa, 14 sezioni: visione e tesi, problema/posizionamento, modello di dominio, input multimodale, ruoli, autorizzazioni/i18n, stati ed etichette configurabili, stack, costi, scope MVP, roadmap, rischi, metriche, licenze/fatturazione, decisioni aperte.
3. **`schema_core.sql`** — schema PostgreSQL completo (26 tabelle), riccamente commentato. È la fonte di verità del modello dati.
4. **`BACKLOG_futuro.md`** — catalogo di tutto ciò che è rimandato (22 voci), ognuna con stato, agganci già pronti e costo di retrofit.

---

## Dove siamo (stato)

Il design architetturale è completo e coerente. Lo schema conta **26 tabelle**; principali blocchi: anagrafica unica `company` + `company_role` (ruoli multipli) + `company_contact`; `engagement → phase → activity → checklist` + `activity_dependency` (grafo); risorse e assegnazioni con vincolo anti-doppia-prenotazione; `capture` (cuore AI-first) + `time_entry` + `material_consumption`; RBAC (`role`/`role_permission`/`user_role`); `canonical_state` + `lookup_value` (stati/priorità configurabili); `number_series` (numerazioni); `template` (blueprint jsonb); `plan` + `subscription` (licenze).

Implementato di recente: anagrafica unificata aziende con ruoli e contatti; template come blueprint jsonb; motore di flusso (attività fisse vs dinamiche, senza flag, + vincoli temporali `earliest_start`/`due_by`); licenze/piani/abbonamenti; fatturazione **Italia-first** (auto-fattura + SDI; no Merchant of Record finché si vende solo in Italia; Argentina come percorso localizzato a parte con Mercado Pago/AFIP).

---

## Come lavoriamo (metodo e preferenze) — importante per la continuità

- **Lingua**: conversazione in **italiano**; artefatti tecnici (schema) in inglese.
- **Tono**: risposte **dirette e opinionate**, niente accondiscendenza. L'utente vuole valutazioni oneste, anche scomode, e che le proposte siano giustificate.
- **Profilo utente**: ingegnere informatico, titolare di una software house (micro-azienda, bootstrap, pochi clienti, crescita graduale). Ha un default mentale verso soluzioni parametrizzate/tradizionali: le proposte alternative vanno argomentate contro quel baseline.
- **Dinamica**: l'utente **sfida le proposte** e porta il **contesto reale** dell'azienda (es. mercati italiani, fatturazione SDI). Quando una proposta "sa di internazionale" o non combacia con la realtà, va ricalibrata. Lui porta il terreno, l'AI porta opzioni ed esperienza tecnica.
- **Metodo per ogni nuovo tema**: analisi di cosa fanno i leader di mercato → proposta motivata dell'AI → l'utente decide → si fissa subito negli artefatti (schema/MVP/backlog).

---

## Principi architetturali fissati (non derogare)

- **L'LLM propone, un motore deterministico dispone** (validatore per l'estrazione, solver/flusso per la pianificazione). L'AI non scrive mai diretto nel DB.
- **Cattura-prima**: non strutturato in ingresso, strutturato a riposo, linguaggio naturale in uscita. Si conserva sempre il grezzo (provenienza).
- **Spina rigida (relazionale) + dominio flessibile (`jsonb`) + semantico (`pgvector`)**.
- **Progetta robusto, spedisci leggero, agganci ora**: distinguere impianto (cheap ora, caro dopo → si fa ora) da feature/presentazione (cheap dopo → si rimanda lasciando i ganci).
- **Autorizzazione al livello dati (RLS) e API, mai solo UI.** RBAC (ruolo) ≠ entitlement (piano): filtrano entrambi.
- **L'AI agisce sempre dentro i permessi/entitlement** dell'utente/tenant.
- **Regola numerazioni**: ogni identificativo sequenziale visibile passa da `number_series`; gli UUID non si mostrano mai in UI.
- **Stati**: insieme canonico riconosciuto dal sistema (`canonical_state`) + etichette configurabili dall'utente (`lookup_value`) che vi mappano sopra obbligatoriamente.
- **Pianificazione**: attività dinamiche (durata + sequenza, collocate dal motore di flusso da "oggi") vs fisse (con `scheduled_start` = pin); vincoli `earliest_start`/`due_by`. Il motore segnala i conflitti, non li nasconde.
- **No lock-in**: Postgres ovunque, open source, multi-tenant; Docker per SaaS e on-prem (on-prem = deployment a tenant singolo; l'AI resta gateway cloud per IP e ricavo).
- **Generalizzare quando paga** (es. `lookup_value`, `number_series`): più volte l'intuizione "già che ci siamo, generalizziamo" ha prodotto infrastruttura migliore.
- **I documenti versionati nel repo sono la fonte di verità, non la memoria di un'AI.**

---

## Stack tecnologico

- **Client**: Ionic + Capacitor + React (PWA + iOS/Android, massimo riuso). *Segnale di switch*: se la robustezza voce/offline diventa il collo di bottiglia, riscrivere **solo l'app del tecnico** in React Native.
- **Database**: PostgreSQL + `pgvector`, multi-tenant con RLS.
- **Sync offline**: PowerSync o ElectricSQL (decisione aperta).
- **Solver di pianificazione**: Timefold o OR-Tools (rimandato a post-MVP).
- **Backend**: Node/TypeScript; coda + worker per processare le `capture`.
- **AI**: API LLM lato server (modello piccolo per estrazione, grande per pianificazione complessa); STT on-device gratis come base.
- **Storage audio**: Cloudflare R2 / S3 (MinIO on-prem).
- **Deployment**: Docker + Compose (no Kubernetes finché la scala non lo impone).
- **Fatturazione**: Italia-first (pagamenti Stripe/SEPA/bonifico + fattura elettronica SDI); modello flat per azienda a fasce con quota AI negli entitlement.

---

## Decisioni (vedi MVP §14)

**Chiuse:**
- ✓ **Verticale di partenza**: dogfood software house, poi piscinaio come primo pilota pagante.
- ✓ **Ordine di costruzione**: core deterministico → estrazione testo NL (prova della tesi) → voce.
- ✓ **Autenticazione**: Supabase Auth (GoTrue) self-hosted; solo authN, seam `app_user.auth_user_id` (via di fuga: Keycloak).

**Aperte (post-MVP, verificare lo stato attuale prima di bloccare):**
1. **Motore di sync**: PowerSync vs ElectricSQL.
2. **Solver**: Timefold vs OR-Tools.

---

## Prossimi passi consigliati

- Le decisioni di partenza (verticale, ordine, auth) sono **chiuse**; restano solo sync e solver, entrambi post-MVP.
- Oppure passare dal design alla **costruzione**: Fase 0 (fondamenta: schema su Postgres, multi-tenant/RLS, scheletro backend e Ionic, Docker Compose) → Fase 1 (core deterministico + form).
- Oppure continuare il design su eventuali nuovi nodi che emergono (registrandoli sempre negli artefatti).

---

## Regola d'oro operativa

Ogni volta che si dice "lo facciamo dopo", si aggiunge una riga in `BACKLOG_futuro.md`. Nulla va perso. I documenti del progetto sono la memoria reale.
