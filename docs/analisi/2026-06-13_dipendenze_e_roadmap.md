# siSuite — Analisi: dipendenze tra attività + roadmap del mancante

> Documento di **analisi e brainstorming** (nessun codice). Serve a decidere — anche
> in una sessione con Claude AI — *cosa* costruire per le dipendenze e *in che ordine*
> affrontare il resto. Stato del repo al 13/06/2026.

---

## 0. TL;DR (per chi ha fretta)

- Lo **schema c'è già** (`activity_dependency`: predecessore→successore, tipo FS/SS/FF/SF, `lag_minutes`), con vincoli anti-ciclo-banale (no self-dep) e anti-duplicato. Mancano: **scrittura** (create/delete), **integrità del grafo** (cicli), **integrazione nello scheduler** (oggi le ignora del tutto), e una **UI** per crearle.
- I leader di mercato si dividono in due famiglie: **"blocking" relazionale** (Asana/Jira/Linear: «bloccata da», zero matematica sulle date) e **"temporale/scheduling"** (MS Project/Smartsheet/Wrike: FS+lag *spostano* le date, critical path). Il 90% dell'uso reale è **Finish-to-Start (FS)**; lag/anticipo conta molto nel lavoro sul campo (tempi di asciugatura/maturazione).
- **Proposta**: 3 fasi. Fase 1 = **FS-only + guardia cicli + lo scheduler rispetta il predecessore come earliest-start** (valore vero, superficie minima). Fase 2 = lag + Gantt drag-to-link + avvisi. Fase 3 = tipi SS/FF/SF + critical path + **dipendenze proposte dall'AI** in cattura.
- In coda: **elenco completo del mancante** (liste standalone, agenda a griglia, assegnazione risorse, raffinamenti scheduler, template, portale cliente, notifiche, mobile, i18n, audit) con esempi e stima d'impatto.

---

## 1. Stato attuale nel codice (fondamenta da cui partire)

### 1.1 Schema DB — già pronto
`db/migrations/001_schema_core.sql`:

```sql
CREATE TYPE dependency_type AS ENUM ('FS','SS','FF','SF'); -- finish-to-start (default) e varianti

CREATE TABLE activity_dependency (
    id              uuid PRIMARY KEY,
    tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    predecessor_id  uuid NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
    successor_id    uuid NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
    type            dependency_type NOT NULL DEFAULT 'FS',
    lag_minutes     int NOT NULL DEFAULT 0,      -- attesa/anticipo tra le due (lead/lag)
    CHECK (predecessor_id <> successor_id),       -- niente self-dependency
    UNIQUE (predecessor_id, successor_id)         -- niente arco duplicato
);
```

Già coperto **gratis** dallo schema: no auto-dipendenza, no arco duplicato, cascade su cancellazione attività. Il modello supporta **tutti e 4 i tipi** e il **lag** fin da subito → espandere in futuro non richiede migrazione.

### 1.2 RLS — parziale
`002_rls_policies.sql`: `activity_dependency` è nel **Gruppo 1** (isolamento per tenant, `FOR ALL`). Quindi un tenant non vede/scrive archi di altri. **Però** non c'è un controllo fine sul fatto che predecessore e successore appartengano alla *stessa* commessa o siano visibili allo scope `own` del tecnico — oggi la policy guarda solo `tenant_id`. Da valutare in fase di scrittura.

### 1.3 Permessi — già definiti, non usati
`packages/shared/src/permissions.ts`:
```
dependency: { actions: { read: 'Vedi', manage: 'Gestisci' } }
```
`dependency:read` è concesso a Planner/Sola-lettura; `dependency:manage` solo a Planner (oltre Owner). **Nessuna route lo usa per scrivere** (esiste solo la lettura).

### 1.4 API — solo lettura (aggiunta ieri)
`GET /engagements/:id/dependencies` (`dependency:read`) → ritorna gli archi con `predecessorTitle`/`successorTitle` (join verificato). **Mancano** create/update/delete.

### 1.5 UI — tag già pronto, ma latente
Nell'albero commessa (`CommessaDetailPage`) le foglie mostrano il tag **«dopo X»** se l'attività è successore di qualcosa. Funziona, ma resta vuoto perché **non c'è modo di creare archi** (solo via SQL).

### 1.6 ⚠️ Motore di flusso — IGNORA le dipendenze (il punto critico)
`packages/backend/src/flow/scheduler.ts`, commento testuale:
> *«non … né risolve il grafo dipendenze (qui ordine = priorità poi creazione)»*

