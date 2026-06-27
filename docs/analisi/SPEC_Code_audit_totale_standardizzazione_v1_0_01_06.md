# SPEC Code — Audit totale, bonifica integrità e standardizzazione

**Chat:** 01.06 · **Versione:** v1.0 · **Data:** 27 giugno 2026
**Governata da:** `REGOLE_CANONICHE_siSuite_v1_0_01_06.md` (la Carta) — questa SPEC ne è l'applicazione operativa su **tutto** il sistema esistente.
**Schema di partenza:** `2026-06-27_schema_db_completo.md` (75 tabelle). **Prossima migrazione libera: 052.**

> **Scopo:** non aggiungere funzioni, ma **rendere robusto, coerente e conforme** ciò che esiste. Il sistema deve smettere di sembrare "fatto a pezzettini per una demo" e diventare l'applicazione che ci eravamo proposti: moderna, dinamica, AI-first, **affidabile per costruzione**. Si controlla TUTTO: ogni tabella, ogni lista, ogni CRUD, ogni documento.
>
> **Principio guida (la Carta in una frase):** se un valore viene da un catalogo è una FOREIGN KEY (mai testo); un record usato non si cancella né si archivia; nessun duplicato entra mai; ogni schermata che usa un dato si aggiorna da sola senza relogin.

---

## Regole tassative
Valgono tutte quelle della Carta (A–G) e degli standard UI v2 / navigazione / `feedback_entity_standard` / `feedback_entity_selection_popup` / `feedback_db_integrity_canonical`. In più: **CLEAN SLATE** (DROP del legacy, niente shim), **ID da number_series**, **RLS su ogni tabella**, **nessuna fatturazione**.

