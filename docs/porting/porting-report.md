# Porting Sivaf — Report del primo trasferimento (2026-06-18)

> Migrazione **eseguita e committata** del solo tenant **Sivaf reale** dal legacy `DBCompanyManagement` (5432) al nuovo `siSuite` (5433), in un **tenant nuovo dedicato**. Gli altri 14 tenant NON toccati.

## Esito

- **Tenant nuovo:** `72adbb79-94ac-597f-bee1-3f125178dc34` — "Si.Va.F. Informatica"
- **Login app:** `vieyra@sivaf.it` / `Sivaf2026!` (utente GoTrue creato; password da cambiare)
- **Verifica end-to-end via API** (login + RLS): `/me` risolve il tenant; `/engagements`=17, `/companies`=37, `/assets`=35, `/resources`=30, `/activities`=5.279, `/time-entries` e `/absences` OK.

### Dati trasferiti

| Entità nuova | Righe | Origine legacy |
|---|---:|---|
| tenant | 1 | tenants[Sivaf] |
| app_user | 30 | users |
| resource (person) | 30 | users |
| company | 37 | companies (36) + 1 placeholder interno |
| company_contact | 15 | contacts |
| asset | 35 | assets (albero → piatto) |
| engagement | 17 | projects (15) + 2 catch-all (varie, ODL) |
| phase | 302 | projectsstructures (albero, integro) |
| activity | 5.279 | tasks (5.062) + 217 attività WBS sintetiche |
| time_entry | 16.156 | worksummary HP+IW → ore |
| absence_entry | 2.413 | worksummary EP → giustificativi |
| work_order | 16 | workorders |

### Validazione chiave
**Somma minuti ore: legacy 2.598.583 = nuovo 2.598.583 → differenza ZERO.** (≈ 43.310 ore storiche, importate come `approved` + `is_locked`, `lock_reason='ETL_HISTORICAL'`.)

### Scartati consapevolmente (con motivo)
- **778** righe "interruzioni di produzione" (IH) con `quantity` NULL → nessuna durata da registrare.
- **17** voci di costo (CI) + **6** articoli (PI) → rinviati (material/cost: pochissimi, non core per Sivaf).

---

## I VERI PROBLEMI AFFRONTATI (con esempi e decisioni)

### 1. CamelCase quotato nel legacy — rompe ogni SELECT ingenua
**Problema:** colonne come `"Language"`, `"Sequence"`, `"Name"`, `"Cost"` sono salvate CamelCase **con virgolette** in Postgres. Una `SELECT Language FROM users` fallisce con *"column language does not exist"* (Postgres abbassa a minuscolo i nomi non quotati).
**Esempio reale:** lo script è andato in errore due volte di fila — prima su `Language` (users), poi su `Sequence` (projects).
**Soluzione:** quotare e aliasare ogni colonna CamelCase: `SELECT "Language" AS language`. Regola valida per ~20 tabelle legacy.

### 2. I progetti legacy NON hanno un'azienda cliente
**Problema:** `engagement.company_id` è NOT NULL nel nuovo schema, ma la tabella `projects` legacy non ha **nessun** riferimento a un'azienda (solo `idtenant`, `idprojectstructure`, `idasset`). Non esiste un legame progetto→cliente da migrare.
**Decisione:** creata un'azienda placeholder **"Si.Va.F. (interno)"** a cui sono agganciate tutte le 15 commesse e gli asset. È la scelta corretta per un primo trasferimento (i dati non contengono il legame), ma **va rivista**: se serve il cliente reale per commessa, la fonte è probabilmente fuori dalla tabella `projects` (es. derivabile da `businessrelationships` o da inserimento manuale).
**Da decidere con te:** ricostruire il legame progetto→cliente (come?) o lasciare il modello "lavori interni".

### 3. Le ore si agganciano a nodi-struttura, ma `time_entry` non ha `phase_id`
**Problema (il cuore del porting):** nel legacy le ore (`worksummary` TH) sono puntate a **qualsiasi nodo** dell'albero WBS (`projectsstructures`) — 6.520 su nodi contenitore e 8.495 su foglie. Nel nuovo schema le ore (`time_entry`) possono agganciarsi solo a `engagement` o `activity`, **mai a `phase`**. C'era il rischio di perdere il dettaglio "su quale voce del progetto" sono le ore.
**Soluzione:** doppia rappresentazione — l'albero WBS è preservato **integro** come albero di `phase` (302 fasi, profondità reale fino a 6), e per ogni nodo che porta ore ho creato un'**attività WBS sintetica** ("<nome nodo> — ore", 217 attività) sotto la fase corretta, a cui sono agganciate le `time_entry`. Risultato: si naviga commessa → fase → attività → ore, senza perdere né gerarchia né ore (diff minuti = 0).

