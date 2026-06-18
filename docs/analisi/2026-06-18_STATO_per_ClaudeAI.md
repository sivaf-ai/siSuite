# siSuite — Stato del progetto e proposta dei prossimi passi (per Claude AI)

> **Scopo del documento.** Dare a Claude AI (partner di design/architettura) un quadro COMPLETO e aggiornato di siSuite al 18/06/2026, gli standard introdotti, i limiti aperti, e una **proposta ragionata dei prossimi lavori** da valutare insieme. Da qui poi scriviamo il piano operativo per le sessioni Claude Code. Autore: sessione Claude Code (Opus). Interlocutore umano: Ricardo (titolare Si.Va.F.).

---

## 1. Cos'è siSuite e dove siamo
siSuite è un **gestionale AI-first multi-tenant** (greenfield) per Si.Va.F./POWERCOM (verticale fibra). Stack **tutto Docker**: PostgreSQL 16 + pgvector, backend **Fastify/TS** (RLS + RBAC), auth **GoTrue**, frontend **Ionic/React + Vite**, storage **MinIO**, code AI server-side (Anthropic). Multi-tenant con **RLS** (ogni query gira nel contesto tenant/utente/data_scope) e **RBAC** (permessi per risorsa:azione).

**Brief POWERCOM v2.4: COMPLETO.** Blocchi: navigazione 2 livelli, Soggetti (modello Party), Ordini di lavoro (PII a 3 livelli), Articoli&seriali (segreti cifrati), Siti, Listino (resolvePrice commessa›gestore›base), Lavorazioni+libretto, **migrazione di tutte le liste/CRUD allo standard v2** (EntityList/ObjectPage), **Field Builder**, **Rapportino-Documento + CaptureBarAI** (estrazione NL→operazioni con apply deterministico), **Pivot preventivo-consuntivo**, **Magazzino/DDT**. 35 migrazioni applicate.

**Dati demo**: pack "fibra" (Sirti, Open Fiber, commessa Napoli Est con WBS, 14 ordini, seriali, listino, lavorazioni, magazzino, rapportini). AI attiva (chiave reale).

## 2. Modello dati (sintesi)
- **Party**: `company` (anagrafica unica) + `company_role` (customer/supplier/operator/partner) + `company_contact`. Attributi flessibili in `attributes jsonb` governati da `field_definition`.
- **Lavoro**: `engagement` (commessa) › `phase` (WBS, gerarchica) › `activity`. `work_order` (ordine di lavoro, committente esterno + PII in `work_order_subject`).
- **Produzione/contabilità**: `time_entry`, `work_line` (lavorazioni, prezzi fotografati), `equipment_usage`, `subcontract_line`, `material_consumption`, vista **`job_cost_ledger`** (alimenta la Pivot).
- **Catalogo/magazzino**: `material` (+seriali `stock_serial_unit` con segreti AES-GCM), `price_list`(+`item`/`override`), `stock_location`/`stock_balance`/`stock_movement`/`stock_document` (DDT).
- **AI/config**: `capture` (estrazione NL), `field_definition` (campi per-entità/tenant), **`export_preset`** (preset export per-utente, mig 034), **`filter_preset`** (set filtri per-utente, mig 035), **`serial_secret_reveal_log`** (audit reveal, mig 033).

