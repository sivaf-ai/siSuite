# BRIEF operativo per Claude Code — Moduli POWERCOM (Ordinativi FTTH · Seriali · Produzione)

> **Questo è il documento di riferimento. Leggilo tutto prima di scrivere codice.** È autosufficiente: contiene contesto, regole, contratti dei componenti, i campi schermo per schermo e il piano di lavoro. I file citati (ADR, `base.css`, mockup, `field_definition.sql`, `FRONTEND_SPEC.md`) sono la **verità di dettaglio** e vanno aperti, ma le decisioni e le priorità stanno qui.
>
> Lingua: **italiano** per UI, testi e commenti; **inglese** per gli identificatori di codice. Chat di provenienza: 01.03 · Giugno 2026. Questo brief **supera e ingloba** il vecchio `2026-06-16_kickoff_Claude_Code_powercom`.

---

## 0. Come voglio che tu lavori

- **In autonomia, a blocchi logici.** Ogni blocco si chiude con un **test funzionale reale** (non solo "compila") e con un report `DONE_<blocco>.md` che elenca: cosa hai fatto, come l'hai verificato, cosa resta aperto, eventuali deviazioni dal brief e perché.
- **Niente review passo-passo.** Ricardo rivede i risultati dei blocchi, non ogni riga. Quindi i `DONE_*.md` devono essere onesti e completi.
- **Chiedi PRIMA di inventare.** Se un dettaglio è ambiguo o manca, **fai una domanda mirata** (raccolta in fondo nel §12) invece di tirare a indovinare. Non proseguire su assunzioni silenziose. Ma: dove il brief è chiaro, **procedi** senza chiedere conferme superflue.
- **I mockup sono target vincolanti, non ispirazione.** Se il tuo output non somiglia al mockup di riferimento, è sbagliato. L'errore storico da non ripetere: privilegiare l'infrastruttura backend e consegnare un frontend generico, con campi mancanti e stile incoerente. **La fedeltà visiva e la completezza dei campi vengono prima.**
- **Checkpoint obbligatorio:** dopo la **prima** maschera "metro" (Ordinativi FTTH, lista + scheda completa), **fermati e mostra** prima di replicare il pattern sulle altre. Aspetta l'ok di Ricardo.
- **JOURNAL:** se lavori in parallelo ad altre chat/sessioni, annota su `JOURNAL` quali migrazioni/moduli stai toccando, per evitare collisioni.

---

## 1. Contesto e stack (cosa stai costruendo)

siSuite è un SaaS **AI-first, mobile-first, multi-tenant** per la gestione di commesse e attività sul campo. Verticale attivo ora: **fibra (FTTH)**, primo cliente **POWERCOM** (installazioni FTTH). Modello di dominio generale già in piedi:

```
engagement (commessa) → phase (fase/WBS, annidabile) → activity (attività/visita) → resource / time / material
```

Stack (già scelto, non discuterlo):
- **Frontend:** Ionic + Capacitor + **React** + Vite, TypeScript strict. Icone **lucide-react**. Grafici **recharts**. Design system in `base.css` v5. La stessa app gira in browser a larghezza "telefono" (per demo su PC senza secondo dispositivo).
- **Backend:** Node 20 + TS strict + **Fastify** + **Zod** + **Drizzle ORM** + node-postgres. Code/queue **pg-boss**. Storage **MinIO**. Auth **GoTrue (Supabase Auth)** solo per authN.
- **DB:** PostgreSQL 16 + pgvector + btree_gist + pgcrypto. Multi-tenant con **RLS**. Monorepo **pnpm**. Tutto in Docker.
- **Convenzione migrazioni del repo:** file `NNN_nome.sql`, tracciati nella tabella `sisuite_migrations(filename)`. **Non** usare il prefisso Flyway `V__`.

---

## 2. Prerequisito: database

Applica **in quest'ordine** le migrazioni già pronte in `migrations/` (immutabili dopo merge):

1. `024_serial_inventory.sql` — `material.tracked_by_serial` + tabella `stock_serial_unit`.
2. `025_work_orders.sql` — `work_order`, `work_order_subject` (PII), `work_order_item`; link seriali/movimenti.
3. `026_price_list.sql` — `price_list`, `price_list_item`, `price_list_override`.
4. `027_production_accounting.sql` — `phase.wbs_code`, `work_line`, `work_line_measure`, `equipment_usage`, `subcontract_line`, vista `job_cost_ledger`.
5. `028_seed_powercom_lookups.sql` — stati ordinativo, tipi di costo, numerazione `work_order`.

