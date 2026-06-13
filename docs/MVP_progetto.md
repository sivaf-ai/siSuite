# Documento MVP — Piattaforma di gestione attività AI-first

*Gestione progetti e manutenzione sul campo, mobile-first e AI-first, multi-verticale (piscine, software, fotovoltaico).*

Versione 0.2.1 — revisione pre-sviluppo (allineata a schema, RLS e permessi).

---

## 1. Visione e tesi

Non costruiamo l'ennesimo gestionale in cui l'umano compila form e il software li organizza. Ribaltiamo il paradigma: **l'intelligenza artificiale è l'interfaccia, non una funzione interna.** Il sistema è un *traduttore bidirezionale* — trasforma la realtà raccontata in linguaggio naturale in dati strutturati, e poi trasforma i dati strutturati in risposte, riassunti e suggerimenti detti in linguaggio umano.

La tesi da validare con questo MVP è una sola: **un operatore sul campo può registrare il proprio lavoro parlando (o scrivendo in linguaggio naturale) invece di compilare, e l'AI estrae da sé dati affidabili e fatturabili.** Se questo funziona, tutto il resto del prodotto regge.

Due principi architetturali governano l'intero sistema e vanno difesi in ogni decisione:

1. **L'LLM propone, un motore deterministico dispone.** L'AI non scrive mai direttamente nel database: emette un intento strutturato che un livello deterministico valida e applica. Vale per l'estrazione (validatore) e per la pianificazione (solver). Rende il sistema testabile, affidabile e indipendente dal modello.
2. **Cattura immutabile prima, interpretazione strutturata dopo.** L'input grezzo (voce/testo) si registra prima di qualunque interpretazione; l'estrazione struttura il dato a riposo; l'AI racconta in uscita. Questo dà tracciabilità, reversibilità e — come vedremo — l'offline quasi gratis.

---

## 2. Problema e posizionamento

Le aziende che lavorano per clienti e cantieri diversi (piscinai, installatori FV, software house) gestiscono insieme **progetti di realizzazione** (lunghi, a fasi) e **manutenzione/assistenza** (breve, ricorrente). Devono pianificare la settimana, allocare persone, mezzi e attrezzature, e rendicontare ore e materiali. I software esistenti falliscono per attrito: richiedono di fermarsi e tradurre a mano la realtà in dati, cosa che sul campo non avviene — e i dati arrivano tardi o mai.

**Il buco di mercato.** I tool di *field service* (Jobber, ServiceTitan) ragionano per intervento/visita e sono deboli sulla vera scomposizione di progetto. I tool di *project management* (Asana, Jira, MS Project) sono fortissimi sulla gerarchia ma deboli sull'esecuzione mobile e privi di cattura vocale/AI. Noi ci posizioniamo nel mezzo: **struttura di progetto vera (ma limitata) + esecuzione sul campo + AI nativa.**

**Strategia di vertical.** Un solo motore, adattato al verticale non più per parametrizzazione ma tramite *domain pack* interpretati dall'AI a runtime. Si vende verticale ("il gestionale per chi fa piscine"), ma la base di codice è unica.

---

## 3. Modello di dominio

Tre strati:

- **Spina relazionale rigida** — le entità universali (sotto). Integrità, vincoli, transazioni.
- **Strato flessibile (`jsonb`)** — gli attributi specifici di ogni verticale, senza fork di codice.
- **Strato semantico (pgvector)** — embedding per il recupero del contesto.

### Entità del core (spina)

