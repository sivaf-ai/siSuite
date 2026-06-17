# Kickoff per Claude Code — Frontend siSuite su design system v5

> Copia tutto il blocco "PROMPT" qui sotto e incollalo come primo messaggio nella sessione di Claude Code.
>
> **Prima, sistema i file nel repo così:**
> - `docs/standard/STANDARD_UI_liste_e_maschere_v2.md` → lo **standard VINCOLANTE** per liste e maschere (vedi Fonti autoritative).
> - `docs/standard/02_navigation_menu.md` → lo **standard Si.Va.F. di navigazione** (menu 2 livelli) — VINCOLANTE.
> - `docs/mockup/` → `base.css` (v5) + `FRONTEND_SPEC.md` + maschere **`28..43`** (target attivo; **41** = rif. liste/CRUD, **42** = rif. Documento, **43** = rif. menu).
> - `docs/mockup/_legacy_v1/` → maschere **`01..26`** (riferimento storico/funzionale, **mai per lo stile**).

---

## PROMPT (copia da qui)

Sei nel repo **sivaf-ai/siSuite** (branch `main`). Il **backend e l'infrastruttura sono già fatti e vanno tenuti** (migrazioni, RLS, trigger, moduli Ore/Magazzino/Rapportini/Budget/Assenze già a backend). Il tuo compito è **(ri)fare e allineare il FRONTEND** al nuovo design system. Non toccare il backend se non per esporre dati che servono al FE.

