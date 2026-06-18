# PIANO PROSSIMI LAVORI — siSuite (per Claude Code)

> **Cos'è questo documento.** Il piano operativo che Claude Code esegue **a blocchi** dopo il completamento della roadmap A→H del `BRIEF_MASTER_Claude_Code_POWERCOM_v2_4`. Non sostituisce il Brief Master: lo **continua**. Chiude i debiti rimasti aperti e introduce le decisioni prese con Sivaf in chat **01.04** (tre lingue da subito, glossario per-tenant, filtro Query by Example, ordinamento multi-campo, salvataggio di filtri/ordini/viste).
> **Lingua:** italiano per UI/testi/commenti, inglese per gli identificatori di codice.
> **Repo:** collocare questo file come `docs/analisi/2026-06-18_PIANO_prossimi_lavori.md`. Migrazioni a partire dalla **036** (stato attuale: 035 applicata).
> **Data:** 18/06/2026 · v1.0 · Chat 01.04.

---

## PARTE 0 — Metodo (vale per ogni blocco)

- **A blocchi, in autonomia.** Ogni blocco chiude con un **test funzionale reale** e un report `DONE_<blocco>.md` che dice: cosa hai fatto, come l'hai verificato, cosa resta aperto, deviazioni e perché.
- **Screenshot obbligatori** nel `DONE_*.md`: schermate nuove/modificate accostate al mock di riferimento. "Compila senza errori" **non basta**.
- **JOURNAL:** annota migrazioni/moduli toccati per evitare collisioni tra sessioni.
- **Restano vincolanti** gli 8 principi non negoziabili e lo standard UI v2 del Brief Master (Lista/Scheda/Documento, header sticky, validazione dentro il campo, numeri a destra/contabili, ID da `number_series`, stati da `lookup_value`, solo design token, RBAC su UI **e** API). Non si re-discutono qui.
- **Chiedi prima di inventare** solo dove questo documento è ambiguo. Dove è chiaro, procedi.

---

## PARTE 1 — Ordine di esecuzione (sintesi)

0. **Verifica** dello stato A→H (mezza giornata, prima di costruire altro).
1. **Design system** — dimensioni tipografia/controlli/pulsanti coerenti (globale).
2. **i18n tre lingue + Glossario per-tenant** — blocco di fondamenta unico.
3. **Liste legacy → standard v2** (Foglio ore, Assenze, Magazzino).
4. **Export dinamico** dai `field_definition` (campi custom del tenant).
5. **Filtri + Ordinamento + Viste salvate** (Query by Example, multi-sort, salva-tutto).
6. **Azione AI: deduplica Soggetti** (una sola azione flagship).

> Igiene/qualità (rigenerazione schema doc, test `buildFilter`, indici GIN/trigram, accessibilità dialoghi) **non è un blocco a sé**: va spalmata dentro i blocchi 2→6 dove pertinente (indicato per blocco).

---

## ⬛ BLOCCO 0 — Verifica dello stato A→H (checkpoint, prima di tutto)

**Perché.** Lo stato dichiara A→H "COMPLETO", ma il DoD del Blocco M impone che **nessuna lista** usi più il pattern vecchio, mentre Foglio ore/Assenze/Magazzino sono ancora su `DataTable`. Quindi "completo" è da correggere. L'errore storico è il "frontend generico": va verificato con gli occhi, non sulla fiducia.

**Cosa fare.** Walkthrough reale (owner@fibra.demo) di ogni schermata A→H accostata al mock corrispondente (44/45/46/47/48/49 + 41/42/43). Per ognuna: screenshot + esito (fedele / divergente / da rifinire).

**DoD.** `DONE_0_verifica.md` con: tabella stato **corretta** (fatto / parziale / aperto) per ogni entità e blocco; screenshot a confronto; elenco puntuale delle divergenze dai mock da correggere nei blocchi successivi. Nessuna modifica al codice in questo blocco: è solo accertamento.

---

## ⬛ BLOCCO 1 — Design system (la "vernice")

