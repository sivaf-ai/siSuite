# Risposta alla review · Blocco B (Ordinativi) — decisioni, menù e piano aggiornato

> Per **Claude Code**, da consegnare insieme al `BRIEF_Claude_Code_POWERCOM_v1_0_01.03.md`.
> In risposta a `2026-06-16_REVIEW_per_ClaudeAI_powercom_bloccoB.md` e `DONE_B_ordinativi_ftth.md`.
> Verificato sullo schema rigenerato `2026-06-16_schema_db_completo.md`. Chat 01.03 · 16/06/2026.

---

## 1. Verdetto sul Blocco B — **approvato**, con tre correzioni

Il lavoro è solido e nella direzione giusta. Approvo in particolare:
- **Prerequisito DB**: migrazioni 024→028 applicate, RLS verificata a due tenant, schema rigenerato. ✔ (confermato: `work_order`, `work_order_subject`, `work_order_item`, `work_line`, `job_cost_ledger` presenti).
- **Migrazione 029 additiva** per i campi fibra dell'ordinativo guidati da `field_definition` (non hardcodati): è esattamente il principio §3.2 del brief. ✔
- **Fix del runner migrazioni** (`ON CONFLICT (filename)`): corretto e legittimo — hai toccato il runner, non le migrazioni immutabili. ✔
- **PII server-side**: il dato in chiaro non arriva al client senza `pii:read`. È il modo giusto (il CSS non è una barriera). ✔
- **Import CSV con dedup** sull'UNIQUE gestore. ✔
- **Riuso del design system esistente** per gli archetipi già presenti (EntityForm da `field_definition`, StatusPill, Num/Money/Dur). ✔ — su questo Code ha ragione: **non si ricostruisce ciò che funziona già**.

Le tre cose che **non** vanno lasciate come sono (dettaglio nei capitoli che seguono):
1. **Il menù a 2 livelli è stato rinviato: lo anticipiamo, è il prossimo blocco.** (cap. 3)
2. **La scheda Ordinativi implementa i componenti "inline": vanno estratti** prima di replicarli su altre entità. (cap. 4)
3. **`data_scope` su `work_order` non è ancora applicato**: oggi la visibilità è solo per tenant. Va deciso e implementato. (cap. 6)

---

## 2. Decisioni sulle domande aperte (§4 review / §12 brief)

1. **Approccio Blocco A** → **Riuso approvato, MA il menù 2-livelli non si rinvia**: diventa il prossimo blocco (cap. 3). Mi prendo la mia parte: nel brief l'avevo messo come "Blocco A — Fondamenta UI" ma senza spec di dettaglio, e questo ti ha lasciato spazio per rinviarlo. Qui sotto lo specifico per bene.
2. **Mascheramento PII / indirizzo** → **L'indirizzo di attivazione resta VISIBILE** ai ruoli operativi (tecnico assegnato, planner, ufficio): serve per andare sul posto, ed è data-minimization corretta (lo vede chi deve eseguire). **Nome, telefono, codice fiscale restano mascherati** senza `pii:read`. Però l'indirizzo **è comunque un dato personale**: per i ruoli senza necessità operativa (es. Sola lettura/Contabile) non esporlo. Vedi anche cap. 6 sui grant.
3. **Import CSV** → **Mappatura configurabile lato client** confermata (nessun tracciato Sirti fisso). L'editor di mapping è parte del Blocco B-bis. ✔
4. **Cifratura password seriali** → **Applicativa lato server** confermata. Al checkpoint mostri solo `hasSecret`, il reveal gated da `serial:secret_read` arriva nel Blocco C. ✔
5. **Export CPM** → **Excel generico per WBS/voce** confermato come partenza. **Azione**: prima del Blocco G, chiedi a POWERCOM se TeamSystem CPM ha un **formato di import specifico** (colonne attese); se sì lo cabliamo, altrimenti resta l'Excel generico. Così eviti rilavorazioni a fine percorso.
6. **Ordine dei blocchi** → riordinato (cap. 5), con priorità alla **demo POWERCOM**.

---

## 3. IL MENÙ — prossima priorità: **AppShellNav2 (2 livelli)**

