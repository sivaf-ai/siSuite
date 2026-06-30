# STD — Selezione di riferimenti & classificazioni (picker / lookup)

**Versione:** 1.0.0 · **Stato:** Normativo (interno siSuite, candidato a standard aziendale) · **Livello:** A (concetti neutri; sintassi/UI nei binding)

> Come si compila un campo che **referenzia un'altra entità** o che **classifica** un record. Regola di prodotto: **mai testo libero, mai combo improvvisata** per questi campi. Vale per qualunque stack.
> Note: `⟨termine generico⟩` fra parentesi angolari; esempi concreti marcati *(siSuite)*. Corrisponde alla regola **D-0** di `docs/STANDARD_siSuite.md`.

---

## 1. Principio

Un campo che **punta a un'altra entità** o che **classifica/tipizza** un record è un **catalogo gestito**, non un campo di testo. L'utente non deve "scrivere" un riferimento: lo **sceglie** da una fonte controllata. Così i dati restano coerenti, filtrabili e affidabili.

**Perché:** se "Categoria" è testo libero, dieci utenti scrivono dieci varianti ("Elettrico", "elettrico", "ELETT.") e qualunque filtro/raggruppamento/report diventa inaffidabile. Se "Cliente" è una combo statica, non puoi crearne uno al volo né riusare la ricerca/azioni della sua lista.

---

## 2. I due casi (decision tree)

```
Il campo cita un'altra ENTITÀ che ha una sua LISTA/anagrafica?
 ├─ SÌ  → PICKER A LENTE: riusa la lista vera in popup (con "+ Nuovo").     [§3]
 └─ NO  → È una CLASSIFICAZIONE "leggera" (tipo/categoria/stato/natura)?
          ├─ SÌ → CATALOGO LOOKUP configurabile + SELECT.                   [§4]
          └─ NO → è un vero ENUM tecnico chiuso e stabile? → SELECT semplice.
```

Mai: input di testo per un riferimento/classificazione; combo "ad-hoc" che duplica una lista già esistente; UUID a video.

---

## 3. Caso A — FK a un'ENTITÀ con lista → **picker a lente**

Il campo memorizza una **FK** (uuid) all'entità. In UI si sceglie con un **campo "scegli"** (etichetta nel bordo) + **icona lente** che apre un **popup centrato** contenente **la stessa lista vera** dell'entità (quella del menu), in modalità selezione, con:
- ricerca/filtri/colonne della lista reale riusati;
- **"+ Nuovo"** per crearne uno al volo senza uscire dal documento;
- click-riga per aprire/scegliere; ritorno del record completo (id + nome).

**Dati:** la FK è uuid con `ON DELETE RESTRICT` verso l'anagrafica (vedi standard integrità). In lettura il DTO espone anche il **nome** per mostrarlo (mai l'uuid).

**UI (neutro):** `⟨PickerField⟩` (mostra il nome scelto + lente) + `⟨EntityPickerDialog⟩` (popup che ospita la lista in pick). Niente `<select>` per queste scelte.

> *(siSuite)* `ui/PickerField` + `ui/*PickerDialog` (Company/Location/Resource/Engagement/Site/Material/Unit/Category). Campi convertiti: Materiale → Unità di misura (`UnitPickerDialog`) e Categoria (`CategoryPickerDialog`, albero); Asset → Sito (`SitePickerDialog`); testate documenti → Cliente/Fornitore/Magazzino/Articolo.

**Varianti:**
- **Entità ad albero** (es. categorie, siti, WBS): il picker mostra l'**albero** in selezione (click sul nodo) — vedi standard "entità ad albero".
- **Scope/filtro:** il picker può essere filtrato dal contesto (es. i Siti del Cliente già scelto).

---

## 4. Caso B — Classificazione "leggera" → **catalogo lookup configurabile**

Tipologie, categorie, stati, nature: piccole liste **configurabili dall'amministratore**. Si memorizza il **codice** (o una FK al lookup), si sceglie con un **`<select>`** (eccezione enum/lookup: per i lookup il select è ammesso, anzi corretto).

**Dati:** un **dizionario unico** filtrato per "categoria/scope" (un'unica tabella di lookup, non N tabelle), con righe **di sistema** (non cancellabili) + righe **del tenant** (aggiunte/rinominate). Gestibile da un pannello di Impostazioni.

> *(siSuite)* tabella `lookup_value` (categoria + canonico + label i18n + colore), configurabile in *Impostazioni › Stati & etichette*. Esempi: `asset_kind` (Tipo asset), `skill_category` (Categoria competenza), `*_status`, `priority`. Selezione via `useLookups().byCategory(...)`.

**Quando lookup e quando tabella dedicata:** se la classificazione è **piccola e configurabile** → lookup (consigliato, niente nuova tabella, gestione centralizzata). Se diventa una **vera anagrafica ricca** (con descrizione/icona/relazioni proprie) → promuovila a entità con lista (Caso A).

---

## 5. Regole UX (tassative)
- **Riferimento a entità = picker a lente**; **classificazione = select da lookup**; **enum tecnico chiuso = select**. **Mai** testo libero.
- Picker = **popup CENTRATO** che riusa la **lista vera** (mai un elenco ad-hoc, mai un pannello laterale), con **"+ Nuovo"**.
- **UUID mai a video**: si mostrano nome/codice/etichetta.
- Le righe **di sistema** dei lookup sono in sola lettura (rinominabili dal tenant via override, non eliminabili).
- Coerenza: lo **stesso** picker/lookup ovunque si scelga quella entità/classificazione (un solo modo).

---

## 6. Definition of Done (nuovo campo di riferimento/classificazione)
1. Stabilito il caso (A entità→picker / B classificazione→lookup / enum→select).
2. **A:** colonna FK uuid `RESTRICT`; DTO con nome risolto; UI `PickerField` + dialog che riusa la lista; "+ Nuovo".
3. **B:** voce/i nel dizionario lookup (righe di sistema + configurabili); UI select dal lookup; nessuna tabella ridondante.
4. **Mai** rimasto un input testo o una combo ad-hoc per il campo.
5. Test: il valore si sceglie solo da fonte controllata; "+ Nuovo" (nel caso A) funziona; rinominare un lookup si riflette ovunque; un valore eliminato/archiviato si comporta secondo lo standard integrità.

---

## 7. Binding (il COME)
Sintassi DDL della FK/lookup, componenti `PickerField`/dialog, hook di lettura lookup → nei binding di stack. Questo doc è il **cosa**.
