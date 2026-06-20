# PIANO per Claude Code — Motore "liste & azioni" unificato + CRUD completi (Magazzino)

> **Cos'è.** Istruzioni operative e **precise** per Claude Code. Definisce un unico "motore" riusabile (Filtro **Gruppo** · Ordina · Colonne · Export · **Report**) da mettere su **tutte** le maschere, la sua integrazione nella **toolbar**, e il completamento dei **CRUD manuali mancanti** (Magazzino). Sostituisce, dove indicato, le implementazioni provvisorie del 20/06.
> **Verità visiva = i mockup HTML** (vedi §0). Vanno **aperti nel browser e replicati 1:1**. Non reinventare layout.
> **Lingua:** italiano in UI/commenti, inglese negli identificatori. **Repo:** colloca questo file in `docs/analisi/2026-06-20_PIANO_motore_liste_e_magazzino.md`. Migrazioni: prossima libera **038**.
> **Data:** 20/06/2026 · v1.0 · Chat 01.04.

---

## 0. REGOLE D'INGAGGIO (leggere prima di scrivere codice)

1. **I mockup sono la verità.** Il titolare ti fornisce questi file HTML (mettili in `docs/mockup/`). **Aprili nel browser** e replica esattamente layout, spaziature, colori (token di `design-system.css`/`base.css`), comportamento:
   - `41_web_aziende_standard.html` → **scheda CRUD canonica** (box con titolo+label nel bordo, `obox/bgrid/bf/bl/bi`, header sticky, barra azioni in fondo). **Non si tocca**: tutto il resto ci "galleggia sopra".
   - `54_web_filtro_qbe_v1_3_01_04.html` → **Filtro "Gruppo"** (QBE sulla scheda, freccettina + pop-up, frase in lingua).
   - `55_web_ordina_v1_0_01_04.html` → **Ordina** multicampo (selettore campi a due aree, pop-up sopra la lista).
   - `56_web_report_v1_0_01_04.html` → **Report designer** (mostra/somma/raggruppa + opzioni + anteprima HTML + barra AI).
   - (contesto già approvato) `50_web_commessa_struttura` (WBS), `51` rapportino, `52` assegnazione, `53` "il mio lavoro".
2. **Precisione assoluta.** Ultimamente il disegno è stato impreciso. Per ogni schermata tocca­ta, il `DONE_*.md` deve contenere **screenshot affiancato al mockup**: se non sono sovrapponibili, non è finito.
3. **La scheda CRUD resta identica a `41`.** Il motore aggiunge solo: **icone in toolbar** e **pop-up che galleggiano**. Niente pannelli laterali che spostano la griglia, niente chip grandi dentro i campi.
4. **Coerenza totale.** Lo stesso motore va su **tutte** le maschere. L'utente impara una maschera → le sa usare tutte.
5. **Additivo / opt-in** sui componenti condivisi (come hai già fatto): nuove prop, zero regressioni sulle liste che non le passano.

---

## 1. IL MOTORE COMUNE (costruiscilo UNA volta, poi riusalo)

Tre mattoni condivisi. Tutto il resto è composizione.

### 1.1 `FieldPicker` — il selettore di campi (un componente, più "modalità")
Sorgente campi: **`field_definition`** dell'entità (così funziona da solo con 2 o 100 campi, anche i campi custom del tenant). Due aree (vedi `55`):
- **Area "scelti"** (in alto): righe ordinate con **numero priorità**, **trascinabili** (drag) **e** con ▲▼ (entrambi, il drag come comfort), e un **controllo per-riga che cambia secondo la modalità**:
  - `sort` → toggle **↑ Crescente / ↓ Decrescente**;
  - `columns` / `export` → nessun controllo extra (solo ordine);
  - `report-show` → nessun extra; `report-sum` → niente (è una lista a parte); `report-group` → niente.
