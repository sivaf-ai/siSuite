# siSuite — Personalizzazione (terminologia, colori), input assistito, Dashboard — per Claude Code (parte 8)

> **Data:** 14/06/2026 · Riscontro su screenshot Dashboard + Planning (tema scuro, griglia piena: tutto OK).
> Contiene valutazioni di prodotto **decise** + specifiche. Ordine consigliato in §6.

---

## 0. Micro-fix immediati
1. **Lingua di default = `app_user.locale` (it-IT per il demo)**, non quella del browser. Lo screenshot si è aperto in
   inglese: la risoluzione iniziale deve essere `app_user.locale` → `tenant.default_locale` → browser → `it-IT`.
2. **Font liste Dashboard**: le righe (`.row-li`/`.cellname`) vanno a capo perché il font è più grande della specifica.
   Riallinea a `base.css` (titolo riga ~14–15px), e fai **troncare con ellissi** il titolo invece di andare a capo
   (es. `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` sul titolo; sottotitolo su seconda riga come nel mock 05).

---

## 1. TERMINOLOGIA per-tenant (glossario i18n) — DECISO: glossario mirato, non override di tutte le stringhe

**Decisione/valutazione:** l'obiettivo (ogni azienda usa le proprie parole di mestiere: "Cantiere" vs "Commessa",
"Intervento" vs "Attività") è corretto e on-thesis. **Ma** NON rendere editabili per-tenant *tutte* le stringhe UI
(migliaia di "Salva/Annulla/Aggiungi" = incubo di manutenzione). Si fa un **glossario di ~30 termini di dominio**,
sovrapposto alle traduzioni standard. Stessa filosofia di `field_definition`/`lookup_value`: default di sistema + override tenant.

**Modello dati (nuova tabella):**
```
term_override(
  id, tenant_id NOT NULL, locale text NOT NULL, term_key text NOT NULL,
  value_singular text NOT NULL, value_plural text,
  UNIQUE(tenant_id, locale, term_key)
)  -- RLS: lettura/scrittura solo tenant corrente; nessuna riga di sistema
```
*(In alternativa `tenant.attributes.terminology[locale][key]`, ma una tabella è più pulita per RLS/query.)*

**Insieme curato di `term_key` (≈30, singolare+plurale):** `engagement`, `phase`, `activity`, `resource`, `asset`,
`material`, `customer`, `contact`, `capture`, `dependency`, `time_entry`, `consumption`, `checklist`, `planning`,
`dashboard`, `template`, `priority`, `status`… (lista completa da concordare; partire dai nomi che compaiono nel menu).

**Frontend (i18next, namespace dedicato):**
- Le scritte di **chrome** restano nei file standard `it-IT/en/es-AR` (namespace `common`).
- I **termini di dominio** vanno in un namespace `terms`; nei componenti usa `t('terms.engagement')` /
  `t('terms.engagement_plural')` per i nomi di dominio (menu, titoli, etichette colonne).
- **Caricamento override**: al login, `GET /settings/terminology?locale=` restituisce gli override del tenant per la
  lingua corrente; vengono **iniettati nel namespace `terms`** (sovrascrivono i default). Ricarica al cambio lingua.

**Admin UI**: pagina **Impostazioni › Terminologia** (`settings:manage`): tabella per lingua con i ~30 termini
(singolare/plurale) editabili; vuoto = usa il default di sistema.

**Backend**: `GET /settings/terminology?locale=`, `PUT /settings/terminology` (upsert per `(locale, term_key)`), `settings:manage`.

**Nota onesta (italiano):** genere e plurale contano ("la commessa/le commesse" vs "il progetto/i progetti").
v1: gestire **singolare + plurale**. L'accordo dell'articolo (la/il) è un raffinamento successivo (flag genere opzionale);
per ora usare forme che funzionino con articolo neutro dove possibile.

---

## 2. PALETTE COLORI — DECISO: palette curata ricca (non hex libero di default)

**Decisione/valutazione:** il colore libero rompe dark mode e coerenza. Si passa dai **6 token semantici** attuali a una
**palette curata di ~16–20 colori**, ognuno con variante **chiara e scura** già definita. Così l'utente ha vera scelta,
ma il sistema resta coerente e a prova di tema scuro.

**Implementazione:**
- In `design-system.css` definisci i colori della palette come token con valori chiaro/scuro, es.:
  `--c-rose, --c-pink, --c-fuchsia, --c-violet, --c-indigo, --c-sky, --c-cyan, --c-teal, --c-emerald, --c-green,
  --c-lime, --c-amber, --c-orange, --c-red, --c-slate, --c-stone` (+ eventuale `-wash` per gli sfondi pill).
