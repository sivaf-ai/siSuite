# siSuite — Guida rapida d'uso e glossario

> Per usare siSuite senza perdersi nei termini tecnici. Verticale **fibra (FTTH)**.
> Pensata per chi gestisce e per le squadre sul campo. Chat 01.03 · Giugno 2026.

---

## 1. Cos'è siSuite, in due righe
È il programma dove **registri il lavoro del campo e ne vedi i conti**. La cosa speciale: il tecnico può **parlare** (o scrivere in modo naturale) e l'AI trasforma quelle parole in dati ordinati; tu confermi, e il sistema li salva. Poi siSuite ti **racconta** com'è messa la commessa, anche a voce.

Regola d'oro da ricordare: **l'AI propone, tu disponi.** L'intelligenza artificiale non scrive mai da sola nel database: prepara, tu confermi.

---

## 2. I concetti in 1 minuto (in parole semplici)

- **Commessa** = il contratto con un gestore su una zona. Esempio: «Sirti — Napoli Est 2026». Dentro ci stanno tante attivazioni.
- **Ordinativo** = la singola attivazione a casa di un cliente (il "ticket"). Una commessa ne contiene centinaia.
- **Intestatario** = il cliente finale dell'attivazione. I suoi dati sono **protetti** (vedi §4.8).
- **Articolo** = una voce di magazzino (un ONT, una borchia, del cavo…) o un **servizio** (es. posa).
- **Seriale** = il numero unico stampato sul singolo apparato. Lo usiamo per sapere *quale* pezzo è stato montato e dove.
- **Parco installato** = l'elenco di cosa è montato a ogni indirizzo. Serve per l'assistenza futura.
- **Voce di capitolato** = una "riga di listino" del lavoro, con un codice (es. `B-1.1`), un prezzo di **costo** e uno di **ricavo**.
- **Listino base + ritocchi** = un listino unico; i "ritocchi" cambiano il prezzo solo per un certo gestore o commessa.
- **Fase / WBS** = il modo di **dividere la commessa in pezzi** (es. «Tratta A»). "WBS" è solo il nome tecnico di questa suddivisione.
- **Lavorazione** = quanto hai eseguito di una voce di capitolato (es. 62 metri di disfacimento) → genera il **ricavo**.
- **Libretto misure** = invece di scrivere "62 m" a mano, registri i parziali (es. `24×1`, `6×1,5`, `29×1`) e il sistema li **somma**.
- **Rapportino** = il foglio di giornata: ore, mezzi, materiali, subappalti, lavorazioni, foto.
- **Preventivo–consuntivo (pivot)** = la tabella che confronta **quanto avevi previsto** con **quanto è successo davvero**, e ti dà il **margine**.
- **Cattura vocale** = il microfono: detti, l'AI propone le righe.

---

## 3. La mappa del menù (dove trovo le cose)
Il menù ha **due livelli**: a sinistra le grandi aree, accanto le voci di quell'area.

- **Campo** → Ordinativi (FTTH), Agenda, **Rapportini**, Catture vocali
- **Magazzino** → Articoli & seriali, Giacenze, Movimenti, Documenti (DDT), Inventario
- **Commesse** → Elenco, Fasi & WBS, Pianificazione, **Lavorazioni**
- **Finanza & Budget** → **Preventivo–consuntivo**, Budget, **Listino voci**, Export CPM/Excel
- **Anagrafiche** → Aziende (gestori, fornitori, clienti), Articoli, Risorse
- In alto la barra **⌘K**: ci scrivi e cerca *oppure* chiede all'AI (es. «ordinativi KO di Sirti a Napoli»).

---

## 4. Come si fa — i flussi principali

### 4.1 Caricare gli ordinativi
Due strade: **Importa da CSV** (i file che scarichi dal portale del gestore) oppure **+ Nuovo** a mano.
→ *Campo › Ordinativi › icona Importa* oppure *+*. Il **codice** (es. `2026-0042`) lo mette il sistema.

### 4.2 Assegnare a una squadra
Selezioni uno o più ordinativi (compare un numerino con quanti) e premi l'icona **Assegna a squadra**. Lo stato passa a *Assegnato*.

### 4.3 Chiudere un ordinativo **a voce** (il bello)
Apri l'ordinativo → premi il **microfono** in alto → detti: *«Montato ONT seriale ON22A-7741, una borchia e uno splitter, attivazione ok»* → l'AI propone i **seriali**, gli **apparati** e lo **stato**. Controlli e premi **Salva**. Niente da scrivere a mano.

### 4.4 Registrare i seriali installati
Nell'ordinativo, scheda **Seriali installati**: *Aggiungi seriale* → scansiona il codice o scegli dal magazzino. Il pezzo passa a *Installato* ed entra nel **parco installato** di quell'indirizzo. La **password** dell'apparato resta mascherata e si sblocca solo con permesso.