## Modalità di esecuzione (autonoma, ma con AUDIT-PRIMA)
- **Prima si fotografa, poi si ripara.** La Fase 0 produce le matrici di conformità su TUTTO **prima** di qualunque correzione: così, anche se la bonifica fosse parziale, abbiamo la mappa completa dello stato reale (niente più sorprese).
- Esecuzione continua attraverso le fasi 0→5, senza fermarsi per conferme. Migrazioni da **052**, numerate in sequenza, una per gruppo logico, documentate.
- Per ogni entità/schermata corretta, annota l'intervento. Se un caso è ambiguo (es. una colonna `category` che è testo legittimo e non catalogo): **non forzare la FK**, documenta la scelta e prosegui.
- Coordinamento: questa chat possiede le migrazioni **052→060** (riserva ampia per l'audit). Aggiorna JOURNAL.

---

## FASE 0 — Inventario e matrici di conformità (nessuna modifica)

Produci due documenti-matrice. Sono il contratto di completezza: ogni riga PASS/FAIL/N.A. con nota.

### 0.1 — `AUDIT_conformita_DB.md` — le 75 tabelle × criteri Carta
Per **ogni** tabella, colonna per riga dove serve:
| Criterio | Cosa verificare |
|---|---|
| **FK integrità** | Ogni riferimento a un catalogo è FK uuid (non testo). FK su anagrafiche = `ON DELETE RESTRICT`. |
| **Unicità** | UNIQUE a DB su ogni chiave naturale, **incluse le righe di sistema** (no collisione tenant vs `tenant_id IS NULL`). |
| **RLS** | ENABLE + FORCE + policy tenant + GRANT a `sisuite_app` + owner `sisuite_admin`. |
| **Audit** | `created_at/updated_at/created_by/updated_by` (+ `archived_at` dove serve soft-delete). |
| **ID visibile** | Entità con codice a video → serie in `number_series`. |
| **Soft-delete** | Se archiviabile, esiste il controllo d'uso (non si archivia un record referenziato). |

### 0.2 — `AUDIT_conformita_UI.md` — ogni lista/CRUD/documento × standard
Elenca **tutte** le schermate (liste, schede, documenti) e per ciascuna:
| Criterio | Cosa verificare |
|---|---|
| **Toolbar completa** | Nuovo/Modifica/Duplica/Elimina/Esporta/Filtro/Aggiorna + slot Azioni AI. Nessuna toolbar ridotta. |
| **Lista = picker** | La stessa lista vera si riusa in selezione (Modal centrato) con "+ Nuovo" e modifica inline. |
| **Object Page** | Header sticky **opaco**, solo Salva/Annulla in alto, label nel bordo, validazione **dentro** il campo, tabelle correlate come tab in fondo. |
| **Duplica** | Apre CREATE precompilato senza chiavi e senza flag sistema, nessun "(copia)". |
| **Elimina** | Popup con il **nome** del record; bloccato se referenziato (messaggio che nomina entità/record). |
| **Input** | `NumInput` su tutti gli importi/quantità; `UnitSelect` su tutte le UM; date/ora nel formato standard. |
| **Reattività** | Creazione/modifica/rimozione visibile **senza relogin** in liste, picker e label dipendenti. |
| **Modal** | CRUD in Modal centrato (mai drawer laterale, mai popup nativi del browser). |

> 「NON FARE」 in Fase 0: nessuna correzione. Solo fotografia. Le matrici devono coprire il 100% delle 75 tabelle e di tutte le schermate.

---

## FASE 1 — Bonifica integrità referenziale (DB) · migrazioni 052+

### 1.1 — Convertire i riferimenti testuali a catalogo in FK (con `ON DELETE RESTRICT`)
**Colonne `unit` (text) → `unit_of_measure_id` uuid FK** (worklist verificato, da convertire tutte):
`material.unit`, `material.weight_unit`, `material_consumption.unit`, `pick_list_line.unit`, `price_list_item.unit`, `purchase_order_line.unit`, `stock_count_line.unit`, `stock_document_line.unit`, `stock_movement.unit`, `work_line.unit`, `equipment_usage.unit`.
- Migrazione: aggiungi la colonna FK, popola per match sul `code` UM esistente, **DROP** della colonna testo, crea la FK `ON DELETE RESTRICT` + indice.
- Frontend/backend: questi campi usano `UnitSelect` (catalogo UM) e salvano l'`id`.

**Colonne `category` (text) → valutazione caso per caso** (NON tutte sono catalogo):
- `material`-correlate / `price_list_item.category` → se rappresentano la categoria articolo, convertire in FK a `material_category`; altrimenti documentare.
- `lookup_value.category`, `canonical_state.category`, `field_definition.unit/category`, `skill.category` → con ogni probabilità **tassonomie interne/metadati**, non riferimenti a un catalogo gestito: **lasciare testo** (o trasformare in `lookup_value` dedicato se diventa gestibile), documentando la decisione nel report. **Non forzare FK dove non è un catalogo.**

### 1.2 — Unicità che include il sistema
Su `unit_of_measure`, `tax_rate`, `material_category`, `lookup_value` e ogni catalogo con righe di sistema: garantire che un codice di tenant non collida con un codice di sistema (`tenant_id IS NULL`). Aggiungere indice/controllo idoneo + messaggio. Verificare il controllo su **INSERT e UPDATE**.

### 1.3 — Soft-delete/archiviazione con controllo d'uso su TUTTE le anagrafiche
`company`, `material`, `site`, `asset`, `resource`, e ogni anagrafica archiviabile: l'archiviazione di un record referenziato è **bloccata** come la cancellazione, con lo stesso messaggio.

### 1.4 — Handler errori → messaggio professionale
Verificare/estendere l'handler globale: `23503` (FK) e `23505` (unique) producono un **popup leggibile e localizzato** che nomina l'entità bloccante e, dove possibile, i record specifici. Mai errore tecnico grezzo.

### Criteri di accettazione Fase 1
Test della Carta su UM e su almeno un'altra anagrafica: creo → referenzio → **non posso cancellare né archiviare** (messaggio coi record); non posso inserire/modificare verso un codice duplicato (anche vs sistema).

---

## FASE 2 — Standardizzazione documenti (master-detail)

Entità documento: `stock_document`(DDT), `purchase_order`, `pick_list`, `stock_count`, e i documenti di lavoro (`work_order`/`work_report`) dove applicabile.
- Tutti seguono l'**archetipo Documento** (testata + righe) in modo **identico**: header con stato/azioni (Ricevi/Conferma/Posta secondo il tipo), righe in griglia.
- Le righe usano i **picker che riusano le liste vere** (articoli/fornitori/magazzini), `UnitSelect` per le UM (ora FK) e `NumInput` per quantità/importi.
- **Integrità righe:** una riga non può referenziare un articolo/UM inesistente (FK); cancellare un articolo usato in un documento è bloccato.
- **Cancellazione** consentita solo in bozza; transizioni di stato coerenti e uniformi tra i tipi.

### Criteri di accettazione Fase 2
Apro ciascun tipo di documento: stessa ergonomia, picker coerenti, UM da catalogo, importi formattati; non riesco a cancellare un articolo usato in una riga.

---

## FASE 3 — Standardizzazione liste & CRUD (tutte le entità)

Per **ogni** schermata marcata FAIL nella matrice UI (Fase 0.2), portarla allo standard:
- **Toolbar completa** ovunque (chiusura definitiva del caso "IVA toolbar ridotta" e simili).
- **Lista riusata come picker** in selezione per ogni associazione.
- **Object Page**: header sticky opaco, solo Salva/Annulla, label nel bordo, validazione dentro il campo, tab correlate in fondo; righe a 1 o 2 livelli secondo l'entità.
- **Duplica/Elimina** standard ovunque (Elimina mostra il nome; Duplica precompila senza chiavi/flag).
- **NumInput/UnitSelect** su tutti gli importi/quantità/UM ancora scoperti: righe "apparati" dell'Ordine di lavoro, budget commessa, tariffe (`rate_card`), `time_entry`, listini.
- **CRUD in Modal centrato**, mai drawer/popup nativi.

### Criteri di accettazione Fase 3
Campionando 5 entità a caso dalla matrice, tutte hanno toolbar completa, picker che riusa la lista vera, Object Page conforme, Duplica/Elimina standard, input formattati.

---

## FASE 4 — Comportamenti trasversali (robustezza + AI-first)

1. **Reattività ovunque (no relogin, no letture stantie).** Il bus di invalidazione copre **tutte** le liste, **tutti** i picker e **tutte** le label risolte. Caso garantito: cancello/rinomino un'anagrafica → sparisce/aggiorna ovunque all'istante. Niente più "fantasmi" come l'unità cancellata ancora visibile.
2. **Niente popup nativi del browser** (alert/confirm): solo `ui/Modal`. Conferme distruttive col nome del record.
3. **Messaggi d'errore** sempre leggibili e localizzati (zod + 23503/23505).
4. **AI-first preservato.** La toolbar standard espone lo **slot Azioni AI** su ogni entità; lo strato deterministico irrobustito qui (FK, unicità, reattività) è **esattamente** ciò che rende affidabile il principio "l'AI propone, il livello deterministico conferma". *Costruire nuove funzioni AI resta in cantiere*: qui si garantisce solo che la fondazione e l'affordance ci siano.

### Criteri di accettazione Fase 4
Giro completo: nessuna schermata richiede relogin per vedere dati nuovi/rimossi; nessun popup nativo; ogni errore di integrità è un messaggio chiaro.

---

## FASE 5 — Re-test, Definition of Done e consegna

1. **Rigenera le due matrici** (DB e UI): devono risultare **tutte PASS** o N.A. documentato. Le matrici finali vanno nel report.
2. **Tre test canonici per ogni entità toccata** (Carta G): integrità referenziale (delete **e** archive bloccati), unicità (add **e** update), reattività (no relogin).
3. **Suite test backend** verde (incl. RLS) + smoke delle entità principali.
4. **Consegna** `DONE_TOTALE_3.md`: stato per fase, matrici finali, elenco conversioni FK eseguite e colonne lasciate a testo (con motivazione), interventi UI per schermata, assunzioni, punti residui. Rigenera il dump schema (`2026-06-2X_schema_db_completo.md`) e aggiorna gli ADR (almeno: ADR "Integrità referenziale canonica: FK obbligatorie + RESTRICT + reattività").

---

## Appendice — Worklist verificato dei riferimenti testuali (da Fase 1.1)
**`unit` text → FK `unit_of_measure` (11):** material, material(weight_unit), material_consumption, pick_list_line, price_list_item, purchase_order_line, stock_count_line, stock_document_line, stock_movement, work_line, equipment_usage.
**`category` text → valutare (5):** material/price_list_item (probabile FK material_category), lookup_value (interno, lasciare), canonical_state (stato, lasciare), skill (valutare lookup), field_definition (metadato, lasciare).

> Ordine esecuzione: 0 → 1 → 2 → 3 → 4 → 5. La Fase 0 (matrici) è il prerequisito di tutto: nessuna correzione prima di aver fotografato il 100% del sistema.
