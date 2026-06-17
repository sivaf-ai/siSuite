# Analisi di copertura — POWERCOM (fibra FTTH) vs siSuite

**Contesto:** POWERCOM s.r.l. (Somma Vesuviana, NA) è un'impresa di infrastrutturazione in fibra ottica che copre tutta la filiera: opere civili stradali → cablaggio → giunzione ottica → **Delivery** (attivazione FTTH nelle unità immobiliari). Ha scritto manifestando interesse a siSuite. Confronto del 15/06/2026.

---

## 1. Sintesi (in breve)

POWERCOM ha **tre bisogni**, in quest'ordine di priorità dichiarata:

1. **Magazzino cloud** → **già coperto** da siSuite.
2. **Gestione ticket delle attivazioni FTTH** (il loro vero gancio) → **copribile ORA** con configurazione + un modulo "Ordinativi" mirato + tracciamento seriali.
3. **Rendicontazione di contabilità industriale** (oggi su TeamSystem CPM Construction) → **modulo parallelo**, più impegnativo. Il cliente stesso dice che può tenere CPM per ora e colmare più avanti.

**Verdetto onesto:** i suoi due bisogni prioritari (1 e 2) li copriamo in questa versione, con un modulo nuovo ma costruito sulla spina esistente. Il punto 3 ("tipo CPM") è un modulo a parte: conviene farlo **bounded** sul nostro modello, non clonare CPM.

---

## 2. Cosa fa TeamSystem CPM (per inquadrare il punto 3)

CPM Construction è un ERP per l'edilizia focalizzato sulla **contabilità di cantiere / Direzione Lavori**. In sintesi (dal sito + dagli screenshot del cliente): prezzari e computo metrico, capitolato d'appalto, **libretto delle misure**, **SAL** (stati avanzamento), **certificati di pagamento**, giornale dei lavori, analisi prezzi/costi, confronto **preventivo-consuntivo**, business intelligence, app mobile per i rapportini, BIM 4D/5D. È un dominio **profondo e in parte normato** (Direzione Lavori opere pubbliche).

**Importante:** POWERCOM non usa l'intero apparato (SAL/certificati pubblici); usa la **fetta "contabilità di commessa / produzione"** — voci di capitolato × quantità → ricavi/costi, pivot per squadra/giorno, rapporto lavori da mobile. Questo restringe parecchio il gap reale da colmare.

---

## 3. Matrice di copertura

| Bisogno | Cosa serve a POWERCOM | Cosa ha siSuite oggi | Gap | Stato |
|---|---|---|---|---|
| **Magazzino cloud** | giacenze, carichi/scarichi, ubicazioni (anche furgone/squadra) | stock_movement / stock_balance / stock_document, media mobile, albero ubicazioni | tracciamento **seriali** apparati | ✅ coperto (+ piccola estensione seriali) |
| **Ticket attivazioni FTTH** | "ordinativo" con: ID univoco gestore, intestatario, indirizzo, telefoni, apparati da installare, **seriali installati**, stato pratica, squadra; volumi alti "a pezzi" | engagement→fase→attività, stati (`lookup_value`), numerazioni (`number_series`), campi per-verticale (`field_definition`), agenda/pianificazione, **cattura vocale AI**, RLS multi-tenant | UI "Ordinativi" dedicata + tracciamento seriali + import CSV | 🟡 copribile ORA (config + 1 modulo mirato) |
| **Contabilità industriale (tipo CPM)** | listino **voci di capitolato**, libretto misure, **WBS**, lavorazioni a quantità→ricavi, attrezzature/subappalti nel rapporto, preventivo-consuntivo + pivot, (SAL/certificati) | budget/margine per commessa/fase (costo/ricavo/margine), rapportini AI, foglio ore, materiali, listino tariffe (`rate_card`) | voci di capitolato→ricavi, WBS come dimensione, rapporto strutturato (attrezzature/subappalti/lavorazioni), pivot preventivo-consuntivo, (SAL/certificati) | 🔴 modulo parallelo |
| **Connettore import dai portali gestori** (Sirti/Fenice…) | import automatico ordinativi | — | l'accesso ai portali è in **2FA (Google Authenticator)** → automazione bloccata | ⚠️ manuale/CSV ora, API solo caso per caso |

---

## 4. Cosa consegniamo SUBITO (la sua priorità: magazzino + ticket)

Il **modulo Ordinativi/Ticket FTTH** si costruisce sulla spina esistente, senza riscrivere l'architettura:

- **Ordinativo** = entità sul modello attività/commessa (commessa = gestore/area, ordinativo = singola attivazione). I campi specifici fibra (ID gestore, intestatario, indirizzo, telefoni) entrano via `field_definition` — niente modifiche di schema.
- **Apparati**: distinzione *pianificati* (HUB6, ONT, splitter, borchia…) vs *installati con seriale* (+ password apparato). È il tracciamento seriali — una piccola estensione del magazzino "a seriali" (era già previsto come evoluzione 6B).
- **Stati pratica** (assegnato → in lavorazione → completato → KO/da ricontattare) via `lookup_value`; **codici** via `number_series`.
- **Assegnazione a squadre** + agenda/pianificazione (li abbiamo già).
- **Import CSV/Excel** degli ordinativi, in attesa di un'eventuale API del gestore.
- **Cattura vocale AI** (differenziatore forte vs CPM): il tecnico detta "attivata unità, montato ONT seriale X, splitter, due borchie" → l'AI propone la chiusura strutturata dell'ordinativo con materiali e seriali. Molto meno data-entry del form CPM.
- **Magazzino**: lo scarico di apparati/materiali sull'ordinativo genera i movimenti (meccanica che già abbiamo).
- **Privacy**: i dati dell'intestatario sono sensibili (il cliente cita contenziosi dei gestori). Qui siamo forti: RLS + mascheramento + ruoli/`data_scope`. Da valorizzare.

Questo copre **integralmente** la sua priorità 1–2 nella versione attuale.

---

## 5. Cosa è modulo parallelo (contabilità "tipo CPM")

- **Cosa avrebbe senso costruire** (bounded, sulla nostra spina): un modulo *Produzione / Contabilità di commessa* con **voci di capitolato** a listino, **righe di lavorazione** (quantità × prezzo → ricavo), **WBS** come dimensione sui movimenti, attrezzature e subappalti nel rapporto lavori, e una **vista preventivo-consuntivo/pivot** per commessa e squadra. Buona parte dei mattoni (budget/margine, rapportini, materiali, listino tariffe) c'è già: è soprattutto da aggiungere il modello "voce di capitolato → ricavo per quantità" e la dimensione WBS.
- **Cosa NON conviene clonare**: SAL, certificati di pagamento, registro di contabilità, giornale dei lavori normati, prezzari DEI, BIM. È il cuore maturo e normato di CPM: meglio che il cliente **tenga CPM** per quello.
- **Ponte intanto**: export dei consuntivi (ore, materiali, lavorazioni) verso CPM o Excel, così riducono la doppia imputazione **senza aspettare il modulo**. Rispetta il suo "possiamo accontentarci della frammentazione momentanea".

Sforzo: **medio-grande**, fase successiva a magazzino+ticket. Da fare con una sessione di design dedicata (come per magazzino avanzato).

---

## 6. Dove siamo più forti di CPM (leve per il meet)

- **Cattura vocale AI** → il tecnico parla, l'AI struttura. CPM è data-entry manuale a form.
- **Cloud multi-tenant + RLS + mascheramento privacy** sugli utenti finali (loro hanno proprio questo timore).
- **Magazzino cloud** con media mobile e ubicazioni (furgone/squadra).
- **Configurabilità per-verticale** (`field_definition`): i campi dell'ordinativo fibra si aggiungono senza toccare lo schema.

CPM resta più forte su: contabilità lavori normata (SAL/certificati), prezzari ufficiali, BIM, maturità del dominio edile. Onestà: su quel terreno non li inseguiamo, lo lasciamo a loro.

---

## 7. Raccomandazione per il meet

1. **Mostra subito magazzino + un mock "Ordinativi FTTH"** (lista "a pezzi" con ID gestore/indirizzo/stato/squadra + scheda ordinativo con apparati e seriali + cattura vocale). È esattamente la sua priorità 1–2: vede il valore immediato.
2. **Posiziona la contabilità "tipo CPM" come fase 2** (modulo dedicato), e intanto offri **l'export verso CPM/Excel**: gli dài una via senza promettere subito il pezzo grosso.
3. **Sul connettore ai portali**: sii onesto — con il 2FA l'import automatico non è garantito; partiamo con inserimento manuale o CSV, e l'API la valutiamo solo se il gestore la espone.

> In una riga: **i suoi due problemi urgenti (magazzino + ticket di attivazione) li risolviamo in questa versione**; la contabilità industriale è un modulo parallelo da fare bounded più avanti, e nel frattempo CPM resta dov'è.