### 4.5 Compilare il rapportino di giornata
*Campo › Rapportini › +*. Testata (commessa, fase, data, squadra), poi le **sei sezioni** (Manodopera, Attrezzature, Materiali, Subappalti, Lavorazioni, Foto). Puoi **dettarlo**: *«4 ore squadra Napoli 2, mini-escavatore mezza giornata, 60 metri di disfacimento»* → l'AI compila le righe. In alto vedi subito **costi, ricavi e margine** della giornata.

### 4.6 Aggiungere una lavorazione con **libretto misure**
Nella sezione *Lavorazioni* (o in *Commesse › Lavorazioni*): scegli la **voce di capitolato**, poi nel **libretto** aggiungi i parziali con la formula (es. `24 × 1,00`). Il sistema **somma** e calcola da solo quantità e ricavo. Se un gestore ha un prezzo diverso, il **ritocco** si applica in automatico.

### 4.7 Listino e ritocchi
*Finanza › Listino voci*. Ogni voce ha **costo** e **ricavo**. Per cambiare il prezzo a un solo gestore/commessa: apri la voce → *Aggiungi ritocco*. Regola: vale sempre il prezzo **più specifico** (commessa › gestore › base).

### 4.8 Dati protetti dell'intestatario (privacy)
Nome, telefoni e indirizzo del cliente finale sono **mascherati** (`•••`). Per vederli in chiaro serve il permesso `pii.read`: premi **Mostra**. È pensato apposta così, perché è il punto delicato per i gestori. A fine pratica i dati si possono cancellare senza toccare lo storico tecnico.

### 4.9 Leggere la pivot preventivo–consuntivo
*Finanza › Preventivo–consuntivo*. In alto i numeri chiave (ricavi, costi, **margine**, margine %). La tabella si **raggruppa** per Commessa › Fase/WBS › Voce. Apri/chiudi i gruppi. Per portare i dati in **CPM o Excel**: icone **Esporta**.

---

## 5. Glossario A–Z (parole semplici + esempio)

| Termine | In parole semplici | Esempio |
|---|---|---|
| **Apparato** | Un dispositivo da installare. | ONT, HUB6, borchia, splitter |
| **Articolo** | Una voce di magazzino o un servizio. | «ONT SKY_OF», «Posa (servizio)» |
| **Cattura vocale** | Detti e l'AI struttura. | «montato ONT 7741…» |
| **Commessa** | Contratto gestore + zona. | «Sirti — Napoli Est 2026» |
| **Consuntivo** | Quanto è successo davvero. | costi/ricavi reali |
| **DDT** | Documento di carico/scarico magazzino. | carico da fornitore |
| **Fase / WBS** | Sottoparte della commessa. | «Tratta A» |
| **Giacenza** | Quanti pezzi hai a magazzino. | 42 ONT |
| **Gestore** | L'operatore committente. | Sirti, Open Fiber, FiberCop |
| **Intestatario** | Il cliente finale (dati protetti). | sig. M. R. |
| **Libretto misure** | I parziali che fanno la quantità. | `24×1 + 6×1,5` |
| **Listino** | Le voci con i loro prezzi. | «Listino base 2026» |
| **Lavorazione** | Quanto eseguito di una voce. | 62 m di B-1.1 |
| **Margine** | Ricavo meno costo. | € 27/m · 69% |
| **Ordinativo** | La singola attivazione (ticket). | `2026-0042` |
| **Parco installato** | Cosa c'è montato a un indirizzo. | ONT 7741 in Via Roma 14 |
| **PII** | Dati personali del cliente finale. | nome, telefono, indirizzo |
| **Preventivo** | Quanto avevi previsto. | budget di ricavo |
| **Pivot** | Tabella di confronto e margini. | preventivo vs consuntivo |
| **Ritocco** | Prezzo diverso per un gestore/commessa. | B-1.1 a 42 € per Sirti |
| **Seriale** | Numero unico del singolo apparato. | `ON22A-7741` |
| **Squadra** | Il gruppo che esegue. | «Napoli 2» |
| **Stato** | Punto della pratica. | Assegnato / In lavorazione / KO |
| **Voce di capitolato** | Riga di listino con costo e ricavo. | `B-1.1` Disfacimento |

---

## 6. Per la demo a POWERCOM (ordine consigliato)
1. **Schema d'insieme** (il file HTML `50_schema_flusso_moduli`) per dare la mappa.
2. **Ordinativi FTTH** (mock 44): mostra la lista «a pezzi», apri una scheda, **detta** la chiusura, fai vedere l'**intestatario mascherato**.
3. **Articoli & seriali** (mock 45): la scheda con le **unità seriali** = parco installato.
4. **Rapportino esteso** (mock 48) + **Libretto misure** (mock 49): la giornata dettata e la misura che si somma.
5. **Preventivo–consuntivo** (mock 47) + **Listino con ritocchi** (mock 46): il **margine** in tempo reale e l'**export verso CPM**.
6. Chiudi con la **privacy by design** e il **pilota a tappe** (slide finali del deck).

> Suggerimento: la demo tecnico gira anche su PC a larghezza "telefono" (Ionic/React in qualsiasi browser): non serve un secondo dispositivo.
