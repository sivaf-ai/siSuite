# BRIEF MASTER — siSuite · Moduli POWERCOM (documento unico per Claude Code)

> **Questo è l'UNICO documento da seguire.** Sostituisce e ingloba: il vecchio kickoff, il `BRIEF_…v1`, la `RISPOSTA_review_bloccoB`, lo `SPEC_bloccoC`. Se trovi quei file, ignorali: vale questo.
> Resta **materiale di riferimento** (verità di dettaglio, da aprire ma non da reinterpretare): `base.css`, i mockup `44..50` (+ `41` lista/scheda, `42` documento, `43` menù), `field_definition.sql`, gli ADR, lo schema rigenerato `2026-06-16_schema_db_completo.md`.
> Lingua: **italiano** per UI/testi/commenti; **inglese** per gli identificatori di codice. Chat 01.03 · 16/06/2026 · **v2.2 — modello Party (Soggetto) + entità Sito incorporati**.

---

# PARTE 0 — Come lavorare

- **In autonomia, a blocchi.** Ogni blocco si chiude con un **test funzionale reale** e un report `DONE_<blocco>.md` che dice: cosa hai fatto, come l'hai verificato, cosa resta aperto, deviazioni dal brief e perché. **Da ora i `DONE_*.md` includono SCREENSHOT** delle schermate nuove accostate al mock di riferimento (non basta "compila senza errori": l'errore storico è il frontend generico).
- **Chiedi prima di inventare.** Se un dettaglio manca o è ambiguo, fai una domanda mirata; non procedere su assunzioni silenziose. Dove il documento è chiaro, procedi.
- **I mockup sono target vincolanti.** Se l'output non somiglia al mock, è sbagliato. Fedeltà visiva e completezza dei campi vengono prima dell'infrastruttura.
- **Checkpoint:** dopo ogni blocco "metro" fermati e mostra a Ricardo prima di replicare il pattern.
- **JOURNAL:** annota su `JOURNAL` migrazioni/moduli che tocchi, per evitare collisioni tra sessioni.

---

# PARTE 1 — Contesto, stack, convenzioni

siSuite è un SaaS **AI-first, mobile-first, multi-tenant** per commesse e attività sul campo. Verticale attivo: **fibra (FTTH)**, primo cliente **POWERCOM**. Dominio:
`engagement (commessa) → phase (fase/WBS, annidabile) → activity → resource/time/material`.

Tesi (vale per tutto): **l'AI propone, il deterministico dispone** — l'AI non scrive mai da sola nel DB; propone, l'uomo conferma, un layer deterministico salva.

Stack (già scelto): **Frontend** Ionic+Capacitor+React+Vite, TS strict, icone lucide-react, grafici recharts, design system `base.css` v5; **Backend** Node 20+TS+Fastify+Zod+Drizzle+node-postgres, pg-boss, MinIO, GoTrue (solo authN); **DB** PostgreSQL 16 + pgvector + RLS; monorepo pnpm; Docker.
**Convenzione migrazioni del repo:** file `NNN_nome.sql`, tracciati in `sisuite_migrations(filename)`. **Non** Flyway `V__`.

---

# PARTE 2 — Stato attuale (cosa è GIÀ fatto)

- **DB**: migrazioni **024→029 applicate**, runner corretto (`ON CONFLICT (filename)`), **RLS verificata** a due tenant, schema rigenerato. Tabelle presenti: `work_order(+subject,+item)`, `stock_serial_unit`, `price_list(+item,+override)`, `phase.wbs_code`, `work_line(+measure)`, `equipment_usage`, `subcontract_line`, vista `job_cost_ledger`; esistono già `work_report(+work_report_time_entry)`, `time_entry`, `material_consumption`, `material`, `asset`, magazzino (`stock_location/balance/movement/document`).
- **Blocco B — Ordinativi FTTH: FATTO** (maschera "metro", mock 44): lista + scheda, **PII mascherata server-side**, RBAC (`work_order:*`, `serial:*`, `pii:read`), import CSV con dedup, voce menu (a **1 livello**). Riusati i componenti del design system esistente.
- **Migrazione 029**: `field_definition` per i campi fibra dell'ordinativo (`connection_type, socket_id, attenuation_db, ont_serial, work_order_ref`).
- **NON ancora fatto** (oggetto di questo documento): **menù a 2 livelli**, **estrazione dei componenti** riusabili, e tutti i moduli da C in poi.

