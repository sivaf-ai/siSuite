# Proposta — Gestione Ubicazioni di magazzino PROFESSIONALE (WMS)

- **Data:** 30/06/2026 · **Chat:** 01.06 · **Stato:** **Fase 1 FATTA** (migr 063) · **Fase 2 FATTA** (migr 065: capacità volume/peso/quantità + % riempimento + blocco/avviso + volume articolo; UDC rinviato) · **Fase 3 FATTA** (tab «Mappa occupazione», heatmap per zona/scaffale, solo FE riusando `subtreeOf`). Fase 4 (putaway/prelievo) da fare.
- **Obiettivo del titolare:** vendere il magazzino anche standalone, con gestione ubicazioni di livello dei leader di mercato: creazione **massiva** di ubicazioni a coordinate (scaffale × ripiano × posizione), **capacità/spazio** per ubicazione, gestione professionale.

## 1. Come fanno i leader (sintesi)
WMS professionali (es. logiche tipo SAP EWM, Manhattan, Odoo Inventory, Infor) modellano l'ubicazione come **bin** dentro una gerarchia a coordinate:

```
Magazzino → Zona → Corsia (Aisle) → Scaffale (Rack/Bay) → Ripiano (Level/Shelf) → Posizione (Bin)
```
- Ogni bin ha un **codice strutturato** (es. `A-01-03-B` = Corsia A, Scaffale 01, Ripiano 03, Posizione B) generato da regole.
- **Creazione massiva**: si definiscono i range (Corsie A–D, Scaffali 1–10, Ripiani 1–5, Posizioni A–C) e il sistema genera tutte le combinazioni (qui 4×10×5×3 = 600 bin) in un colpo.
- **Capacità**: ogni bin ha limiti — volume (m³), peso (kg), n° posti-pallet/UDC, o quantità per articolo. Il sistema impedisce/segnala il sovraccarico.
- **Tipo bin** e regole: picking / stoccaggio / staging / quarantena; strategie di putaway (dove mettere la merce) e di prelievo (FIFO/FEFO, percorso).
- **Stato occupazione**: % riempimento per bin/scaffale/zona, mappa visiva.

## 2. Proposta per siSuite (incrementale, sul nostro EntityTree)
Manteniamo `stock_location` ad albero (già fatto) e lo arricchiamo:

### 2.1 Coordinate strutturate (migrazione)
Aggiungere a `stock_location` campi opzionali: `aisle`, `rack`, `level`, `position` (testo brevi) + `code` (già esiste). Il codice si compone da questi (regola configurabile). Restano compatibili gli alberi semplici (chi non li usa li lascia vuoti).

### 2.2 Generatore MASSIVO di ubicazioni (la feature chiave)
Un comando «**Genera ubicazioni**» sul magazzino/scaffale: form con i **range** per ogni livello (es. Ripiani 1→5, Posizioni A→C) + pattern del codice (`{rack}-{level}-{pos}`). Anteprima del conteggio e dei primi codici, poi creazione in transazione (tutti i bin come figli, con coordinate e codice). Endpoint `POST /stock/locations/:id/generate` con i range.

### 2.3 Capacità / spazio per ubicazione
Aggiungere `capacity` strutturata: scegliere il **criterio** (volume m³ · peso kg · n° UDC/pallet · quantità) e il **valore massimo**. In giacenza calcoliamo l'occupato e mostriamo **% riempimento** + blocco/avviso al superamento (configurabile). L'articolo può avere volume/peso unitari (già abbiamo weight; aggiungere volume) per il calcolo automatico.

### 2.4 Tipo bin + viste
- `stock_location_kind` (già lookup configurabile) esteso con tipi bin: scaffale, ripiano, posizione, picking, staging, quarantena (rinominabili/icona/colore — già supportato).
- Vista **mappa occupazione** (heatmap % per scaffale/zona) come tab del magazzino — fase 2.

### 2.5 Putaway/prelievo (fase 3, avanzata)
Regole "dove stoccare" (per categoria/dimensione → zona) e ottimizzazione percorso di prelievo. Solo se serve, post-MVP.

## 3. Piano a fasi
- **Fase 1 (core, alto valore):** coordinate + **generatore massivo** + tipo bin. È ciò che chiedi (scaffale con x/y/z creati in blocco).
- **Fase 2:** capacità/spazio + % riempimento + avvisi + volume articolo.
- **Fase 3:** mappa occupazione visiva.
- **Fase 4 (opzionale):** putaway/prelievo ottimizzati.

## 4. Perché è vendibile standalone
Coordinate + generazione massiva + capacità + mappa = il nucleo che ogni azienda con scaffalature si aspetta da un WMS. Sul nostro stack (EntityTree + lookup configurabili + RLS multi-tenant) è coerente e veloce da estendere.

## 5. Domanda
Approvi la **Fase 1** (coordinate + generatore massivo + tipo bin) come primo blocco? Poi Fase 2 (capacità). Le altre a seguire.
