# siSuite — Decisioni e brief operativo per Claude Code

> **Data:** 13/06/2026 · **Autore della sessione di decisione:** Sivaf (titolare) + Claude AI
> **Scopo:** fissare le decisioni prese e dare a **Claude Code** istruzioni precise e ordinate.
> **Regola d'oro di questa sessione:** ciò che si rimanda va **scritto** (in `BACKLOG_futuro.md`),
> mai lasciato alla memoria. Nessun punto rinviato deve andare perso.

---

## 0. Principio guida ribadito (vale per tutto ciò che segue)

Il sistema **non forza mai** le decisioni operative: **propone una soluzione già pronta, l'utente conferma**.
È l'estensione naturale del principio già nello schema ("l'LLM propone, il deterministico dispone")
applicato alla pianificazione. In pratica, ovunque ci sia un conflitto o un cambiamento:

1. il sistema **mostra il problema**;
2. il sistema **propone una soluzione concreta già calcolata** (non solo l'allarme);
3. l'utente **conferma con un tocco**, oppure **modifica al volo** la proposta prima di confermare;
4. il sistema **non sposta mai nulla in automatico e di nascosto**.

Questo è il vero significato di "AI-first" per noi e va tenuto presente in ogni schermata che gestisce
conflitti, slittamenti o riprogrammazioni.

---

## 1. DECISIONI PRESE — Dipendenze tra attività

Riferimenti repo verificati: tabella `activity_dependency` in `db/migrations/001_schema_core.sql`
(campi `predecessor_id`, `successor_id`, `type dependency_type DEFAULT 'FS'`, `lag_minutes`,
`CHECK (predecessor_id <> successor_id)`, `UNIQUE (predecessor_id, successor_id)`, cascade su delete attività);
lettura già esistente `GET /engagements/:id/dependencies` in `packages/backend/src/routes/activities.ts`;
permessi `dependency:read` / `dependency:manage` in `packages/shared/src/permissions.ts`.

### 1.A — Le dipendenze DEVONO guidare davvero l'agenda → **SÌ (obiettivo finale)**
Il sistema deve far rispettare le dipendenze e **riorganizzare dinamicamente le agende** in caso di problemi.
Il meccanismo per **definire** una dipendenza deve essere **semplice e forte**; il meccanismo per **farle
rispettare** deve essere **molto dinamico**.

### 1.B — Quando qualcosa slitta → **AVVISO + SOLUZIONE PROPOSTA, mai auto-spostamento**
Non basta segnalare il conflitto (rischioso: i responsabili potrebbero non vederlo).
Il sistema deve **presentare già la riprogrammazione proposta**, pronta da confermare con un tocco,
con possibilità di **modificarla rapidamente prima di confermare**. (Vedi §0.)

### 1.C — Sequenza di costruzione → **prima la parte semplice, poi l'integrazione nell'agenda**
- **ADESSO:** la parte semplice (definire/creare/cancellare le dipendenze + etichetta "dopo X").
- **DOPO (dopo le persone/risorse, vedi §2):** l'integrazione nel motore agenda e la soluzione-proposta.
- **OBBLIGO:** l'integrazione rimandata va **scritta in `BACKLOG_futuro.md`** (vedi §6). Non va dimenticata.

### Dettagli tecnici approvati (decisi, non da ridiscutere)
1. **Un solo tipo di legame: Finish-to-Start (FS).** SS/FF/SF restano nello schema ma **non** si espongono in UI.
2. **Attesa (`lag_minutes`) presente**, mostrata in modo semplice all'utente ("+2 giorni"), non in minuti.
3. **Niente dipendenze tra commesse diverse:** `predecessor` e `successor` devono avere lo **stesso `engagement_id`**.
4. **Controllo anti-ciclo obbligatorio** prima dell'inserimento (vedi §3, lavoro #7).
5. **Creazione dal dettaglio attività:** sezione "Bloccata da" con tendina delle altre attività della commessa.
   Niente drag-to-link sul Gantt per ora (rimandato).

---

## 2. DECISIONI PRESE — Ordine di lavoro (priorità)

Priorità orientata alla **vendibilità** (siamo in fase critica, serve un prodotto dimostrabile).
Confermato dal titolare. **L'app del tecnico viene anticipata** rispetto alla lista originale (vedi §4).

**Blocco demo — ciò che fa colpo su un cliente (massima priorità):**
1. **L'AI che racconta** (lato uscita del loop AI). Da **verificare se esiste** e, se manca, costruirlo (vedi §3 #2).
2. **Schermo per assegnare le persone** alle attività (vedi §3, lavoro "Assegnazione risorse UI").
3. **App del tecnico dimostrabile su PC** (vedi §4) — i punti 1 e 2 vanno **visibili anche nella vista mobile del tecnico**.

**Blocco credibilità — ciò che rende il prodotto serio:**
4. **Disponibilità risorse:** lo scheduler deve sottrarre ferie/indisponibilità (`resource_availability`).
5. **Scheduling per-risorsa:** il motore deve distinguere *chi* fa l'attività (oggi è un'unica timeline).
6. **Agenda a griglia** risorse × giorni (mock 03/21).

