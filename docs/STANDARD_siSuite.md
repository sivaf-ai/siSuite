# STANDARD siSuite — Regole tassative (enforcement cross-sessione)

> **Scopo:** raccolta UNICA di tutte le regole di prodotto/UI/DB che OGNI sessione deve rispettare, su OGNI entità presente e futura. Se una regola qui contrasta con un'implementazione esistente, l'implementazione va corretta. Le maschere **specializzate** con mockup HTML dedicato (rapportino, filtro QBE, report designer, pianificazione) replicano il mockup 1:1 e fanno eccezione SOLO dove esplicitato.
>
> **Versione:** v1.0 · **Data:** 28/06/2026 · **Fonti:** memorie `feedback_*` + Carta integrità + sessioni audit 01.06.
> Le regole sono numerate per poterle citare nelle review (es. «viola S-L3»).

---

## A. Database & integrità (la Carta)

- **DB-1 — Riferimenti a catalogo = FOREIGN KEY uuid, mai testo.** Se un valore proviene da un catalogo/anagrafica è una FK (es. unità di misura → `unit_id` FK `unit_of_measure`, categoria → `category_id` FK `material_category`). Mai memorizzare il codice come testo libero. *Eccezione documentata:* tassonomie/metadati interni non gestiti come catalogo restano testo (`lookup_value.category`, `canonical_state.category`, `field_definition.category/unit`, `skill.category`, `price_list_item.category`, enum applicativi come `*.kind`/`company_role.role`).
- **DB-2 — FK su anagrafiche con `ON DELETE RESTRICT`.** La cancellazione fisica di un record referenziato è bloccata a DB (errore 23503 → 409 leggibile).
- **DB-3 — Mai chiavi duplicate.** Ogni chiave naturale ha un UNIQUE a DB. Il controllo include le **righe di sistema** (`tenant_id IS NULL`): un tenant non può duplicare un codice di sistema (indice parziale `WHERE tenant_id IS NULL` + check applicativo su INSERT **e** UPDATE). Handler 23505 → 409 che nomina il valore.
- **DB-4 — Unicità ignora gli ARCHIVIATI.** Gli UNIQUE "chiave naturale" sono parziali `WHERE archived_at IS NULL`: un record soft-deleted **non** blocca la ricreazione della stessa chiave. *Eccezione:* identità fisiche immutabili (es. `stock_serial_unit.serial`) restano uniche anche da archiviate. *(Aggiunta sessione 28/06: bug «Prova».)*
- **DB-5 — Soft-delete con controllo d'uso.** Un record archiviabile referenziato **non si archivia** (la FK RESTRICT non scatta sull'UPDATE `archived_at` → serve `context/usageGuard.ts`): 409 col **nome** del record e le **entità** referenzianti. Vale come e quanto la cancellazione fisica.
- **DB-6 — RLS su OGNI tabella:** `ENABLE` + `FORCE ROW LEVEL SECURITY` + policy tenant + `GRANT` a `sisuite_app` (owner `sisuite_admin`). Tabelle globali di sistema: `read=true / write=app_is_platform_admin()`.
- **DB-7 — Audit colonne:** `created_at/updated_at/created_by/updated_by` (+ `archived_at` dove serve soft-delete) sulle entità; trigger `set_updated_at`.
- **DB-8 — ID a video da `number_series`.** I codici mostrati all'utente si generano da `number_series` (`nextNumber`), non a mano.
- **DB-9 — Naming SQL:** nuove tabelle/colonne **lowercase concatenato** (no snake_case, no CamelCase quotato), allineato al legacy.
- **DB-10 — CLEAN SLATE:** niente shim/compatibilità legacy; quando si converte (es. testo→FK) si DROPpa la colonna vecchia. Nessuna fatturazione attiva.
- **DB-11 — Migrazioni:** una per gruppo logico, numerate in sequenza (prossima libera annotata in JOURNAL), idempotenti, applicate via servizio `migrate`. Aggiornare il dump schema e gli ADR per i cambi strutturali.

## B. Liste (EntityList) — il "motore liste"