- `lookup_value.color_token` (e l'eventuale colore utente/avatar) memorizza la **chiave palette** (es. `teal`),
  non un hex. Le `.pill--<key>`/swatch leggono il token.
- **Picker**: una griglia di **swatch** (la palette) con stato selezionato; sostituisce i "pochi colori" attuali.
- I **token semantici di sistema** (success/warning/danger/info) restano per gli stati logici di sistema.
- **Avanzato (futuro):** colore personalizzato (hex) con il sistema che deriva variante scura + colore testo a contrasto
  (WCAG AA). Etichettarlo "avanzato" perché meno adattivo del set curato.

---

## 3. INPUT DATA/ORA ASSISTITO — DECISO: selettori strutturati, niente testo libero

Sostituire ovunque il formato testuale a rischio con **controlli strutturati e locale-aware**:
- **Ora**: selettore con **passi di 15 minuti** (input `type="time"` con `step=900`, o un select stilizzato).
- **Data**: calendario / `type="date"` (locale-aware via `Intl`).
- **Editor orari per-risorsa (mock 20 `.avail`)**: per ogni giorno, **righe-intervallo** (`08:00`–`13:00`) con due
  selettori ora + pulsante rimuovi + "Aggiungi intervallo". Validazione: **fine > inizio**, **niente sovrapposizioni**,
  messaggio inline. Vuoto = "usa orario azienda".
- **Indisponibilità**: data inizio/fine con calendario + ora; controllo `fine > inizio`.
- Niente parsing di stringhe scritte a mano dall'utente.

---

## 4. DASHBOARD — grafici + configurabile

### 4.1 Grafici (più "visiva")
Aggiungi 2–3 elementi grafici (libreria consigliata: **recharts**, già nello stack React):
- **Ore per giorno (questa settimana)**: bar chart (da `time_entry`).
- **Commesse per stato**: donut/bar (da `engagement.status`).
- **Avanzamento commesse**: barre di progresso per commessa attiva (% attività `done` su totale).

### 4.2 Dashboard configurabile (catalogo KPI/widget)
- **Catalogo widget** (chiave + come si calcola). **Calcolabili ORA:**
  - `commesse_attive` (count engagement attive) · `ore_settimana` (sum time_entry settimana) ·
    `catture_da_rivedere` (count capture pending) · `scadenze_a_rischio` (activity due_by a rischio) ·
    `attivita_oggi` (lista) · `catture_recenti` (lista) · `avanzamento_commesse` (% done per commessa) ·
    `ore_preventivo_vs_consuntivo` (Σ`estimated_minutes` vs Σ`time_entry.minutes` per commessa →
    "ore residue / sforamento") · `ore_per_giorno` (chart) · `commesse_per_stato` (chart) ·
    `carico_per_risorsa` (ore pianificate per risorsa).
- **Richiede piccola aggiunta dati (vedi §4.3):** `marginalita_commesse` (budget − costi).
- **Config per utente** (con default di tenant): `app_user.attributes.dashboard = { widgets: [keys ordinate], hidden: [...] }`.
  UI: **trascina per ordinare**, **toggle** per mostrare/nascondere; un "Ripristina default".
- Backend: estendi `GET /dashboard` perché ogni widget sia un blocco calcolato on-demand secondo la config; oppure
  endpoint `GET /dashboard/widgets?keys=`.
- Partire con un **default sensato** (le 4 KPI attuali + Attività di oggi + Avanzamento commesse).

### 4.3 Prerequisito dati per la marginalità (proporre come campi configurabili)
Per calcolare la marginalità servono **ricavo** e **costo**, oggi non modellati. Aggiungerli come **campi di sistema
`field_definition`** (nessuna migrazione DDL):
- `engagement.budget` (money) — valore/preventivo della commessa (ricavo).
- `resource.hourly_cost` (money) — già usato negli attributes del demo; formalizzarlo come campo di sistema.
- `material.unit_cost` (money) — costo unitario materiale.
Margine commessa ≈ `budget − (Σ ore×hourly_cost + Σ consumi×unit_cost)`. *(Da fare quando si attiva il widget marginalità.)*

---

## 5. PLANNING — va bene così
Fedele e leggibile; nessuna modifica ora. **Backlog (futuro):** click su un blocco → apre l'attività;
**trascinamento** del blocco per riassegnare/spostare (con la solita logica "proponi, non forzare").

---

## 6. Ordine consigliato (mio parere su "cosa proseguire")
Claude Code propone **FASE 3 dipendenze (parte semplice) + fix sicurezza visibilità**: **sono d'accordo, è il prossimo
passo core giusto.** Intorno ad esso:
1. **Micro-fix §0** (lingua default it-IT, font liste dashboard) — minuti, alta resa.
2. **Input data/ora assistito §3** — piccolo, mette in sicurezza ciò che è appena uscito (orari risorsa).
3. **FASE 3 — dipendenze (parte semplice)** con fix sicurezza nel `POST /dependencies` (visibilità di **entrambe** le
   attività via `withRls`; anti-ciclo `WITH RECURSIVE`; stessa commessa; picker "Bloccata da"). ← proposta di Claude Code, approvata.
4. **Personalizzazione (on-thesis, vendibile):** Palette colori §2, poi Terminologia per-tenant §1.
5. **Dashboard:** fix grafici §4.1 + configurabile §4.2 (marginalità §4.3 quando si aggiungono i campi costo/budget).
6. Resto FASE 3: gestione campi personalizzati, template, pack software/piscine, solver, ecc.

---

## 7. Checklist per Claude Code (questa parte)
- [ ] Lingua default = `app_user.locale` (it-IT nel demo); font liste Dashboard a `base.css` + ellissi. *(§0)*
- [ ] **Input assistito** ore/date: selettori (15') + calendario + validazione; editor `.avail` a intervalli. *(§3)*
- [ ] **FASE 3 dipendenze (parte semplice)** + fix sicurezza visibilità nel `POST /dependencies`. *(§6.3)*
- [ ] **Palette colori** curata (~16–20, chiaro/scuro) + swatch picker; `color_token` = chiave palette. *(§2)*
- [ ] **Terminologia per-tenant**: tabella `term_override` + RLS, namespace i18next `terms`, `GET/PUT /settings/terminology`, pagina Impostazioni › Terminologia. *(§1)*
- [ ] **Dashboard**: grafici (recharts) + dashboard configurabile (catalogo widget + config per utente + drag/toggle). *(§4)*
- [ ] Campi di sistema per marginalità (`engagement.budget`, `resource.hourly_cost`, `material.unit_cost`) quando si attiva il widget. *(§4.3)*
- [ ] Conferma prima di toccare lo scheduler; commit + push a fine sessione.

---

*Fine parte 8 — 14/06/2026.*