**Blocco profondità:**
7. **Dipendenze — parte semplice** (la §1.C "adesso"). *Prerequisito: fix sicurezza §3 #1.*
8. **Modelli di lavoro** (template commessa: "Nuova piscina standard" → 12 attività già concatenate).

**Poi:** avvisi/notifiche, completamento app tecnico, portale cliente, lingue `en`/`es-AR`.

**RIMANDATO ma da NON dimenticare:** integrazione dipendenze nel motore agenda + soluzione-proposta (§6).

---

## 3. COSE DA SISTEMARE — istruzioni precise per Claude Code

### #1 — Chiudere il buco di sicurezza sulla scrittura delle dipendenze *(prima di costruire la creazione)*
**Stato reale (verificato):** la RLS su `activity_dependency` (in `002_rls_policies.sql`, "Gruppo 1") controlla
**solo** `tenant_id`. La tabella `activity` invece ha lo scope fine (`act_select`: `own` = creata da me o assegnata a me).
**Precisazione importante:** con i ruoli di sistema attuali il buco **non è sfruttabile**, perché `dependency:manage`
è concesso solo a **Owner** e **Planner**, entrambi `data_scope='tenant'` (vedono tutto). Il buco è **latente**:
si aprirebbe se un tenant creasse un **ruolo custom** che combina `data_scope='own'` **con** `dependency:manage`.

**Cosa fare (difesa in profondità, da fare comunque prima del POST):**
- Nel futuro handler `POST /dependencies`: dopo aver risolto il contesto, **verificare la visibilità di entrambe le
  attività** facendo una `SELECT` su `activity` per `predecessor_id` e `successor_id` **attraverso la connessione
  RLS** (`withRls()`). Se una delle due non torna → **rifiuta (404/403)**. Questo riusa automaticamente la policy
  `act_select` e chiude il buco anche per i ruoli custom.
- **Verificare anche** `predecessor.engagement_id == successor.engagement_id` (stessa commessa, §1 dettaglio 3).
- Opzionale/futuro: una policy RLS dedicata su `activity_dependency` che richieda la visibilità di entrambe le
  attività (più robusto ma più complesso). Per l'MVP basta il controllo applicativo qui sopra — **da documentare**.

