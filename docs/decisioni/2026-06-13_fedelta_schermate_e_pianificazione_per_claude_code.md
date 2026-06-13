# siSuite — Fedeltà visiva (4 schermate) + Pianificazione per-risorsa — brief per Claude Code (parte 4)

> **Data:** 13/06/2026 · Complemento al BRIEF MASTER. Verificato leggendo `docs/mockup/base.css` e i mockup
> `05/06/07/24/03`. **Regola di metodo:** il mockup HTML è la **specifica letterale**. Non chiedere al titolare
> "quanto sono vicine / dove sono i colori": le risposte sono nei file. Auto-verifica come segue.

---

## 1. PROTOCOLLO DI FEDELTÀ (così il titolare non fa più da "righello")

Per **ogni** schermata, esegui questo confronto **da solo**:

1. **Struttura = contratto.** Apri il `<body>` del mockup. Il componente React deve emettere **lo stesso albero di
   elementi e le stesse `class`**, nello stesso ordine. La struttura del mockup è vincolante (la trovi estratta in §3).
2. **Parità delle classi.** Ogni classe usata dal mockup deve esistere in `design-system.css` con **valori identici** a
   `base.css`. Verifica con un diff/grep classe-per-classe; se una classe manca o ha valori diversi, allineala a `base.css`.
3. **Colori solo da token.** Mai hex cablati. Stato/tipo = `.pill .pill--<token>` dove `<token>` viene da
   `lookup_value.color_token` (`success|warning|danger|info|neutral|brand`). Sfondi icona = variabili `--*-wash`.
4. **Icone.** I mockup usano SVG inline; l'app usa lucide (già migrata). Per ogni icona del mockup scegli la lucide
   equivalente per forma/peso; stessa dimensione (16/17/18/21px come nel mockup).
5. **Tipografia/spaziature.** Vengono da `base.css` via le classi: se usi le classi giuste, tornano da sole. Non
   reintrodurre stili locali che le sovrascrivono.
6. **Ruolo del titolare = solo colpo d'occhio finale** su uno screenshot, non misurazione.

**Token di colore di riferimento** (`base.css`): `--brand #5B4DF0`, `--flow #1FC8C2`, `--success #13A06B`,
`--warning #D9912A`, `--danger #E04550`, `--info #3B82F6`, `--neutral #8A8F9B`, `--paper #F3F5F8`, `--card #FFFFFF`,
`--ink #1B1D24`, `--line #E5E8EE`. Raggi: `--r-lg 20px`, `--r 14px`, `--r-sm 10px`, `--r-pill 999px`.

---

## 2. Shell comune (presente in tutte le schermate desktop)
`div.app` (grid `248px 1fr`) → `aside.sidebar` (sfondo `--ink`) + `div.main`.
- **sidebar**: `.brand-logo` (mark gradiente flow + "siSuite", "si" in `--flow`); gruppi `.nav-group` "Il mio / Lavoro /
  Amministrazione"; `.nav-item` (icona + testo; `.active` = sfondo `--brand`); `Catture` ha `.badge`; in fondo `.side-user`.
- **main**: `.topbar` (h 68) con `.cmdbar` (max 560, centrata: spark + input "Racconta la settimana, o cerca…" + `.kbd ⌘K`)
  e `.ico-btn` (campanella). Poi il contenuto: `.page` (padding 24) **oppure** `.work` (grid `1fr 300px`) per la Pianificazione.

> Voce di menu: **"Impostazioni"** (singola), non Etichette/Numeratori sparsi (già fatto). Ordine voci come nei mockup.

---

## 3. Le 4 schermate — struttura esatta da replicare

### 3.1 DASHBOARD (mock `05_web_dashboard.html`)
`.page` →
- `.page-head`: `h1` "Dashboard" + `.sub` "Il polso dell'azienda, oggi." + a destra `.seg` (Oggi/Settimana/Mese, "Oggi" `.on`).
- `.kpis` (grid 4 colonne) — 4 × `.kpi`, ognuno: `.ic` (sfondo `--brand-wash`/`--flow-wash`/`--warning-wash`) + `.lab` +
  `.val` (numero grande; per "Scadenze a rischio" il valore è `color:var(--danger)`) + `.trend up|down`.
  KPI: **Commesse attive**, **Ore questa settimana** (`142` + `<small>h</small>`), **Catture da rivedere**, **Scadenze a rischio**.
