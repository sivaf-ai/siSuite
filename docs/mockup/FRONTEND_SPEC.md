# siSuite — Spec Frontend VINCOLANTE · v2 (2026-06-15)

> Da consegnare a Claude Code **insieme** al brief, per **rifare/allineare il frontend**. Il backend/infra già fatto si tiene. Questo documento ha **precedenza** sulle parti UI del brief e **sostituisce** la v1 dove sono in conflitto (la v1 usava una scala tipografica più grande e il drawer per tutto: superati).
>
> **Per tutte le LISTE e le MASCHERE (CRUD) il riferimento VINCOLANTE è `STANDARD_UI_liste_e_maschere_v2.md`** (in `docs/standard/`). Questo spec resta valido per design system, componenti e mappa maschere; dove tocca liste/CRUD, **vince lo standard**. La maschera **41** ne è il riferimento visivo.
>
> **Per la NAVIGAZIONE/MENU il riferimento VINCOLANTE è lo standard Si.Va.F. `02_navigation_menu`** (2 livelli, Rail+Sub-panel collassabile, omnibox ⌘K, una route canonica per entità, Regola del 10%). La maschera **43** ne è il riferimento visivo. L'archetipo **Documento** (testata+righe) ha come riferimento la maschera **42**.

---

## 0. Cosa è cambiato rispetto alla v1 (leggere per primo)

La v1 aveva font troppo grandi, colonne larghe, maiuscolo diffuso, unità ripetute in ogni cella e drawer per ogni entità. **Tutto rivisto e confrontato con i leader di mercato.** Il nuovo riferimento è:

- **`base.css` v5** = unica fonte di verità del look (token, **3 densità**, scala font, helper numeri/valuta/durata, master-detail, pagina-form).
- **Maschere `28..41`** = esempi canonici del nuovo sistema (vedi §6). Sono il TARGET visivo. La **41** (Aziende) è il riferimento dello standard liste/CRUD; la **40** (Ordinativi FTTH) il modulo per il cliente fibra.
- Le maschere **`01..26`** sono **legacy**: utili solo come riferimento di **layout e funzionalità** per le schermate non ancora rifatte, **mai per lo stile**. Diverse sono già state rifatte su v5 (mappatura in §6).

**Struttura cartelle nel repo (importante):**
- `docs/mockup/` → contiene **solo** `base.css` (v5) + le maschere **`28..41`**. È il **target attivo**: quando leggi `docs/mockup/`, vedi solo la verità corrente.
- `docs/mockup/_legacy_v1/` → le maschere **`01..26`** (riferimento storico/funzionale). I numeri `01..26` citati in questo documento si riferiscono a questa cartella. **Non copiarne lo stile.**

---

## 1. Gli 8 standard UI — VINCOLANTI ovunque

Valgono per ogni schermata, desktop e mobile. Sono già implementati in `base.css` v5.

1. **Densità in 3 versioni** — Compatta / Comoda / Spaziosa, via `<html data-density="compact|comfortable|spacious">`. Default **comfortable**. Selezionabile nelle impostazioni e **salvata per utente**. Niente dimensioni cablate: usare le variabili `--row-pad`, `--cell-fs`, `--ctrl-h`, `--input-h`.
2. **Scala font**: H1 22 · sezione 16 · card 15 · corpo/cella 13 · intestazione tabella **11.5 in sentence case** · eyebrow 10.5 (**unico** maiuscolo ammesso). Mai maiuscolo sulle intestazioni di colonna o sulle label.
3. **Numeri**: sempre **allineati a destra**, **incolonnati ai decimali**, **cifre tabellari** (mono, `tnum`), **separatore migliaia + 2 decimali** di default. Classe `.num`.
4. **Unità non monetarie**: nell'**intestazione** di colonna, celle pulite. Es. header `Giacenza (pz)` → cella `24`. Mai l'unità in ogni cella.
5. **Valuta**: formato **contabile** — simbolo **a sinistra** della cella, numero **a destra**, decimali incolonnati. Classe `.money` (`<span class="money"><span class="sym">€</span><span class="val">12,40</span></span>`). Negativi in `--danger`. Gestisce anche il multi-valuta.
6. **Durata vs ora del giorno**: durata = header `Ore (h:mm)` → `4:30` (classe `.dur`); ora del giorno = header `Orario`, 24h → `09:45` o range `09:45 → 10:42` (classe `.time`). L'intestazione disambigua.
7. **Liste e maschere → `STANDARD_UI_liste_e_maschere_v2.md` (VINCOLANTE).** Il default **non è più** il drawer master-detail: è **Lista → Scheda (Object Page)**. In sintesi: **una sola lista + un solo CRUD per entità** (riusati anche in selezione/pop-up, stessa lista/stesso formato); **righe a 1 o 2 livelli** secondo l'entità; toolbar a sole icone con tooltip e azioni dati a destra (**+** ultimo); selezione = solo un numero; **label e titoli box fissi nel bordo**; scheda con **solo Salva/Annulla** in alto (intestazione sticky opaca, niente dati ripetuti); validazione **dentro** il campo; **tabelle correlate come strip di tab in fondo**. Restano validi: la **pagina-form** (`.formpage`), la **modale di conferma**, e il pannello di anteprima **solo** per il triage ad alto volume (Catture/Ordinativi).
8. **Ore**: una sola colonna `Ore (h:mm)`. Inizio/fine compaiono **solo se misurati col cronometro**, nel **dettaglio** della riga (non come colonne extra). Toggle presenze per-tenant per attivare la timbratura.