- **L-1 — Ogni entità standard usa `ui/EntityList`** sia per vedere sia per selezionare (mai `DataTable`/`CrudList`/liste custom per entità standard).
- **L-2 — Toolbar RICCA** (ordine canonico): **Filtra (Gruppo) · Ordina · Colonne · Report · Esporta · AI** + azioni su selezione (**Modifica · Duplica · Elimina**) + **Nuovo +**. Tutte icone+tooltip. La toolbar built-in è generata da EntityList: NON aggiungere `leftActions` placeholder disabilitati.
- **L-3 — Testata lista FISSA (sticky) e A FILO.** Header (titolo/viste) + toolbar + barra filtro attivo restano in alto durante lo scroll: **scrollano solo le righe**, non la maschera intera. Implementato centralmente in EntityList (`.dsx-head { position: sticky }`) → vale per tutte le liste. *(Aggiunta sessione 28/06.)*
- **L-3-bis — MAI un buco sopra la barra sticky (tassativo, ribadito più volte).** La barra del titolo/toolbar (liste) e la barra Salva/Annulla (schede) devono stare **a filo** del bordo superiore dello scroll: niente padding-top dove le righe possano comparire tra la barra e il menu dell'app. Meccanismo: `Page` usa layout *flush* (niente `--padding-top`) sia per le schede (`bleed`) sia per le liste (Page senza header), e `.dsx-head`/`.op-head` fanno bleed orizzontale e `top:0`. Quando aggiungi una nuova lista/scheda **non reintrodurre il gap**.
- **L-4 — Reload all'ingresso:** `useReloadOnEnter(reload)` su ogni lista (Ionic tiene le pagine in cache → senza, restano dati stantii).
- **L-5 — Click riga → scheda** `/<entity>/:id`; **Nuovo +** → `/<entity>/new` (o CRUD in Modal in pick mode).
- **L-6 — Esporta/Filtra/Ordina server-side** dove l'endpoint lo supporta (`?q/?filter/?sort` con `buildFilter`/`buildOrderBy`); altrimenti documentare il limite.

## C. Scheda / CRUD (ObjectPage)

- **C-1 — CRUD = `ui/ObjectPage`** (ObjectBox con **label nel bordo**: `.dsx/.bgrid/.bf/.bl/.bi`, non `.field/.txt`). I campi vengono da schema + `field_definition` (`ui/AttrFields`).
- **C-2 — Header sticky OPACO a filo:** barra **solo Salva/Annulla** in alto, a filo del titolo, **senza gap** dove scorrono i dati. Validazione **dentro** il campo (campi obbligatori in **rosso**) + toast chiaro.
- **C-3 — CRUD SEMPRE in `ui/Modal` centrato** quando richiamato da liste/tab/pick. **Mai** `Drawer` laterale, **mai** `IonModal` fullscreen.
- **C-4 — Master-detail = `RelatedTabs`** in fondo alla scheda (i dati correlati in TAB sotto il master, non tab-bar custom a livello pagina). Es. Articolo → Seriali/Giacenze/Movimenti; Magazzino → Articoli&Giacenze/Movimenti/Ubicazioni.
- **C-5 — Input tipizzati:** `ui/NumInput` su TUTTI gli importi/quantità; `ui/UnitSelect` su TUTTE le UM (catalogo); date/ora nel formato standard. Mai `<input type=number>` grezzo per importi.
- **C-6 — Schemi zod create:** FK/stringhe opzionali sempre `.nullable().optional()` (la UI invia `null`) → altrimenti 400.

## D. Selezione entità (picker)

- **D-1 — Scegliere un'entità = riuso della SUA lista vera** in modalità selezione (EntityList `pick-single`/`pick-multi`), dentro un **`ui/Modal` CENTRATO** (mai pannello laterale, mai `<select>` per entità, mai lista ad-hoc). I `<select>` restano SOLO per enum/lookup (stato, tipo, priorità…).
- **D-2 — "+ Nuovo" nel picker:** dal popup si crea l'entità al volo (CRUD embeddata in Modal) senza uscire dal documento. Pattern: `*PickerDialog` + `ui/PickerField` (campo "scegli" con label nel bordo). Dialog esistenti: Material/Company/Location/Resource/Engagement/WorkOrder.
- **D-2-bis — Apertura picker = sola icona lente** (niente testo "Scegli"/"Cambia"); l'etichetta resta in `title`/`aria-label`.
- **D-3 — UUID mai a video:** i picker mostrano nomi/codici, ritornano i DTO completi.
- **D-4 — Estendere a OGNI punto di scelta** entità, presente e futuro.