- `.grid2` (grid `1fr 340px`) — due `.panel`:
  - "Attività di oggi" (`.ph` con `h3` + `.chip` "8 totali"; `.pb` con righe `.row-li`: testo + `.cellsub` + `.pill` di stato).
  - "Catture recenti" (`.ph` con link `.dep` "Vedi tutte →"; righe `.row-li` con testo `.faint` "«…»" + `.cellsub` + pill stato).

### 3.2 LISTA COMMESSE (mock `06_web_commesse.html`)  — "le icone colorate"
`.page` →
- `.page-head`: `h1` "Commesse" + `.sub` "12 attive · 3 in manutenzione".
- `.toolbar`: `.search` (lente + input) + `.seg` (Tutte/Realizzazione/Manutenzione) + a destra `.btn.btn-primary.btn-sm`
  (icona "+", "Nuova commessa", `margin-left:auto`).
- `.table-wrap > table.t`: colonne **Codice · Cliente · Titolo · Tipo · Responsabile · Stato · Aggiornata**.
  - Codice: `<span class="mono" style="font-weight:600">`.
  - Cliente: `.cellname` + `.cellsub`.
  - **Tipo** (le "icone colorate"): `.pill .pill--brand` per **Realizzazione**, `.pill .pill--info` per **Manutenzione**
    (sempre con `<span class="dot">`).
  - Responsabile: `.who` con `.ava` (iniziali, gradiente flow).
  - **Stato**: `.pill .pill--<token>` dove `<token>` = `lookup_value.color_token` dello stato
    (Attiva→info, a-rischio→warning, Aperta→neutral, Chiusa→success).
  - Aggiornata: `.cellsub.mono`.
  > Punto critico: i pill **devono essere colorati** dal color-token, non grigi/testo semplice. Mappa
  > `lookup_value.color_token` → classe `pill--<token>`. Verifica che la lista renda i pill come nel mockup.

### 3.3 DETTAGLIO COMMESSA + TAB (mock `07_web_dettaglio_commessa.html` + albero `24_web_commessa_albero.html`)
**Errore noto da correggere:** i tab attuali ("albero/Gantt/Lista/deps/racconto AI") **non** sono quelli del mockup.
Struttura corretta:
- `.detail-head`: `.code` (mono, su `--brand-wash`) + `.pill.pill--brand`/`info` (tipo) sulla stessa riga; `h1`
  "Titolo — Cliente"; `.sub`; `.kv` (coppie `.k`/`.v`): **Cliente · Responsabile · Stato (pill) · Periodo (mono) · Ore registrate (mono)**.
- **Tab principali** (`.tabs > a`, "on" sul primo): **Struttura · Risorse · Ore & materiali · Catture**. ← questi sono i 4 tab.
- **Tab "Struttura"** = due rese, con sotto-selettore `.seg` (**Albero / Gantt / Lista**) + `.btn.btn-primary.btn-sm` "Aggiungi fase":
  - **Vista semplice (mock 07)**: `.tree` con `.phase-row` ("FASE n" in `.seq` + nome) e `.task-row`
    (`.tt` nome + opzionale `.dep` "→ dopo X" + `.dur` mono + `.pill` stato).
  - **Vista Albero espandibile (mock 24)**: `.xtree` con `.tnode` (indentati via `padding-left` 16/40/64), `.tchev`
    (chevron giù aperto / destra chiuso; `.empty` sulle foglie), **`.ticon` colorata** (sfondo `--brand-wash`+icona brand
    per le **fasi**, `--flow-wash`+flow per le **sotto-fasi**, `transparent`+pallino `--ink-faint` per le **attività foglia**),
    `.tname`, `.tmeta` (`.troll` "3/11 · 48h" mono, pill stato, opzionale `.tdep` "→ dopo X", `.tactions` con `.iaction`
    aggiungi/modifica/elimina visibili in hover).
  > Regola di dominio (dal mock 24): le **fasi** si annidano via `parent_phase_id`; **solo le attività foglia** portano
  > ore/risorse/materiali. La "Racconto AI" che abbiamo aggiunto **non è un tab**: tienila come card sotto la testata o
  > dentro un tab esistente, senza rompere i 4 tab del mockup.