**Perché ora e non "più avanti".** Code ha rinviato il menù 2-livelli perché quello attuale (1 livello raggruppato) funziona. È un'obiezione ragionevole sul piano tecnico, ma la respingo per quattro motivi concreti:
1. È uno **standard normativo vincolante** del progetto (`02_navigation_menu`, mock `43`), non una rifinitura estetica.
2. È la **cornice in cui si innesta ogni schermata**: se costruiamo C, D, E… sulla shell a 1 livello, poi ogni schermata va re-innestata. La **mappa del menù del mock 43 è già pronta**, quindi farlo ora costa poco (si sostituisce il renderer della shell leggendo la mappa che hai già); farlo dopo costa di più ad ogni schermata aggiunta nel frattempo.
3. È **la prima cosa che si vede nella demo**: la navigazione a 2 livelli stile SAP Fiori è parte dell'impressione "prodotto moderno e scalabile" che vendiamo a POWERCOM.
4. Farlo ora ci permette di **estrarre i componenti riusabili** (cap. 4) prima di replicarli, così la fondazione è pulita.

**Cosa costruire (spec, dal mock 43 + standard `02_navigation_menu`):**
- **Rail L1** collassabile a sole icone; lo stato (aperto/ridotto) si **ricorda per utente**.
- **Sub-panel L2**: mostra le voci della **sezione attiva**, raggruppate con caption. **Nessun terzo livello. Massimo 2 click** per arrivare a qualunque voce.
- **Sezioni**: `Preferiti` · **LAVORO** (Cruscotto, Commesse, Campo, Magazzino, Finanza & Budget) · **DATI** (hub Anagrafiche: Aziende, Articoli, Risorse, Materiali) · **SISTEMA** (Impostazioni, Amministrazione, SuperUsers). Ordinativi (FTTH) sta sotto **Campo**.
- **Una sola rotta canonica per entità**; i richiami cross-modulo usano `↪` verso la **stessa** rotta (no duplicati). Regola del 10%: entità usata da ≥2 moduli → vive in **Anagrafiche**.
- **Omnibox ⌘K** = ricerca rapida **+** barra comandi AI. La ricerca può indicizzare inizialmente le voci di menù (lo "smart command" AI può restare placeholder, cablato alla cattura nel Blocco F).
- **Sibling tab bar** in cima alla pagina per spostarsi tra entità sorelle (es. Articoli · Giacenze · Movimenti · Documenti).
- **Preferiti** (★ pin per-utente) con sezione virtuale in alto; **Recenti** consigliato.
- Il menù **si nasconde per licenza + RBAC**, ma **non è la barriera di sicurezza** (lo resta il backend).

**Definition of Done del blocco menù:**
- Rail L1 collassabile e persistente per utente; sub-panel L2 con gruppi e caption; Ordinativi sotto Campo.
- Max 2 click a qualunque voce; 1 rotta canonica per entità; cross-link con `↪`.
- Omnibox ⌘K apre ricerca voci (+ slot AI placeholder).
- Sibling tab bar funzionante su almeno un gruppo (Magazzino).
- Visibilità filtrata per licenza+RBAC; backend resta la barriera (verifica: una voce nascosta non è raggiungibile nemmeno via URL diretto senza permesso).
- **Le schermate esistenti (Ordinativi) re-innestate nella nuova shell senza regressioni.**
- **Responsive**: su larghezza telefono la navigazione degrada in modo pulito (pattern Ionic), verificato in browser a width telefono.

---

## 4. Disciplina componenti — estrarre prima di replicare

La scheda Ordinativi oggi implementa **inline** (con le classi del mock 44) ciò che dovrebbe essere riusabile. Prima di costruire la seconda entità (Articoli), **estrai** in componenti condivisi e ri-punta Ordinativi su di essi:
- `ObjectPage` + `ObjectBox` + `RelatedTabs` (header sticky, box con titolo nel bordo, tab correlate in fondo).
- `EntityList` con `mode = manage | pick-single | pick-multi` (la modalità selezione-da-popup serve già negli Apparati pianificati e in mille altri punti).
- `CaptureBarAI` come componente (anche se la logica arriva nel Blocco F).

Motivo: il principio è **"una Lista e una Scheda per entità, riusate ovunque"**. Se Articoli copia-incolla il pattern invece di riusarlo, in tre schermate hai già tre varianti divergenti. Questo lavoro va **insieme al blocco menù** (sono entrambi "fondazioni").

---

## 5. Piano dei blocchi aggiornato (ordine consigliato)

Ho riordinato mettendo davanti le **fondazioni** e la **demo-readiness**.