### #2 — Verificare/costruire "l'AI che racconta" (lato uscita del loop)
**Stato reale (verificato):** la pipeline AI in `packages/backend/src/ai/` copre solo l'**ingresso**
(operazioni `log_time`, `log_material`, `set_activity_status`, `check_checklist_item`, `clarify`).
Il **lato uscita** (l'AI legge i dati strutturati e racconta) **non risulta costruito** — ma è dentro l'MVP
(`MVP_progetto.md` §1 "traduttore bidirezionale" e §4 "l'AI racconta in uscita").

**Cosa fare:**
- **Prima verifica** se esiste già un percorso di narrazione/riepilogo. Se no, costruiscilo.
- Endpoint **di sola lettura**, es. `GET /engagements/:id/narrative` (o `POST /engagements/:id/summary`):
  1. raccoglie i dati strutturati **sotto RLS** (attività, stato/rollup, `time_entry`, `material_consumption`,
     output di `/schedule`);
  2. li passa all'LLM con istruzione di **riassumere in linguaggio naturale nella lingua dell'utente**
     (`app_user.locale`);
  3. ritorna il testo.
- **Sola lettura:** non scrive nulla, quindi **non** passa dal validatore deterministico di scrittura — **ma deve
  rispettare la RLS** (racconta solo ciò che l'utente può vedere).
- **Costo basso:** modello piccolo, contesto stretto (è frequente).
- **Dove mostrarlo:** `CommessaDetailPage.tsx` (titolare/pianificatore) **e** nella vista mobile del tecnico
  (es. riepilogo della giornata / "chiedi"). È il momento "wow" del demo.

### #3 — Fedeltà visiva delle schermate (gate bloccante)
**Il titolare segnala molte differenze tra i mockup di riferimento e le schermate costruite.** Questo va preso sul serio.
**Regola (vincolante):** `docs/FRONTEND_SPEC.md` §7 — una schermata è "fatta" **solo** se **combacia visivamente**
con la maschera corrispondente in `docs/mockup/01..26_*.html` (layout, spaziature, tipografia, componenti),
non solo se ha i campi giusti.

**Cosa fare:**
- Per **ogni** schermata, confronto **a vista** contro il mockup corrispondente. Produrre un **elenco delle differenze**
  (spaziature, tipografia, colori via design token, uso dei componenti del kit, campi mancanti) e correggere finché combacia.
- Verificare che `packages/frontend/src/theme/design-system.css` sia allineato a `docs/mockup/base.css` (token, non hex cablati).
- **Priorità ai mockup che compaiono nel demo:** vista tecnico/oggi (mock 01/02/04/21/22), dettaglio commessa (mock 24/07),
  pianificazione (mock 03), dashboard (mock 05).
- **Non accettare** "strutturalmente equivalente": il gate è la somiglianza visiva.

### #4 — Copia di sicurezza su GitHub (ad ogni sessione)
**Aggiornamento dal titolare:** il repository GitHub **ora esiste**. (Il titolare tiene anche una copia sul proprio NAS.)
**Cosa fare:** **al termine di ogni sessione di lavoro** (e dopo ogni unità di lavoro significativa):
`git add -A` → `git commit -m "..."` → `git push`. Verificare che il `remote` GitHub sia configurato.
Committare subito le modifiche non ancora committate (l'ultimo commit noto era `ed5d99b`).
**Regola:** nessuna sessione si chiude con lavoro non committato e non pushato.

### #5 — Reti di sicurezza (test) sul motore agenda *(prima di toccarlo)*
**Perché:** lo scheduler (`packages/backend/src/flow/scheduler.ts` + `routes/schedule.ts`) verrà modificato per
disponibilità risorse (§2.4), per-risorsa (§2.5) e dipendenze (§6). Oggi ha **0 test** (esistono solo 3 test RLS).
Una modifica potrebbe rompere il calcolo dell'agenda **senza che nessuno se ne accorga**.

**Cosa fare — scrivere una suite di test che "blocca" il comportamento attuale, PRIMA di modificare:**
- Dato un insieme di attività fisse (`scheduled_start` valorizzato) + dinamiche (`estimated_minutes`) e gli orari di
  lavoro (`tenant.working_hours`), **asserire l'agenda calcolata**. Casi minimi da coprire:
  1. le **fisse** diventano occupazioni e le dinamiche si versano nei buchi;
  2. **`earliest_start`** rispettato (una dinamica non parte prima);
  3. **`due_by`** non raggiungibile → segnalato (`due_by_missed` / `unplaceable`), **non** violato;
  4. ordinamento delle dinamiche per **priorità poi data di creazione**.
- Ogni modifica successiva allo scheduler **gira contro questi test** (sicurezza anti-regressione).
- Quando si aggiungono disponibilità / per-risorsa / dipendenze, **aggiungere nuovi test per ciascuno**.

---

## 4. APP DEL TECNICO — piano di sviluppo + vincolo demo su PC

**Vincolo del titolare:** in un demo online è difficile condividere lo schermo di due dispositivi. L'app del tecnico
deve poter **girare anche su PC**, sullo stesso schermo del pannello del pianificatore.

**Buona notizia (fattibile, nessun secondo dispositivo necessario):** il frontend è **Ionic + Capacitor + React + Vite**,
cioè **un'app web**. Le viste mobile del tecnico **girano in qualsiasi browser**. Per il demo:
- aprire le viste del tecnico in una **finestra del browser a larghezza telefono** (~390px) — o in modalità
  emulazione dispositivo del browser — **accanto** al pannello pianificatore in un'altra finestra, **sullo stesso PC**;
- per resa scenica del demo: avvolgere le viste tecnico in una **cornice "telefono"** (device frame in CSS) quando
  visualizzate su desktop, così nel demo si legge subito come "questo è il telefono di Mario". Opzionale ma d'impatto.

**Come organizzare lo sviluppo (priorità per il demo, non tutto subito):**
1. **Le viste che portano la tesi vengono prima.** Stato attuale: `/today` (TodayPage) e `/captures` (CapturePage)
   esistono; le mock 21 (agenda mobile), 22 (catture mobile), 23 (cerca) sono **placeholder/parziali**.
   Concentrarsi su: **lista piatta di oggi + cattura voce/testo + il nuovo riepilogo/racconto (§3 #2)**.
2. Rendere queste 2-3 schermate **perfette a larghezza telefono** e **fedeli ai mockup 21/22** (gate §3 #3).
3. Il loop di cattura (voce → estrazione → conferma → commit) deve essere **visibile end-to-end** sulla vista tecnico
   (il backend c'è già; serve esporlo bene nella UI mobile).
4. **Rimandare** il resto dell'app mobile (agenda completa, ricerca) a dopo il demo.

**Promemoria operativo demo:** le funzioni AI (estrazione + racconto) si attivano solo con `ANTHROPIC_API_KEY` nel `.env`.
Assicurarsi che la chiave sia presente sull'ambiente del demo.

---

## 5. Riepilogo decisioni "dettaglio tecnico" approvate in blocco

(Approvate dal titolare senza riserve.)
- Dipendenze: solo FS in UI; `lag` mostrato come giorni; stessa commessa obbligatoria; anti-ciclo obbligatorio;
  creazione da tendina "Bloccata da" nel dettaglio attività; no drag-to-link per ora.
- Ordine di lavoro come in §2.
- I 5 interventi di §3 vanno fatti come scritto.

---

## 6. DA NON DIMENTICARE — voce nuova per `BACKLOG_futuro.md`

> **Claude Code: aggiungi questa riga a `BACKLOG_futuro.md`** (è la fonte di verità anti-dimenticanza).

**Modulo:** Integrazione dipendenze nel motore agenda + **soluzione proposta** alla riprogrammazione.
**Stato:** rimandato (dopo scheduling per-risorsa e dopo la suite di test scheduler).
**Cosa comprende:**
1. lo scheduler rispetta le dipendenze **FS**: ordinamento topologico + `earliest_effettivo(succ) =
   max(earliest_start(succ), fine(pred) + lag)`; predecessore non collocabile → successore **bloccato**;
2. al verificarsi di un conflitto/slittamento, il sistema **non auto-sposta**: rileva il conflitto e **genera una
   riprogrammazione proposta** (un insieme concreto di spostamenti) **pronta da confermare con un tocco**, con
   **modifica rapida** prima della conferma (principio §0).
**Perché rimandato:** è la modifica a più alto rischio del motore; va fatta dopo il per-risorsa e con i test in rete.
**Aggancio ora (così non ci si pittura in un angolo):** costruendo la parte semplice delle dipendenze, salvare gli archi
puliti e accendere il tag "dopo X"; progettare la UX del picker così che possa in futuro ospitare il pannello
"soluzione proposta". Lo schema (`activity_dependency` con FS/SS/FF/SF + `lag`) è già completo: nessuna migrazione.
**Costo di retrofit:** Medio (modifica scheduler contenuta ma delicata + UI di proposta/conferma).

**Nota sulla qualità della proposta:** la *bontà* della riprogrammazione proposta dipende da quanto è "intelligente"
il motore. La **prima versione** può proporre uno spostamento semplice (es. "sposta il successore in conflitto a dopo
il predecessore + lag"); diventerà più sofisticata quando arriverà il **solver** (Timefold/OR-Tools, già in backlog #3,
post-MVP). Va comunicato così: la proposta parte semplice e migliora.

---

## 7. Checklist sintetica per Claude Code

- [ ] Commit + push su GitHub a fine sessione (e configura il remote se assente). *(§3 #4)*
- [ ] Suite di test che blocca il comportamento attuale dello scheduler — **prima** di modificarlo. *(§3 #5)*
- [ ] Verifica se "l'AI che racconta" esiste; se no, costruisci l'endpoint di sola lettura + UI. *(§3 #2)*
- [ ] Costruisci lo schermo di assegnazione risorse (backend e vincolo anti-doppia-prenotazione già pronti). *(§2.2)*
- [ ] Rendi le viste tecnico (oggi + cattura + racconto) demo-ready a larghezza telefono, fedeli ai mockup. *(§4, §3 #3)*
- [ ] Passa al gate di fedeltà visiva schermata per schermata contro `docs/mockup/`. *(§3 #3)*
- [ ] Sottrazione `resource_availability` nello scheduler. *(§2.4)*
- [ ] Scheduling per-risorsa. *(§2.5)*
- [ ] Agenda a griglia risorse × giorni. *(§2.6)*
- [ ] Fix sicurezza visibilità su scrittura dipendenze — **prima** del POST/DELETE. *(§3 #1)*
- [ ] Dipendenze, parte semplice: `POST /dependencies`, `DELETE /dependencies/:id`, anti-ciclo, stessa commessa,
      picker "Bloccata da", tag "dopo X". *(§1.C, §1 dettagli)*
- [ ] Aggiungi a `BACKLOG_futuro.md` la voce "integrazione dipendenze nello scheduler + soluzione proposta". *(§6)*
- [ ] Modelli di lavoro (template commessa). *(§2.8)*

---

*Fine brief — 13/06/2026.*