- Tab **Risorse / Ore & materiali / Catture**: contenuti coerenti (assegnazioni risorse; righe ore+consumi; inbox catture).

### 3.4 PIANIFICAZIONE (mock `03_web_pianificazione.html`)
`.work` (grid `1fr 300px`):
- **Sinistra**:
  - `.page-head`: `h1` "Pianificazione" + `.sub` "Le attività dinamiche fluiscono da oggi; le fisse fanno da ancora." +
    `.week-switch` (‹ + `.lbl` "16–20 giugno" + ›).
  - `.alert` (sfondo `--warning-wash`): icona + "**Scadenza a rischio.** …" + `.chip` "Vedi le opzioni".
  - `.agenda > .ag-grid` (grid **`128px repeat(5,1fr)`**):
    - riga intestazioni: cella vuota d'angolo + 5 `.ag-h` (giorno + `.dn` numero; oggi = `.ag-h.today`, su `--brand-wash`).
    - per **ogni risorsa**: `.ag-res` (`.rk` pallino; `.rk.veh` quadratino `--info` per mezzi) + 5 `.ag-cell`
      (oggi = `.ag-cell.today`). In una cella, un blocco:
      - **fissa**: `.block.fixed` (bordo sx `--brand`) con `.pin` (icona pin) + `.bt` orario + `.bn` nome;
      - **dinamica/flusso**: `.block.flowing` (bordo gradiente flow) con `.bt` "flusso" + `.bn` nome; può ripetersi su
        più giorni consecutivi per la stessa attività;
      - **a rischio**: `.block.flowing` con gradiente `--danger/--warning` e `.bt` "a rischio" `color:var(--danger)`.
- **Destra `.rail`**:
  - `.narr` (card scura `--ink`): titolo "La settimana, in breve" (spark `--flow`); `<p>` riassunto AI; poi righe `.ln`
    (pallino `.d` colorato + testo) = **le proposte AI** ("Sposta l'addestramento di Anna o affianca Marco a Luca giovedì").
  - `.mini`: "Questa settimana" con `.stat`: Ore pianificate `142h`, Attività `23`, Conflitti `1` (`color:var(--danger)`).

> La Pianificazione è una **griglia risorse × giorni**: per renderla reale serve il backend per-risorsa (§4).
> Il rail `.narr` è il punto dove vive la **narrazione + soluzione proposta** (principio "proponi, non forzare").

---

## 4. PIANIFICAZIONE — backend per-risorsa + ORARI PER-TECNICO (FASE 2)

### 4.1 Risposta alla domanda del titolare: gli orari sono già per-collaboratore
Lo schema **ha già** gli orari per-risorsa: **`resource.working_hours jsonb`** (riga 659 dello schema), stessa forma di
`tenant.working_hours` (per giorno: liste di intervalli `[["08:00","13:00"],["14:00","18:00"]]`). È **nullable**.
→ **Nessuna migrazione necessaria.** Manca solo che il motore li usi e che siano modificabili in UI.

### 4.2 Regola degli orari (da implementare nel motore di flusso)
Per ogni risorsa, il calendario lavorativo effettivo =
1. `resource.working_hours` **se valorizzato**, **altrimenti** `tenant.working_hours` (fallback);
2. **meno** gli intervalli `resource_availability` (kind `unavailable`) di quella risorsa (ferie/permessi);
3. (gli `scheduled_start/end` delle attività **fisse** assegnate alla risorsa diventano occupazioni).
Le attività **dinamiche** assegnate a una risorsa si versano nei buchi **del calendario di quella risorsa**, in ordine
priorità poi `created_at`, rispettando `earliest_start`/`due_by` (come oggi, ma per-risorsa).

### 4.3 Scheduling per-risorsa (sostituisce la timeline unica)
- Oggi `flow/scheduler.ts` calcola su **una sola timeline** con `tenant.working_hours`. Va reso **per-risorsa**:
  calcola un piano **per ogni `resource`** assegnata (via `activity_resource`), usando il calendario §4.2 di quella risorsa.