---

# PARTE 3 — Principi non negoziabili (8)

1. **AI propone, deterministico dispone.** L'AI produce una **proposta strutturata** che l'utente conferma; solo allora il layer deterministico scrive. Chiave AI = **segreto di piattaforma, lato server**, con quota per tenant/piano. Mai lato client.
2. **Campi guidati da metadati.** I campi (colonne schema **+** chiavi `attributes` jsonb) vengono da `field_definition`, che guida **sia** Zod **sia** il rendering di `EntityForm`. Campo mancante → aggiungilo in `field_definition`, non hardcodarlo.
3. **Tre assi di autorizzazione, mai confusi:** **RBAC** (azioni) ≠ **entitlement di piano** ≠ **`data_scope`** (righe visibili). Il menù nasconde per licenza+RBAC, ma **la barriera è il backend**.
4. **PII protetta.** `work_order_subject` mascherato di default, in chiaro solo con `pii:read`, mai loggato. Password apparato (`stock_serial_unit.secrets`) cifrata, gated `serial:secret_read`.
5. **ID visibili sempre da `number_series`** (es. `2026-0042`). UUID mai in UI.
6. **Solo design token** (niente colori hardcodati); etichette di stato da `lookup_value` (rinominabili per tenant).
7. **Prezzo "più specifico":** override commessa › override gestore › prezzo base. Funzione **unica** (`resolvePrice`) riusata ovunque.
8. **Tipo di costo dedotto dalla fonte** (ore=labor, materiali=material, mezzi=equipment, subappalti=subcontract, lavorazioni=production). Nessun campo "tipo" da compilare.

---

# PARTE 4 — Standard UI vincolanti (operativo)

**Tre archetipi, una Lista e una Scheda per entità (riusate ovunque, anche in selezione pop-up):**
- **Lista:** titolo + viste su una riga; toolbar a **sole icone + tooltip**; ricerca che si espande; gruppi azioni a destra con **Nuovo `+` per ultimo**; selezione = **solo un numero** (niente icone-azione sulle righe); righe a **2 livelli** per entità ricche, **1 livello** per griglie numeriche.
- **Scheda (Object Page):** **una pagina** per crea+vedi+modifica; **header sticky opaco** con **solo Salva/Annulla**; **label e titoli box nel bordo** (statici); griglia densa; validazione = **bordo rosso + messaggio dentro il campo**; tabelle correlate come **tab in fondo**; azioni AI nel bordo del box.
- **Documento:** solo per documenti (DDT, **rapportino**): testata + righe.

**Navigazione (mock 43):** 2 livelli (rail L1 collassabile + sub-panel L2), **niente 3° livello, max 2 click**, una rotta canonica per entità, cross-link con `↪`, **omnibox ⌘K**, **sibling tab bar**.
**Densità:** Compatta/Comoda/Spaziosa via `data-density` su `<html>`, per utente, default Comoda, selettore solo in Impostazioni.
**Tipografia:** H1 22 · sezione 16 · card 15 · body/cella 13 · header tabella 11.5 sentence-case · eyebrow 10.5 maiuscolo.
**Numeri:** sempre a destra, decimali allineati, cifre tabellari; unità nell'header, celle pulite; **valuta contabile** (simbolo sx, numero dx); **durata** "h:mm" (4:30); **orario** 24h (09:45).
**Anagrafica soggetti (modello "Party" / Business Partner) — IMPORTANTE.** La tabella **`company` (nome tecnico invariato)** NON è "l'azienda": è l'**anagrafica di un soggetto** — **persona fisica** (`company.type='private'`) **o organizzazione** (`'organization'`) — che porta uno o più **ruoli** in `company_role` (Cliente, Fornitore, Partner, Gestore, anche più d'uno insieme). Quindi:
- Non chiamarla mai "Azienda"/"Cliente" al singolare. **Hub di navigazione = "Anagrafiche"**; **singola scheda = "Soggetto"**; **Clienti / Fornitori / Gestori = viste filtrate** per ruolo.
- **Non rinominare la tabella fisica** `company` (referenziata ovunque: `engagement`, `asset`, `work_order.operator_company_id`, `price_list_override`, `stock_serial_unit`, `company_role/contact`, `app_user`, RLS `app_current_company`). Si cambia solo concetto + etichette + i18n.
- **i18n vincolante** (tre lingue, da seedare nei namespace i18next / glossario):

  | Concetto | it-IT | en (EU) | es-AR |
  |---|---|---|---|
  | Hub anagrafiche | Anagrafiche | Master data | Maestros |
  | Scheda soggetto (entità) | Soggetto | Party | Tercero |
  | Ruolo cliente | Cliente | Customer | Cliente |
  | Ruolo fornitore | Fornitore | Supplier | Proveedor |
  | Ruolo partner | Partner | Partner | Socio comercial |
  | Ruolo gestore (FTTH) | Gestore | Operator | Operador |
  | Sito / località | Sito | Site | Sitio |

