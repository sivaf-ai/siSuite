# PASSAGGIO DI CONSEGNE — siSuite, chat 01.06 → nuova sessione (28/06/2026)

> **LEGGERE PER PRIMO.** Questo documento consegna lo stato completo alla nuova sessione: cosa è stato fatto, le decisioni prese e perché, lo schema DB aggiornato, cosa resta, come riprendere, e la checklist di test che il titolare sta eseguendo (i cui esiti arriveranno nella nuova sessione).

- **Repo:** GitHub `sivaf-ai/siSuite`, branch `main`, **HEAD `3b068db`** — tutto pushato.
- **DB:** PostgreSQL, migrazioni applicate **001→057**, **prossima libera 058**. Schema completo: `docs/analisi/2026-06-28_schema_db_completo.md` (76 tabelle).
- **Stato:** typecheck shared+BE+FE puliti · **79/79 test backend verdi** · app up (frontend 5173, backend 3010, db 5433, GoTrue 9999, MinIO 9100).
- **Login:** owner@sisuite.local / Owner123!
- **Standard di prodotto (fonte di verità tassativa):** `docs/STANDARD_siSuite.md` (regole A–H, U, D-0…). Da far rispettare a OGNI sessione.
- **Documenti tematici prodotti:** `GESTIONE_soft_delete_v1.md`, `GESTIONE_ALBERO_categorie_v1.md`, `AUDIT_conformita_DB.md`, `AUDIT_conformita_UI.md`, `ADR-0010-integrita-referenziale-canonica.md`.

---

## 1. Come avviare
```
cd c:\Users\Ricardo\Sivaf\siSuite
docker compose up -d
docker compose run --rm migrate     # idempotente, applica fino a 057
```
Se il backend non riflette modifiche `src`: `docker compose restart backend`. Frontend (Vite) ricarica da solo; in caso `docker compose restart frontend`. **Niente deploy.ps1** (è per siERP, non per siSuite).

---

## 2. COSA È STATO FATTO IN QUESTA SESSIONE (con le decisioni e il perché)

La sessione 01.06 (28/06) ha eseguito l'**audit totale** + una lunga serie di rifiniture su integrità, UX e standard. In ordine:

### 2.1 Audit totale + bonifica integrità referenziale (migr 052→054)
- **Matrici di conformità** su 74 tabelle (`AUDIT_conformita_DB.md`) e su ogni schermata (`AUDIT_conformita_UI.md`).
- **052 — `unit` testo → FK `unit_id` uuid → `unit_of_measure(id)` ON DELETE RESTRICT** (11 colonne), DROP del testo. *Decisione:* contratto DTO invariato — il backend deriva il codice via join in lettura e risolve codice→id in scrittura (`app_resolve_unit`), così il frontend `UnitSelect` non è cambiato. Vista `job_cost_ledger` ricreata.
- **053 — unicità incl. righe di SISTEMA** (UM/IVA: indici parziali `WHERE tenant_id IS NULL`) + chiavi naturali mancanti (material_category, template, resource.code, app_user.code, numeri documento).
- **054 — unicità ESCLUDE gli archiviati** (`WHERE archived_at IS NULL`): un record soft-deleted non blocca la ricreazione della stessa chiave (bug «Prova»). Eccezione: `stock_serial_unit.serial` (identità fisica).
- **Soft-delete con controllo d'uso** (`context/usageGuard.ts`) su material/company/resource/site/asset → 409 col nome e le entità referenzianti.
- **Handler errori** 23503/23505 nominano entità/valore.
- *Decisione documentata:* le colonne `category` testo che sono **tassonomie/metadati** (lookup_value/canonical_state/field_definition/skill/price_list_item) restano testo; quelle che sono cataloghi diventano FK.