---

## 2. Design system = `base.css` v5 (no Ionic grezzo)

`base.css` definisce token (colori a ruolo, ombre, raggi), tipografia (Bricolage Grotesque display + Inter testo + JetBrains Mono codici/numeri), le 3 densità e tutti i componenti.

- **Niente componenti Ionic con stile di default.** Ionic solo per shell/navigazione/gesture; l'aspetto viene dai componenti propri sui token.
- **Colori sempre via token** (mai hex cablati) → coerenza con `lookup_value.color_token` e tema scuro futuro.
- **Icone: `lucide-react`.** Mai emoji. Ogni azione ha la sua icona (mappa §8).
- **Marchio**: `<em>si</em>Suite` (la "si" in `--flow`); mark a gradiente `--flow-grad`.
- Hover states, focus visibili, transizioni 120–150ms.

---

## 3. Libreria componenti (costruirla PRIMA delle schermate)

| Componente | Cosa fa | Classe/rif. base.css | Mock |
|---|---|---|---|
| **AppShell** | sidebar scura + topbar con barra comando (⌘K) | `.app/.sidebar/.topbar/.cmdbar` | 28–33 |
| **MobileShell** | screen telefono + tab bar + capture-bar | `.phone/.screen/.tabbar/.capture-bar` | 32,37 |
| **DensityToggle** | Compatta/Comoda/Spaziosa → setta `data-density`, salva per utente | `.seg.dens` | 29 |
| **DataTable** | colonne, ordinamento, hover-row con azioni, paginazione, vuoto, skeleton, selezione multipla; helper `.num/.money/.dur/.time` | `table.t` | 28,29,31 |
| **MasterDetail** | lista (master) + pannello persistente (detail) sincronizzato, guardia non-salvato | `.split/.detailpanel/.dp-*` | 28,30,31 |
| **FormPage** | pagina-form per entità ricche e documenti, sezioni in schede, barra azioni fissa | `.formpage/.formcard/.fgrid/.formbar` | 29(doc),33 |
| **EntityForm** | **generato da `field_definition`** (§4): campi tipizzati + attributi raggruppati/ordinati, validazione | `.fsec/.fld/.inp` | 33 |
| **Drawer** | pannello laterale per form brevi dalle liste (alternativa leggera al master-detail) | `.drawer/.drawer-*` | — |
| **Modal + ConfirmDialog** | solo conferme distruttive | `.modal/.modal-f` | — |
| **StatusPill/PriorityPill** | da `lookup_value` (color_token + label locale + sigla) | `.pill--*` | ovunque |
| **TreeView** | gerarchia espandibile (commesse: fasi → sotto-fasi → attività) | `.xtree/.tnode` | 36 |
| **DetailLayout** | testata (codice, titolo, stato) + chiave/valore + tab underline | `.detail-head/.kv/.tabu` | 36,38,30(budget) |
| **Stepper** | flusso di stato (rapportino: grezzo→AI→confermato→firmato) | `.stepper/.step` | 30 |
| **KPI card / ProgressBar** | indicatori budget + barra con allarme | `.kpi/.budgetbar` | 30,35 |
| **Timeline** | storico/libretto asset | `.timeline/.tlitem` | 38 |
| **Toast / EmptyState** | esiti azioni / stato vuoto | `.toast/.empty` | — |

---

## 4. EntityForm guidato da `field_definition` (invariato dalla v1)

Il form di ogni entità è **generato**, non scritto a mano:

1. **Campi tipizzati** (colonne reali: `title`, `status_id`, date, FK…) → widget dedicati (testo, select da `lookup_value`, date picker, select FK con ricerca).
2. **Campi in `attributes jsonb`** (P.IVA, CF, PEC, SDI, dati tecnici per-verticale…) → letti da **`field_definition`** filtrando `(entity, vertical, tenant)`: render per `data_type`, etichetta dalla `label` nella lingua utente, raggruppati per `group_key`, ordinati per `sequence`, validazione da `field_definition.validation` (+ `required`); lo **zod** FE è generato dalle stesse righe del BE (una sola fonte di verità).
3. Salvataggio: gli attributi finiscono in `entity.attributes`. Niente blob opachi: ogni jsonb ha le sue righe in `field_definition`.

La pagina-form **Cliente** (mock 33) è il riferimento: Anagrafica, Dati fiscali, Contatti, Indirizzi, Condizioni commerciali, Note — colonne + attributi insieme, sezioni in schede.

---

## 5. CRUD completo su tutte le entità

Per **ogni** entità: **Lista · Crea · Dettaglio · Modifica · Elimina**, dietro RBAC (`permissions.ts`) + RLS.

- **Lista** (DataTable + Toolbar): ricerca server-side con debounce, filtri (chip/segmented), ordinamento per colonna, paginazione (scroll infinito su mobile), azioni a icona in hover, selezione multipla + bulk, EmptyState e skeleton.
- **Crea/Modifica** — secondo lo standard 7:
  - entità/righe **brevi** → **master-detail** o **drawer**;
  - entità **ricche** e **documenti** → **FormPage** (pagina intera);
  - pre-compilato in modifica, validazione, **toast** d'esito, update ottimistico.
- **Elimina**: soft-delete (`archived_at`) con **ConfirmDialog**; cancellazioni che intaccano storia fatturabile già bloccate dal DB (`RESTRICT`) → messaggio chiaro, non crash.

Entità coperte: company (+ company_role, company_contact), asset, engagement, phase, activity, resource, material, time_entry, stock (movement/balance/document), app_user (+ user_role), role, lookup_value, number_series, plan/subscription. Inventario campi: vedi v1 §4 (criterio invariato).

---

## 6. Indice maschere

**Nuove (TARGET sul design system v5):**