---

# PARTE 5 — Componenti condivisi (contratti) — costruiscili UNA volta

- **`AppShellNav2`** — shell a 2 livelli + omnibox ⌘K + sibling tab bar (dettaglio in Blocco A).
- **`EntityList`** — `mode = manage | pick-single | pick-multi`, `columns`, `views`, `rowLevels: 1|2`, `onSelect`; toolbar a icone; selezione = numero.
- **`ObjectPage` + `ObjectBox` + `RelatedTabs`** — header sticky Salva/Annulla; box con titolo nel bordo; tab correlate in fondo.
- **`EntityForm`** — campi **da `field_definition`** + Zod dalla stessa fonte; validazione inline.
- **`DocumentPage`** — testata + sezioni di righe (rapportino, DDT).
- **`CaptureBarAI`** — cattura → proposta → review → apply (dettaglio in Blocco F).
- **`MaskedField` / `PiiGate`** — valore mascherato, "Mostra" gated da permesso, mai loggato (già esiste dal Blocco B: riusalo per PII **e** per i segreti seriali).
- **`StatusPill`** — da `lookup_value`.
- **`PivotTable`** — albero espandibile con totali e barre margine (Blocco G).
- **`resolvePrice(item,{engagement,company})`** — prezzo "più specifico" (Blocco D).
- **`MoneyCell/NumberCell/DurationCell`** — formattazione secondo §4 (già esistono).

> ⚠️ La scheda Ordinativi (Blocco B) implementa ObjectPage/box **inline**. Nel Blocco A vanno **estratti** in componenti veri e Ordinativi va **ri-puntato** su di essi, prima di replicare su altre entità.

---

# PARTE 6 — Decisioni chiuse (definitive)