- **Tenant** — l'azienda che usa il software; porta il *domain pack* (vocabolario, dimensioni attive, tipologie di ore).
- **Company / Company_role / Company_contact** — anagrafica *unica* delle aziende (e persone), con **ruoli multipli** (un'azienda può essere cliente *e* fornitore senza duplicarla) e i contatti associati. La natura *episodica/ricorrente* sta sul ruolo cliente.
- **Asset** — l'oggetto gestito (la piscina, l'impianto, il sistema software) che *nasce* da una build e poi vive di manutenzione, con la sua storia.
- **Engagement** — l'ingaggio: tipo `build` (realizzazione) o `maintenance`; con `code` umano (da `number_series`) e `manager_id` (responsabile, uno, opzionale).
- **Phase** — il "ramo / modulo / work-package"; annidabile in modo *limitato*.
- **Activity** — l'unità atomica schedulabile: la sola che porta ore, risorse e materiali e compare in agenda. Ha una **durata stimata** (`estimated_minutes`); se ha `scheduled_start` è **fissa** (ancora), altrimenti **dinamica** (la colloca il motore di flusso).
- **Template** — modelli riusabili (attività, checklist, fasi, progetto) come blueprint `jsonb`; di sistema (domain pack) o custom del tenant; l'AI li genera, sceglie, adatta ed estrae dallo storico.
- **Plan / Subscription** — il piano (catalogo della piattaforma, con entitlements di default) e l'abbonamento/licenza del tenant (stato, scadenze, entitlements effettivi). Vale per SaaS e on-prem; il gating è separato dall'RBAC (piano vs ruolo).
- **Activity_dependency** — il grafo (DAG) delle dipendenze tra attività (finish-to-start di default).
- **Resource** — persone, mezzi, attrezzature.
- **Resource_availability** — le eccezioni alla disponibilità di una risorsa (ferie, malattia, mezzo in officina = `unavailable`; straordinari = `available`). Insieme a `tenant.working_hours` (orario standard) e all'eventuale override `resource.working_hours`, dà al motore di flusso la disponibilità **effettiva** su cui collocare le attività.
- **Activity_resource** — assegnazione risorsa→attività, con vincolo di non-doppia-prenotazione a livello di database.
- **Material / Material_consumption** — catalogo materiali e consumi.
- **Time_entry** — registrazione ore, con tipologia dipendente dal verticale.
- **Capture** — l'input grezzo (voce/testo/**foto**), l'estrazione proposta e l'embedding: la tabella-cardine dell'AI-first. Multimodale per costruzione: `media_url` + `media_type` per il media, `channel` ∈ {voice, text, photo}, `raw_text` valorizzato dalla trascrizione/vision (nullable, può arrivare async). Porta la provenienza offline (`client_created_at`) e la traccia di applicazione (`applied_by`).
- **Role / Role_permission / User_role** — l'RBAC: ruoli (di sistema o custom per tenant) e permessi `risorsa:azione`; la visibilità dei dati passa da `role.data_scope` + RLS.
- **Canonical_state / Lookup_value** — gli stati che *il sistema* riconosce (canonici) e le etichette *configurabili dall'utente* che vi mappano sopra (con sigla, colore-ruolo, icona, ordine; label per-locale).
- **Number_series** — numeratori generici configurabili (commesse, ricevute, fatture...), una riga per *cosa* si numera, con formato personalizzabile e numerazione senza buchi. **Regola: ogni identificativo sequenziale visibile all'utente passa da qui; gli UUID non si mostrano mai in interfaccia.**
- **Locale/timezone** — `tenant.default_locale`, `tenant.timezone`, `app_user.locale` per l'i18n (supportati: `it-IT`, `en`, `es-AR`).

### Le dimensioni che si accendono per verticale

| Dimensione | Piscine | Software | Fotovoltaico |
|---|---|---|---|
| Mezzi pesanti | sì | no | sì |
| Mobilità/geo | alta | bassa | alta |
| Tipologie ore | costruz./manut. | sviluppo/assist./addestr. | installaz./manut. |
| Materiali | chimica, ricambi | schede, cavi, HW | pannelli, inverter |
| Compliance | collaudi, igiene | SLA, GDPR | GSE/ENEA, detrazioni |

Lo schema relazionale completo è nel file `schema_core.sql`.

### Struttura del progetto: la regola d'oro

> **Solo le foglie schedulabili (`activity`) portano ore, risorse e materiali e compaiono in agenda. Ciò che sta sopra (le `phase`) è organizzazione e rollup; ciò che sta sotto è una *checklist* di passi, non entità.**

Niente sotto-attività annidate (la trappola di complessità). Un pezzo più piccolo o è un'altra `activity` (se va schedulato a parte) o è un passo della checklist. Le dipendenze sono un grafo separato che alimenta il solver. E — punto AI-first — l'utente non costruisce l'albero a mano: da una descrizione in linguaggio naturale, l'AI propone fasi, attività, dipendenze e stime a partire dai template del domain pack; l'umano corregge.

---

## 4. Input multimodale e degradazione graduale

Il sistema **non dipende dall'audio**: dipende dall'*intento*. La voce è solo una delle porte d'ingresso a un sottile *strato di intento* con front-end intercambiabili:

