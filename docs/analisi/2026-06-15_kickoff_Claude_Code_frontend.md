# Kickoff per Claude Code — Frontend siSuite su design system v5

> Copia tutto il blocco "PROMPT" qui sotto e incollalo come primo messaggio nella sessione di Claude Code.
>
> **Prima, sistema i file nel repo così:**
> - `docs/mockup/` → `base.css` (v5) + `FRONTEND_SPEC.md` (v2) + maschere **`28..39`** (il target attivo).
> - `docs/mockup/_legacy_v1/` → maschere **`01..26`** (riferimento storico/funzionale, **mai per lo stile**).

---

## PROMPT (copia da qui)

Sei nel repo **sivaf-ai/siSuite** (branch `main`). Il **backend e l'infrastruttura sono già fatti e vanno tenuti** (migrazioni, RLS, trigger, moduli Ore/Magazzino/Rapportini/Budget/Assenze già a backend). Il tuo compito è **(ri)fare e allineare il FRONTEND** al nuovo design system. Non toccare il backend se non per esporre dati che servono al FE.

### Fonti autoritative (leggile PRIMA di scrivere codice, in quest'ordine)
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
7. **Drawer/pannello master-detail persistente** per liste e modifiche brevi (lista resta, click riga aggiorna il pannello, guardia su modifiche non salvate); **pagina intera** (`.formpage`) per entità ricche (Cliente/Commessa/Asset) e documenti magazzino; **modale** solo per conferme.
8. Ore: una sola colonna `Ore (h:mm)`; inizio/fine solo se misurati col cronometro, nel dettaglio riga.

### Vincoli tecnici
- Stack: **Ionic + Capacitor + React**. Ionic solo per shell/navigazione/gesture; **niente componenti Ionic con stile di default** — l'aspetto viene dai componenti propri sui token di `base.css`.
- Icone: **`lucide-react`** (mai emoji). Mappa azioni in `FRONTEND_SPEC.md §8`.
- Stati/etichette come **pill da `lookup_value`** (color_token + label per-locale + sigla). Mai colori hex cablati: usa i token.
- EntityForm **generato da `field_definition`** (FRONTEND_SPEC §4): campi tipizzati + attributi raggruppati/ordinati; zod FE generato dalle stesse righe del BE.

### Ordine di lavoro
1. **Costruisci prima i componenti** del design system da `base.css` (FRONTEND_SPEC §3), inclusi i tre nuovi rispetto alla v1: **DensityToggle**, **MasterDetail** (`.split/.detailpanel`), **FormPage** (`.formpage`). Più: AppShell, MobileShell, DataTable (con `.num/.money/.dur/.time`), Toolbar, SearchBar, EntityForm, Drawer, Modal/ConfirmDialog, StatusPill, TreeView, DetailLayout, Stepper, KPI/ProgressBar, Timeline, Toast, EmptyState.
2. **Cabla `field_definition`**: il BE espone le definizioni per (entity, vertical, tenant); `EntityForm` le consuma.
3. **Porta Cliente a livello "TOP"** come metro (mock 33 pagina-form + lista in master-detail): lista (ricerca/ordina/pagina) → crea/modifica → dettaglio → elimina con conferma. Quando è eccellente, **replica lo stesso metro su tutte le altre entità**.
4. **Moduli già a backend** (mock 28–32): Foglio ore, Magazzino (+ documenti come pagina intera), Rapportini (stepper AI), Budget, Assenze, Cronometro.
5. **Schermate ricche**: Pianificazione (34), Dashboard (35), Commesse+Albero (36, TreeView), Catture inbox (38), Asset/libretto (38, Timeline), Stati-etichette (39), Login (39), Mobile tecnico (37).
6. Le liste semplici (Clienti, Risorse, Materiali, Utenti, Numerazioni, Impostazioni) **riusano identico** il pattern DataTable di 31/36: non serve una maschera dedicata, derivale.

### Definition of Done (per ogni schermata)
Combacia con la maschera v5 · rispetta gli 8 standard (densità funzionante, sentence case, numeri/valuta/durata formattati, drawer/pagina/modale corretti) · tutti i campi (inventario + `field_definition`) presenti ed **editabili** · CRUD completo dove applicabile · solo componenti del design system + icone lucide · RBAC applicato (azioni nascoste/disabilitate senza permesso **e** bloccate lato API) · stati vuoto/caricamento/errore · responsive desktop+mobile.

### Come procedere
Parti dai **componenti** e da **Cliente** come verticale di riferimento. Quando Cliente è "done" secondo la DoD sopra, **fermati e fammi vedere** prima di replicare sulle altre entità. Lavora a commit piccoli e descrittivi.

## (fine prompt)

---

### Promemoria operativi (per te, Sivaf — non per il prompt)
- I 14 commit della fase backend sono ancora **locali**: ricordati `git push origin main` quando vuoi.
- L'integrazione del **motore Agenda** (planner) resta gated: sessione separata e supervisionata.
- Quando crei la maschera Cliente "TOP", Code dovrebbe fermarsi e mostrartela: è il punto di controllo giusto prima di moltiplicare il lavoro su tutte le entità.
