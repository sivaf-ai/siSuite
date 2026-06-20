# STATO SVILUPPO per Claude AI — siSuite (20/06/2026)

> **Scopo.** Stato preciso e completo dell'esecuzione del `PIANO_prossimi_lavori_v1_0_01_04.md` (Blocchi 0→6), per decidere insieme come proseguire. Scritto da Claude Code dopo l'esecuzione autonoma del 18/06.
> **Fonti incrociate:** report per-blocco in `docs/DONE_0..6_*.md` · coordinamento in `JOURNAL.md` · schema DB aggiornato in `docs/analisi/2026-06-20_schema_db_completo.md` (001→037).

---

## 0. SINTESI ESECUTIVA + COSE DA SAPERE SUBITO

- **Tutti i 7 blocchi (0→6) sono stati eseguiti.** 5 completi al 100% (0,1,3,4,6); 2 con coda documentata (2: long-tail traduzioni per-pagina; 5: 2 rifiniture). Dettaglio sotto.
- **⚠️ I 7 commit NON sono su GitHub.** Sono sul `main` locale (`main...origin/main [ahead 7]`). L'harness di Claude Code blocca `git push` sul branch di default. **Serve `git push origin main` a mano.** Finché non si pusha, su GitHub o su qualsiasi altra macchina non si vede nulla.
- **Verifiche oggettive (ripetibili):** typecheck `shared`+`backend`+`frontend` puliti; **64 test backend verdi** (8 file vitest); backend health 200; migrazioni applicate **001→037**.
- **Migrazioni nuove:** `036_saved_view.sql`, `037_trgm_indexes.sql` (applicate). Prossima libera: **038**.
- **Decisione di metodo presa in autonomia (la più importante da validare):** il *long-tail* di traduzioni i18n per-pagina (header colonne, label box nelle schede) **non è stato tradotto a freddo** — è materia di terminologia e va fatto con revisione del titolare. Vedi §4 e §6.

### Commit (dal più recente)
```
2299e85 feat(i18n): Blocco 2 - EntityList generico tradotto (namespace list.*)
391dd74 feat: Blocco 5 completamento - multi-sort + between + indici trigram
ae8b373 feat: Blocco 6 - deduplica Soggetti (scan deterministico + merge transazionale)
731540b feat: Blocco 5 (parziale) - igiene filtri (between+test) + viste salvate
56e2952 feat: Blocco 3 - liste legacy (Foglio ore/Assenze/Magazzino) -> EntityList v2
03880a1 feat(i18n): Blocco 2 - propagazione glossario per-tenant + retrofit flagship
213291f feat: Blocchi 0/1/4 del PIANO prossimi lavori
```

---

## 1. STATO DETTAGLIATO PER BLOCCO (requisito → fatto → COME → file → verifica → residuo)

