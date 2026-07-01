# Proposta — WMS professionale: ubicazioni a livello di riga, movimenti guidati, consultazione giacenze

- **Data:** 01/07/2026 · **Chat:** 01.06 · **Autore:** Claude (richiesta Sivaf: "sviluppa la miglior idea possibile come i leader di mercato")
- **Obiettivo:** portare la gestione magazzino a livello dei leader (SAP EWM, Manhattan, Odoo Inventory, Infor): ogni movimento sa **da dove prelevare / dove versare** a livello di bin, in modo **guidato** (il sistema propone), con **consultazione potente** delle giacenze per articolo e ubicazione.

## 1. Come fanno i leader (sintesi operativa)

| Tema | Leader (SAP EWM / Manhattan / Odoo / Infor) |
|---|---|
| **Unità di giacenza** | "Quant": giacenza per **(articolo, ubicazione, lotto)**. Noi: `stock_balance(material, location)` ✔ (lotto già gancio). |
| **Codice ubicazione** | Codice **locale** univoco **per padre** (01-01-A si ripete in ogni scaffale); la **catena** (Zona/Corsia/Scaffale/Ripiano/Bin) lo rende univoco. ✔ *(fatto oggi, migr 066)* |
| **Documenti** | La riga porta **origine/destinazione a livello di riga**; il documento ha un **default** (magazzino/zona) che le righe ereditano e possono sovrascrivere. |
| **Prelievo (pick)** | Il sistema mostra **solo le ubicazioni dove l'articolo è presente**, con quantità, e **suggerisce** quale (strategia FEFO/FIFO/percorso più corto/round-trip). ✔ *(source-picker per articolo, fatto oggi)* |
| **Versamento (putaway)** | Il sistema propone ubicazioni **compatibili** (tipo bin corretto) e **con capacità disponibile**; blocca il sovraccarico. *(capacità già c'è, manca il filtro nel picker)* |
| **Movimenti diretti** | Trasferimenti bin→bin, resi, rettifiche per ubicazione. |
| **Consultazione** | Inquiry per **articolo** (dov'è, quanto, per bin, sotto scorta) e per **ubicazione** (cosa contiene). ✔ *(tab Giacenze per bin + path + riordino, fatto oggi)* |
| **Automazione/AI** | Creazione documenti assistita: da linguaggio naturale al documento con articoli+ubicazioni proposti. |

## 2. Cosa è GIÀ stato fatto (01/07, migr 066 + questa sessione)
- **Codice ubicazione univoco per padre** (non più per tenant): 01-01-A esiste in ogni scaffale. **Auto-codice** quando l'utente non lo mette (magazzini `MAG-###`, ubicazioni `UB-####`).
- **Catena completa** (`stock_location_path`, campo `pathLabel`): ovunque si mostra «Magazzino › Scaffale › Bin», mai il solo codice ambiguo. I picker ritornano la catena.
- **Movimenti con ubicazione**: maschera più larga; **prelievo intelligente** (scarico/rettifica → `SourceLocationPicker` mostra **solo le ubicazioni con giacenza** dell'articolo, con quantità); versamento → albero ubicazioni del magazzino.
- **Consultazione giacenze** (tab *Articoli & giacenze*): ora `subtreeOf` = mostra gli articoli **nelle loro ubicazioni (bin)** del magazzino, con **catena**, **giacenza per bin**, **totale articolo**, **stato riordino** (badge "riordino" se sotto scorta minima), ricerca e filtro "solo sotto scorta".
- **Schema pronto** per il livello-riga: `stock_document_line.source_location_id` / `dest_location_id` (migr 066).

## 3. Piano a fasi (proposto)

### Fase A — Ubicazioni a livello di RIGA nei documenti *(schema fatto; manca UI+conferma)*
- Ogni riga di DDT/Trasferimento/Pick/Carico ha **Origine** e/o **Destinazione** (picker ubicazione), **precompilate dal default del documento** e sovrascrivibili.
- La **conferma** genera i movimenti usando la ubicazione **di riga** (fallback: default documento).
- Prelievo per riga → `SourceLocationPicker` (solo dove c'è l'articolo). Versamento per riga → putaway picker (Fase B).
- *Effort medio. È il cuore del "documento professionale".*

### Fase B — Movimenti GUIDATI (suggerimento putaway & pick)
- **Putaway**: il picker di destinazione mostra solo ubicazioni del **tipo giusto** e con **capacità disponibile** (usa capacity_kind/max/occupied già presenti); ordina per "più adatta".
- **Pick**: ordina le ubicazioni-sorgente per strategia **FEFO** (scadenza lotto) → **FIFO** → **percorso** (coordinate aisle/rack), evidenzia la proposta.
- Trasferimento bin→bin rapido.

### Fase C — Maschera di CONSULTAZIONE globale (inquiry) *(molto richiesta)*
- **Per articolo**: "dov'è" — elenco ubicazioni con quantità in tutti i magazzini, totale, valore, sotto-scorta; drill-down.
- **Per ubicazione**: cosa contiene.
- **Report riordino**: articoli sotto scorta minima con suggerimento di riordino (usa `reorder_point`).
- Pagina dedicata `/stock/inquiry` + tab già potenziato nella scheda magazzino.

### Fase D — Creazione documenti ASSISTITA / AI *(desiderio del titolare)*
- Linguaggio naturale → documento: «trasferisci 10 ONT da Scaffale A a furgone di Ahmed» → il sistema crea il documento con articolo, quantità, origine (dove c'è l'articolo) e destinazione (capacità disponibile), pronto da confermare.
- Deterministico prima (funzione potente su regole giacenza/capacità), AI come strato di comprensione dell'intento. Riusa la pipeline AI esistente (`ai/`).

## 4. Note di modello dati
- `stock_balance(material, location)` resta la fonte di verità (quant). Lotti: `stock_movement.lot_id` già presente per FEFO (Fase B).
- Ubicazioni a livello di riga: colonne aggiunte (migr 066), nullable → retrocompatibile; se NULL, si usa il default del documento.
- Nessun UDC/pallet ancora (serve entità "unità di carico" per posti-pallet; Fase futura).

## 5. Raccomandazione
Procedere con **Fase A** (livello-riga sui documenti) come prossimo blocco: è ciò che rende i documenti "professionali" e sblocca prelievi/versamenti per bin reali. Poi **Fase C** (inquiry, alto valore percepito) e **Fase B** (guida). **Fase D (AI)** quando il deterministico è solido.