- **Voce** → trascrizione → pipeline AI. Per il campo, mani occupate, in movimento.
- **Testo in linguaggio naturale** → stessa pipeline AI. Fallback diretto della voce, costo zero.
- **Form guidati** → scrivono *direttamente* nelle tabelle strutturate, senza AI. Deterministici, offline-friendly.
- **Form assistiti** (AI pre-compila, l'umano conferma) e **azioni rapide**.

Conseguenza chiave: **due percorsi indipendenti verso i dati** — il percorso AI (voce/testo → estrazione) e il percorso deterministico (form → scrittura diretta). Se l'intero strato AI è giù, l'app resta un gestionale funzionante. La voce è l'ultimo strato, opzionale.

### Pipeline di estrazione (voce/testo → righe strutturate)

1. **Cattura** — audio in object storage, trascrizione, riga in `capture` (`status=pending`). La provenienza esiste prima di interpretare.
2. **Assemblaggio del contesto** — qui si vince: si passano al modello l'agenda di oggi dell'operatore (chiave di disambiguazione), i cataloghi (materiali, tipologie ore), il domain pack, e i precedenti simili via pgvector.
3. **Estrazione con output strutturato** — il modello *risolve* la frase sugli ID forniti (non genera testo libero), emettendo operazioni tipizzate con confidenza.
4. **Validazione deterministica** — schema, referenziale, regole di business. Non la fa l'LLM.
5. **Conferma proporzionale al rischio** — alta confidenza + basso rischio = applica con riscontro; ambiguo o irreversibile = una domanda mirata. Mai indovinare in silenzio su un dato fatturabile.
6. **Commit e reversibilità** — scrittura in transazione, ogni riga legata al `capture_id`. Correzioni successive rileggono il grezzo.

---

## 5. I due ruoli

**Il titolare / pianificatore** vive l'app come direttore d'orchestra: racconta la settimana, l'AI propone un'agenda già ragionata, lui negozia. (Tablet/desktop, anche voce.)

**Il tecnico** vive l'app come un collega: la mattina riceve cosa fare; a fine intervento parla o tocca, e l'AI registra. Vede una **lista piatta** delle attività di oggi, ognuna con la sua checklist — la gerarchia di progetto resta nel pannello del titolare. (Telefono, voce-centrico, offline.)

### Motore di flusso: agenda che si riempie da sola

Non usiamo il Gantt rigido a date fisse, inadatto al lavoro (informatico e non) dove le date non si conoscono. Due tipi di attività:

- **Dinamiche (fluttuanti)**: niente data, solo una **durata stimata** (`estimated_minutes`) e una posizione nella sequenza/dipendenze. Il motore le colloca *fluendo da oggi* (o dall'inizio progetto): consuma la durata della prima, poi la successiva, riempiendo il calendario in avanti, dentro l'orario di lavoro e la disponibilità delle risorse.
- **Fisse (ancore)**: hanno `scheduled_start` valorizzato — un appuntamento reale. Il motore le rispetta e fa scorrere le dinamiche *attorno* a loro.

Niente flag fissa/dinamica: la distinzione è data dal dato stesso (`scheduled_start` valorizzato ⟺ fissa). Per le dinamiche la posizione sul calendario è un **output calcolato**, non un input dell'utente, e non viene riscritta in `scheduled_start`. Quando qualcosa cambia (durata reale diversa, nuova attività, ancora spostata) tutto ciò che sta a valle **si ri-distribuisce da solo**. L'AI affina nel tempo le durate stimate dallo storico. Questo motore di flusso è più leggero del solver ottimizzante (è un passaggio in avanti) e può stare vicino all'MVP; il solver è l'enhancement sopra.

**Vincoli temporali ricchi.** Oltre a fissa/dinamica, un'attività dinamica può avere due limiti indipendenti: `earliest_start` (non può iniziare prima) e `due_by` (deve finire entro — la scadenza). Insieme formano una **finestra**; una finestra di un giorno esprime "data fissa, ora libera". Il pin è il caso degenere (finestra di un istante). Il motore colloca rispettando i limiti e, se una scadenza non è raggiungibile, **la segnala** invece di violarla: l'AI porta il conflitto al pianificatore con le opzioni (riordina, aggiungi risorse, sposta un'ancora).

### Disponibilità e orari delle risorse

Il motore di flusso non colloca nel vuoto: lavora dentro l'**orario di lavoro** e attorno alle **indisponibilità**. Tre livelli: `tenant.working_hours` è il template settimanale standard (ora locale, interpretata con `tenant.timezone`); `resource.working_hours` lo sovrascrive per la singola risorsa (part-time, mezzo a giorni alterni); `resource_availability` registra le eccezioni puntuali (ferie, fermi, straordinari). La disponibilità **effettiva** che il motore consuma è: *(override risorsa ?? orario tenant) − intervalli `unavailable` + intervalli `available`*. Quando un'attività non entra nelle finestre disponibili, il motore **lo segnala** (come per le scadenze): non comprime in silenzio.

### Pianificazione AI (negoziazione)

L'LLM è il *negoziatore*, non il calcolatore: traduce l'intento sfumato in vincoli e obiettivi pesati. Un **solver deterministico** (OR-Tools / Timefold) calcola gli orari fattibili:

- **Vincoli duri**: non-sovrapposizione risorse (già nel DB), qualifiche, dipendenze tra attività, appuntamenti fissi, orari di lavoro.
- **Obiettivi morbidi**: minimizzare spostamenti (geo), rispettare scadenze, bilanciare il carico, incastrare le manutenzioni nei buchi.

L'LLM poi *racconta e spiega* il piano, rende espliciti i compromessi e lascia all'umano il giudizio di valore. L'agenda è viva: pioggia, esaurimento materiali, manutenzioni in scadenza o nuovi vocali fanno scattare una **riprogrammazione proattiva**.

---

## 6. Autorizzazioni, ruoli e multilingua

Due impianti trasversali progettati dalla fondazione (costosi da aggiungere dopo), spediti minimali.

### Autorizzazioni (RBAC)

Tre livelli distinti, da non confondere: **platform admin** (noi, il fornitore: gestiamo i tenant, non entriamo nei dati dei clienti — campo `is_platform_admin`); **tenant admin** (dentro ogni azienda cliente, configura l'istanza e gestisce i suoi utenti: è un utente con un ruolo che concede `user:manage`/`settings:manage`); **utente** (ruoli e permessi dentro il suo tenant).

Modello: **utente → ruoli → permessi**. I permessi sono coppie `risorsa:azione` (`activity:create`, `engagement:delete`, `time_entry:read`...), definite *nel codice* e versionate con l'app; nel DB stanno ruoli e assegnazioni (`role`, `role_permission`, `user_role`). Si spediscono **ruoli di sistema** di default (Owner, Planner, Tecnico, Contabile, Sola lettura) così l'MVP funziona senza configurazione; il tenant admin può comporre ruoli custom.

Due dimensioni diverse: le **azioni** le copre l'RBAC; la **visibilità dei dati** (il tecnico vede solo le sue attività, il contabile i numeri) è una scope-rule imposta dalla **Row-Level Security di Postgres** (estensione delle policy che già isolano i tenant, via `role.data_scope` = own/team/tenant). Principio di robustezza non negoziabile: **l'autorizzazione si impone al livello dati (RLS) e API, mai solo nascondendo i bottoni in UI.**

Legame con l'AI: **l'AI agisce sempre dentro i permessi dell'utente che la invoca, non è una scorciatoia.** Il controllo cade nel livello deterministico ("l'LLM propone, il deterministico dispone"): prima di applicare le operazioni, il validatore verifica permessi e RLS. L'AI è sicura per costruzione.

### Multilingua (i18n)

Due strati. **UI**: stringhe esternalizzate in file per lingua (libreria tipo `react-i18next`), formato ICU, locale = lingua+regione. **Dati/dominio**: lo strato strutturato resta *indipendente dalla lingua* (l'operazione `close_activity` e l'ID `mat_05` sono neutri), si localizza solo ai bordi — input e presentazione — e si dice all'AI in che lingua rispondere.

Vantaggio AI-first: **gli LLM sono nativamente multilingue**, quindi la parte più dolorosa dell'i18n di un'app normale — il linguaggio libero dell'utente — qui è quasi gratis: la stessa pipeline gestisce operatori che parlano italiano, inglese o spagnolo.

**Locale supportati**, allineati ai mercati (Italia, EU, Argentina):

- **`it-IT`** — italiano, mercato di casa e lingua di partenza.
- **`en`** — inglese, lingua franca per l'ingresso nei mercati EU.
- **`es-AR`** — spagnolo rioplatense (Argentina). La *regione* conta, non solo la lingua: vocabolario e registro argentini (≠ es-ES), separatore decimale a virgola, valuta ARS, fusi orari locali. Va trattato come locale a sé, non come "spagnolo generico".

Lo schema è già i18n-friendly dove conta: `timestamptz` (UTC), quantità con unità esplicite, `tenant.default_locale` + `tenant.timezone` + `app_user.locale`, domain pack *locale-aware* (vocabolari e sinonimi per lingua, utili anche agli hint dello STT).

**Triage MVP** (vale per entrambi): si mette in piedi *la macchina* — RBAC con ruoli di default, RLS per la visibilità, stringhe esternalizzate, campi locale — ma si spedisce minimale: pochi ruoli preconfigurati e **una sola lingua attiva all'avvio (italiano)**, con `en` ed `es-AR` abilitati appena i mercati lo richiedono. Progettare robusto, spedire leggero.

### Stati ed etichette configurabili

Stessa filosofia "spina rigida, display flessibile" applicata agli stati. Due livelli: lo **stato canonico** (`canonical_state`) è l'insieme chiuso di valori che il sistema riconosce e su cui ragiona (fatturazione, agenda, AI) — non configurabile; le **etichette** (`lookup_value`) sono configurabili dall'utente con sigla, colore-ruolo, icona e ordine, e **ogni etichetta mappa obbligatoriamente su un canonico** (FK a livello DB). L'utente può creare più etichette diverse sullo stesso canonico (es. "Archiviata", "Completata", "Consegnata" → tutte `done`): per il sistema sono identiche, per lui sono tre badge diversi. Il pattern è generico e riusabile per stato attività, stato commessa, stato fase, **priorità** e altre categorie. Le label sono per-locale, agganciate all'i18n. L'AI in estrazione risolve sempre sul canonico, indipendente dalla lingua.

### Aspetto (tema e colori) — feature rimandata, agganci ora

Dark mode e personalizzazione dei colori sono **presentazione**, quasi tutta front-end: si rimandano (non sono MVP). L'unica disciplina a costo quasi-zero da prendere subito è costruire la UI con **design token / variabili CSS**, mai colori cablati nei componenti — così aggiungere tema chiaro/scuro e colori utente domani è banale. Per questo gli stati memorizzano un **`color_token`** (ruolo: `success`/`warning`/`danger`...) e non un hex grezzo: è il tema a risolverlo nel colore reale, diverso in chiaro e scuro, così i badge restano leggibili in entrambe le modalità. La preferenza di tema dell'utente sarà un campo su `app_user` quando si costruirà la feature.

### Tracciabilità e archiviazione (impianto)

Ogni tabella mutabile porta `updated_at` (trigger automatico); le tabelle di business portano `created_by`/`updated_by`, e la `capture` un `applied_by` (chi ha confermato l'estrazione, distinto da chi l'ha catturata). Per le modifiche applicate dall'AI, l'autore è l'utente per conto del quale l'AI agisce — coerente con "l'AI agisce dentro i permessi di chi la invoca". I dati di business **non si cancellano, si archiviano** (`archived_at`); le cancellazioni che azzererebbero storia fatturabile sono bloccate a livello di vincolo (`RESTRICT`). Il log d'audit completo è rimandato (backlog), ma le colonne ci sono da subito perché aggiungerle dopo perde la storia.

---

## 7. Stack tecnologico

- **Client**: Ionic + Capacitor + React — massimo riuso tra app del tecnico (mobile/PWA) e pannello del titolare (web), il più rapido ed economico per validare. *Segnale di switch*: se la robustezza voce/offline diventa il collo di bottiglia, si riscrive **solo l'app del tecnico** in React Native.
- **Database**: PostgreSQL + `pgvector` (relazionale per la spina, `jsonb` per il dominio, vettori per il semantico). Multi-tenant con Row-Level Security.
- **Sync offline**: ElectricSQL o PowerSync (Postgres → SQLite locale, replica parziale per tenant+utente). Non scrivere il sync a mano.
- **Solver di pianificazione**: Google OR-Tools (CP-SAT) o Timefold (community).
- **Backend**: Node/TypeScript (coerente con lo stack JS); orchestrazione di contesto, estrazione, solver, validazione; coda con worker per processare le catture in asincrono.
- **Storage audio**: Cloudflare R2 / S3 in cloud, MinIO on-prem.
- **AI**: API LLM lato server (modello piccolo per l'estrazione frequente, grande solo per la pianificazione complessa). STT on-device gratuito come base, STT cloud opzionale per l'accuratezza.
- **Deployment**: Docker + Compose, stesse immagini per SaaS e on-prem. L'installazione on-prem è "un deployment con un solo tenant". L'AI resta un *gateway cloud* anche per l'on-prem: protegge l'IP e garantisce ricavo ricorrente. **Niente Kubernetes** finché la scala non lo impone.
- **Autenticazione**: Supabase Auth (GoTrue) self-hosted in Docker Compose accanto al backend; utenti in Postgres, JWT asimmetrico (validabile offline sul telefono). Solo authN: l'autorizzazione resta su RBAC + RLS. Sostituibile (Keycloak) senza toccare l'authZ.

---

## 8. Costi (micro-azienda)

Quasi tutto il *software* è gratis/open source: Postgres+pgvector, Ionic/Capacitor, ElectricSQL, OR-Tools/Timefold, backend, SQLite, push.

Si paga: **API LLM** (l'unico costo che scala col successo — tenuto basso da contesto stretto e modelli piccoli), **hosting** (Supabase free tier o VPS ~5–10 €/mese), **STT cloud** (opzionale), **tasse store** (evitabili lanciando come PWA).

**Stack a costo minimo per partire**: Supabase free tier + backend economico + Ionic come PWA + STT on-device + API LLM a consumo. Realisticamente **sotto ~20–40 $/mese in fase pilota**, dominato da AI e hosting. *(I prezzi per-token cambiano: da verificare al momento della scelta.)*

---

## 9. Scope dell'MVP

### Verticale di partenza
**La nostra software house (dogfooding).** È il verticale dove abbiamo la comprensione più profonda e il feedback è immediato perché lo usiamo ogni giorno. Piscine e fotovoltaico diventano domain pack successivi.

### Ordine di costruzione (a prova di fallimento)
1. **Core deterministico + form** — l'app è già usabile e vendibile, non dipende da nulla di fragile.
2. **Estrazione da testo in linguaggio naturale** — la pipeline completa, validata su testo.
3. **Voce** — strato finale, da validare con calma.

### Dentro l'MVP (v1)
- Multi-tenant con un tenant attivo (la nostra azienda).
- Entità core: customer, asset, engagement, phase, activity, resource, time_entry, material, capture.
- Creazione progetto da template + scomposizione editabile (AI assistita).
- Agenda settimanale con assegnazione risorse e vincolo anti-doppia-prenotazione.
- Rendicontazione ore e materiali via **form** e via **linguaggio naturale testuale**.
- Lista piatta delle attività di oggi per l'operatore, con checklist.
- Riepiloghi in linguaggio naturale (l'AI legge i dati strutturati e racconta).
- Funzionamento offline base con sync.
- RBAC con ruoli di sistema predefiniti + RLS per la visibilità dei dati (impianto completo, configurazione minima).
- Impianto i18n pronto (stringhe esternalizzate, campi locale, storage canonico); **attiva solo l'italiano** all'avvio, `en`/`es-AR` abilitabili.
- **Timeline/storico dell'asset** ("il libretto"): vista in lettura che raccoglie commesse, attività, ore, materiali e catture di un asset (dati già collegati; nessuna tabella nuova). L'AI può raccontarla in NL.
- **Ricerca semantica** sul lavoro passato come *infrastruttura* (già usata per il contesto dell'estrazione via `pgvector`); l'interfaccia di ricerca lato utente è un fast-follow leggero.
- **Disponibilità risorse**: orari del tenant + indisponibilità, su cui poggia il motore di flusso.

### Fuori dall'MVP (rimandato)
- Voce (subito dopo la v1).
- Solver di pianificazione avanzato con ottimizzazione geografica (in v1 basta assegnazione manuale + rilevamento conflitti).
- Riprogrammazione proattiva (meteo, scorte).
- Mezzi pesanti e dimensioni di verticali diversi dal nostro.
- Foto/OCR, fatturazione, integrazioni esterne, on-prem.
- Portale cliente esterno (agganci dati già predisposti: `app_user.company_id`, ruolo "Cliente esterno").

> Il catalogo completo di tutto ciò che è rimandato — con agganci e costo di retrofit — è in **`BACKLOG_futuro.md`**, che è la fonte di verità da aggiornare a ogni rinvio.

---

## 10. Roadmap indicativa

- **Fase 0 — Fondamenta**: schema su Postgres, multi-tenant/RLS, scheletro backend, scheletro Ionic, Docker Compose.
- **Fase 1 — Core deterministico**: CRUD entità, agenda, form di rendicontazione, lista operatore + checklist, sync offline base.
- **Fase 2 — Linguaggio naturale (testo)**: pipeline capture→contesto→estrazione→validazione→commit; riepiloghi in uscita.
- **Fase 3 — Voce**: registrazione, STT, cattura-prima/elabora-dopo; hint di vocabolario dal domain pack.
- **Fase 4 — Validazione sul campo**: uso reale interno, raccolta correzioni (chiude il ciclo di apprendimento), misura delle metriche.

---

## 11. Rischi e mitigazioni

- **Affidabilità dell'estrazione** → il valore dipende dal contesto, non dal modello: investire sull'assemblaggio (agenda + cataloghi + precedenti); validazione deterministica; astensione (`clarify`) di prima classe.
- **Voce in ambiente rumoroso / offline** → cattura-prima/elabora-dopo; fallback su testo e form; hint di vocabolario.
- **Costo AI che scala** → modelli piccoli per l'alta frequenza, contesto stretto, caching.
- **Over-engineering della gerarchia** → albero poco profondo, regola delle foglie, niente sotto-attività.
- **Sync offline** → usare un motore dedicato (ElectricSQL/PowerSync); il design capture-first rende le scritture dell'operatore quasi append-only, quindi senza conflitti.
- **Lock-in** → tutto open source e Postgres ovunque; nessun fornitore obbligato.

---

## 12. Metriche di successo dell'MVP

La tesi è validata se, sul nostro uso reale:

- la **quota di rendicontazioni catturate in linguaggio naturale** (vs form) cresce nel tempo;
- il **tempo medio per registrare** un intervento cala in modo netto rispetto a oggi;
- l'**accuratezza dell'estrazione** (operazioni applicate senza correzione) supera una soglia accettabile e migliora con le correzioni accumulate;
- gli operatori **adottano** lo strumento spontaneamente invece di rimandare la rendicontazione a fine giornata.

---

## 13. Licenze, abilitazione e fatturazione SaaS

Sottosistema commerciale: come *abilitiamo* (licenze/entitlement) e come *fatturiamo* i tenant (≠ i tenant che fatturano i loro clienti). Scelte tarate su una micro-azienda con pochi clienti che cresce piano.

**Modello di fatturazione: flat per azienda a fasce** (Trial → Basic → Pro), non per-seat né ibrido all'avvio. È il più semplice da costruire e vendere, prevedibile per il cliente. Il rischio sui margini AI è neutralizzato da una **quota AI dentro gli entitlement di ogni piano** (un tetto), non dalla fatturazione a consumo. I ganci per l'ibrido ci sono già: il consumo si conta dagli eventi `capture`, quindi aggiungere l'overage domani è semplice.

**Provider: Italia-first (auto-fatturazione + SDI).** Vendendo all'inizio solo in Italia, a aziende italiane, *non* serve un Merchant of Record: il MoR risolverebbe il fisco estero (che non abbiamo) e creerebbe attrito sulla **fattura elettronica via SDI** (i clienti B2B italiani vogliono una fattura con la nostra P.IVA, detraibile). Quindi: **fatturiamo noi**. Incasso con un provider di pagamenti (Stripe con carta o SEPA Direct Debit; con pochi clienti anche bonifico); **fattura elettronica via SDI** con strumenti italiani (Fatture in Cloud, Aruba, o il commercialista). Stripe gestisce il ciclo dell'abbonamento (webhook → entitlements), la fattura esce dal canale SDI. Il MoR (Paddle/Lemon Squeezy) si rivaluta *solo* se e quando si vende davvero internazionale. *Argentina*: percorso localizzato a parte — Mercado Pago + fattura elettronica AFIP. Lo schema è provider-agnostico: regge tutti questi casi senza modifiche.

**Abilitazione (entitlements).** `plan` porta gli entitlements di default (limiti + feature: `max_users`, `verticals`, `ai_quota_month`, `features`); `subscription` lega il tenant al piano con stato e scadenze, più eventuali override. Il **gating è al livello API, separato dall'RBAC**: l'RBAC dice cosa può fare l'utente col suo ruolo, l'entitlement cosa permette il piano del tenant. Per l'**on-prem**, una licenza firmata (token con entitlements + scadenza) validata localmente, con check-in periodico sullo stesso canale del gateway AI.

**Avvisi di scadenza.** Job schedulati che leggono `trial_ends_at` / `current_period_end` e notificano a 30/7/1 giorni, alla scadenza e in periodo di grazia — sia al tenant admin (rinnova) sia a noi (churn/scadenze).

**Cosa è MVP e cosa no.** Dentro: il modello dati (`plan` + `subscription` + entitlements) con default "trial/tutto abilitato", il gating, e il meccanismo di avvisi. Fuori (fast-follow): l'integrazione webhook del provider, la fatturazione a consumo/ibrida, e il sottosistema notifiche su cui poggiano gli avvisi.

---

## 14. Decisioni aperte e raccomandazioni (da confermare insieme)

Sintesi di tutti i nodi ancora aperti, con la raccomandazione proposta. Da rivedere e decidere nella prossima passata.

**1. Verticale di partenza.** → ✓ *Deciso: dogfood sulla nostra software house; piscinaio come primo pilota pagante subito dopo.* Separa la validazione **tecnica** (interna, gratis, dominio che conosciamo meglio) da quella di **mercato** (esterna, pagante): servono entrambe.

**2. Ordine di costruzione.** → ✓ *Deciso: core deterministico → estrazione da testo NL (prova della tesi) → voce (ultima, additiva).* Così il "wow" non slitta in fondo: il testo NL dimostra "linguaggio → dati strutturati" senza la fragilità dell'audio.

**3. Pianificazione v1 senza solver.** → *Confermo il taglio.* La v1 va con assegnazione manuale + rilevamento conflitti (vincolo a livello DB) + agenda narrata dall'AI. Non doppio-prenotare e vedere la settimana coerente è già valore rispetto al caos attuale. *Segnale di anticipo*: se in uso reale l'assegnazione manuale risulta troppo onerosa, il solver sale in cima alla v2.

**4. Motore di sync offline.** → *PowerSync* per l'MVP: sincronizzazione bidirezionale e coda di upload offline già pronte — l'operatore crea catture e ore offline che devono risalire, e non vogliamo scrivere il write-path a mano. *ElectricSQL* resta l'alternativa open/self-host se il "nessun fornitore" diventa requisito duro (ma il percorso di scrittura è fai-da-te). Da **verificare lo stato attuale** prima di bloccare: sono progetti in rapida evoluzione.

**5. Solver di pianificazione.** → *Decisione rimandata: è post-MVP, non va presa ora* (è la trappola dell'ingegnere). Quando servirà: tendenza verso **Timefold** (il problema combacia col suo dominio planning/rostering/routing), **OR-Tools** se servirà controllo combinatorio molto custom. In entrambi i casi gira come servizio separato (coerente con Docker), chiamato dal backend.

**6. Ruoli di default (verticale software).** → bozza proposta:

| Ruolo | data_scope | Permessi (sintesi) |
|---|---|---|
| **Owner** (tenant admin) | tenant | tutto, incl. `user:manage`, `settings:manage`, `role:manage` |
| **Planner** | tenant | engagement/phase/activity create-read-update, `resource:assign`, lettura ore/materiali; niente gestione utenti/impostazioni |
| **Tecnico** | own | lettura/aggiornamento delle *proprie* attività e checklist, `capture:create`, `time_entry:create`, `material_consumption:create`; niente delete, niente dati altrui |
| **Contabile** | tenant | lettura engagement/ore/materiali/asset/clienti + export; nessuna modifica operativa |
| **Sola lettura** | tenant | solo lettura |

(Seminati come ruoli di sistema nello schema; i grant dei permessi avvengono al bootstrap dell'app dal catalogo definito nel codice.)

**7. Domain pack es-AR.** → *Pianificare la traduzione dei vocabolari di dominio* (non solo la UI) quando l'ingresso in Argentina si concretizza. Non blocca l'MVP, ma l'argentino va trattato come locale a sé (registro rioplatense, formati, valuta), e questo include il dizionario che l'AI usa per estrarre e i sinonimi per gli hint dello STT.

**8. Provider di autenticazione.** → ✓ *Risolto: **Supabase Auth (GoTrue)**, open-source e self-hostable (gira on-prem con le stesse immagini Docker).* RBAC ≠ login: il provider copre solo l'authN ("chi sei"); l'authZ (RBAC + RLS + entitlement) resta nostro. Seam: `app_user.auth_user_id` (UNIQUE, nullable) lega l'identità esterna verificata; nessuna credenziale in `app_user`. JWT asimmetrico → validabile offline. Via di fuga documentata se servirà SSO enterprise: Keycloak (lo switch è a basso costo grazie al seam pulito).

> **Stato decisioni.** Chiuse: #1 (verticale), #2 (ordine di costruzione), #3 (pianificazione v1 senza solver), #8 (autenticazione). Restano aperte, **post-MVP**: il **motore di sync offline** (PowerSync vs ElectricSQL) e il **solver** (Timefold vs OR-Tools) — entrambi da decidere verificando lo stato attuale delle tecnologie.

---

*Fine v0.2.1 — allineato a schema, RLS e permessi.*