- **Area "tutti i campi"** (in basso): **casella di ricerca** + elenco **raggruppato per sezione**; clic su un campo → entra negli "scelti". (La ricerca è obbligatoria: è ciò che rende usabile con 100 campi.)
- Props: `entity`, `mode`, `value` (array di {key, dir?}), `onChange`. Mobile: le due aree si **impilano** (scelti sopra, ricerca+lista sotto).

### 1.2 `SavedHeader` — combo "salva / carica / elimina" (identica ovunque)
La striscia in cima a Filtro, Ordina, Colonne, Export, Report: `<select>` dei salvati + bottone **Salva** (PromptDialog nome) + **Elimina**. **Stesso componente, stesso aspetto** in tutte e cinque le funzioni. Persistenza: §7.

### 1.3 `FloatingPopover` — il pop-up che "naviga sopra" la scheda
Pop-up ancorato (per il filtro) o modale centrato con backdrop tenue (per Ordina/Report quando serve spazio). **Non sposta né ridisegna** la scheda sottostante. `position: fixed`, clamp ai bordi viewport, chiusura su click esterno / Annulla.

### 1.4 Sorgente unica dei campi
Da **`field_definition`** (label localizzata, tipo, sezione). Il filtro server-side resta whitelisted (`FILTER_FIELDS`); **PII fuori** dal filtro (non si aggira il mascheramento, come già verificato).

---

## 2. LE CINQUE APPLICAZIONI DEL MOTORE

### 2.1 Filtro "GRUPPO" (Query by Example) — mockup `54_v1_3` (riferimento principale)
**Sostituisce** il *manual builder* (campo·operatore·valore) dell'attuale `AiFilterPanel`. Il filtro a **linguaggio naturale/voce resta** come scorciatoia (barra ⌘K "chiedi: clienti di Bergamo senza P.IVA").
Comportamento (replica esatta del mockup):
- È **la scheda CRUD dell'entità in modalità filtro**, a tutta larghezza. Ogni campo resta **identico** a `41`; l'unica aggiunta è una **freccettina ▾ piccola, colore brand, a destra del campo** (icona `chevron-down`, ~22px, niente testo, tooltip "Opzioni filtro").
- **Scrivi e basta** in un campo testo → operatore di default `contiene`, applicato.
- **Clic sulla ▾** → apre `FloatingPopover` con, in quest'ordine: **Operatore** (testo: contiene/è/inizia/finisce/**da–a**/è vuoto · data: oggi/mese/anno/dopo/prima/**intervallo**/nell'anno · enum: è uno di/non è); **Valore**; per **da–a/intervallo** appare il **secondo campo** nel formato del tipo (testo "dalla A… …alla M", due date, due numeri); **Lega alle altre condizioni**: `E / O`, `NON`, `apri ( `, `chiudi )`; **Annulla / Applica**.
- In alto, **frase in lingua** che cresce in tempo reale ("Aziende dove ( Ragione sociale contiene 'srl' E … ) O NON Paese è Italia"), con chip rimovibili. I campi con un filtro hanno la **freccettina piena** (stato attivo).
- **Parentesi:** **un solo livello** di raggruppamento (deciso col titolare). Non implementare annidamento infinito.
- Applicazione **server-side** (estendi `filterSql.buildFilter`): operatori per tipo, `between`, enum display↔raw, `is null/empty`. Test anti-injection già presenti: estendili ai nuovi operatori.
- **Conteggi dei chip "viste"** devono rispettare il filtro attivo (residuo 5.3 del 20/06: chiudilo qui).