### 2.2 Soft-delete GESTITO completo (migr 055, 056) — A+B+C
Scelta del titolare: pacchetto completo.
- **055:** `archived_by uuid` su tutte le tabelle archiviabili + tabella **`audit_log`** (chi/quando/azione, RLS).
- **A · Vista archiviati:** lista `?archived=1`. **B · Tracciabilità:** archived_by + audit_log + endpoint `GET /audit?entity=&entityId=` (storico). **C · Eliminazione definitiva:** `DELETE /:id/purge` (hard, solo se archiviato, protetto da FK RESTRICT → 409 se ancora referenziato). + `POST /:id/restore`.
- **UI:** `EntityList` con toggle "Mostra archiviati", azioni Ripristina/Storico/Elimina-definitiva (nel **menu ⋮**), badge "Archiviato", `ui/AuditDialog` (timeline). Conferma cancellazione UNICA; messaggio standard senza "irreversibile" (l'irreversibile è solo sul purge).
- **Entità abilitate (11):** material, company, resource, site, asset, engagement, work_order, stock_location, **unit_of_measure, tax_rate, skill** (056 ha aggiunto archived_at/by ai 3 cataloghi; righe di sistema UM/IVA non archiviabili).
- **Escluse (con motivo, vedi `GESTIONE_soft_delete_v1.md`):** documenti (PO/pick/stock_document) e seriali = ciclo per STATO non per archivio; categorie = albero (standard albero futuro); template/saved_report = config/preset interni.
- *Decisione UX:* il toggle "Mostra archiviati" è **effimero** (`useArchivedView`, si azzera rientrando nella maschera) — su richiesta del titolare, rientrando in una lista si torna agli attivi.

### 2.3 Fix UX e standard (frontend)
- **Testata liste A FILO (sticky, niente buco):** header+toolbar fissi, scrollano solo le righe; centrale in `EntityList`/`Page` (layout flush). Regola L-3/L-3-bis.
- **Hint su OGNI icona** (tooltip desktop + etichetta su mobile): regola U-1. Bug: i `data-tip` non avevano CSS.
- **Menu overflow (⋮):** le azioni secondarie (soft-delete, esporta, storico) raccolte sotto i tre puntini, in toolbar restano le 2-3 principali. Regola L-7. Stesso metodo per il mobile.
- **Hub AI (una sola stella):** l'unica icona AI apre un popup con le funzioni AI (Filtro intelligente + extra, es. "Trova doppioni"). Soggetti non ha più la doppia stella. Regola G-4-bis.
- **Codice articolo editabile:** `material.code` (default number_series) ora sovrascrivibile (scelta del titolare dopo analisi leader ERP — Odoo Internal Reference / Dynamics No.).
- **Date in console:** campi DATE backend → `yyyy-MM-dd` (no più ISO completo rifiutato dagli input date).
- **Fix vari:** doppia conferma cancellazione (UM/IVA) → unica; AuditDialog leggeva male `{items}`; stato vista persistito/ripristinato.

### 2.4 Documenti & liste portate allo standard
- Picker (riuso lista vera) su PO-Ricevi, Ordinativo, Asset, Template; rebuild AttivitaDetailPage su ObjectPage; CommessaDetailPage sub-CRUD in ui/Modal; /agenda placeholder rimosso; toolbar filtri liste-documenti.
- **Competenze (skill):** da sola-lettura a **anagrafica completa** (EntityList + "+ Nuova" + CRUD + soft-delete).

### 2.5 Cataloghi gestiti per le classificazioni + picker a lente (migr 057) — REGOLA D-0
*Decisione (con il titolare): mai testo libero/combo per campi di riferimento o classificazione.*
- **057:** lookup_value configurabili **`asset_kind`** (Tipo asset) e **`skill_category`** (Categoria competenza), gestibili in *Impostazioni › Stati & etichette*.
- **Asset.Tipo** e **Competenze.Categoria**: da testo libero → **select da lookup**.
- **SITI promossi ad anagrafica:** voce di menu *Anagrafiche › Siti/Località* + `pages/SitiPage` (EntityList + CRUD inline in Modal + soft-delete) + `ui/SitePickerDialog`. Backend `GET /sites` con `companyName` + `?q`/`?sort` + `GET /sites/:id`. L'albero `SiteTree` dentro il Soggetto resta.
- **Picker a LENTE** sui campi che referenziano un'entità con lista: Materiale.UM → `UnitPickerDialog` (UnitsPage pick), Materiale.Categoria → `CategoryPickerDialog` (CategoriePage albero pick), Asset.Sito → SitePicker. Tolti i combo.
- **Regola D-0** in `STANDARD_siSuite.md`: FK a entità con lista → picker a lente; classificazione → lookup_value (select). Mai input testo.

---

## 3. Migrazioni della sessione (riferimento)
| # | File | Contenuto |
|---|---|---|
| 052 | unit_fk_conversion | unit text → unit_id FK RESTRICT (11 col) + helper app_resolve_unit + vista ricreata |
| 053 | uniqueness_keys | unicità incl. sistema + chiavi naturali |
| 054 | unique_exclude_archived | unique parziali WHERE archived_at IS NULL |
| 055 | archive_audit | archived_by + tabella audit_log |
| 056 | softdelete_catalogs | archived_at/by su unit_of_measure, tax_rate, skill |
| 057 | lookup_asset_skill | lookup_value asset_kind + skill_category (+ canonical_state) |

---

## 4. COSA RESTA DA FARE (residui aperti)
1. **Categorie articolo (albero) — soft-delete e picker già parziali:** la gestione ad albero è il candidato per uno **standard "entità ad albero"** (vedi `GESTIONE_ALBERO_categorie_v1.md`, 18 funzionalità proposte: componente `<EntityTree>` generico, drag&drop+anti-ciclo server, ordinamento manuale, conteggi ricorsivi, ricerca nell'albero, breadcrumb, lazy-load, merge, import/export…). Da analizzare con Claude AI e decidere quali entrano nello standard.
2. **Soft-delete non esteso a:** documenti (gestione per stato), seriali (per stato), template/saved_report (config). Valutare se servono viste archiviati anche lì.
3. **Picker mancanti residui** (alcune scelte ancora `<select>` dove la lista non ha pick mode): es. PickList→risorsa/commessa/WO, OrdinativoDetail→commessa/squadra, UserDetail→risorsa, LavorazioniPage→commessa, Categoria-padre nei siti. Estendere `pickProps` a quelle liste + dialog.
4. **Toolbar filtri/ordina** server-side sulle liste documenti magazzino (alcuni endpoint hanno ORDER BY fisso).
5. **Hub AI:** per ora contiene Filtro intelligente (+ dedup su Soggetti). Aggiungere le nuove funzioni AI man mano (è il contenitore generico, via `aiActions`).
6. **Tab `.tabs` di CommessaDetail** non convertita a RelatedTabs (scelta documentata: contenuto ricco albero/Gantt).
7. **Asset.kind dati demo:** alcuni vecchi codici (pv_plant, pool, software_system) non sono nel catalogo `asset_kind` seedato; appaiono come valore grezzo (fallback). Se si vuole, mappare i codici dei pack demo o aggiungerli al catalogo.
8. **Esiti dei test del titolare** (sezione 6) — da raccogliere e correggere nella nuova sessione.

---

## 5. GOTCHA (importante)
- **tsx watch su Windows bind-mount:** dopo aver editato `src` backend → `docker compose restart backend`.
- **Migrazioni:** `docker compose run --rm migrate` (idempotente). Una per gruppo logico. Aggiornare JOURNAL.
- **DB role:** `sisuite_admin` (superuser+bypassrls) per le migrazioni; il backend gira come `sisuite_app` (NOBYPASSRLS) con `SET LOCAL` per tenant.
- **lookup_value nuovi:** richiedono righe `canonical_state` (FK `(category,canonical)`). Pattern in 057.
- **Soft-delete:** archive bloccato se referenziato (usageGuard, solo sulle anagrafiche con `*_REFS`); purge protetto da FK RESTRICT; unicità esclude archiviati; toggle archiviati effimero (`useArchivedView`).
- **Picker vs select:** FK a entità → picker (`PickerField`+`*PickerDialog`); enum/lookup → select. MAI testo libero per riferimenti/classificazioni (D-0).
- **Hint:** ogni icona-azione DEVE avere `tip`/`title` (U-1).
- **Push su main:** l'harness a volte blocca; se serve `git push origin main` a mano.

---

## 6. CHECKLIST DI TEST (il titolare la sta eseguendo — riferire gli esiti nella nuova sessione)
Spuntare OK/KO per ciascuno:

**Soft-delete (su Articoli/Soggetti/Risorse/Asset/Commesse/Ordini di lavoro/Magazzini/Unità di misura/Aliquote IVA/Competenze):**
- [ ] ⋮ → "Mostra archiviati" mostra gli archiviati; uscendo/rientrando il toggle torna a "Mostra archiviati" e si vedono gli attivi.
- [ ] Elimina (archivia) chiede conferma UNA volta, senza "irreversibile".
- [ ] In archiviati: Ripristina riporta attivo; Storico mostra chi/quando; Elimina definitivamente (irreversibile) funziona e è bloccato se il record è ancora usato.
- [ ] Archiviare un record referenziato è bloccato col messaggio che nomina le entità.

**Cataloghi/classificazioni:**
- [ ] Asset › Tipo = tendina dal catalogo (Impostazioni › Stati & etichette → `asset_kind`); valori demo vecchi visibili come fallback.
- [ ] Competenze › Categoria = tendina dal catalogo `skill_category`.
- [ ] Impostazioni › Stati & etichette: rinominare/aggiungere voci a `asset_kind`/`skill_category` si riflette nelle tendine.

**Picker a lente:**
- [ ] Materiale › Unità di misura = pulsante lente → lista UM (con "+ Nuovo").
- [ ] Materiale › Categoria = pulsante lente → albero categorie (clic nodo).
- [ ] Asset › Sito = pulsante lente → lista Siti del cliente (dopo aver scelto il Cliente).

**Siti anagrafica:**
- [ ] Menu Anagrafiche › Siti/Località: lista con colonna Cliente, CRUD (Cliente via picker), archiviazione.
- [ ] L'albero Siti dentro la scheda Soggetto funziona ancora.

**UX trasversale:**
- [ ] Liste: scrollando, header+toolbar restano fissi (niente righe nel buco in alto).
- [ ] Ogni icona della toolbar mostra l'hint (hover desktop; etichetta su mobile).
- [ ] Menu ⋮ raccoglie le azioni secondarie; toolbar corta.
- [ ] Soggetti: clic sulla stella AI → popup con "Filtro intelligente" e "Trova doppioni" (niente doppia stella).
- [ ] Materiale: campo Codice editabile (default automatico).
- [ ] Nessun errore data in console aprendo documenti/ore/commesse.

---

## 7. TESTO DA INCOLLARE NELLA NUOVA SESSIONE
> Riprendo il lavoro su **siSuite** (chat 01.06). Leggi PER PRIMO `docs/analisi/2026-06-28_PASSAGGIO_CONSEGNE_nuova_sessione.md` e `docs/STANDARD_siSuite.md` (regole tassative da rispettare sempre). Stato: repo `sivaf-ai/siSuite` branch `main` HEAD `3b068db`, migrazioni 001→057 (prossima libera **058**), schema in `docs/analisi/2026-06-28_schema_db_completo.md`, 79/79 test BE verdi, app up (5173/3010, login owner@sisuite.local/Owner123!). In questa nuova sessione: (1) ti passo gli **esiti dei test** della checklist §6 del passaggio di consegne — correggi ciò che è KO; (2) poi proseguiamo coi **residui §4** (in particolare l'analisi dello **standard "entità ad albero"** per le Categorie, doc `GESTIONE_ALBERO_categorie_v1.md`). Regole operative: autonomia totale (decidi e procedi, niente conferme inutili), aggiorna JOURNAL e memoria a fine, commit+push a fine unità, apri e chiudi ogni risposta col timestamp `🕐 AAAA-MM-GG HH:MM:SS (giorno)`.