Dopo l'applicazione:
- **Verifica RLS**: con due tenant diversi, una query su `work_order` deve restituire solo le righe del tenant corrente (usa gli helper esistenti `app_current_tenant()`, `app_sees_whole_tenant()`, `app_current_user()`, `app_data_scope()`, `app_current_company()`).
- **Rigenera** il documento schema con `pg_dump --schema-only` e sostituisci il riferimento in `docs/`.
- **Non** modificare le migrazioni 024–028; se serve un aggiustamento, crea `029_...` nuova.

---

## 3. Principi non negoziabili (valgono per tutto)

1. **L'AI propone, il deterministico dispone.** L'AI (cattura vocale/testo) produce sempre una **proposta strutturata** che l'utente rivede e conferma; solo allora un **layer deterministico** scrive nel DB. L'AI **non scrive mai direttamente** nel database. La chiave API dell'AI è un **segreto di piattaforma, lato server**, con quota per tenant/piano. Mai chiave lato client.
2. **Campi guidati da metadati.** I form non si inventano: i campi (colonne schema **+ chiavi in `attributes` jsonb**) sono definiti in `field_definition.sql`. La stessa definizione guida **sia** la validazione **Zod** **sia** il rendering di `EntityForm`. Se un campo manca in `field_definition`, aggiungilo lì, non hardcodarlo nella UI.
3. **Autorizzazione su tre assi indipendenti — non confonderli mai:**
   - **RBAC** (azioni permesse al ruolo, es. `pii.read`),
   - **entitlement di piano** (cosa il piano del tenant abilita),
   - **`data_scope`** (quali righe l'utente può vedere).
   Il menù **nasconde** per licenza+RBAC, ma **la barriera di sicurezza è il backend** (controllo su ogni endpoint), non la UI.
4. **PII protetta.** I dati dell'intestatario (`work_order_subject`) sono **mascherati di default**, in chiaro solo con permesso `pii.read`, **mai loggati**. La password apparato (`stock_serial_unit.secrets`) è cifrata, gated da `serial.secret.read`, mai mostrata senza sblocco esplicito.
5. **ID visibili sempre da `number_series`** (es. `work_order` → `2026-0042`). Gli UUID **non si mostrano mai** in UI.
6. **Solo design token.** Niente colori hardcodati: usa le variabili di `base.css`. Niente etichette di stato hardcodate: vengono da `lookup_value` (rinominabili per tenant via `lookup_override`).
7. **Prezzo "più specifico".** La risoluzione del prezzo di una voce segue: **override di commessa › override di gestore › prezzo base**. Implementa la funzione **una volta** e riusala (lavorazioni, preventivi, pivot).
8. **Tipo di costo dedotto dalla fonte** (ore=labor, materiali=material, mezzi=equipment, subappalti=subcontract, lavorazioni=production). Non aggiungere un campo "tipo" da compilare a mano.

---

## 4. Standard UI vincolanti (riassunto operativo — non andare a memoria)

Apri `base.css`, `41_web_aziende_standard.html` (Lista & Scheda), `42_web_ddt_carico.html` (Documento), `43_web_menu_due_livelli.html` (Menu) e i mockup 44–50. Qui il minimo che **devi** rispettare:

**Tre archetipi, una Lista e una Scheda per entità (riusate ovunque, anche in selezione pop-up):**
- **Lista (List Report):** titolo + viste su una riga; toolbar con **bottoni a sole icone + tooltip**; ricerca che si espande; gruppi azioni a destra con **Nuovo `+` per ultimo**; selezione = **solo un numero** (niente icone-azione sulle righe); righe a **2 livelli** per entità ricche (dato primario sopra, collegato sotto in corsivo), a **1 livello** per griglie numeriche.
- **Scheda entità (Object Page):** **una sola pagina** per crea+vedi+modifica; **header sticky opaco** (nessun gap) con **solo Salva/Annulla** (Duplica/Elimina stanno nella Lista, non qui; niente dati del record ripetuti nell'header); **label e titoli box nel bordo** (statici, non floating); griglia densa, campi affiancati; validazione = **bordo rosso + messaggio dentro il campo**; tabelle correlate come **strip di tab in fondo**; azioni AI contestuali nel bordo del box; tooltip su tutte le icone.
- **Documento (master-detail):** solo per documenti veri (DDT, fatture, **rapportino**): testata + righe.

**Navigazione (menu a 2 livelli, modello SAP Fiori):** rail L1 (collassabile a icone) + sub-panel L2 (voci della sezione attiva, raggruppate). **Niente terzo livello. Max 2 click.** Una sola rotta canonica per entità; i link cross-modulo usano `↪` verso la stessa rotta. **Omnibox ⌘K** = ricerca + barra comandi AI. **Sibling tab bar** in cima alla pagina per spostarsi tra entità sorelle.

**Densità:** 3 varianti (Compatta/Comoda/Spaziosa) via `data-density` su `<html>`, salvata per utente, default **Comoda**; il selettore sta **solo in Impostazioni**.

**Tipografia:** H1 22px · sezione 16 · card 15 · body/cella 13 · header tabella 11.5 (sentence-case) · eyebrow 10.5 (solo maiuscolo).

**Numeri:** sempre **allineati a destra**, decimali allineati, cifre tabellari (mono `tnum`), separatore migliaia + 2 decimali di default. Unità non monetarie nell'**header di colonna**, celle pulite. **Valuta contabile**: simbolo a sinistra, numero a destra. **Durata** = "Ore (h:mm)" → `4:30`; **orario** = "Orario" 24h → `09:45`.

**Naming entità:** **Aziende** (company) con ruoli Cliente/Fornitore/Partner/**Gestore**; "Clienti"/"Fornitori"/"Gestori" sono **viste filtrate** della stessa lista.

---

## 5. Componenti condivisi — costruiscili UNA volta, poi riusa

Estraili dai mockup 44–50. Contratti:

- **`AppShellNav2`** — shell: rail L1 collassabile + sub-panel L2 + omnibox ⌘K + sibling tab bar. La voce **Campo → Ordinativi (FTTH)** e **Magazzino → Articoli & seriali** sono già nella mappa del menu (`43`). Le voci si nascondono per licenza+RBAC.
- **`EntityList`** — props chiave: `mode = 'manage' | 'pick-single' | 'pick-multi'`, `columns`, `views`, `rowLevels: 1|2`, `onSelect`. Toolbar a icone con tooltip; selezione mostrata come numero; **nessuna** icona-azione sulle righe. In `pick-*` la stessa lista vive in un pop-up (rif. 41).
- **`ObjectPage`** — header sticky opaco con Salva/Annulla; slot per box (`ObjectBox`) con titolo nel bordo e azione AI nel bordo; tabelle correlate come `RelatedTabs` in fondo. Gestisce gli stati crea/vedi/modifica in un'unica pagina.
- **`EntityForm`** — renderizza i campi **da `field_definition`** (schema + `attributes`), con Zod generato dalla stessa fonte. Validazione inline dentro il campo.
- **`DocumentPage`** — archetipo Documento: testata + sezioni di righe a tab (usato dal Rapportino).
- **`CaptureBarAI`** — barra cattura (vedi §7): microfono/area testo → proposta strutturata → review → applica. Riusabile in Ordinativo e Rapportino.
- **`MaskedField` / `PiiGate`** — campo mascherato con bottone "Mostra" gated da permesso (`pii.read`, `serial.secret.read`); non logga mai il valore in chiaro.
- **`StatusPill`** — pill colorata da `lookup_value` (mai etichette hardcodate).
- **`PivotTable`** — griglia ad albero espandibile con totali e barre margine (rif. 47), alimentata da `job_cost_ledger`.
- **`resolvePrice(item, {engagement, company})`** — funzione unica per il prezzo "più specifico".
- **`MoneyCell` / `NumberCell` / `DurationCell`** — formattazione numeri/valuta/durata secondo lo standard §4.

---

## 6. Le maschere — in ordine, con i campi schermo per schermo

> Per ogni entità: i **campi scheda** sono colonne schema + chiavi `attributes` (queste ultime guidate da `field_definition`). Il mockup indicato è la **verità visiva**.

### PRIORITÀ 1 — Magazzino + Ticket (urgenza POWERCOM, è il meet)

#### 6.1 Ordinativi FTTH — *mockup `44` (faro)*  ⭐ maschera "metro": falla per prima e fermati
**Entità:** `work_order` (+ `work_order_subject`, `work_order_item`, `stock_serial_unit`).
**Lista** — righe a 2 livelli. Viste: **Tutti · Da assegnare · In lavorazione · Completati · KO**.
Colonne: `Ordinativo` (code mono) + `ID gestore` (operator_order_id, sotto); `Intestatario` (**mascherato**) + `Indirizzo` (address); `Stato` (StatusPill da `work_order_status`) + `Squadra` (assigned_resource); `Apparati` (installati/previsti, num); `Pianificato` (scheduled_on).
Toolbar: ricerca · Filtri · Colonne · Azioni AI · | · **Importa CSV** (da portale gestore) · Assegna a squadra · Esporta · Elimina · **Nuovo +**.
**Scheda** — header sticky: back, titolo, `code` (pill verde), StatusPill, Salva/Annulla. In testa **`CaptureBarAI`**. Box:
- **Pratica:** `operator_company_id` (Gestore, select da Aziende ruolo Gestore), `operator_order_id` (ID gestore), `code` (read-only da number_series), `status_id` (select da lookup), `assigned_resource_id` (Squadra), `scheduled_on` (date picker, no testo libero).
- **Intestatario · dati protetti** (`work_order_subject`, `MaskedField`+`PiiGate`): `full_name`, `phone`, `phone_alt`, `email`, `fiscal_code`, `address`. Nota privacy in fondo al box.
- **Indirizzo di attivazione:** `address` del work_order (+ eventuale `geo`).
- `attributes` fibra (da `field_definition`): `connection_type`, `socket_id`, `attenuation_db`, `ont_serial`, `work_order_ref`.
Tab correlate in fondo: **Apparati pianificati** (`work_order_item`: material, planned_qty, note) · **Seriali installati** (`stock_serial_unit`: serial, stato, ubicazione/installato, **password mascherata**) · **Materiali** (`material_consumption` con `work_order_id`) · **Foto** (`capture`) · **Storico**.
Regole: codice da `number_series` key `work_order`; UNIQUE su (tenant, operator_company, operator_order_id) → in import segnala i doppioni; PII mascherata.

#### 6.2 Articoli & seriali — *mockup `45`*
**Entità:** `material` (+ `stock_serial_unit`).
**Lista** — righe 2 livelli. Viste: **Tutti · A magazzino · A seriale · Servizi · Scorta bassa**.
Colonne: `Articolo` (name) + `SKU` (mono); `Categoria` + tracciamento (tag: a seriale / a magazzino / servizio); `Giacenza` (num, unità in header) ; `Costo medio` (valuta contabile, da `default_cost`); `Stato`.
**Scheda** — Box **Anagrafica** (`name`, `sku`, `unit`, `category`, `Tipo` Articolo/Servizio, codice fornitore) · Box **Magazzino & tracciamento** (`track_stock`, `tracked_by_serial`, `tracked_by_lot`, `costing_method`, `default_cost`, scorta minima, giacenza totale).
Tab correlate: **Unità seriali** (`stock_serial_unit`: serial, stato `in_stock/assigned/installed/faulty/returned/retired`, dove si trova **oppure** installato presso + ordinativo, aggiornato) — le righe con stato `installed` **sono** il parco installato · **Giacenze per ubicazione** · **Movimenti** · **Documenti**.

#### 6.3 Allineamenti (riusando lo shell di 44/45 — *mockup da creare tu*)
- **Magazzino**: Giacenze / Movimenti / Inventario (base `29`).
- **Documenti di magazzino**: DDT / Scarico / Trasferimento / Rettifica come archetipo **Documento** (base `42`, varianti di `stock_document`). Lo scarico su un ordinativo genera i `stock_movement` con `work_order_id`.
- **Ordinativi legacy** (`40`) → **sostituito da `44`**, non riproporlo.

### PRIORITÀ 2 — Produzione / Contabilità

#### 6.4 Listino voci di capitolato — *mockup `46`*
**Entità:** `price_list_item` (+ `price_list`, `price_list_override`).
**Lista** — selettore listino (`price_list`, default = base). Viste: **Tutte · Per categoria · Con ritocchi · Disattivate**.
Colonne: `Voce` (description) + `code` (mono); `Categoria` + unità; `Costo` (valuta); `Ricavo` (valuta); `Margine %` (calcolato); `Ritocchi` (conteggio override).
**Scheda** — Box **Voce** (`code`, `description`, `unit`, `category`, `cost_price`, `revenue_price`, margine calcolato). Tab **Ritocchi (override)**: righe `price_list_override` (ambito company **o** engagement, costo, ricavo, validità) con etichetta "più specifico"; Tab **Storico prezzi**; Tab **Lavorazioni che la usano**. Mostra esplicito che la regola è **commessa › gestore › base**.

#### 6.5 Lavorazioni + libretto misure — *mockup `49`*
**Entità:** `work_line` (+ `work_line_measure`).
**Lista** (per commessa) — Viste: **Tutte · Per fase · Con libretto · Da cattura vocale**. Colonne: `Voce` (da price_list_item) + code; `Fase/WBS` + data; `Quantità` (num) + unità + nota "da libretto"; `Ricavo` (valuta); `Origine` (voce/manuale).
**Scheda** — Box **Lavorazione** (`price_list_item_id` select, `phase_id` (WBS), `occurred_on`, `quantity` **read-only se da libretto**, `cost_price`/`revenue_price` fotografati con `resolvePrice`, ricavo calcolato). Tab **Libretto misure** (`work_line_measure`: label, formula testuale es. `24 × 1,00`, value; **riga totale** = quantità). `attributes` (es. `competenza`, `area_cavo`) da `field_definition`.

#### 6.6 Rapportino esteso — *mockup `48`* — archetipo **Documento**
**Entità testata:** un `work_report` (se non esiste, crealo: tenant, engagement_id, phase_id, occurred_on, resource/squadra, meteo, status; **chiedi in §12** se preferisci riusare `activity`). **Righe per sezione:** Manodopera (`time_entry`) · Attrezzature (`equipment_usage`) · Materiali (`material_consumption`) · Subappalti (`subcontract_line`) · Lavorazioni (`work_line`) · Foto (`capture`).
In testa **`CaptureBarAI`** (detta la giornata → propone le righe). Striscia totali: costi / ricavi / margine della giornata. Il **tipo di costo** è dedotto dalla sezione.

#### 6.7 Preventivo–consuntivo (pivot) — *mockup `47`*
**Fonte:** vista `job_cost_ledger` (colonne: tenant_id, engagement_id, activity_id, phase_id, cost_type, price_list_item_id, quantity, unit, cost_amount, revenue_amount, occurred_on).
KPI in testa (ricavi, costi, margine, margine %). `PivotTable` ad albero **Commessa › Fase/WBS › Voce**, con sottototali e barre margine; etichette/colori del tipo da `lookup_value('cost_type')`. Azioni: **Esporta Excel** e **Esporta per CPM**. La manodopera è già valorizzata dalla vista (tariffe su `time_entry`); i materiali con `default_cost`.

---

## 7. Il flusso `CaptureBarAI` (cattura → proposta → applica) — il cuore

1. **Cattura:** l'utente detta o scrive in linguaggio naturale (es. «montato ONT 7741, una borchia, attivazione ok»). La traccia/testo si salva in `capture`.
2. **Proposta (AI, lato server):** un endpoint chiama l'LLM (chiave server-side, quota per tenant) e restituisce una **proposta strutturata** = un *diff* di operazioni candidate (es. *aggiungi seriale ON…7741 all'ordinativo*, *imposta stato = done*, *aggiungi lavorazione B-1.1 × 40 m*). Mai scrivere nel DB qui.
3. **Review:** la UI mostra la proposta come righe **accettabili/modificabili/rifiutabili** (il mockup mostra "Rivedi proposta"). L'utente corregge.
4. **Applica (deterministico):** solo dopo conferma, il layer deterministico valida (Zod) e scrive (Drizzle) con audit; collega `source_capture_id` dove previsto (es. `work_line`).
5. **Racconto:** lo stato aggiornato è leggibile in linguaggio naturale (riassunto commessa/ordinativo).
Vincoli: idempotenza dell'apply; nessun dato PII nei log; quota AI applicata prima della chiamata.

---

## 8. Dati demo (pacchetto fibra) — serve per il meet

Crea un **seed pack "fibra"** caricabile/scaricabile, isolato per tenant: 1 gestore (Sirti) + 1 commessa («Napoli Est 2026») con 2–3 fasi/WBS; ~15 articoli (di cui ONT/borchia/splitter **a seriale**, cavo a magazzino, 1 servizio); ~30 ordinativi su vari stati (con intestatari **fittizi**); qualche seriale installato (parco installato); un listino base con 1–2 ritocchi Sirti; 1 rapportino compilato; dati sufficienti perché la **pivot** mostri un margine credibile. Loader/unloader idempotenti.

---

## 9. Piano di lavoro a blocchi (con test funzionali)

- **Blocco A — Fondamenta UI.** `AppShellNav2`, `EntityList`, `ObjectPage`, `EntityForm` (da `field_definition`), `StatusPill`, `MoneyCell/NumberCell/DurationCell`, `MaskedField/PiiGate`. *Test:* navigazione 2 livelli a max 2 click; una lista demo che apre una scheda; densità che cambia da Impostazioni.
- **Blocco B — Ordinativi FTTH (maschera metro).** Lista + Scheda complete (6.1), import CSV, PII mascherata, seriali installati. *Test:* crea→leggi→modifica→lista→pick; numerazione `2026-NNNN`; PII in chiaro solo con `pii.read`; RLS isola due tenant. **→ STOP e mostra a Ricardo.**
- **Blocco C — Articoli & seriali** (6.2) + ciclo di vita seriale + parco installato. *Test:* un seriale passa `in_stock→assigned→installed` e compare nel parco installato dell'indirizzo.
- **Blocco D — Listino + `resolvePrice`** (6.4). *Test unitario:* la risoluzione restituisce override commessa › gestore › base sui casi limite.
- **Blocco E — Lavorazioni + libretto** (6.5). *Test:* somma delle misure = quantità; ricavo = quantità × prezzo risolto.
- **Blocco F — Rapportino (Documento)** (6.6) + `CaptureBarAI` end-to-end (§7). *Test:* dettato → proposta → review → apply scrive le righe giuste; nessun PII nei log.
- **Blocco G — Pivot preventivo-consuntivo** (6.7) + export. *Test:* i totali pivot coincidono con la somma di `job_cost_ledger` per commessa.
- **Blocco H — Allineamenti magazzino/DDT** (6.3) + **seed pack fibra** (§8). *Test:* demo end-to-end su dati seed.

Ogni blocco → `DONE_<blocco>.md`.

---

## 10. Definition of Done (vale per ogni maschera)

Fedeltà al mockup di riferimento · tutti i campi previsti presenti (schema + `attributes` da `field_definition`) · RBAC applicato su **UI e API** · entitlement di piano e `data_scope` rispettati · stati **vuoto / caricamento / errore** · responsive **desktop + mobile** (gira a larghezza telefono in browser) · densità via `data-density` · numeri tabellari a destra · valuta contabile · durata `h:mm` · ID visibili da `number_series` · etichette stato da `lookup_value` · colori e spaziature **solo da token** · icone lucide · tooltip su tutte le icone · nessun PII/segreto loggato.

---

## 11. Cosa NON fare

- Non privilegiare il backend a scapito della fedeltà del frontend (errore storico).
- Non inventare campi, stili, colori, etichette o ID: vengono da `field_definition`, `base.css`, `lookup_value`, `number_series`.
- Non far scrivere l'AI direttamente nel DB; non mettere la chiave AI lato client.
- Non mostrare UUID, non mostrare PII/password senza permesso, non loggarli.
- Non clonare le parti normate di TeamSystem CPM (SAL, certificati di pagamento, giornale dei lavori, prezzari DEI, BIM): restano a CPM, noi facciamo il **ponte export**.
- Non confondere i tre assi di autorizzazione (RBAC ≠ entitlement ≠ data_scope).
- Non riproporre la maschera Ordinativi legacy `40`.

---

## 12. Domande da chiarire PRIMA di partire (rispondi qui, non indovinare)

1. **Rapportino:** creo una tabella testata dedicata `work_report`, oppure la testata è un `activity` (tipo "rapporto") con le righe collegate? (Io propendo per `work_report` dedicata; conferma.)
2. **Import CSV ordinativi:** esiste un tracciato/colonne standard del gestore Sirti da mappare, o definisco io un mapping configurabile?
3. **GoTrue:** il wiring auth (deploy GoTrue, callback, provisioning `app_user.auth_user_id` al primo login) è già fatto o lo includo in un blocco a parte?
4. **Cifratura `secrets` seriale:** uso `pgcrypto` lato DB o cifratura applicativa con chiave gestita dal backend? (Io propendo per applicativa.)
5. **Export CPM:** formato file atteso da TeamSystem CPM (CSV/Excel con quali colonne)? Se non disponibile ora, parto con un Excel "consuntivo per WBS/voce" generico.

> Procedi così: leggi questo brief, poni le domande del §12 se bloccanti, parti dal **Blocco A**, poi la **maschera metro (Ordinativi)** e **fermati**. Buon lavoro.