**Perché.** Le maschere "sembrano piccole con i font grossi"; pulsanti troppo grandi (anche il testo dentro). È la prima cosa che vede un prospect. Va **prima** delle riscritture di schermate: sistemare i token dopo costringerebbe a ripassare ogni schermata.

**Cosa fare.** Intervento **solo su token e classi globali** in `base.css`, nessuna logica:
- **Scala tipografica** confermata e applicata davvero ovunque: H1 22 · sezione 16 · card 15 · body/cella 13 · header tabella 11.5 sentence-case · eyebrow 10.5 maiuscolo. Verificare che nessuna schermata usi misure ad-hoc.
- **Altezza controlli** `--ctrl-h` e padding coerenti per le tre densità (Compatta/Comoda/Spaziosa); default Comoda.
- **Pulsanti**: unificare `.btn` / `.btn-sm`; **il testo del bottone non deve essere più grande del body**; icone lucide a misura del controllo; gerarchia primario/secondario/ghost.
- Controllo a campione su Lista, Scheda, Documento, dialoghi.

**Igiene inclusa.** Nessuna.

**DoD.** `DONE_1_designsystem.md` con **screenshot prima/dopo** delle stesse 4–5 schermate; nessun colore/misura hardcodato introdotto; densità funzionante; pulsanti coerenti in tutta l'app.

---

## ⬛ BLOCCO 2 — i18n tre lingue + Glossario per-tenant (fondamenta)

**Perché.** Sivaf vuole **it-IT / en / es-AR da subito** (un cliente potrebbe non parlare italiano) **e** poter rinominare i concetti di dominio nel proprio tenant (es. *Commessa→Progetto*) vedendo il cambio ovunque. Le due cose sono **la stessa infrastruttura**: per rinominare o tradurre, ogni scritta deve passare da una chiave, non essere fissa nel codice. Oggi header/label sono **costanti italiane** (debito noto): è qui che si chiude.

**Modello (decisione chiusa).** Due livelli, un'unica risoluzione a runtime:
1. **Catalogo base** i18next in tre lingue (`it-IT`, `en`, `es-AR`) per **tutte** le stringhe UI. Le stringhe generiche (pulsanti, messaggi, titoli) vivono **solo** qui (non sovrascrivibili per tenant).
2. **Namespace `term`** (~30 termini di dominio: *engagement/commessa, company/soggetto, work_order/ordine di lavoro, site/sito, material/articolo, phase/fase, work_line/lavorazione, …*) con default nel catalogo **e** uno strato di **override per-tenant** in DB che vince sul default. Solo i termini del namespace `term` sono sovrascrivibili dal tenant.