1. **Menù 2 livelli:** non si rinvia — è il **Blocco A "vero"**. Riuso del design system esistente per gli archetipi già pronti: approvato.
2. **Visibilità PII (chi vede in chiaro nome/telefono/CF dell'intestatario):**
   - **Owner + Pianificatore/Ufficio** → vedono **tutto** (nome, telefono, CF): permesso `pii:read`.
   - **Tecnico assegnato** → vede **solo il telefono** (per chiamare il cliente), **non** il codice fiscale: nuovo permesso fine **`pii:read:contact`**. Vale solo sugli ordinativi della **sua squadra** (vedi §3).
   - **Contabile / Sola lettura** → **nessun** dato personale (né nome/tel/CF, né indirizzo del cliente).
   - **Indirizzo di attivazione**: **visibile** ai ruoli operativi (Pianificatore, Ufficio, Tecnico assegnato) perché serve per andare sul posto; non esposto ai ruoli non operativi.
   - *Implementazione*: aggiungi il grant **`pii:read:contact`** al ruolo Tecnico; il backend, per chi ha solo `pii:read:contact`, restituisce **il telefono in chiaro** e **nome/CF mascherati**.
3. **`data_scope` su `work_order` e seriali:** il **Tecnico vede e lavora SOLO gli ordinativi della sua squadra** (assegnati alla sua risorsa/squadra); **Pianificatore/Ufficio vedono tutto**. Stessa logica per le **unità seriali**: il Tecnico vede quelle del **suo furgone** (`holder_resource_id`) + quelle installate da lui; magazziniere/planner vedono tutto. Applicare in **RLS** (come su `work_report`) e/o in query, non solo in UI.
4. **Import CSV:** mappatura **configurabile lato client**; il backend riceve righe già mappate e gestisce i doppioni. ✔
5. **Cifratura segreti seriali:** **applicativa lato server**. ✔
6. **Parco installato / asset:** **NON si crea la riga `asset` all'installazione** (deciso dopo verifica schema: `asset.company_id` è **obbligatorio** e l'utente finale FTTH non è una `company` — forzarlo significherebbe creare una company per ogni privato, spargendo PII, o modificare una tabella core). Il parco installato si **legge dai seriali** (`status=installed` + `work_order`/indirizzo), che basta per i bisogni attuali. **Si lascia il gancio** `stock_serial_unit.installed_asset_id`: quando servirà il modulo assistenza, la riga `asset` si aggiunge nello stesso endpoint di transizione (eventuale piccola migrazione per agganciare l'asset a indirizzo/ordinativo senza company).
7. **Export verso CPM:** l'**export Excel generico** (per WBS/voce) è **incluso** nel software ed è lo **standard**. Se POWERCOM fornisce il **tracciato di import specifico di CPM**, lo agganciamo nel Blocco G **come funzione a pagamento a parte** (add-on). Il tracciato va chiesto a POWERCOM in parallelo; **non blocca** lo sviluppo.
8. **Tipo articolo/servizio:** campo **esplicito `item_type` (Articolo / Servizio)** scelto a mano, via `field_definition` (estendibile in futuro con altre tipologie). ✔
9. **Anagrafica = modello Party (Soggetto), non "Azienda":** `company` resta il nome tecnico ma rappresenta un **soggetto** (persona o organizzazione) con ruoli in `company_role`. Etichette: hub **"Anagrafiche"**, scheda **"Soggetto"**, viste filtrate per ruolo. Traduzioni vincolanti nella tabella i18n (Parte 4). Nessun rename della tabella fisica. ✔
10. **Località/Sito per gli asset: SI FA (deciso, non rinviato).** Nuova entità **`site`** gerarchica (stabilimento › edificio › piano › locale › armadio/POP) legata al soggetto, con `asset.site_id`. Allinea siSuite al modello dei leader (ServiceTitan "service location", Dynamics "functional location"): un soggetto può avere **più siti**, l'asset vive in un punto preciso. Spec in Parte 8 (Blocco C-bis), migrazione `031`. È **additiva** (non rompe nulla). NB: la fibra residenziale continua a usare l'indirizzo sull'ordinativo; i siti servono ai soggetti strutturati (Fiat, Denaris, comuni, condomìni).

---

# PARTE 7 — Piano dei blocchi (ordine)

1. **Blocco A "vero"** — Menù 2 livelli + estrazione componenti (incluso: hub "Anagrafiche", scheda "Soggetto", i18n della Parte 4).
2. **Blocco C** — Articoli & seriali.
3. **Blocco C-bis** — Anagrafica **Siti/Località** (entità `site` gerarchica) + `asset.site_id`.
4. **Seed pack fibra (minimo)** — per la demo.
5. **Blocco B-bis** — rifinitura Ordinativi.
6. **Blocco D** — Listino + `resolvePrice`.
7. **Blocco E** — Lavorazioni + libretto.
8. **Blocco F** — Rapportino + CaptureBarAI.
9. **Blocco G** — Pivot + export.
10. **Blocco H** — Magazzino/DDT + seed completo.

> Sequenza minima per la **demo**: A (menù) → seed → Ordinativi (fatto) → C (seriali/parco installato) → G (pivot).

---

# PARTE 8 — Spec per blocco

## ⬛ Blocco A "vero" — Menù 2 livelli + estrazione componenti

**Perché ora:** è standard vincolante, è la cornice in cui si innesta ogni schermata (farlo dopo costa ad ogni schermata aggiunta; la mappa menù del mock 43 è già pronta), ed è la prima cosa che si vede in demo.

**AppShellNav2 (mock 43):**
- **Rail L1** collassabile a sole icone; stato **ricordato per utente**.
- **Sub-panel L2:** voci della sezione attiva, raggruppate con caption. **No 3° livello, max 2 click.**
- **Sezioni:** `Preferiti` · **LAVORO** (Cruscotto, Commesse, Campo, Magazzino, Finanza & Budget) · **DATI** (Anagrafiche: Aziende, Articoli, Risorse, Materiali) · **SISTEMA** (Impostazioni, Amministrazione, SuperUsers). Ordinativi (FTTH) sotto **Campo**.
- **Una rotta canonica per entità**; cross-link con `↪`. Regola 10%: entità usata da ≥2 moduli → Anagrafiche.
- **Omnibox ⌘K** = ricerca voci (+ slot AI placeholder, cablato in Blocco F).
- **Sibling tab bar** in cima alla pagina (es. Articoli·Giacenze·Movimenti·Documenti).
- **Preferiti** (★ per-utente) + **Recenti**. Visibilità per licenza+RBAC; backend resta la barriera.

**Estrazione componenti:** estrai `ObjectPage/ObjectBox/RelatedTabs` e `EntityList` (con `pick-single/pick-multi`) dall'inline di Ordinativi e ri-punta Ordinativi su di essi.

**DoD:** rail collassabile e persistente; sub-panel a gruppi; max 2 click; ⌘K apre ricerca; sibling tab bar su almeno un gruppo; voce nascosta non raggiungibile via URL senza permesso; Ordinativi re-innestato senza regressioni; responsive a width telefono; componenti estratti e riusati.

---

## ⬛ Blocco C — Articoli & seriali (mock 45)

**Modello dati — colonne REALI:**
- `material`: `name, unit, sku, track_stock, costing_method('avg'), tracked_by_lot, tracked_by_serial, default_cost, attributes, archived_at`. UNIQUE `(tenant,name)`, UNIQUE `(tenant,sku) WHERE sku NOT NULL`. ⚠️ **Niente colonne `category/min_stock/tipo`** → via `attributes`+`field_definition` (migrazione 030, sotto).
- `stock_serial_unit`: `material_id, serial, status(in_stock|assigned|installed|faulty|returned|retired), location_id, holder_resource_id, installed_company_id, installed_asset_id, installed_on, secrets(jsonb), note, source_movement_id, work_order_id, work_order_item_id, attributes`. UNIQUE `(tenant,material,serial)`.
- Magazzino esistente: `stock_location/balance/movement/document`. `asset` per parco installato.

**Migrazione 030 (additiva) `030_material_fields.sql`:** `field_definition` di sistema per `material`: `category`, `min_stock`(number), `item_type`(select article|service, default article), `supplier_code`.

**RBAC:** `serial:read/manage/secret_read`, `material:*`. **`data_scope` (deciso):** il Tecnico vede le unità del **suo furgone** (`holder_resource_id`) + quelle installate da lui; magazziniere/planner vedono tutto.

**Backend:** `GET /materials` (viste Tutti/A magazzino/A seriale/Servizi/Scorta bassa + ricerca + conteggi); `GET/POST/PATCH/DELETE /materials`; `GET /materials/:id/serials` (password mai nel payload, solo `hasSecret`); `GET /serials`; `POST /serials` (carico, `in_stock`); `POST /serials/:id/transition` (**unica via** ai cambi stato, audit, valida transizioni); `PUT /serials/:id/secret` (cifra lato server); `POST /serials/:id/secret/reveal` (gated `serial:secret_read`, una-tantum, mai loggato, evento tracciato); `GET /work-orders/:id/installed`.

**Lista (mock 45):** righe 2 livelli; colonne Articolo+SKU, Categoria+tracciamento, Giacenza, Costo medio, Stato.
**Scheda:** Box **Anagrafica** (name, sku, unit, Categoria, Tipo, codice fornitore) · Box **Magazzino & tracciamento** (track_stock, tracked_by_serial, tracked_by_lot, costing_method, default_cost, Scorta minima, Giacenza totale). Tab: **Unità seriali** (serial, Stato, *dove*/installato presso+ordinativo, **password mascherata**, transizione), **Giacenze per ubicazione**, **Movimenti**, **Documenti**.

**Ciclo vita seriale:** `in_stock→assigned→installed→faulty/returned/retired` (+ rientri); transizioni non ammesse **rifiutate dal backend**; ogni transizione con audit. **Install su ordinativo** (aggancio B↔C): da scheda Ordinativo → tab Seriali installati → scansiona/scegli unità → `transition: install` con `work_order_id` (per la fibra `installed_company_id` resta NULL, aggancio via work_order). Parco installato MVP = `stock_serial_unit status=installed` join `work_order`; la riga `asset` **NON si crea ora** (vedi Parte 6.6): parco installato letto dai seriali; si lascia il gancio `installed_asset_id` per il futuro modulo assistenza.

**Password apparato:** cifratura applicativa lato server; API mai col chiaro (solo `hasSecret`); reveal una-tantum gated; mai loggato; UI con `MaskedField`.

**DoD/Test:** carico 2 ONT → assegno 1, installo 1 → compare nel parco installato; password vista solo con `serial:secret_read` (provato a 2 ruoli) e non nei log; vista "Scorta bassa" corretta; transizione illegale rifiutata; screenshot vs mock 45.
**Decisioni chiuse (Parte 6):** `data_scope` = suo furgone; asset = rimandato (gancio lasciato); Servizio = campo esplicito `item_type`; lotto = hook spento.

---

## ⬛ Blocco C-bis — Anagrafica Siti/Località (entità `site`) + `asset.site_id`

**Obiettivo:** dare ai soggetti strutturati (Fiat, Denaris, comuni, condomìni…) una **gerarchia di luoghi** dove collocare gli asset (router, punti di collegamento fibra, impianti). Allinea siSuite ai leader (ServiceTitan *service location*, Dynamics *functional location*).

**Migrazione `031_site.sql` (additiva):**
```sql
CREATE TABLE site (
  id          uuid PK default gen_random_uuid(),
  tenant_id   uuid NOT NULL → tenant,
  company_id  uuid NOT NULL → company,      -- il soggetto proprietario/occupante
  parent_id   uuid → site,                  -- gerarchia (self-reference), come phase
  name        text NOT NULL,
  kind        text NOT NULL,                -- 'plant'|'building'|'floor'|'room'|'cabinet'|'pop'|… (canonico/lookup, estendibile)
  address     text,
  geo         point,
  attributes  jsonb NOT NULL default '{}',
  audit…, archived_at
);
-- indici: (tenant_id), (company_id), (parent_id)
-- CHECK anti-self-parent: parent_id IS NULL OR parent_id <> id
-- RLS tenant come le altre entità (USING tenant_id = app_current_tenant())
ALTER TABLE asset ADD COLUMN site_id uuid → site;   -- nullable, additivo
```

**Backend:** `GET /sites?company_id=…` (albero per soggetto); `GET/POST/PATCH/DELETE /sites`; l'asset (quando esisterà la sua UI) può valorizzare `site_id`.

**Frontend:** dentro la scheda **Soggetto**, tab **Siti** = albero espandibile (riusa il pattern albero di fasi/WBS); ogni nodo è un sito con `kind` e indirizzo. Nella futura scheda Asset, selettore "Sito" (pick dall'albero del soggetto).

**Regole:** gerarchia via `parent_id` (niente limite di profondità, ma in UI max ~4–5 livelli leggibili); `kind` da lookup estendibile; un soggetto può avere più siti radice (es. più stabilimenti). **Non tocca** la fibra residenziale (resta su indirizzo dell'ordinativo).

**DoD:** creo soggetto "Fiat" → 2 stabilimenti → dentro edifici/piani; collego un asset a un nodo foglia; l'albero si naviga; RLS isola i tenant; nulla di esistente regredisce.

**Decisione chiusa (Parte 6.10):** entità `site` gerarchica legata al soggetto; `asset.site_id` opzionale; additiva.

## ⬛ Seed pack fibra (minimo) — anticipato per la demo
Pacchetto dati realistico, isolato per tenant, caricabile/scaricabile e **idempotente**: gestore Sirti; commessa «Napoli Est 2026» con 2–3 fasi/WBS; ~15 articoli (ONT/borchia/splitter **a seriale**, cavo a magazzino, 1 servizio); ~30 ordinativi su vari stati con **intestatari fittizi**; qualche seriale installato (parco installato); 1 listino base + 1–2 ritocchi Sirti; 1 rapportino; dati sufficienti perché la **pivot** mostri un margine credibile.

---

## ⬛ Blocco B-bis — rifinitura Ordinativi
Editor **mapping CSV** nella toolbar (scelta colonna→campo); **azioni bulk** (assegna/esporta più ordinativi); **selezione multipla** righe. Per la demo: rendi funzionanti **Importa** e **Assegna**; Filtri/Colonne/Azioni-AI possono restare "presto".

---

## ⬛ Blocco D — Listino + `resolvePrice` (mock 46)

**Entità (colonne reali):** `price_list` (code, name, currency, is_default, valid_from/to, active); `price_list_item` (price_list_id, code, description, unit, category, cost_price, revenue_price, active, attributes); `price_list_override` (base_item_id, scope_type `company|engagement`, company_id, engagement_id, cost_price, revenue_price, valid_from/to).

**`resolvePrice(item,{engagement,company})`** — **funzione unica**: cerca override per **engagement**, poi per **company (gestore)**, poi prezzo **base**; rispetta validità temporale. Esposta come libreria + endpoint di anteprima. **Va testata unitariamente** sui casi limite (nessun override, override solo gestore, override commessa che vince su gestore, override scaduto).

**Lista:** selettore listino (default = `is_default`); viste Tutte/Per categoria/Con ritocchi/Disattivate; colonne Voce+code, Categoria+unità, Costo, Ricavo, **Margine %** (calcolato), **Ritocchi** (conteggio).
**Scheda:** Box **Voce** (code, description, unit, category, cost_price, revenue_price, margine); Tab **Ritocchi** (override, con etichetta "più specifico"), **Storico prezzi**, **Lavorazioni che la usano**.
**DoD:** `resolvePrice` con test unitari verdi; margine calcolato coerente; la regola commessa›gestore›base è evidente in UI.

---

## ⬛ Blocco E — Lavorazioni + libretto misure (mock 49)

**Entità (colonne reali):** `work_line` (engagement_id, phase_id, work_order_id, price_list_item_id, description, quantity, unit, cost_price, revenue_price, occurred_on, resource_id, source_capture_id, attributes); `work_line_measure` (work_line_id, label, formula, value, seq).

**Lista (per commessa):** viste Tutte/Per fase/Con libretto/Da cattura; colonne Voce+code, Fase/WBS+data, Quantità+unità (+nota "da libretto"), Ricavo, Origine.
**Scheda:** Box **Lavorazione** (price_list_item select, phase_id (WBS), occurred_on, **quantity read-only se da libretto**, cost/revenue **fotografati con `resolvePrice`** alla creazione, ricavo calcolato); Tab **Libretto misure** (label, formula testuale es. `24 × 1,00`, value; **riga totale** = quantity). `attributes` (es. `competenza`, `area_cavo`) da `field_definition`.
**DoD:** somma misure = quantity; ricavo = quantity × prezzo risolto; il tipo di costo è dedotto (production).

---

## ⬛ Blocco F — Rapportino + CaptureBarAI (mock 48)

**Testata:** **`work_report`** (esiste, riusala) + `work_report_time_entry` per la manodopera. **Sezioni:** Manodopera (`time_entry`) · Attrezzature (`equipment_usage`) · Materiali (`material_consumption`) · Subappalti (`subcontract_line`) · Lavorazioni (`work_line`) · Foto (`capture`). Archetipo **Documento**; striscia totali costi/ricavi/margine (tipo dedotto per sezione).

**CaptureBarAI (il cuore AI) — costruiscilo qui, end-to-end:**
1. **Cattura:** detta/scrive → salva in `capture`.
2. **Proposta (lato server):** endpoint chiama l'LLM (**chiave server-side, quota per tenant/piano**) → restituisce un **diff di operazioni candidate**. **Mai scrivere nel DB qui.**
3. **Review:** UI mostra le righe **accettabili/modificabili/rifiutabili**.
4. **Apply (deterministico):** dopo conferma, valida (Zod) e scrive (Drizzle) con **audit**, collega `source_capture_id`. **Idempotente.**
5. **Racconto:** stato leggibile in linguaggio naturale.
Vincoli: **nessun PII nei log**; quota applicata **prima** della chiamata AI.
**DoD:** dettato → proposta → review → apply scrive le righe corrette nelle sezioni giuste; l'AI non scrive mai diretta; nessun PII loggato.

---

## ⬛ Blocco G — Pivot preventivo-consuntivo + export (mock 47)

**Fonte:** vista **`job_cost_ledger`** (tenant_id, engagement_id, activity_id, phase_id, **cost_type**, price_list_item_id, quantity, unit, **cost_amount**, **revenue_amount**, occurred_on).
**UI:** KPI in testa (ricavi, costi, **margine**, margine %); `PivotTable` ad albero **Commessa › Fase/WBS › Voce** con sottototali e **barre margine**; etichette/colori del tipo da `lookup_value('cost_type')`. Azioni: **Esporta Excel** (incluso, standard) e **Esporta per CPM** (add-on a pagamento, solo se POWERCOM fornisce il tracciato — vedi Parte 6.7).
**DoD:** i totali pivot coincidono con la somma di `job_cost_ledger` per commessa; manodopera valorizzata dalle tariffe `time_entry`, materiali da `default_cost`.

---

## ⬛ Blocco H — Magazzino/DDT + seed completo

Documenti di magazzino come archetipo **Documento** (base mock 42): DDT carico/scarico/trasferimento/rettifica (varianti di `stock_document`); lo **scarico su un ordinativo** genera `stock_movement` con `work_order_id`. Schermate Giacenze/Movimenti/Inventario. **Seed pack fibra completo** (estende quello minimo).

---

# PARTE 9 — Definition of Done globale + cosa NON fare

**DoD (ogni maschera):** fedeltà al mock · tutti i campi (schema + `attributes` da `field_definition`) · RBAC su **UI e API** · entitlement + `data_scope` rispettati · stati vuoto/caricamento/errore · responsive desktop+telefono · densità · numeri a destra, valuta contabile, durata h:mm · ID da `number_series` · stati da `lookup_value` · solo token · icone lucide + tooltip · **nessun PII/segreto loggato** · **screenshot nel DONE**.

**NON fare:** privilegiare il backend a scapito del frontend; inventare campi/colori/etichette/ID; far scrivere l'AI diretta nel DB o mettere la chiave AI lato client; mostrare UUID o PII/password senza permesso; clonare le parti normate di CPM (SAL, certificati, giornale lavori, prezzari DEI, BIM — restano a CPM, noi facciamo il ponte export); confondere i 3 assi di autorizzazione; riproporre la maschera Ordinativi legacy `40`; copia-incollare il pattern invece di riusare i componenti estratti.

---

# PARTE 10 — Checkpoint di verifica Blocco B (per Ricardo, da fare ORA)

Apri `http://localhost:5173` (owner@fibra.demo) → **Lavoro → Ordinativi (FTTH)**, contro il mock 44:
1. **Lista:** righe 2 livelli; viste con contatori; toolbar a sole icone con tooltip; niente icone-azione sulle righe; selezione = numero.
2. **Scheda:** header sticky opaco con solo Salva/Annulla; `code` pill + StatusPill; label/titoli box nel bordo; box Pratica/Intestatario(PII)/Indirizzo/**Dati tecnici fibra**/Apparati; validazione dentro il campo.
3. **PII:** login `marco@fibra.demo` (Tecnico) → nome/telefono mascherati, "Mostra" bloccato; **indirizzo visibile**.
4. **Crea + Import:** "Nuovo" salva con `2026-NNNN`; import CSV → 1 creato, 1 doppione.

Se i 4 punti tornano, il "metro" è validato → **parti dal Blocco A (menù)**.