| # | File | Dimostra |
|---|---|---|
| 28 | `28_web_foglio-ore_nuova-densita.html` | DataTable densa + **toggle densità** + **master-detail** + `Ore (h:mm)` + tariffa contabile |
| 29 | `29_web_magazzino.html` | Giacenze (unità in header, **valuta contabile** multi-colonna, riga negativa) + **documento di carico come pagina intera** |
| 30 | `30_web_rapportini-budget.html` | Rapportini (**stepper** flusso AI in master-detail, toggle Cliente/Interno) + Budget (KPI + progress + ripartizione per fase, toggle Costo/Ricavo/Margine) |
| 31 | `31_web_assenze.html` | Richieste (approva/respingi in master-detail) + Saldi (unità in header) |
| 32 | `32_web_cronometro.html` | Cronometro desktop (sessioni misurate: `Orario` + `Ore (h:mm)`) + **widget timer mobile** |
| 33 | `33_web_cliente_scheda.html` | **Pagina-form ricca** (riferimento per Cliente/Commessa/Asset) |
| 34 | `34_web_pianificazione.html` | Pianificazione: griglia per-risorsa, card attività (orario/flusso, pinned), pannello riepilogo settimana |
| 35 | `35_web_dashboard.html` | Dashboard: KPI, prossime attività, catture da elaborare, margine per commessa, avvisi |
| 36 | `36_web_commesse.html` | Commesse (lista con avanzamento/margine) + **dettaglio con albero** (TreeView fasi/sotto-fasi/attività, dipendenze) |
| 37 | `37_tecnico_mobile.html` | Mobile tecnico: Oggi, **Cattura vocale → proposta AI**, Agenda tecnico |
| 38 | `38_web_catture-asset.html` | Catture inbox (coda AI master-detail) + Asset/**libretto** (testata + Timeline) |
| 39 | `39_web_stati-login.html` | Editor **lookup_value** (canonico/colore/sigla/ordine) + Login sul brand |
| 40 | `40_web_ordinativi-ftth.html` | **Ordinativi FTTH** (cliente fibra): lista "a pezzi" + scheda ordinativo (apparati/seriali, privacy) + chiusura mobile via AI |
| 41 | `41_web_aziende_standard.html` | **Riferimento dello standard liste/CRUD** (`STANDARD_UI_liste_e_maschere_v2.md`): lista a 2 livelli + selezione in pop-up (stessa lista) + Scheda Object Page (label/titoli nel bordo, solo Salva/Annulla, tab correlate in fondo, validazione nel campo) |
| 42 | `42_web_ddt_carico.html` | **Riferimento dell'archetipo Documento** (master-detail): testata con label nel bordo + righe a una riga (incolonnate) + numerazione + conferma immutabile + totali contabili. Esempio: DDT di carico magazzino |
| 43 | `43_web_menu_due_livelli.html` | **Riferimento del menu a 2 livelli** (standard Si.Va.F. `02_navigation_menu`): Rail (L1) collassabile + Sub-panel (L2) raggruppato, preferiti/pin, Collegamenti (↪), badge PRESTO, omnibox ⌘K. Include la mappa completa di tutte le voci siSuite |

**Legacy in `docs/mockup/_legacy_v1/` (`01..26`) — solo riferimento funzionale, mai stile.**

Già rifatte su v5 (puoi ignorarne la versione legacy): 03→34 · 05→35 · 06/07/24→36 · 08/10→38 · 09/15→39 · 01/02/21→37.

Ancora utili come riferimento di layout/funzioni (non rifatte singolarmente): 04 (dettaglio attività mobile) · 11/12/13/14 (liste clienti/risorse/materiali/utenti) · 16 (numerazioni) · 17 (piano) · 18 (impostazioni) · 19/20 (dettaglio cliente/risorsa) · 22/23 (catture/cerca mobile) · 25 (lista CRUD) · 26 (form cliente legacy). Le liste semplici riusano il DataTable di 31/36, non serve ridisegnarle.

---

## 7. Struttura commessa = ALBERO (mask 36; legacy 24 in `_legacy_v1/`)

```
Engagement (commessa)
└─ Phase (ramo)            ← annidabile via parent_phase_id
   └─ Sub-phase (sotto-ramo)
      └─ Activity (foglia) ← l'unica che porta ore/risorse/materiali
```
Espandi/collassa con chevron + connettori; ogni nodo con StatusPill, rollup, azioni inline in hover; sulle attività: durata stimata, badge dipendenze, priorità. `TreeView` riusabile.

---

## 8. Icone (lucide-react) — mappa azioni (invariata)

Ricerca `Search` · Nuovo `Plus` · Filtro `SlidersHorizontal` · Ordina `ArrowUpDown` · Esporta `Download` · Espandi `ChevronDown`/`ChevronRight` · Modifica `Pencil` · Elimina `Trash2` · Duplica `Copy` · Menu `MoreHorizontal` · Apri `ChevronRight` · Conferma `Check` · Cattura `Mic` · Avviso `AlertTriangle`. Sezioni: Commesse `Briefcase` · Clienti `Building2` · Risorse `Users` · Materiali/Magazzino `Package`/`Warehouse` · Asset `Box` · Agenda `Calendar` · Impostazioni `Settings`.

Toolbar lista standard (da sx): SearchBar · Filtro · Ordina · *(spazio)* · DensityToggle · Esporta · **Nuovo** (primario).

---

## 9. Definition of Done — UI (gate per schermata)

Passa solo se: ✓ combacia con la maschera v5 di riferimento · ✓ **rispetta gli 8 standard** (densità funzionante, sentence case, numeri/valuta/durata formattati come da §1, drawer/pagina/modale corretti) · ✓ tutti i campi (inventario + `field_definition`) presenti **ed editabili** · ✓ CRUD completo dove applicabile · ✓ solo componenti del design system (no Ionic grezzo) + icone lucide · ✓ permessi RBAC applicati (azioni nascoste/disabilitate senza permesso **e** bloccate lato API) · ✓ stati vuoto/caricamento/errore · ✓ responsive desktop+mobile.

---

## 10. Sequenza di lavoro

1. **Componenti** §3 da `base.css` v5 — inclusi **DensityToggle**, **MasterDetail**, **FormPage** (sono i nuovi rispetto alla v1).
2. **`field_definition`** cablato; `EntityForm` lo consuma; zod generato dalle stesse righe.
3. **Cliente** portato a livello "TOP" come metro (lista → master-detail/pagina-form → dettaglio → elimina), poi **stesso metro su tutte le altre entità**.
4. **Moduli già a backend** (mask 28–32): Foglio ore, Magazzino (+ documenti pagina intera), Rapportini, Budget, Assenze, Cronometro.
5. **Schermate ricche già disegnate su v5** (mask 34–39): Pianificazione, Dashboard, Commesse+Albero (TreeView), Mobile tecnico, Catture inbox, Asset/libretto (Timeline), Stati-etichette, Login. Restano da **derivare** le liste semplici (Clienti, Risorse, Materiali, Utenti, Numerazioni, Impostazioni) riusando il DataTable di 31/36 — non serve una maschera dedicata.

> Le maschere dicono *come deve apparire*; `field_definition` dice *quali campi*; gli **8 standard** + `base.css` v5 dicono *con quali regole*; questo documento dice *quando è finita*.