## 3. Standard UI introdotti (questa sessione) — sono il cuore della "piattaforma"
Tutte le liste passano dal componente **`EntityList`** (un'unica implementazione → si propaga ovunque):
1. **Testata su una riga**: titolo+sottotitolo a sinistra, **viste** (filtri salvati come Tutti/Clienti/…) a destra. Niente righe vuote/duplicate.
2. **Selezione**: checkbox per riga + checkbox di testata (seleziona tutti/indeterminato). Click riga → scheda.
3. **Toolbar standard a destra** (ricerca larga a sinistra, "+" per ultimo): Filtri · Colonne · AI · [selezione: Modifica/Duplica/Esporta/Elimina] · azioni custom · Nuovo+. Regole: 0 sel = solo Nuovo; 1 sel = Modifica/Duplica/Esporta/Elimina; >1 = Esporta/Elimina.
4. **Export** (`FieldPicker`+`ExportDialog`): popup con **TUTTI i campi** dell'entità, riordinabili (drag), tutti selezionati di default, **preset per-utente** (salva con nome / carica precompilando campi+ordine), output `.xlsx` (exceljs). Etichette = label localizzate, non costanti.
5. **Colonne**: stesso picker per mostrare/nascondere e riordinare (persistito per-utente).
6. **Filtro AI-first** (`AiFilterPanel`): (a) linguaggio naturale + **voce** → l'AI traduce in condizioni; (b) **builder manuale** (campo·operatore·valore, logica **E/O**). Salva/carica set. Applicato **lato server** (`filterSql.buildFilter` + `FIELD_MAP` per endpoint) → filtra tutti i dati, non solo la pagina.
7. **Scheda** (`ObjectPage`/`ObjectBox`/`RelatedTabs`): crea+vedi+modifica in una pagina, header sticky a filo con solo Salva/Annulla, box con label nel bordo, tab correlate in fondo. `AttrFields` rende i `field_definition`.
8. **Dialoghi in-app obbligatori** (`ConfirmDialog`/`PromptDialog`): **mai** `window.confirm/prompt/alert`.
9. **Documento** (`DocumentArchetype`): testata + sezioni-righe + striscia totali costi/ricavi/margine (Rapportino; riusabile per DDT).

Documentazione standard: `docs/STD_export_e_colonne.md`, `docs/STD_filtro_ai.md`. Memorie regola: `feedback_no_native_popups`, `feedback_objectpage_sticky_header`.

## 4. Limiti aperti / debiti tecnici (onesti)
1. **Design-system globale**: font e pulsanti troppo grandi (anche dentro i bottoni). Va sistemato a livello di **design tokens / classi globali `.btn`** (Ricardo ha detto che lo farà gestire a Claude AI). I dialoghi nuovi hanno già font ridotti localmente.
2. **Filtro server-side — copertura parziale**: per ogni entità è mappato un sottoinsieme di campi raw. NON mappati: campi **calcolati** (giacenza, conteggi, margine), **PII** (intestatario, per non bypassare il mascheramento), alcuni **enum/label** (il filtro lavora sul valore RAW della colonna, es. `type=build` non "Realizzazione"). I **conteggi delle viste** non riflettono il filtro attivo. Mancano operatore **between**, **date-picker**, **gruppi annidati** (parentesi AND/OR).
3. **Export "tutti i campi"** è definito a mano per pagina (`exportFields`): non include dinamicamente i `field_definition` custom del tenant.
4. **Saved views**: il mockup prevede "Salva" sulla riga viste (= filtro+colonne+ordinamento salvati con nome). Non implementato (abbiamo i mattoni: filter_preset, colonne localStorage).
5. **Liste legacy** ancora su `DataTable` (non EntityList v3): **Foglio ore**, **Assenze**, **Magazzino** (giacenze/movimenti/documenti/ubicazioni). Niente selezione/export/filtro standard.
6. **i18n**: header/label colonne sono **costanti italiane**; esistono i18n it/en/es per il menu ma non per i dati. Per multilingua serve mappare le label dei campi su chiavi i18n.
7. **Input valore del builder manuale** è sempre testo: dovrebbe adattarsi al tipo campo (select per enum, date-picker per date, number per numeri) e l'elenco operatori dovrebbe filtrarsi per tipo.
8. **Performance filtro**: ILIKE su `attributes->>'x'` senza indici; per volumi servono indici GIN/trigram.
9. **Test**: nessun test automatico su `buildFilter` (sicurezza/iniezione, operatori).

## 5. PROPOSTA dei prossimi passi (da valutare insieme)
Ordinati per priorità che suggerisco; ognuno con motivazione, effort indicativo, rischio.

### P1 — Design-system: dimensioni font/pulsanti coerenti (BLOCCANTE per l'estetica)
- **Perché**: l'utente l'ha segnalato più volte; le maschere "sembrano piccole con font grossi". È un problema globale (`.btn`, scale tipografiche, `--ctrl-h`, paddings).
- **Cosa**: rivedere i design tokens (scala tipografica, altezze controlli, font dei bottoni), uniformare `.btn/.btn-sm`, verificare densità. Probabilmente di competenza **Claude AI** (design), Claude Code applica.
- **Effort**: medio · **Rischio**: medio (tocca tutte le viste) → fare con screenshot di confronto.

### P2 — "Saved Views" complete (filtro + colonne + ordinamento, per-utente, con nome)
- **Perché**: è il "Salva" del mockup; combinato con export+filtro è la feature che supera i leader di mercato (l'utente lo vuole esplicitamente). Già esistono filter_preset/export_preset/colonne.
- **Cosa**: un'unica entità "vista salvata" (nome + filtro + colonne/ordine + vista corrente) per-utente (e opz. condivisa col tenant); chip "viste" che include le viste salvate dall'utente accanto a quelle di sistema; applica tutto in un click.
- **Effort**: medio · **Rischio**: basso (riusa i mattoni).

### P3 — Filtro: builder "best-in-class" completo
- **Perché**: l'utente vuole un meccanismo manuale top, oltre all'AI.
- **Cosa**: input valore **per tipo** (select enum con valori reali, date-picker, number); operatori filtrati per tipo; **between**/intervalli; **gruppi annidati** (parentesi, AND/OR misti); copertura **enum mappati su valore display↔raw**; conteggi viste che rispettano il filtro; indici DB per performance.
- **Effort**: alto · **Rischio**: medio.

### P4 — Migrare le liste legacy a EntityList v3 (Foglio ore, Assenze, Magazzino)
- **Perché**: coerenza totale (selezione/export/filtro/colonne ovunque). Sono le ultime maschere "vecchie".
- **Cosa**: riscrivere su EntityList + ObjectPage; per il Magazzino valutare se le sotto-liste (movimenti/documenti) diventano EntityList annidate.
- **Effort**: medio-alto · **Rischio**: medio (Magazzino ha logiche di stato).

### P5 — Export dinamico dai field_definition (campi custom del tenant)
- **Perché**: i tenant aggiungono campi (Field Builder) → l'export deve includerli senza codice.
- **Cosa**: EntityList costruisce `exportFields` unendo i campi base + i `field_definition` dell'entità (label localizzata) leggendo `row.attributes`.
- **Effort**: medio · **Rischio**: basso.

### P6 — "Azioni AI" sulla selezione (oltre al filtro)
- **Perché**: visione AI-first; l'utente aveva proposto categorizza/deduplica/arricchisci/riassumi.
- **Cosa**: menu azioni AI sulle righe selezionate → endpoint che propone operazioni (diff) → review → apply deterministico (riusa il pattern CaptureBarAI). Partire da 1 azione (es. **deduplica Soggetti** o **arricchisci anagrafica**).
- **Effort**: alto · **Rischio**: medio (qualità/quota AI).

### P7 — Igiene/qualità
- Rigenerare `schema_db_completo.md` (post 034/035); test `buildFilter`; indici GIN/trigram; accessibilità dialoghi; i18n delle label dati (se serve multilingua a breve).

## 6. Cosa chiedo a Claude AI
1. Validare/riprioritizzare P1→P7 (e l'estetica P1: linee guida tipografiche/pulsanti).
2. Definire lo standard "Saved View" (P2): cosa salvare, condivisione tenant sì/no, UI nelle viste.
3. Definire lo standard del **builder filtro** (P3): set operatori per tipo, gruppi annidati, gestione enum display↔raw, comportamento conteggi.
4. Indicare quali entità prioritizzare per le "Azioni AI" (P6).
Poi scriviamo insieme il **piano operativo** (un doc `docs/analisi/<data>_PIANO_prossimi_lavori.md`) che le sessioni Claude Code eseguiranno a blocchi, con DONE_*.md per ciascuno.

## 7. Riferimenti
- Handoff operativo: `docs/analisi/2026-06-18_HANDOFF_nuova_sessione.md`
- Standard: `docs/STD_export_e_colonne.md`, `docs/STD_filtro_ai.md`
- Report blocchi: `docs/DONE_*.md` · Coordinamento: `JOURNAL.md` · Schema: `docs/analisi/2026-06-18_schema_db_completo.md` (001-035)
- Repo: `github.com/sivaf-ai/siSuite` (main). Migrazioni 001-035, prossima 036.