### 2.2 ORDINA multicampo — mockup `55`
**Sostituisce** la `SortDialog` "aggiungi un campo alla volta da tendina" (giudicata macchinosa). Usa `FieldPicker` in modalità `sort`:
- Area "scelti" = livelli di ordinamento con priorità (il primo conta di più), **↑/↓** per verso, **drag + ▲▼** per riordinare, ✕ per togliere.
- Area "tutti i campi" con **ricerca**.
- `SavedHeader` in cima. Applica → la lista si riordina (backend `sortSql.buildOrderBy` già esiste: collega l'UI nuova).

### 2.3 COLONNE — stesso `FieldPicker` (mode `columns`): mostra/nascondi + ordine, persistito per-utente.

### 2.4 EXPORT — stesso `FieldPicker` (mode `export`). Hai già l'export dinamico dai `field_definition`: **unifica** il vecchio picker export su questo componente, così è identico ad Ordina/Colonne.

### 2.5 REPORT DESIGNER — mockup `56` (nuovo)
- Tre usi di `FieldPicker`: **Campi da mostrare** (`report-show`), **Totali/somma** (`report-sum`, solo campi numerici), **Raggruppa per / tagli di controllo** (`report-group`).
- **Opzioni**: linee griglia, nascondi valori ripetuti, subtotali per gruppo, totale generale, dividi in pagine, layout **Elenco/Scheda**.
- **Barra AI** in cima ("descrivi il report" → propone la configurazione → l'utente la ritocca; pattern propone→conferma, chiave server, come le catture).
- **Anteprima HTML live** a destra (raggruppata, con subtotali e totale generale) — dev'essere **bella** (è un nostro vantaggio). Output: HTML/PDF.
- Salvataggio: **`saved_report`** (§7), con `SavedHeader`.
- Mobile: anteprima sotto i controlli; autoring pieno è attività da scrivania (su mobile: consulta/ritocca i report salvati).

---

## 3. TOOLBAR STANDARD (icone, ordine, tooltip — niente testo)
Le funzioni vivono come **icone sole** con **tooltip** (hover → nome funzione), per non allargare la toolbar. Ordine canonico (sinistra→destra) della `EntityList`:

`[ Ricerca … (largo, a sinistra) ]  ·  Gruppo  ·  Ordina  ·  Colonne  ·  Report  ·  Esporta  ·  AI  ·  [azioni su selezione: Modifica·Duplica·Elimina]  ·  Nuovo +`

| Funzione | Icona lucide | Tooltip |
|---|---|---|
| Filtro Gruppo | `list-filter` | "Filtra (Gruppo)" |
| Ordina | `arrow-up-down` | "Ordina" |
| Colonne | `columns-3` | "Colonne" |
| Report | `file-bar-chart-2` | "Report" |
| Esporta | `download` | "Esporta (Excel)" |
| AI | `sparkles` | "Chiedi all'AI" |
| Nuovo | `plus` | "Nuovo" |
| Modifica/Duplica/Elimina | `pencil`/`copy`/`trash-2` | come da v2 |

Le nuove (**Gruppo · Ordina · Report**) vanno **aggiunte a sinistra** del gruppo esistente. Quando un filtro/ordinamento è attivo, l'icona mostra un piccolo badge col numero (come da mockup).

---

## 4. APPLICA A TUTTE LE MASCHERE — anagrafiche **identiche**
Stesso `EntityList` + `ObjectPage` (stile `41`) + toolbar §3 + motore §1–2 su **tutte** queste entità (nessuna esclusa):
Soggetti (`company`) · Articoli (`material`) · Risorse (`resource`) · Asset (`asset`) · Siti (`site`) · Commesse (`engagement`)+WBS · Ordini di lavoro (`work_order`) · Listino (`price_list`+righe) · Lavorazioni (`work_line`) · Foglio ore (`time_entry`) · Assenze · **Magazzini/Ubicazioni** (`stock_location`) · **Movimenti** (`stock_movement`) · **Giacenze** (`stock_balance`) · **Documenti** (`stock_document`) · e le config (Campi/`field_definition`, Terminologia/`term_override`, Lookup, Numeratori).
**DoD trasversale:** apri due anagrafiche a caso → la toolbar, il filtro Gruppo, l'Ordina, le Colonne, l'Export e il Report devono essere **identici** nel comportamento.

---

## 5. CRUD COMPLETI — MAGAZZINO (gap critico, da chiudere)
**Principio non negoziabile:** *ogni entità ha la sua lista e il suo CRUD manuale*. L'AI è una **seconda strada** (automazione), non l'**unica**: l'utente deve sempre poter **inserire / vedere / modificare / cancellare** a mano. Entrambe le strade coperte.

Stato attuale (dal 20/06): il Magazzino è solo a viste; i movimenti si creano **solo** via documento; magazzini/ubicazioni non si creano/modificano. Da correggere così, **rispettando i vincoli DB reali** (verificati sullo schema 001→037):

### 5.1 Magazzini — `stock_location` con `parent_id IS NULL`
Lista + Scheda CRUD completa (crea/vedi/modifica/elimina-soft via `archived_at`). Campi: `name`, `kind` (lookup: warehouse/van/site…), `address` (jsonb), `holds_stock`, `is_default`, `active`, `resource_id` (opz., es. furgone↔tecnico). Nella scheda, **tab correlata "Ubicazioni"** = `stock_location` figli (`parent_id = questo`), con CRUD figlio (è il "dettaglio del magazzino" che il titolare cerca). Rispetta il trigger **no-ciclo** (`stock_location_no_cycle`).

### 5.2 Ubicazioni — `stock_location` figli
Gestite nella tab della scheda magazzino **e** disponibili come lista globale (vista filtrata `parent_id IS NOT NULL`). Stesso CRUD.

### 5.3 Movimenti — `stock_movement` (⚠️ **IMMUTABILE per design**)
Sullo schema c'è il trigger `stock_movement_is_immutable` → **UPDATE/DELETE sono vietati a livello DB** ("usa una rettifica, non modifiche o cancellazioni"). **NON rimuovere il trigger, NON tentare edit/delete.** La strada manuale corretta:
- **"Nuovo movimento"** (form CRUD di sola creazione): `type_id` (lookup: carico/scarico/rettifica/trasferimento), `material_id`, `location_id`, `quantity` (≠0), `unit`, `unit_cost`/`unit_price` opz., `occurred_on`, `note`, opz. `engagement_id`/`work_order_id`/`activity_id`. → l'INSERT aggiorna la giacenza via trigger `apply_stock_movement`.
- **"Rettifica / Storna"** come azione di riga: crea un **movimento compensativo** (quantità opposta), non modifica l'originale. **Trasferimento** = due movimenti legati da `transfer_group_id` (uscita dalla sorgente + entrata nella destinazione).
- Lista movimenti con icona **lucchetto** "registro immutabile" e tooltip che spiega.

### 5.4 Giacenze — `stock_balance` (sola lettura, **derivata**)
Lista **non modificabile** (è calcolata dal trigger). Click su una riga → mostra i movimenti che l'hanno generata (drill-down su `stock_movement` filtrato per material+location). Niente edit diretto: la giacenza cambia **solo** creando movimenti.

### 5.5 Documenti — `stock_document` (+ `stock_document_line`)
CRUD completo con **archetipo Documento** (testata + righe), stato `draft → confirmed`. La **Conferma** posta i `stock_movement` collegati (`stock_document_id`). In `draft` il documento è modificabile; confermato, si rettifica con un nuovo documento/movimento. (Chiude anche il residuo "Documenti → DetailPage-archetipo" del 20/06.)

**AI in magazzino (seconda strada):** la cattura ("scaricato 200 m di cavo dal furgone in commessa Napoli") propone movimenti → review → apply deterministico. Ma il **manuale** sopra dev'esserci comunque.

---

## 6. STATO 20/06 — cosa completare / sostituire (mappa decisa)
| Voce del 20/06 | Decisione |
|---|---|
| QBE "operatore = select, non type-aware" | **Sostituito** dal Filtro Gruppo §2.1 (freccettina+pop-up). |
| `SortDialog` a tendina | **Sostituito** da Ordina §2.2. |
| Picker export separato | **Unificato** su `FieldPicker` §2.4. |
| Conteggi viste col filtro | **Completare** in §2.1. |
| Long-tail i18n (header colonne/box) | **Completare**: traduci con glossario di traduzione che proponi, poi il titolare valida (it-IT/en/es-AR). Non lasciare costanti italiane. |
| Dedup Soggetti AI-assistita | **Fast-follow** (resta deterministica per ora). |
| Magazzino Documenti archetipo | **Completare** in §5.5. |
| Assenza approvata: DELETE ripristina `used` | **Correggere** (bug saldo). |
| **Push GitHub** | I 7 commit precedenti sono solo locali (`main ahead 7`): vanno **pushati** (azione del titolare) prima del giro di test. |

---

## 7. DATI & ENDPOINT
- **Esiste:** `saved_view` (036, filtro+ordine+colonne+export sotto nome, RLS proprie+condivise) · `filterSql.buildFilter` · `sortSql.buildOrderBy` · export dinamico da `field_definition` · indici trgm (037).
- **Nuovo — migrazione `038_saved_report.sql`** (additiva): `saved_report(id, tenant_id, user_id, entity, name, payload jsonb {show,sum,group,options,layout}, is_shared bool default false, audit, archived_at)`; UNIQUE (tenant_id,user_id,entity,name); RLS proprie+condivise come `saved_view`.
- **Endpoint Report:** `GET/POST/DELETE /saved-reports` + `POST /reports/render` (config → HTML/PDF server-side).
- **Magazzino:** completa i CRUD/endpoint mancanti per `stock_location` (incl. figli), `stock_movement` (solo POST + POST `/stock-movements/:id/reverse` per la rettifica), `stock_document` (CRUD + `/confirm`). `stock_balance` solo GET.
- I `FieldPicker` leggono `GET /field-definitions?entity=X`.

---

## 8. ORDINE DI ESECUZIONE (a blocchi, ognuno con `DONE_<n>.md` + screenshot vs mockup)
1. **Motore comune** §1 (`FieldPicker`, `SavedHeader`, `FloatingPopover`) — isolato, con storybook/pagina demo.
2. **Filtro Gruppo** §2.1 su Soggetti (replica `54_v1_3`), poi esteso. Test backend nuovi operatori.
3. **Ordina** §2.2 (replica `55`) + collegamento `buildOrderBy`.
4. **Colonne + Export** §2.3/2.4 unificati sul `FieldPicker`.
5. **Report Designer** §2.5 (replica `56`) + migrazione 038 + render HTML.
6. **Toolbar** §3 su `EntityList` (icone+tooltip) → si propaga a tutte le liste.
7. **Magazzino CRUD** §5 (Magazzini/Ubicazioni/Movimenti/Giacenze/Documenti).
8. **Anagrafiche identiche** §4: giro di verifica che il motore sia ovunque uguale.
9. **Residui** §6 (conteggi viste, i18n long-tail, assenze saldo).

Tra un blocco e l'altro: test funzionale reale + `DONE_*.md` con screenshot affiancati ai mockup.

---

## 9. NON FARE
- **Non** ridisegnare la scheda CRUD (`41` è lo standard): il motore ci galleggia sopra.
- **Non** usare chip grandi con testo nei campi: solo la **freccettina ▾** piccola + pop-up.
- **Non** rimuovere il trigger di immutabilità dei movimenti né tentare edit/delete: correggi con **rettifiche**.
- **Non** rendere modificabili le **giacenze** (derivate).
- **Non** lasciare entità senza CRUD manuale "perché tanto c'è l'AI": servono **entrambe** le strade.
- **Non** lasciare costanti italiane dove serve i18n.
- **Non** introdurre annidamento infinito di parentesi nel filtro (un solo livello).
- **Non** considerare "fatto" senza screenshot sovrapponibile al mockup.

*Fine piano. Mockup di riferimento: `41`, `54_v1_3`, `55`, `56` (+ `50–53`). Migrazione nuova: 038. Esecuzione a blocchi 1→9 con `DONE_*.md`.*