1. **Blocco A "vero" — Fondazioni UI** *(nuovo prossimo passo)*: **AppShellNav2 (menù 2 livelli, mock 43)** + **estrazione componenti** (ObjectPage/EntityList pick-mode/RelatedTabs) + ri-innesto di Ordinativi. *(cap. 3-4)*
2. **Blocco C — Articoli & seriali (mock 45)**: ciclo `in_stock→assigned→installed`, parco installato, password cifrata e reveal gated. Costruito **sui componenti estratti** e dentro la **nuova shell**.
3. **Seed pack fibra (minimo) — anticipato qui**: gestore Sirti, commessa "Napoli Est 2026", ~30 ordinativi su vari stati, qualche seriale installato, 1 listino base con un paio di ritocchi. Serve perché **la demo abbia dati realistici** (oggi era previsto in coda al Blocco H: troppo tardi per il meet).
4. **Blocco B-bis — rifinitura Ordinativi**: editor mapping CSV in toolbar, azioni bulk (assegna/esporta), selezione multipla righe.
5. **Blocco D — Listino + `resolvePrice` (mock 46)**: prezzo "più specifico" (commessa › gestore › base), funzione unica riusata ovunque.
6. **Blocco E — Lavorazioni + libretto misure (mock 49)**.
7. **Blocco F — Rapportino + CaptureBarAI (mock 48)**: riusa `work_report` (+ `work_report_time_entry`); cattura vocale end-to-end (proposta → review → apply deterministico).
8. **Blocco G — Pivot preventivo-consuntivo (mock 47)** + export (Excel/CPM).
9. **Blocco H — Allineamenti magazzino (DDT/movimenti)** + seed pack completo.

> Se il meet POWERCOM è imminente, la sequenza minima da avere pronta è: **1 (menù) → 3 (seed) → Ordinativi (già fatto) → C (seriali/parco installato) → G (pivot)**. Sono i quadri che fanno "vedere il prodotto".

---

## 6. Punti di attenzione / correzioni

- **`data_scope` su `work_order`** (importante): l'RLS attuale di `work_order` isola **solo per tenant**. Va deciso: un **Tecnico** vede *tutti* gli ordinativi del tenant o *solo quelli della sua squadra/assegnati*? Se vale il secondo, applica `data_scope` (in RLS, come già fatto su `work_report`, oppure in query). Oggi è tenant-wide: non è un bug, ma è una decisione di visibilità da chiudere, non da lasciare implicita.
- **Grant di `pii:read`**: default "solo Owner" è prudente ma **operativamente stretto**. Planner e Ufficio quasi certamente devono vedere nome/telefono per gestire le pratiche; il tecnico assegnato potrebbe aver bisogno **del solo telefono** per chiamare il cliente. Proponi a Ricardo: `pii:read` assegnabile a Planner/Ufficio; valutare un permesso fine `pii:read:contact` per il tecnico. È una decisione di business: **segnalala, non deciderla da solo**.
- **Prova di fedeltà frontend**: i `DONE_*.md` d'ora in poi includano **screenshot** delle schermate nuove accostate al mock di riferimento, non solo il typecheck. È il modo per evitare il rischio storico "frontend generico" senza che Ricardo debba fare da QA visivo manuale ogni volta.
- **Toolbar Ordinativi**: per la **demo** rendi funzionanti **Importa** (con l'editor di mapping CSV) e **Assegna** (bulk); Filtri/Colonne/Azioni-AI possono restare "presto". Conferma con Ricardo quali sono demo-critical.
- **Box "Dati tecnici (fibra)"**: verifica a vista che sia **generato da `field_definition` (029)** e non reintrodotto a mano — è il test del principio metadata-driven.
- **Export CPM**: vedi decisione §5 — chiedi il formato a POWERCOM prima del Blocco G.

---

## 7. Cosa verificare ORA al checkpoint Blocco B (click-through per Ricardo)

Apri `http://localhost:5173` (owner@fibra.demo) → **Lavoro → Ordinativi (FTTH)** e controlla, contro il mock 44:
1. **Lista**: righe a 2 livelli; viste con contatori (Tutti/Da assegnare/In lavorazione/Completati/KO); toolbar a sole icone con tooltip; **nessuna icona-azione sulle righe**; selezione = solo numero.
2. **Scheda**: header sticky **opaco** con solo Salva/Annulla; `code` pill + StatusPill; **label e titoli box nel bordo**; box Pratica / Intestatario(PII) / Indirizzo / **Dati tecnici fibra** / Apparati; tab correlate in fondo; validazione **dentro** il campo.
3. **PII**: login `marco@fibra.demo` (Tecnico) → nome/telefono mascherati, "Mostra" bloccato; l'indirizzo invece **resta visibile** (decisione §2.2).
4. **Crea + Import**: "Nuovo ordinativo" salva con codice `2026-NNNN`; import CSV di prova → 1 creato, 1 doppione segnalato.

Se questi quattro punti tornano, il "metro" è validato e si può procedere col **Blocco A vero (menù)**.