- Output suggerito (per la griglia mock 03): per ogni risorsa, per ogni giorno della settimana, l'elenco di blocchi
  `{activity_id, title, kind: 'fixed'|'flowing', from, to, at_risk: bool}`. Endpoint es. `GET /schedule/week?from=YYYY-MM-DD`
  (o estensione di `/engagements/:id/schedule` con vista settimanale per-risorsa).
- **Conflitti / a rischio**: se una dinamica con `due_by` non rientra nel calendario della risorsa entro la scadenza →
  marcala `at_risk` e **genera la proposta** (es. "sposta X" / "affianca Y") nel rail `.narr` (principio "proponi, non forzare";
  la versione semplice ora, più sofisticata col solver in futuro — già in BACKLOG).
- **Estendi i test** (`test/scheduler.test.ts`, oggi 7): aggiungi casi per orari per-risorsa, fallback a tenant,
  sottrazione `resource_availability`, due risorse in parallelo, conflitto `at_risk`.

### 4.4 Editabilità e persistenza (collegato all'open point #5)
- **`resource.working_hours`** modificabile nel **dettaglio risorsa** (mock 20: striscia `.avail` a 7 giorni `.avday`/`.off`):
  se vuoto = "usa orario azienda"; se valorizzato = override del tecnico.
- **`tenant.working_hours`** modificabile in **Impostazioni › Generale** (oggi informativo) e **persistito** (serve al motore).

---

## 5. Dove siamo e cosa proseguire (analisi)
- **Fatto e solido:** FASE 0, FASE 1 (demo fibra end-to-end), SUPER admin, Impostazioni. Buon livello.
- **Prossimo blocco consigliato = FASE 2**, perché risolve **tre** cose insieme:
  1. la **Pianificazione** (mock 03) che vuoi adesso è una **griglia per-risorsa** → richiede il backend per-risorsa;
  2. la tua richiesta sugli **orari per-tecnico** (è lo stesso lavoro);
  3. la **credibilità** dell'agenda (non pianifica chi è in ferie / fuori orario).
  Quindi: **scheduling per-risorsa + orari per-risorsa + `resource_availability` + griglia mock 03**, in un colpo solo.
- **Fedeltà visiva in parallelo:** allinea ai mockup le 4 schermate di §3 (priorità: Dettaglio commessa-tab e Lista
  commesse-pill, perché hanno errori strutturali noti; poi Dashboard; la Pianificazione si completa con §4).
- **Dopo FASE 2 → FASE 3:** dipendenze (parte semplice, con fix sicurezza), gestione campi personalizzati, template, pack software/piscine.
- **Risposta all'open point #1 (FASE 2 vs 3):** FASE 2 prima — confermato, e ora con motivo aggiuntivo (serve alla schermata richiesta).

---

## 6. Checklist per Claude Code (questa parte)
- [ ] Applica il **protocollo di fedeltà** §1 (auto-verifica contro i mockup; il titolare fa solo il colpo d'occhio finale).
- [ ] **Dettaglio commessa**: 4 tab corretti (Struttura/Risorse/Ore & materiali/Catture) + sotto-selettore Albero/Gantt/Lista; albero `.xtree` con `.ticon` colorate; Racconto AI come card, non tab. *(§3.3)*
- [ ] **Lista commesse**: pill Tipo (brand/info) e Stato (da `color_token`) **colorati** come nel mock. *(§3.2)*
- [ ] **Dashboard**: kpis (4) + grid2 (2 panel) fedeli. *(§3.1)*
- [ ] **Pianificazione**: griglia `.ag-grid 128px repeat(5,1fr)` + blocchi fixed/flowing/at-risk + rail `.narr`/`.mini`. *(§3.4)*
- [ ] **Backend per-risorsa**: scheduling per risorsa con `resource.working_hours` (fallback tenant) − `resource_availability`; vista settimanale; conflitti `at_risk` + proposta. *(§4)*
- [ ] **Editabilità orari**: `resource.working_hours` nel dettaglio risorsa; `tenant.working_hours` in Impostazioni › Generale (persistiti). *(§4.4)*
- [ ] **Estendi i test scheduler** per i casi per-risorsa. *(§4.3)*
- [ ] Commit + push su GitHub a fine sessione.

---

*Fine parte 4 — 13/06/2026.*