### ⬛ BLOCCO 0 — Verifica stato A→H — ✅ COMPLETO
- **Come.** 5 agenti di esplorazione paralleli sul monorepo (livello codice+DB), confronto coi DoD del Brief. Nessuna modifica al codice.
- **Esito chiave.** Il PIANO era scritto su uno stato superato: molta infrastruttura **già esisteva** (es. `term_override` è la migrazione **007**, NON da creare come "036"; il framework export/preset/filtro c'era già).
- **File.** `docs/DONE_0_verifica.md` (tabella stato corretta per ogni blocco) + correzioni numerazione migrazioni del piano.

### ⬛ BLOCCO 1 — Design system — ✅ COMPLETO (è "vernice")
- **Stato di partenza.** ~85% già fatto: scala tipografica a token (`--fs-h1:22`…`--fs-eyebrow:10.5`), `--ctrl-h` + 3 densità (default Comoda) esistevano.
- **Come/cosa.** Solo token in `packages/frontend/src/theme/design-system.css`: `.btn` font-size `13.5→var(--fs-body)` (13) "testo non più grande del body"; `.btn-sm` `12.5`; icone bottoni vincolate a 16/15px; nuova classe `.btn-secondary` (gerarchia primario/secondario/ghost/danger).
- **Verifica.** Visivamente sottile (è "vernice"). `docs/DONE_1_designsystem.md`.

### ⬛ BLOCCO 2 — i18n + Glossario per-tenant — ✅ NUCLEO COMPLETO · ⚠️ long-tail residuo
- **Il problema centrale del DoD** era: rinomino *Commessa→Progetto* e NON si propaga (menu/liste/schede restano "Commessa"). **Risolto.**
- **Come (meccanismo di propagazione).** Le label *di dominio* ora referenziano le chiavi `terms.*` via **nesting i18next `$t(...)`** dentro i 3 cataloghi (`packages/frontend/src/i18n/{it-IT,en,es-AR}.json`). Es. `nav.engagements: "$t(terms.engagement_plural)"`. `refreshTerminology()` (`i18n/index.ts`) ora: (1) **ripristina i default bundled** per tutti i `terms.*`, (2) applica gli override del tenant, (3) **emette `languageChanged`** per forzare il re-render → i `$t()` si ricalcolano. Provato a runtime: override `engagement_plural`→"Progetti" cambia `nav.engagements` e `navsec.commesse`, mentre `nav.work-orders` resta invariato (nessun effetto collaterale).
- **Glossario.** `TERM_KEYS` 18→**28** (+party/customer/supplier/operator/partner/masterdata/work_order/work_line/site) + nuovo `TERM_GROUPS` (`packages/shared/src/admin.ts`). Aggiunti i termini `work_order`/`work_line`/`masterdata_plural` ai 3 cataloghi.
- **UI Glossario** (`pages/admin/TerminologySettings.tsx`): rifatta con **raggruppamento + pulsante ↺ "Ripristina default" per termine + anteprima live** (riquadro Menu/Titolo lista/Scheda che cambia mentre digiti).
- **Retrofit titoli/scheda flagship.** Collegate a `t('terms.*')` le schermate principali (lista + dettaglio): Soggetti, Commesse, Ordini di lavoro, Articoli, Risorse, Asset, Attività, Lavorazioni.
- **`EntityList` generico tutto i18n** (namespace **`list.*`** nei 3 cataloghi): tooltip toolbar (Modifica/Duplica/Esporta N/Elimina N), Ordina/Colonne/Filtro/Filtro AI, placeholder ricerca, chip viste, barra filtro attivo + "N risultati", stati vuoto, ConfirmDialog eliminazione con pluralizzazione → **ogni lista cambia lingua per intero**.
- **⚠️ RESIDUO (long-tail).** Restano in italiano fisso: **header di colonna** delle tabelle (es. "P.IVA / cod. fiscale", "Giacenza / unità"), alcune **label di box/sezione** nelle schede di dettaglio, **toast/messaggi** specifici, e schermate minori (rapportino, pivot, DDT). ~centinaia di stringhe. **Decisione presa: non tradurle a freddo** (la resa, specie es-AR, è terminologia da rivedere col titolare). Vedi §4.
- **File/verifica.** `docs/DONE_2_i18n_glossario.md`. Demo: Impostazioni › Terminologia → rename; cambio lingua utente.

### ⬛ BLOCCO 3 — Liste legacy → standard v2 — ✅ COMPLETO
- **Come.** 3 agenti paralleli su file disgiunti, ognuno con spec stretta "converti la presentazione a `EntityList`, **preserva la logica esistente**".
- **Foglio ore** (`TimeEntriesPage.tsx`): → `EntityList` (colonne Data/Commessa-fase/Risorsa/Tipologia/Durata h:mm/Tariffa/Stato+lock; viste Tutte/Da approvare/Approvate/Bozze; export). Nuova **`TimeEntryDetailPage.tsx`**. Nuovo endpoint **`GET /time-entries/:id`**. **Barra approvazioni in blocco preservata** (submit/approve/reject/lock/unlock).
- **Assenze** (`AssenzePage.tsx`): Richieste → `EntityList`; Saldi → `EntityList` sola lettura. Nuova **`AbsenceDetailPage.tsx`** (Approva/Elimina). Nuovo **`GET /absences/:id`**. Drawer creazione preservato.
- **Magazzino** (`MagazzinoPage.tsx`): 4 tab (Giacenze/Movimenti/Documenti/Ubicazioni) → `EntityList`. **Conferma documenti + drawer + transizioni di stato draft→confirmed PRESERVATI** (azione "Conferma" resa come colonna custom per non perderla).
- **Backlog segnalato (non introdotto per non alterare la logica):** la DELETE di un'assenza già approvata non ripristina il saldo `used`.
- **File/verifica.** `docs/DONE_3_liste_legacy.md`. Route `/time-entries/:id`, `/absences/:id` in `AppShell.tsx`.

### ⬛ BLOCCO 4 — Export dinamico dai `field_definition` — ✅ COMPLETO
- **Come.** `EntityList` nuova prop **`entity`**: carica `GET /field-definitions?entity=X` e unisce i campi custom del tenant ai campi esportabili (helper `attrExportValue` legge `row.attributes`, label localizzata via `currentLocale`), evitando duplicati con i campi già mappati a mano.
- **Wired** su 6 liste: company, material, asset, work_order, engagement, resource.
- **File/verifica.** `docs/DONE_4_export_dinamico.md`. Demo: aggiungi campo custom su work_order → compare in Esporta + `.xlsx`.

### ⬛ BLOCCO 5 — Filtri + Ordinamento + Viste salvate — ✅ FATTO · ⚠️ 2 rifiniture residue
- **Test `buildFilter`** (`packages/backend/test/filterSql.test.ts`): **19 verdi** — operatori + **sicurezza anti-injection** (i valori finiscono SOLO nei parametri bind `$N`, mai concatenati; verificato con payload `'; DROP TABLE …` e `1 OR 1=1`).
- **Operatore `between` ("tra da–a")** end-to-end: backend (`filterSql.ts`, numerico o testuale per date ISO), due input *da/a* nel pannello (`AiFilterPanel.tsx`), valutazione client (`lib/listFilter.ts`).
- **Multi-sort.** Helper backend **`sortSql.ts` `buildOrderBy`** (multi-campo, whitelisted via `SORTABLE`, direzione vincolata asc/desc, retro-compatibile). **Test `sortSql.test.ts`: 9 verdi** (anti-injection inclusa). Wired su **6 endpoint** (companies, work-orders, materials, engagements, resources, assets; param `?sort=[{field,dir}]`). UI **`SortDialog`** in `EntityList` (mascherina "Ordina" multi-campo con priorità) via props `sortFields`/`onSortChange`, wired su Soggetti/Commesse/Ordini/Articoli.
- **Viste salvate.** Migrazione **`036_saved_view.sql`** (RLS: vedo le mie + condivise `is_shared`, scrivo solo le mie; payload `{filter,sort,columns,exportRef}`). Backend **`routes/savedViews.ts`** (GET/POST/DELETE). UI `EntityList` prop opt-in **`savedViewKey`**: chip "Viste salvate", "+ Salva vista" (PromptDialog), ricarica filtro+colonne, ✕ elimina. Wired su Soggetti e Ordini.
- **Igiene.** Migrazione **`037_trgm_indexes.sql`** (estensione `pg_trgm` + 9 indici GIN trigram per ILIKE veloci). **PII**: verificato che nessun campo PII (intestatario in `work_order_subject`, mascherato) è presente nelle `FILTER_FIELDS` → il filtro non può aggirare il mascheramento (è una whitelist); nessuna modifica necessaria.
- **⚠️ RESIDUO (2 rifiniture).** (1) **QBE "type-aware" pieno**: oggi l'operatore è una *select* (non un *chip* visibile) e gli input del filtro non sono ancora specializzati per tipo (data→date-picker, enum→menu dei valori reali). Funziona, ma non è la versione "a scheda con chip operatore" descritta nel DoD. Serve passare i tipi dei campi (dai `field_definition`) al pannello filtro. (2) **Conteggi delle viste (numeri sui chip) che rispettino il filtro attivo**: oggi riflettono la ricerca testuale ma non il filtro AI/manuale.
- **File/verifica.** `docs/DONE_5_filtri_viste.md`.

### ⬛ BLOCCO 6 — Deduplica Soggetti — ✅ COMPLETO
- **Come.** Pattern propone→review→apply. Backend **`routes/companyDedup.ts`**: `POST /companies/dedup/scan` (proposta **deterministica** per nome normalizzato — lowercase, no diacritici/punteggiatura, no suffissi societari — **nessuna AI**, gate `company:read`) + `POST /companies/merge` (transazionale, gate `company:delete`).
- **L'apply** ri-punta tutte le FK verso `company` dal record assorbito al superstite, gestisce i **conflitti UNIQUE** (`company_role` per ruolo, `work_order` per `principal_order_ref`), poi **archivia** (mai cancella) l'assorbito. **Idempotente.**
- **CORREZIONE allo schema (importante).** Le FK verso `company` sono **11**, non 8 (piano) né 9 (mia verifica Blocco 0): mancavano **`site.company_id`** e **`stock_document.company_id`**. Verificate sul DB live (`\d company` → "Referenced by"). Elenco completo: app_user, asset, company_role, company_contact, engagement, price_list_override, site, stock_document, stock_serial_unit, subcontract_line, work_order.
- **Test DB `companyMerge.test.ts`: 2/2 verdi** (ri-punta senza orfani + idempotenza, con cleanup seed).
- **UI** `ui/DedupDialog.tsx` (scan → scegli superstite/assorbiti per gruppo → fondi) su Soggetti.
- **Decisione presa (da validare).** La **proposta è deterministica, non AI**, per affidabilità (la fusione tocca 11 FK, dev'essere sicura). La proposta **AI-assistita** (riconoscere "Rossi Mario" = "Mario Rossi SRL") è il **fast-follow**, riusa lo stesso flusso review→apply.
- **File/verifica.** `docs/DONE_6_dedup_soggetti.md`. Demo: Soggetti → "Trova doppioni".

---

## 2. METODO DI LAVORO (come ho operato)

- **A blocchi**, ognuno chiuso con verifica reale + report `DONE_<n>.md`.
- **Sub-agenti paralleli** per il lavoro meccanico e indipendente (retrofit i18n per-pagina, conversione liste legacy, backend dedup), ciascuno su **file disgiunti** per evitare conflitti, con spec stretta e obbligo di typecheck.
- **Test prima di fidarsi del codice rischioso:** il merge dei Soggetti (11 FK, transazione) è stato implementato con un **test DB-backed obbligatorio** che doveva passare prima di considerarlo valido; idem i filtri/ordinamento (test unitari su `buildFilter`/`buildOrderBy`, inclusa la sicurezza anti-injection).
- **Additivo e opt-in dove tocca componenti condivisi:** le novità di `EntityList` (export dinamico, viste salvate, multi-sort) sono dietro prop opzionali (`entity`, `savedViewKey`, `sortFields`/`onSortChange`) → le liste che non le passano restano identiche (zero rischio di regressione).
- **Verifica end-to-end:** typecheck FE+BE+shared + suite vitest dopo ogni blocco; backend riavviato quando aggiunte rotte (tsx watch non sempre ricarica).

---

## 3. SCHEMA DB — cosa è cambiato

Rigenerato in **`docs/analisi/2026-06-20_schema_db_completo.md`** (da `pg_dump --schema-only`, 001→037). Delta vs `2026-06-18` (035):
- **+ tabella `saved_view`** (036): viste salvate per-utente (filtro+ordinamento+colonne+export sotto un nome), RLS proprie+condivise.
- **+ estensione `pg_trgm`** e **+ 9 indici GIN trigram** (037): su `company(display_name, attributes->>'city', attributes->>'vat_number')`, `material(name, sku)`, `work_order(code, address)`, `engagement(code, title)`.
- Nessuna modifica distruttiva a tabelle esistenti. Tutte additive.

---

## 4. DECISIONI PRESE IN AUTONOMIA (da validare con Claude AI/titolare)

1. **Long-tail i18n NON tradotto a freddo.** Header colonne e label box per-pagina restano in italiano. *Perché:* sono centinaia di stringhe la cui resa (specie es-AR) è terminologia; tradurle senza revisione produce parole che il titolare vorrebbe comunque ricontrollare, con churn alto. *Alternativa se si vuole:* lo faccio io con scelte mie + glossario di traduzione, poi revisione.
2. **Dedup Soggetti: proposta deterministica, non AI.** *Perché:* l'apply tocca 11 FK e deve essere affidabile/testato; la qualità della *proposta* AI è un layer successivo a basso rischio sullo stesso flusso. *Da decidere:* se/quando aggiungere la proposta AI (serve chiave lato server + quota per tenant, come il pattern catture).
3. **QBE: operatore come select, non chip; input non ancora type-aware.** *Perché:* il valore funzionale (filtrare per tipo/da–a) è già lì; il chip + date-picker/enum-select è rifinitura UX. *Da decidere:* se è prioritaria per la demo.
4. **Magazzino Documenti:** lasciato il flusso draft/confirm esistente (drawer + azione in colonna) invece di portarlo all'archetipo-Documento DetailPage. *Perché:* le transizioni di stato sono server-side e delicate; il refactor è alto-rischio/basso-valore. *Da decidere:* se serve davvero la DetailPage-archetipo.

---

## 5. APERTO / RESIDUO (con stima)

| Voce | Blocco | Stima | Rischio |
|---|---|---|---|
| Long-tail i18n: header colonne + label box per-pagina (3 lingue) | 2 | media (mecc.) | basso, ma serve revisione termini |
| QBE type-aware: input data→date-picker, enum→select valori reali, **chip operatore** | 5.1 | media | basso |
| Conteggi viste (chip) che rispettino il filtro attivo | 5.3 | bassa | basso |
| Proposta dedup **AI-assistita** (oltre alla deterministica) | 6 | media | medio (AI + quota) |
| Magazzino Documenti → DetailPage-archetipo | 3 | media | medio (stati) |
| Assenza approvata: DELETE che ripristina il saldo `used` | 3 | bassa | basso |

Nessuna di queste blocca la demo: il valore-demo dei blocchi è già consegnato.

---

## 6. PROPOSTA SU COME PROCEDERE (da decidere insieme)

**Opzione A — "demo-ready" minimale:** chiudere solo le 2 rifiniture del Blocco 5 (QBE type-aware + conteggi-col-filtro) perché sono le più visibili in demo. ~mezza giornata.

**Opzione B — "completare il PIANO al 100%":** A + long-tail i18n (con un glossario di traduzione che propongo e il titolare valida) + (eventuale) proposta dedup AI. ~1-2 giorni.

**Opzione C — "consolidare e pushare":** prima di tutto, **push su GitHub** (azione del titolare) e giro di test sul PC, poi si decide A o B in base a cosa emerge dai test reali.

**Raccomandazione di Claude Code:** **Opzione C** come passo zero (serve il push e una validazione visiva reale, che io non posso fare senza browser), poi **A** per la demo. La proposta dedup AI e il long-tail i18n li tratterei come iterazione successiva con il titolare presente, perché entrambi richiedono scelte (terminologia / quota AI) che è meglio non prendere a freddo.

---

## 7. COME VERIFICARE A VIDEO (per il giro di test)

http://localhost:5173 · owner@fibra.demo / Demo123! · **Ctrl+F5 per refresh forzato** (Vite HMR).
- **Glossario (B2):** Impostazioni › Terminologia → rinomina Commessa→Progetto (IT, sing+plur) → guarda menu + titolo lista Commesse + scheda. Cambia la tua lingua → menu/liste/chrome cambiano.
- **Liste legacy (B3):** Foglio ore / Assenze / Magazzino → toolbar standard, niente vecchie tabelle; click riga → scheda (Foglio ore/Assenze).
- **Export dinamico (B4):** Impostazioni › Campi personalizzati → aggiungi campo su "work_order" → Ordini di lavoro › Esporta.
- **Filtri/ordinamento/viste (B5):** Soggetti → icona "Ordina" (multi-campo), chip "+ Salva vista"; pannello ✨ → operatore "tra (da–a)".
- **Dedup (B6):** inserisci 2 doppioni → Soggetti › "Trova doppioni".

*Fine stato. Per il dettaglio per-blocco vedere i singoli `docs/DONE_*.md`.*