### Fonti autoritative (leggile PRIMA di scrivere codice, in quest'ordine)
0. **`STANDARD_UI_liste_e_maschere_v2.md` — VINCOLANTE per ogni lista e maschera.** Definisce: **una sola lista + un solo CRUD per entità** (riusati anche per cercare/selezionare da altre maschere, in pop-up); i **3 archetipi** (Lista / Scheda Object Page / Documento master-detail); **righe a 1 o 2 livelli** secondo l'entità; toolbar a sole icone con tooltip e azioni dati raggruppate a destra con **+** ultimo; selezione = solo un numero; **label e titoli box fissi nel bordo**; validazione con messaggio **dentro** il campo; scheda con **solo Salva/Annulla** in alto (intestazione sticky opaca, niente dati ripetuti); **tabelle correlate come strip di tab in fondo**; densità solo in Impostazioni. Riferimenti visivi: **41** (Lista+Scheda), **42** (Documento). In caso di conflitto con qualunque altra fonte (incluso lo standard #7 storico qui sotto), **vince questo documento**.
0-bis. **`02_navigation_menu.md` (Si.Va.F.) — VINCOLANTE per la navigazione/menu.** Menu a **2 livelli** (Rail L1 collassabile + Sub-panel L2 raggruppato), **max 2 click**, niente 3° livello (gli aspetti dell'entità stanno in-page via tab/pillbar); **una route canonica per entità**; entità trasversali nell'hub Anagrafiche (**Regola del 10%**); **Collegamenti** (↪) verso le route canoniche; **omnibox ⌘K** (ricerca + comando AI); **preferiti** per-utente; il menu nasconde per licenza/RBAC ma non è la barriera di sicurezza. Riferimento visivo: **43**.
1. `base.css` (v5) — **unica fonte di verità del look**: design token, **3 densità** (`<html data-density="compact|comfortable|spacious">`), scala font, helper `.num/.money/.dur/.time`, master-detail, pagina-form, tutti i componenti. In testa al file ci sono gli **8 standard UI**: sono vincolanti.
2. `FRONTEND_SPEC.md` (v2) — cosa costruire, libreria componenti, EntityForm da `field_definition`, CRUD, indice maschere, **Definition of Done**. Ha precedenza sulle parti UI del brief e **sostituisce la v1**.
3. Maschere `docs/mockup/28..39_*.html` — **il TARGET visivo** (vedi indice e mappatura in FRONTEND_SPEC §6). Le maschere `01..26` stanno in `docs/mockup/_legacy_v1/` e sono **solo** riferimento di layout/funzioni per le poche schermate non ancora rifatte: **non copiarne mai lo stile** (font/densità/unità/valuta della v1 sono superati). Molte sono già state rifatte su v5 (mappatura in §6).

### Gli 8 standard (riassunto, dettaglio in base.css/spec)
1. Densità 3 versioni via `data-density`, salvata per utente, default comfortable. Mai dimensioni cablate: usa le variabili.
2. Scala font come da `base.css`; **intestazioni e label in sentence case**; maiuscolo solo sulle micro-eyebrow.
3. Numeri sempre a destra, incolonnati ai decimali, cifre tabellari, migliaia + 2 decimali default (`.num`).
4. Unità non monetarie nell'intestazione di colonna, celle pulite.
5. Valuta in formato contabile (`.money`): simbolo a sinistra, numero a destra.
6. Durata `Ore (h:mm)` (`.dur`) vs ora del giorno `Orario` 24h (`.time`).
7. **(SUPERATO)** Il vecchio standard "drawer/pannello master-detail come default" **non vale più**. Per liste e CRUD segui `STANDARD_UI_liste_e_maschere_v2.md`: default **Lista → Scheda**; il pannello di anteprima resta solo per i flussi di triage ad alto volume (Catture/Ordinativi). La pagina-form (`.formpage`) e la modale-di-conferma restano valide.
8. Ore: una sola colonna `Ore (h:mm)`; inizio/fine solo se misurati col cronometro, nel dettaglio riga.

### Vincoli tecnici
- Stack: **Ionic + Capacitor + React**. Ionic solo per shell/navigazione/gesture; **niente componenti Ionic con stile di default** — l'aspetto viene dai componenti propri sui token di `base.css`.
- Icone: **`lucide-react`** (mai emoji). Mappa azioni in `FRONTEND_SPEC.md §8`.
- Stati/etichette come **pill da `lookup_value`** (color_token + label per-locale + sigla). Mai colori hex cablati: usa i token.
- EntityForm **generato da `field_definition`** (FRONTEND_SPEC §4): campi tipizzati + attributi raggruppati/ordinati; zod FE generato dalle stesse righe del BE.

### Ordine di lavoro
1. **Costruisci prima i componenti** del design system da `base.css` (FRONTEND_SPEC §3), inclusi i tre nuovi rispetto alla v1: **DensityToggle**, **MasterDetail** (`.split/.detailpanel`), **FormPage** (`.formpage`). Più: AppShell, MobileShell, DataTable (con `.num/.money/.dur/.time`), Toolbar, SearchBar, EntityForm, Drawer, Modal/ConfirmDialog, StatusPill, TreeView, DetailLayout, Stepper, KPI/ProgressBar, Timeline, Toast, EmptyState.
2. **Cabla `field_definition`**: il BE espone le definizioni per (entity, vertical, tenant); `EntityForm` le consuma.
3. **Porta Aziende a livello "TOP"** come metro, seguendo `STANDARD_UI_liste_e_maschere_v2.md` con la **maschera 41** come riferimento visivo: lista a due livelli con toolbar a icone + **selezione in pop-up (stessa lista, radio)** → **Scheda Object Page** (label/titoli nel bordo, solo Salva/Annulla in alto, tab correlate in fondo, validazione dentro il campo). **Una sola `EntityList` + una sola Scheda**, riusate ovunque. Quando è eccellente, **fermati e mostramelo**, poi replica lo stesso metro su tutte le altre entità.
4. **Moduli già a backend** (mock 28–32): Foglio ore, Magazzino (+ documenti come pagina intera), Rapportini (stepper AI), Budget, Assenze, Cronometro.
5. **Schermate ricche**: Pianificazione (34), Dashboard (35), Commesse+Albero (36, TreeView), Catture inbox (38), Asset/libretto (38, Timeline), Stati-etichette (39), Login (39), Mobile tecnico (37).
6. Le altre liste (Articoli, Risorse, Materiali, Utenti, Numerazioni…) **riusano identico** il pattern della **maschera 41** (lista a 1/2 livelli + toolbar + Scheda Object Page): non serve una maschera dedicata, derivale dallo stesso componente.

### Definition of Done (per ogni schermata)
Combacia con la maschera v5 e con `STANDARD_UI_liste_e_maschere_v2.md` (liste/CRUD) · rispetta gli standard di `base.css` (densità funzionante, sentence case, numeri/valuta/durata formattati) · **una sola lista + un solo CRUD per entità, riusati in gestione e selezione** · tutti i campi (inventario + `field_definition`) presenti ed **editabili** · CRUD completo dove applicabile · solo componenti del design system + icone lucide · RBAC applicato (azioni nascoste/disabilitate senza permesso **e** bloccate lato API) · stati vuoto/caricamento/errore · responsive desktop+mobile.

### Come procedere
Parti dai **componenti** e da **Cliente** come verticale di riferimento. Quando Cliente è "done" secondo la DoD sopra, **fermati e fammi vedere** prima di replicare sulle altre entità. Lavora a commit piccoli e descrittivi.

## (fine prompt)

---

### Promemoria operativi (per te, Sivaf — non per il prompt)
- I 14 commit della fase backend sono ancora **locali**: ricordati `git push origin main` quando vuoi.
- L'integrazione del **motore Agenda** (planner) resta gated: sessione separata e supervisionata.
- Quando crei la maschera Cliente "TOP", Code dovrebbe fermarsi e mostrartela: è il punto di controllo giusto prima di moltiplicare il lavoro su tutte le entità.