## E. Azioni standard di riga

- **E-1 — Elimina con NOME (conferma UNICA).** La conferma è UNA sola, mostrata da EntityList col **nome** del record (prima colonna `value` o prop `rowLabel`); selezione multipla elenca i nomi. **La pagina NON aggiunge una seconda `ConfirmDialog`**: l'`onDelete` passato a EntityList esegue direttamente la cancellazione. *(Fix sessione 28/06: era doppia su UM/IVA.)*
- **E-2 — Duplica STANDARD:** NON crea subito; apre il CRUD "nuovo" **precompilato** coi dati della riga **senza i campi chiave** (codici da number_series, email, SKU, seriali, P.IVA…) e **senza flag di sistema**; nessun suffisso "(copia)". Una riga alla volta (`useEntityActions.duplicateBody` → `state.prefill`).
- **E-3 — Righe di sistema** (`isSystem`/`tenant_id IS NULL`) in sola lettura: niente modifica/elimina dal tenant.

## F. Documenti (master-detail)

- **F-1 — Archetipo Documento identico** per DDT/Ordine d'acquisto/Pick list/Inventario/Rapportino: **testata + righe nella stessa pagina** (`ui/DocumentArchetype`/ObjectPage + griglia righe `.subt` compatta), header con stato/azioni (Ricevi/Conferma/Posta secondo il tipo).
- **F-2 — Righe = picker** (articolo/fornitore/magazzino) + `UnitSelect` (UM da catalogo, FK) + `NumInput` (qtà/importi).
- **F-3 — Integrità righe:** una riga non può referenziare articolo/UM inesistente (FK); cancellare un articolo usato in una riga è bloccato.
- **F-4 — Cancellazione documenti solo in BOZZA** (`status='draft'`); i confermati hanno generato movimenti → si stornano con rettifica (backend DELETE solo se draft). La LISTA documenti ha la toolbar standard come le anagrafiche.

## G. Comportamenti trasversali

- **G-1 — Reattività cross-entità (no relogin):** dopo create/update/delete, tutte le liste/picker/label che usano quell'anagrafica si ricaricano da sole. Bus `api/cache.ts` (`apiFetch`/`apiUpload` su metodo ≠ GET → `invalidatePath`; `useApi` si risottoscrive) + `useReloadOnEnter`. Mai "fantasmi".
- **G-2 — Niente popup nativi del browser:** mai `window.confirm/alert/prompt`. Solo `ui/ConfirmDialog`/`ui/PromptDialog`/`ui/Modal` centrati e formattati. Conferme distruttive col nome del record.
- **G-3 — Messaggi d'errore leggibili e localizzati (it-IT):** zod (campi non validi elencati) + 23503 (nomina l'entità bloccante) + 23505 (nomina il valore duplicato). Mai errore tecnico grezzo.
- **G-4 — AI-first preservato:** la toolbar standard espone lo **slot Azioni AI** su ogni entità; lo strato deterministico (FK, unicità, reattività) è ciò che rende affidabile «l'AI propone, il deterministico conferma».

## H. Definition of Done (per ogni entità toccata)

I **3 test canonici** devono passare prima del "fatto":
1. **Integrità referenziale:** creo → referenzio → **non posso cancellare né archiviare** (messaggio coi record).
2. **Unicità:** non posso inserire **né modificare** verso un codice duplicato (anche vs sistema); un archiviato non blocca la ricreazione.
3. **Reattività:** creazione/modifica/rimozione visibile **senza relogin** in liste, picker e label.

Più: typecheck shared+BE+FE puliti, suite test backend verde, smoke delle entità principali.

---

### Storico modifiche standard
- **v1.0 (28/06/2026):** prima raccolta unificata. Aggiunte in sessione: L-3 (testata lista fissa), E-1 (conferma unica), DB-4 (unicità ignora archiviati). Consolidate le regole delle memorie `feedback_entity_standard`, `feedback_entity_selection_popup`, `feedback_db_integrity_canonical`, `feedback_objectpage_sticky_header`, `feedback_no_native_popups`, `feedback_sql_naming` + ADR-0010.