**Plurali e lingue.** Ogni termine ha **singolare e plurale** (chiavi i18next `*_one`/`*_other`) **per ogni locale**. L'override per-tenant è **per-locale**: se il tenant personalizza solo l'italiano, en/es-AR restano sul default. (Concordanza articolo/genere = limite noto: scrivere le label in modo da non dipendere dall'articolo dove possibile; non si tenta accordo automatico di genere.)

**Migrazione `036_term_override.sql` (additiva):**
```sql
CREATE TABLE term_override (
  id         uuid PK default gen_random_uuid(),
  tenant_id  uuid NOT NULL → tenant,
  term_key   text NOT NULL,          -- es. 'engagement'
  locale     text NOT NULL,          -- 'it-IT' | 'en' | 'es-AR'
  singular   text NOT NULL,
  plural     text NOT NULL,
  audit…, archived_at
);
-- UNIQUE (tenant_id, term_key, locale)
-- indice (tenant_id)
-- RLS tenant come le altre entità (USING tenant_id = app_current_tenant())
```

**Backend.**
- A inizio sessione/utente, l'i18n layer carica gli override del tenant e li **fonde** nel namespace `term` sopra il default.
- `GET /terms?locale=…` (default + override del tenant) · `PUT /terms/:key` (upsert override del tenant, per locale, singolare+plurale) · `DELETE /terms/:key` (torna al default). RBAC: nuovo permesso **`term:manage`** (Owner/Admin).
- **Le label colonna/header esposte dalle API export devono usare le chiavi**, non costanti, così l'export rispetta lingua e glossario.

**Frontend — Impostazioni › "Terminologia / Glossario":**
- Lista dei ~30 termini, raggruppati; per ciascuno: default (sola lettura) + campi **singolare/plurale** modificabili **per la lingua attiva** (selettore lingua in cima).
- **Anteprima live**: un riquadro che mostra un esempio reale (voce di menu + titolo lista + label nella scheda) che cambia mentre digiti. Esempio: digiti *Progetto/Progetti* e vedi il menu passare da "Commesse" a "Progetti".
- Pulsante "Ripristina default" per singolo termine.

**Retrofit (parte critica del blocco).** Sostituire le **scritte fisse** con chiavi i18n in: menu (già i18n), titoli/sottotitoli liste, header colonne, label di scheda/box, pulsanti, messaggi, dialoghi, e **tutte le schermate già migrate** (Soggetti, Commesse, Ordini di lavoro, Articoli, Listino, Lavorazioni, Rapportino, Pivot, DDT). Le label di campo passano dai `field_definition` (che già hanno label i18n it/en/es-AR): collegarle.

**Igiene inclusa.** Aggiornare `JOURNAL`; nessun PII nei log.

**DoD.**
- Cambio lingua dell'utente → **tutta** l'app cambia (menu, liste, schede, pulsanti, export), non solo il menu.
- In Impostazioni › Terminologia, rinomino *Commessa→Progetto* (sing+plur) in italiano: **menu, titoli lista e label scheda mostrano "Progetto/Progetti" ovunque** (è il bug che oggi non si propaga: deve sparire). en/es-AR restano sui default finché non li personalizzo.
- RLS isola gli override per tenant; "Ripristina default" funziona; nessuna stringa di dominio resta hardcodata nelle schermate elencate.
- `DONE_2_i18n_glossario.md` con screenshot delle 3 lingue su una stessa schermata + screenshot del rename *Commessa→Progetto* propagato su menu **e** scheda.

---

## ⬛ BLOCCO 3 — Liste legacy → standard v2

**Perché.** Foglio ore, Assenze, Magazzino sono le ultime maschere sul pattern vecchio (`DataTable`, niente selezione/export/filtro/colonne standard). Chiude il vero residuo del Blocco M. A valle del Blocco 2, **nascono già tradotte** (chiavi i18n).

**Cosa fare.** Riscrivere su `EntityList` + `ObjectPage` (componenti estratti nel Blocco A), checklist v2:
- **Foglio ore** (`time_entry` + `work_report_time_entry`): lista con viste utili (Mie ore / Per commessa / Da approvare); colonne data, commessa/fase, durata **h:mm**, voce; scheda di dettaglio. **Prioritario** (è nel flusso tecnico/ufficio della demo).
- **Assenze**: lista + scheda standard; viste per tipo/stato.
- **Magazzino** (per ultimo, ha logiche di stato): Giacenze (`stock_balance`), Movimenti (`stock_movement`), Documenti (`stock_document`, archetipo Documento già esistente dal Blocco H), Ubicazioni (`stock_location`). Le sotto-liste come `EntityList` sotto la **sibling tab bar** Articoli·Giacenze·Movimenti·Documenti. **Non rompere** le transizioni di stato esistenti.

**Igiene inclusa.** Verificare stati vuoto/caricamento/errore e responsive a width telefono su queste tre.

**DoD.** Nessuna lista usa più `DataTable`/icone-azione sulle righe; selezione = solo conteggio; click riga → scheda; export/colonne/filtro standard presenti; `DONE_3_liste_legacy.md` con screenshot prima/dopo accostati al mock 41 (e 42 per i documenti di magazzino).

---

## ⬛ BLOCCO 4 — Export dinamico dai `field_definition`

**Perché.** Promessa metadata-driven (principio #2): i campi che il tenant aggiunge col Field Builder devono finire nell'export **senza codice**. Oggi `exportFields` è cablato a mano per pagina.

**Cosa fare.** `EntityList` costruisce l'elenco campi export unendo **colonne base + `field_definition`** dell'entità (label localizzata via Blocco 2, leggendo `row.attributes`). Eliminare gli `exportFields` mantenuti a mano. Il `FieldPicker` (riordino/selezione/preset per-utente, già esistente) lavora sull'elenco così composto.

**Igiene inclusa.** Nessuna.

**DoD.** Aggiungo via Field Builder un campo custom (es. "Note POP", text) su Ordini di lavoro → **compare automaticamente** tra i campi esportabili e nel file `.xlsx`, con label nella lingua corrente; `DONE_4_export_dinamico.md` con screenshot del campo custom presente nell'ExportDialog e nel file generato.

---

## ⬛ BLOCCO 5 — Filtri + Ordinamento + Viste salvate

**Perché.** È il pacchetto che ci fa superare i leader: filtro AI **+** filtro manuale intuitivo (Query by Example) **+** ordinamento multi-campo **+** salvataggio/ricarico di tutto. Riusa i mattoni esistenti (`AiFilterPanel`, `filter_preset` 035, `export_preset` 034, colonne).

### 5.1 — Filtro "Query by Example" (manuale, primario)
Modalità di `EntityList` che mostra **i campi dell'entità come input di filtro**, nel layout della scheda (stesso ordine/raggruppamento dei `field_definition`). **Type-aware**: data→date-picker, enum→select dei valori reali, numero→numerico, testo→testo.
- **Convenzioni (di Sivaf, da implementare):** valore semplice → match sul campo; **"da–a"** → intervallo (numeri/date); **spazio iniziale + testo** → "contiene" dentro il campo; date anche **per anno**.
- **Miglioria approvata (scopribilità):** su ogni campo un **chip operatore visibile** (Uguale · Contiene · Da–a) che fa la stessa cosa della scorciatoia; la scorciatoia da tastiera (spazio iniziale = contiene) resta per i veloci.
- Applicato **lato server** estendendo `filterSql.buildFilter` + `FIELD_MAP` per endpoint. **Coesiste** con il filtro a linguaggio naturale/voce (`AiFilterPanel`): entrambi alimentano lo stesso filtro server-side.
- **Enum display↔raw:** il filtro mostra l'etichetta (es. "Realizzazione") ma confronta il valore raw (`type=build`). **PII resta non filtrabile** (non bypassare il mascheramento). Campi calcolati: filtrabili solo dove il calcolo è economico lato server, altrimenti esclusi (documentare quali).

### 5.2 — Ordinamento multi-campo
- Clic sull'header colonna = ordinamento veloce su **una** colonna (toggle asc/desc): resta.
- **Mascherina "Ordina"**: elenco dei campi, scegli **più campi** e per ciascuno asc/desc, con priorità (es. prima Cliente, poi Data). Applicato lato server (`ORDER BY` multiplo).

### 5.3 — Salva tutto + Viste
**Migrazione `037_saved_view.sql` (additiva):**
```sql
CREATE TABLE saved_view (
  id         uuid PK default gen_random_uuid(),
  tenant_id  uuid NOT NULL → tenant,
  user_id    uuid NOT NULL → app_user,    -- proprietario
  entity     text NOT NULL,               -- 'company' | 'work_order' | …
  name       text NOT NULL,
  payload    jsonb NOT NULL,              -- { filter, sort, columns, export_ref }
  is_shared  boolean NOT NULL default false, -- condivisione col tenant (fase 2)
  audit…, archived_at
);
-- UNIQUE (tenant_id, user_id, entity, name)
-- indici (tenant_id, user_id, entity)
-- RLS: tenant + (user_id = app_current_user() OR is_shared)
```
- Si salva **a pezzi** (solo filtro / solo ordinamento / solo colonne / solo export — tabelle preset esistenti) **e** come **"Vista"** che impacchetta tutto (`saved_view`). Esempio: "Clienti di Napoli" = filtro Napoli + ordina per nome + colonne scelte → un clic e la lista si presenta così.
- I chip **"Viste"** sulla riga del titolo mostrano viste di sistema **+** viste salvate dall'utente. `is_shared` di default **false** (per-utente); condivisione col tenant come evoluzione, non ora.

**Igiene inclusa (qui obbligatoria).**
- **Conteggi delle viste che rispettano il filtro attivo** (oggi non lo fanno).
- Operatore **between** e **date-picker** completati.
- **Test automatici** su `buildFilter` (operatori + sicurezza/iniezione): da fare **prima** di affidarci al filtro in demo.
- **Indici GIN/trigram** su `attributes->>'x'` usati nei filtri per le performance.
- Input del builder manuale **per tipo** (chiude il debito sull'input sempre-testo).

**DoD.** Filtro QBE funzionante con chip operatore + scorciatoia; ordinamento multi-campo; salvo una "Vista" e la ricarico con un clic; conteggi viste coerenti col filtro; test `buildFilter` verdi; `DONE_5_filtri_viste.md` con screenshot di QBE, mascherina Ordina, e una Vista salvata/ricaricata.

---

## ⬛ BLOCCO 6 — Azione AI: deduplica Soggetti (flagship)

**Perché.** Visione AI-first oltre al filtro. Una sola azione, quella di maggior valore e impatto-demo: trovare i **doppioni** nelle anagrafiche (es. "Rossi Mario" e "Mario Rossi SRL") e proporne la fusione.

**Cosa fare (riusa il pattern CaptureBarAI: propone → review → apply deterministico).**
1. Su `EntityList` Soggetti, azione AI sulla selezione (o sull'intero set) → endpoint server-side che propone **candidati di fusione** (diff: chi tiene, chi confluisce, perché). **Chiave AI lato server, quota per tenant/piano, nessun PII nei log.**
2. **Review**: l'utente accetta/modifica/rifiuta ogni proposta.
3. **Apply deterministico (Drizzle, transazione, audit):** sul record superstite ri-puntare **tutte** le FK del record assorbito — `engagement`, `asset`, `work_order.principal_company_id`, `price_list_override`, `stock_serial_unit`, `company_role`, `company_contact`, `app_user` — poi **archiviare** (non cancellare) il record assorbito. **Idempotente.**

> Nota: la fusione tocca molte FK; l'apply deve essere transazionale e testato. L'AI **propone soltanto**, non scrive mai diretta. (Arricchimento anagrafica = fast-follow successivo, non in questo blocco.)

**Igiene inclusa.** Test sull'apply (ri-punta FK senza orfani); audit completo.

**DoD.** Inserisco 2–3 doppioni nel seed → l'azione li propone → confermo → i due diventano uno, le commesse/ordini/seriali del doppione risultano ora sul superstite, il doppione è archiviato; nessun PII nei log; `DONE_6_dedup_soggetti.md` con screenshot di proposta → review → risultato.

---

## PARTE 9 — Definition of Done globale (richiamo)

Per ogni schermata toccata: fedeltà al mock · campi da schema + `field_definition` · **tutte le scritte da chiavi i18n** (niente costanti) · RBAC su UI **e** API · entitlement + `data_scope` · stati vuoto/caricamento/errore · responsive desktop+telefono · densità · numeri a destra/contabili, durata h:mm, orario 24h · ID da `number_series` · stati da `lookup_value` · solo design token · icone lucide + tooltip · **nessun PII/segreto loggato** · **screenshot nel DONE**.

## PARTE 10 — Cosa NON fare

Non lasciare scritte fisse nel codice (rompono lingue e glossario); non far scrivere l'AI diretta nel DB né mettere la chiave AI lato client; non mostrare UUID o PII senza permesso; non costruire il filtro manuale in versione "iper-elaborata" con gruppi annidati a parentesi (**fuori scope, deciso**: bastano QBE + chip operatore + AI); non cancellare fisicamente i Soggetti nella fusione (archiviare); non reintrodurre `DataTable`/icone-azione sulle righe.

---

*Fine piano. Esecuzione a blocchi 0→6, ognuno con `DONE_<blocco>.md` + screenshot. Migrazioni 036 (term_override) e 037 (saved_view); prossima libera 038.*