Lo scheduler è un **passaggio in avanti** (non un solver): mette le **fisse** come occupazioni e «versa» le **dinamiche** nei buchi, ordinandole per **priorità poi data di creazione**. Le dipendenze **non hanno alcun effetto** sull'agenda calcolata.

> **Conseguenza progettuale fondamentale**: creare le dipendenze come semplice CRUD le rende solo *documentazione visiva* (il tag «dopo X»). Per dare loro **valore operativo** (l'agenda rispetta «posa dopo scavo») serve **integrarle nello scheduler**. Questa è la vera decisione di scope.

---

## 2. Cosa serve concretamente per "creare le dipendenze"

Scomposizione per livelli — ognuno è una decisione di scope a sé.

### A. Scrittura backend (CRUD)
- `POST /dependencies` `{ predecessorId, successorId, type?, lagMinutes? }` (`dependency:manage`).
- `DELETE /dependencies/:id` (o `DELETE /dependencies?pred=&succ=`).
- (Opz.) `PATCH /dependencies/:id` per cambiare `type`/`lag`.
- Schema zod in `shared` + DTO (già abbozzato `DependencyEdgeDto`).

### B. Integrità del grafo (la parte "seria")
- **Cicli**: `A→B→C→A` va rifiutato. Lo `UNIQUE` e il `CHECK` coprono solo i casi banali. Serve un **controllo di raggiungibilità** prima dell'insert: «aggiungendo pred→succ, succ può già raggiungere pred?» → ricerca su grafo (DFS/BFS in app, o CTE ricorsiva in SQL `WITH RECURSIVE`).
- **Stessa commessa**: vietare (o gestire esplicitamente) archi cross-engagement. Per l'MVP: **stessa commessa obbligatoria**.
- **Validità rispetto a fasi**: nessun vincolo richiesto (le dipendenze sono tra *attività*, non fasi — coerente con lo schema: solo le foglie portano lavoro).
- **Visibilità**: il tecnico con scope `own` non deve poter creare archi verso attività che non vede.

### C. Integrazione nello scheduler (il valore vero)
Per il solo **FS** (il caso che conta): il successore non può iniziare prima di `fine(predecessore) + lag`. Tradotto nello scheduler attuale:
1. **Ordinamento topologico** delle dinamiche (oggi: priorità+creazione) → un predecessore va collocato prima del successore.
2. **Propagazione earliest-start**: `earliest_effettivo(succ) = max(earliest_start(succ), fine_calcolata(pred) + lag)` per ogni predecessore (fisso o dinamico).
3. **Casi limite**: predecessore *unplaceable* → successore *blocked*; predecessore *fisso* → si usa il suo `end` noto; ciclo già escluso in fase di scrittura.
4. Gli altri tipi (SS/FF/SF) richiedono la stessa logica su «inizio/fine» diversi — rimandabili.

Stima: modifica **contenuta ma delicata** a `scheduler.ts` (da forward-pass a forward-pass *in ordine topologico*). È il pezzo a più alto valore e più alto rischio di regressione → merita test dedicati.

### D. UI per creare/gestire
Tre punti d'innesto possibili (non mutuamente esclusivi):
- **Dettaglio attività** (`AttivitaDetailPage`): sezione «Bloccata da / Blocca» con picker delle altre attività della commessa. *Più semplice, copre il 100% dei casi.*
- **Albero commessa**: azione «aggiungi dipendenza» in hover sul nodo. *Comodo ma il picker resta uguale.*
- **Gantt**: trascinare dalla coda di una barra all'inizio di un'altra (drag-to-link) + frecce tra le barre. *La UX «wow» dei leader, ma è la più costosa.*

### E. Effetti collaterali da gestire
- **Cancellazione attività**: FK `ON DELETE CASCADE` → gli archi spariscono (già ok).
- **Cambio stato a `done`**: lo scheduler già esclude done/cancelled; un predecessore concluso «sblocca» naturalmente il successore.
- **Spostamento di una fissa**: oggi nessun ricalcolo automatico — coerente col modello «agenda calcolata on-demand» (si rilegge `/schedule`). Da decidere se mostrare avvisi.

### F. AI (pipeline cattura) — opzionale ma "on brand"
L'estrazione NL potrebbe **proporre** dipendenze: «la posa va fatta dopo lo scavo» → operazione proposta `create_dependency(pred=scavo, succ=posa, FS)`. Si aggancia al validatore deterministico esistente (RBAC + esistenza attività). Naturale evoluzione, non MVP.

---

## 3. Cosa fanno i leader di mercato

### 3.1 Le due famiglie (decisione mentale di fondo)

| Famiglia | Esempi | Cosa fa una dipendenza | Matematica sulle date | Per chi |
|---|---|---|---|---|
| **Blocking / relazionale** | Asana, Jira, Linear, Trello (power-up) | «X è *bloccata da* Y»: segnala, avvisa, ordina | **Nessuna** (o solo avviso) | Team software/knowledge |
| **Temporale / scheduling** | MS Project, Primavera P6, Smartsheet, Wrike, GanttPRO, TeamGantt | FS+lag **determina/sposta** le date del successore; critical path | **Sì**, è il cuore | Edilizia, impianti, progetti datati |

siSuite vive **a metà**: target SMB tecnici (piscine, fotovoltaico, software house) con archetipi *build* (datati, sequenziali → temporale) e *maintenance* (interventi → più relazionale). Il motore di flusso esistente la spinge verso la famiglia **temporale**, ma in versione *leggera*.

### 3.2 Dettaglio per strumento (cosa imitare / cosa evitare)

- **MS Project / Primavera P6** — il riferimento *semantico*. Tutti e 4 i tipi (FS default, SS, FF, SF), lag/lead (`FS+2g`, `SS−1g`), constraint ("deve iniziare il", "non oltre il"), **critical path (CPM)**, resource leveling. *Da imitare*: la semantica FS/lag. *Da evitare*: la complessità da PM professionista (overkill per un tecnico).
- **Smartsheet / GanttPRO / TeamGantt** — Gantt-first SMB. **Drag-to-link** sulle barre, FS prevalente, auto-shift dei successori quando sposti il predecessore, critical path opzionale. *Sweet spot UX per noi.*
- **Asana** — «Mark as dependent» → badge *bloccata da / che blocca*, niente lag, niente date-math di default; sulla Timeline può proporre lo shift. *Da imitare*: la semplicità del modello mentale «bloccata da».
- **Monday.com** — colonna *Dependency* + **automazioni** («quando sposto il predecessore, spingi le date dei successori» — l'utente sceglie il comportamento). *Lezione*: il «cosa succede quando il predecessore si muove» è una **scelta di prodotto esplicita**, non un default nascosto.
- **ClickUp** — *blocking / waiting on / linked*, warning sulle dipendenze, reschedule opzionale dei dipendenti.
- **Jira** — *issue links* («blocks»/«is blocked by») **non** guidano le date; solo *Advanced Roadmaps/Plans* fa scheduling con dipendenze. *Lezione*: si può partire **relazionali** e aggiungere lo scheduling dopo.
- **Wrike** — 4 tipi + lag + auto-reschedule. **Notion/Linear** — relazioni manuali, nessun motore date (Linear: «blocked by/blocks» pulito, dev-centric).

### 3.3 Pattern ricorrenti (le lezioni trasversali)
1. **FS domina** (>90% reale). SS/FF/SF servono a edilizia/impianti complessi → *non* MVP.
2. **Lag/lead conta sul campo**: «posa dopo getto **+2 giorni** (maturazione)», «collaudo dopo allaccio». Lo schema lo prevede già.
3. **Prevenzione cicli = obbligatoria** ovunque (nessuno la salta).
4. **Due viste di creazione**: picker «bloccata da» nel dettaglio (semplice) **e/o** drag-to-link nel Gantt (visuale).
5. **«Cosa succede quando il predecessore si sposta»** è la domanda-prodotto chiave: *avviso* vs *auto-shift*. I migliori la rendono **esplicita e configurabile**.
6. **Critical path** = funzione avanzata, sempre opzionale/a strati.
7. **Cross-project deps** = enterprise → fuori scope SMB.

---

## 4. Proposta (come la farei) — a fasi

Principio: **YAGNI** sullo schema *no* (è già completo), **YAGNI** sulla superficie *sì*. Si parte dal modello mentale più semplice e a più alto valore.

### Fase 1 — "Bloccata da" che conta davvero (MVP consigliato)
**Scope**: solo **FS**, `lag` esposto ma opzionale (default 0), stessa commessa, guardia cicli.
- Backend: `POST /dependencies`, `DELETE /dependencies/:id`, con **cycle-check** (CTE ricorsiva o DFS) e check «stessa commessa».
- Scheduler: **ordinamento topologico** + **earliest-start dai predecessori FS** (il pezzo di valore). Predecessore non collocabile → successore `blocked`.
- UI: sezione **«Bloccata da»** nel **dettaglio attività** con picker; il tag «dopo X» nell'albero (già pronto) si accende; nel **Gantt** una nota «← dopo Y» sotto la barra (no frecce ancora).
- AI: *fuori* (Fase 3).

*Perché questa*: dà subito il comportamento che un tecnico capisce («questa viene dopo quella, e l'agenda lo rispetta») con la minima superficie. Lo schema completo resta pronto per espandere.

### Fase 2 — Lag, Gantt visuale, avvisi
- `lag_minutes` con UI dedicata (es. «+2 giorni»).
- **Gantt**: frecce predecessore→successore + **drag-to-link** (trascina dalla coda all'inizio).
- **Avviso** quando una fissa si sposta oltre l'inizio di un suo successore («conflitto di sequenza») — coerente col modo «segnala, non violare in silenzio» già adottato per `due_by`.

### Fase 3 — Tipi completi, critical path, AI
- SS/FF/SF (per i pochi casi build complessi).
- **Critical path** evidenziato nel Gantt.
- **AI**: l'estrazione propone `create_dependency` («fai X dopo Y») nel validatore deterministico.

### Trade-off della scelta
- ✅ Valore reale già in Fase 1; nessuna migrazione per crescere; rischio concentrato nello scheduler (testabile in isolamento).
- ⚠️ La modifica allo scheduler è la parte delicata: serve **suite di test** sul topo-sort e sui casi limite (ciclo già escluso a monte, predecessore fisso, predecessore unplaceable, lag negativo).
- Alternativa scartata: **deps puramente relazionali** (stile Jira base, nessun effetto sull'agenda). Più semplice, ma il tag «dopo X» resterebbe cosmetico e tradirebbe la promessa «agenda che si riempie da sola».

---

## 5. Esempi concreti (per ancorare la discussione)

**Scenario A — build piscina (FS + lag)**
```
Scavo (8h, dinamica)
  └─FS─> Getto platea (6h)  +lag 0
            └─FS─> Impermeabilizzazione (4h)  +lag 2880min (2 giorni di maturazione)
                      └─FS─> Posa rivestimento (10h)
```
Atteso dallo scheduler Fase 1: «Posa» non parte prima di fine «Impermeabilizzazione» +2 giorni; se «Scavo» è non collocabile, tutta la catena risulta `blocked`.

**Scenario B — software (blocking semplice, niente date)**
```
API autenticazione  ──blocks──>  API anagrafiche
```
Il tecnico vuole solo l'ordine logico; non gli interessa il lag. Default `FS`, `lag 0`. Il tag «dopo API auth» appare nell'albero.

**Scenario C — ciclo da rifiutare**
```
A ─FS─> B ─FS─> C ;  poi l'utente prova C ─FS─> A  →  HTTP 409 "dipendenza ciclica"
```

**Esempio API (Fase 1)**
```
POST /dependencies { predecessorId, successorId, type:"FS", lagMinutes:2880 }
→ 201 { id, ... }   |   409 se ciclo   |   400 se commesse diverse
DELETE /dependencies/:id → 204
```

**Esempio UI (dettaglio attività)**
```
Bloccata da:  [ Impermeabilizzazione ▾ ]  +2 giorni   [+ aggiungi]
              • dopo Getto platea            ✕
Blocca:       • Posa rivestimento           ✕
```

---

## 6. Punti aperti da decidere (con te + Claude AI)

1. **Famiglia**: partiamo *temporale* (lo scheduler le rispetta) o *relazionale* (solo tag/avviso)? → *Proposta: temporale, FS-only.*
2. **Quando il predecessore si sposta**: solo *avviso* in `/schedule` o anche *auto-shift*? → *Proposta: avviso (l'agenda è già ricalcolata on-demand).*
3. **Lag in Fase 1**: lo esponiamo subito o lo rimandiamo a Fase 2? → *Proposta: campo presente, UI minima.*
4. **Dove si creano**: dettaglio attività (semplice) o anche albero/Gantt? → *Proposta: dettaglio attività in Fase 1.*
5. **Scope cross-commessa**: vietato in MVP? → *Proposta: sì, stessa commessa.*
6. **Cycle-check**: in app (DFS) o in SQL (`WITH RECURSIVE`)? → *Proposta: SQL ricorsivo, una query, dentro la tx.*
7. **AI propone dipendenze**: in scope o rimandato? → *Proposta: Fase 3.*
8. **Critical path**: ci interessa o è oltre il bisogno SMB? → *da decidere.*

---

## 7. Tutto il resto che manca (roadmap oltre le dipendenze)

Ricognizione completa di ciò che ho lasciato fuori scope o non ancora costruito, con esempio e stima d'impatto (S=piccolo, M=medio, L=grande). Serve a prioritizzare nella discussione.

### Lavoro / commessa
- **[M] Gestione dipendenze** — oggetto di questo documento.
- **[M] Agenda vera a griglia (mock 03/21)** — risorse × giorni con blocchi drag&drop, non la lista attuale. *Es.: vedere il calendario di tutti i tecnici della settimana e spostare un intervento.* Richiede scheduling resource-aware (sotto).
- **[S] Edit attività nel kit Drawer** — oggi l'edit nell'albero è una modale Ionic; allinearla al nuovo kit (Field/Drawer) come le altre.
- **[M] Assegnazione risorse da UI** — `activity_resource` ha già backend + vincolo anti-doppia-prenotazione; manca la UI «assegna tecnico/mezzo all'attività». *Es.: trascinare Mario su «Scavo».*
- **[S] Checklist / ore / materiali nel dettaglio attività** — backend pronto (`time_entry`, `material_consumption`, checklist jsonb); UI di rendicontazione manuale da rifinire nel dettaglio.

### Motore di flusso (raffinamenti dichiarati nel codice)
- **[M] Sottrazione `resource_availability`** — lo scheduler non salta ferie/malattie/mezzo in officina. *Es.: non pianificare Mario in ferie.*
- **[M] Scheduling resource-aware** — oggi colloca attività su un'unica timeline; non distingue *chi* la fa. Serve per l'agenda a griglia.
- **[S] Timezone puntuale** — orari interpretati come «naive»; applicare `tenant.timezone`.
- **[L] Solver ottimizzante** — post-MVP dichiarato; sostituisce il forward-pass con ottimizzazione (livellamento risorse, critical path).

### Entità / amministrazione
- **[M] Template commessa (instanziazione blueprint)** — `template.blueprint` (jsonb) esiste; manca «applica template → crea fasi/attività/(deps)/date relative». *Es.: «Nuova piscina standard» genera 12 attività con dipendenze.* **Nota**: si lega direttamente alle dipendenze (il blueprint le contiene).
- **[S] Liste standalone** attività / ore / consumi (oggi vivono nei dettagli). Utile per il Contabile.
- **[S] Plan/subscription self-service** — `/admin/billing` è informativo; l'upgrade passa dal provider (Stripe/Lemon Squeezy) → integrazione webhook (L se la si fa davvero).

### AI
- **[M] AI propone dipendenze** (vedi §2.F) e **template** dallo storico.
- **[S] Quota AI enforcement** — oggi la quota è *mostrata* (billing); il *gating* effettivo (bloccare oltre soglia) è separato e non implementato.

### Trasversali / piattaforma
- **[M] Notifiche** — scadenze `due_by`, conflitti agenda, scadenza `subscription` (30/7/1 giorni). Nessun canale oggi.
- **[L] Portale cliente esterno** — RLS `data_scope='customer'` predisposta; manca la proiezione client-safe (nascondere i costi) + le pagine. Backlog #13.
- **[M] App mobile tecnico (mock 21/22/23)** — Agenda, Catture mobile, Cerca: oggi placeholder/parziali.
- **[S] i18n attivazione en/es-AR** — infrastruttura `label` per-locale presente; UI solo it-IT.
- **[M] Audit log completo** — ci sono `created_by/updated_by/updated_at`; manca il log storico delle modifiche su dati fatturabili.

### Suggerimento di priorità (mia opinione, da discutere)
1. **Dipendenze Fase 1** (sblocca template e agenda seria).
2. **Assegnazione risorse UI** + **resource_availability** nello scheduler.
3. **Agenda a griglia** (dipende da 2).
4. **Template commessa** (usa le dipendenze).
5. Notifiche, poi mobile, poi portale/i18n/audit.

---

## 8. Riferimenti nel codice (per la sessione tecnica)
- Schema: `db/migrations/001_schema_core.sql` (`activity_dependency`, `dependency_type`).
- RLS: `db/migrations/002_rls_policies.sql` (Gruppo 1).
- Permessi: `packages/shared/src/permissions.ts` (`dependency:*`).
- Lettura deps: `packages/backend/src/routes/activities.ts` (`GET /engagements/:id/dependencies`).
- Scheduler (da estendere): `packages/backend/src/flow/scheduler.ts` + `packages/backend/src/routes/schedule.ts`.
- UI albero/tag: `packages/frontend/src/pages/CommessaDetailPage.tsx`.
- DTO: `packages/shared/src/entities.ts` (`DependencyEdgeDto`).
```