### 4. Due alberi indipendenti che si incrociano
**Problema:** esistono DUE gerarchie scollegate — la WBS (`projectsstructures`) e l'albero dei task (`tasks`/`tasksparents`) — unite da una N:M (`projectsstructurestasks`, 6.375 righe). Una `activity` nuova ha un solo padre (`phase`), non può rappresentare entrambe.
**Decisione:** WBS → `phase`; `tasks` → `activity` con `phase_id` risolto via `projectsstructurestasks` (primo match). I **133 task** non collegati a nessuna struttura sono finiti in una commessa catch-all "Attività varie (non collegate)" e marcati `unlinked` negli attributes — niente è andato perso, ma è un dato da bonificare.

### 5. `worksummary` polimorfico e polisemico
**Problema:** una sola tabella (26.518 righe) mescola ore, assenze, materiali, costi e prestazioni. Il discriminante reale è `workitemobjecttype` (TH/PH/KH/IH…) — **diverso** dai codici della documentazione del kit (HP/PI/EP). La colonna `quantity` è polisemica (minuti / pezzi / valori).
**Soluzione:** classificazione per `worktrackingtype` della **categoria** (HP/IW→ore, EP→assenze, PI→materiali, CI/PR→rinviati), e split su tabelle tipizzate diverse. `quantity` interpretata come minuti solo per le ore.
**Trappola polimorfica WO confermata e gestita:** per `entitytype='WO'`, `entitytypeobjectid` punta a `workordersassets` (non `workorders`): costruita la mappa `workorderasset→workorder` prima di usarla.

### 6. `entitytype='SU'` non sono ore-progetto, sono paghe/assenze
**Problema:** 3.191 righe (16% delle ore Sivaf) con `entitytype='SU'` e `entitytypeobjectid` spesso NULL non risolvevano a nessuna entità — sembrava un errore.
**Scoperta:** dalla doc costanti, `SU` = bucket paghe (`PH`=giustificativi ferie/malattia/permessi, `IH`=interruzioni). NULL è **legittimo** (record standalone legati all'utente). Mappati su `absence_entry` (2.413) con la persona da `iduser`; le 778 interruzioni a durata nulla scartate.

### 7. Password non migrabili
**Problema:** `pwdhash` legacy è HMAC-SHA256 con `privkey` per-utente — incompatibile con GoTrue.
**Soluzione:** nessun hash migrato. Creato un utente GoTrue per il titolare (login sopra); gli altri 29 utenti hanno `auth_user_id` NULL e dovranno fare reset/primo accesso. Email duplicate cross-tenant temute dalla doc: **non presenti** in Sivaf.

### 8. Il DB nuovo non era vuoto
**Problema:** il target conteneva già la demo Powercom fibra (4 tenant). Rischio di mescolare reale e demo.
**Soluzione:** tenant nuovo dedicato; lo script fa **wipe+rebuild del solo tenant Sivaf** (cancella e ricrea quel tenant via cascade, UUID deterministici v5) → rilanciabile all'infinito senza toccare la demo né duplicare dati.

---

## Cosa resta aperto / da decidere
1. **Legame commessa→cliente reale** (oggi tutto su azienda interna placeholder) — punto #2.
2. **133 task non collegati** a struttura (catch-all) — bonifica.
3. **Materiali/costi/prestazioni** (23 righe Sivaf) — se servono, mappare su `material_consumption`/`stock_movement`.
4. **Reset password** per i 29 utenti non-owner.
5. **Altri tenant**: pochi e per lo più demo; si replica lo stesso ETL cambiando lo scope quando vorrai.

## Artefatti
- ETL: `scratch-porting/etl.js` (idempotente, dry-run con `node etl.js`, commit con `--commit`).
- Analisi: `scratch-porting/analyze.js`, `census.js`.
- Strategia: `docs/porting/porting-strategy.md`.

---
*Si.Va.F. — primo trasferimento Sivaf, 2026-06-18.*
