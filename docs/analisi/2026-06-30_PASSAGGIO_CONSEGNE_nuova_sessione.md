# PASSAGGIO DI CONSEGNE — siSuite, chat 01.06 → nuova sessione (30/06/2026)

> **LEGGERE PER PRIMO.** Stato completo al termine di una lunga sessione (28→30/06). In fondo: la **checklist di test** e il **testo da incollare** nella nuova chat.

- **Repo:** GitHub `sivaf-ai/siSuite`, branch `main`, **HEAD `d07f844`** — tutto pushato.
- **DB:** PostgreSQL, migrazioni applicate **001→064**, **prossima libera 065**.
- **Stato:** typecheck shared+BE+FE puliti · **90/90 test backend verdi** · app up (frontend 5173, backend 3010, db 5433, GoTrue 9999, MinIO 9100).
- **Login:** owner@sisuite.local / Owner123! (tenant Si.Va.F., **vertical = software**; vedi §"Gotcha vertical").
- **Standard (legge di prodotto):** `docs/STANDARD_siSuite.md` (regole A–H, D-0, **D-0-bis**), `docs/standards/`, `sivaf-standards/`. **Vanno letti e rispettati** (regola in memoria `feedback_standards_are_law`).
- **Backlog vivo:** `docs/BACKLOG_cantiere.md` (tutto il pendente, da tenere aggiornato).

## 1. Come avviare
```
cd c:\Users\Ricardo\Sivaf\siSuite
docker compose up -d
docker compose run --rm migrate     # idempotente, applica fino a 064
```
Dopo aver editato `src` backend → `docker compose restart backend` (tsx watch su bind-mount Windows). Frontend (Vite) ricarica da solo. **Niente deploy.ps1** (è per siERP).

## 2. COSA È STATO FATTO IN QUESTA SESSIONE (per blocchi)

### 2.1 Standard "Entità ad albero" + EntityTree (migr 058)
- Componente UNICO `ui/EntityTree.tsx` + scheda `ui/TreeNodeCard.tsx` per ogni tabella self-FK (adjacency list `parent_id` RESTRICT + `sequence` + anti-ciclo trigger + soft-delete). Pick mode (radio + onPick), drag&drop 3 zone, "Sposta in…", ricerca con `<mark>`, conteggi ricorsivi, vista Albero⇄Tabella, ordine Manuale⇄Alfabetico, eliminazione **a 3 modi** (block/reassign/cascade).
- **Pilota Categorie articolo** + pick mode nella scheda Articolo. Doc: `docs/architecture/STANDARD_entita_albero.md`, ADR 0011/0012/0013, `docs/DONE_tree_standard_01_05.md`.
- Palette C "Ponte" (bordeaux+ciano) recepita in `variables.css`.

### 2.2 Siti e Ubicazioni migrati a EntityTree
- `SiteTree` (scheda Soggetto, scope per cliente) e `UbicazioniTab` (scheda magazzino, `subtreeOf`+`rootParentId`) usano EntityTree. EntityTree esteso: `scopeQuery`, `createDefaults`, `rootParentId`, `showAppearance`, `extraCard`, `rowMeta`, `nodeAppearance`, `nodeActions`. Migr 058 ha corretto **site FK CASCADE→RESTRICT**.
- **Menu Anagrafiche › Siti**: toggle Lista ⇄ **Albero per cliente** (`GlobalSiteTree`).

### 2.3 Tipi configurabili (lookup con ICONA+COLORE) — migr 059, 060
- Tipi di **sito** (`site_kind`) e **ubicazione** (`stock_location_kind`) come `lookup_value` rinominabili in *Stati & etichette*. Aggiunta colonna `icon` ai lookup (migr 060): ogni etichetta ha **icona+colore configurabili**; gli alberi colorano i nodi per Tipo (`EntityTree.nodeAppearance`). Maschera Etichette con **IconPicker**.
- Aggiunte categorie mancanti in Stati & etichette: `work_order_type` (Tipologie ordine), `work_order_status`, `cost_type`, asset_kind, skill_category, ecc.

### 2.4 Campi configurabili PER CONTESTO (geografia + tipo) — migr 061, 062
- `field_definition` ha scope `(entity, country?, vertical?, variant?)`:
  - **Paese** (country): indirizzo IT (5 campi) vs AR (8 campi: calle/numero/piso/depto/localidad/partido/provincia/cpa). Configurabile in *Campi personalizzati* (entità **Indirizzo**, selettore Paese). **Migr 062**: `tenant.country` (default IT) + **selettore Paese in Generale**; nuove anagrafiche ereditano il Paese.
  - **Variante/Tipo** (variant, migr 061): campi diversi per Tipo di record (es. Ordine "Attivazione" vs "Manutenzione"). Selettore **Tipo** in Campi personalizzati (entità work_order/asset). I form Ordinativo/Asset caricano `?variant=<tipo>`. **Validazione "obbligatorio"** anche per i campi-per-tipo (messaggio chiaro al salvataggio).
- Doc proposta: `docs/analisi/2026-06-30_PROPOSTA_campi_configurabili_per_contesto.md`.

### 2.5 Campi di SISTEMA personalizzabili dal tenant (migr 064)
- `field_definition_override`: il tenant cambia **label (it/en/es), obbligatorio, attivo, ordine, segnaposto, aiuto** di un campo di SISTEMA, senza toccarne chiave/tipo/scope e senza eliminarlo. UI: i campi di sistema sono **cliccabili** → "Personalizza campo di sistema" + **"Ripristina default"** + badge "personalizzato".

### 2.6 WMS Magazzino — Fase 1 (migr 063)
- Coordinate su `stock_location` (aisle/rack/level/position). **Generatore massivo** `POST /stock/locations/:id/generate`: prodotto cartesiano dimensioni×range → bin figli con code composto (es. `01-01-A`). Modalità **Piatta** o **Gerarchica** (Scaffale › Ripiano › Posizione, nodi annidati). UI "Genera ubicazioni (scaffalatura)" + "Genera ubicazioni qui" dal menu ⋯ di un nodo.
- Proposta WMS completa (fasi 2-4): `docs/analisi/2026-06-30_PROPOSTA_WMS_ubicazioni_professionali.md`.

### 2.7 Fix UX trasversali
- **Modali in PORTAL** su `document.body` (Modal/TreeNodeCard/ConfirmDialog/PromptDialog) → non si infilano più sotto la barra del titolo.
- **Doppia barra del titolo** eliminata: `Page` con `bleed` non rende la sua IonHeader (ObjectPage ha già la testata).
- **BusyOverlay** (spinner+progress in portal) = STANDARD per operazioni di qualche secondo (niente sfarfallio/refresh intermedi). Usato in bulk delete e generatore.
- **EntityTree selezione multipla + bulk delete** (checkbox per riga, "Seleziona ramo", barra "Elimina selezionate").
- **AddressField** modalità `bare` (campi a griglia, non più ammucchiati).
- Schede CRUD allineate allo standard `.dsx/.bgrid` (Contatti, LabelModal, FieldModal).
- Picker a lente (D-0) al posto dei `<select>`-entità su documenti e flussi tecnico (Ordinativi, Magazzino, Listino, Ore, Rapportino, Cronometro).
- Fix iniziale: `asset_kind`/`skill_category` visibili in Stati & etichette.

## 3. Migrazioni della sessione
| # | Contenuto |
|---|---|
| 058 | tree_standard (material_category/site/stock_location: RESTRICT, sequence, anti-ciclo) |
| 059 | lookup site_kind + stock_location_kind |
| 060 | lookup icon (icona configurabile sulle etichette) |
| 061 | field_definition.variant (campi per Tipo) |
| 062 | tenant.country (Paese del tenant) |
| 063 | stock_location coords (aisle/rack/level/position) — WMS Fase 1 |
| 064 | field_definition_override (campi di sistema personalizzabili) |

## 4. GOTCHA importanti
- **vertical del tenant:** i campi `field_definition` con `vertical='fiber'` (pacchetto POWERCOM: Seriale ONT, Tipo connessione, ecc.) **NON compaiono** sul tenant Sivaf di default (`vertical='software'`). È il filtro di settore, corretto. Per vederli serve un tenant `fiber`. → Backlog: rendere il **vertical selezionabile in Generale** (come il Paese). Se l'utente si lamenta "non vedo i campi ordine", è questo.
- **Campi di SISTEMA:** sola lettura nella struttura; si personalizzano via override (§2.5). Non si eliminano.
- **Ubicazioni icona/colore:** vengono dal **Tipo** (Stati & etichette › Tipi di ubicazione), non per-nodo.
- **Migrazioni:** `docker compose run --rm migrate` (idempotente). Una per gruppo logico. Aggiornare JOURNAL.
- **Push su main:** l'harness a volte blocca; se serve `git push origin main` a mano.
- `scratch-porting/` gestita da altra sessione: NON toccare.

## 5. COSA RESTA (vedi `docs/BACKLOG_cantiere.md`)
1. **WMS Fase 2** — capacità/spazio per ubicazione (volume/peso/UDC/quantità) + % riempimento + avvisi.
2. **vertical del tenant** selezionabile in Generale (per vedere i campi del settore, es. fiber).
3. **WBS commessa ad albero** (specializzazione EntityTree con colonne economiche; mockup `docs/mockup/mockup_WBS_commessa_v1_2_01_06.html`).
4. **Porting dati legacy** (ETL dal vecchio DB).
5. **Hub AI** nuove funzioni.
6. WMS Fasi 3-4 (mappa occupazione, putaway). Picker "Articolo" nei movimenti. Upload immagine categoria MinIO.

## 6. CHECKLIST DI TEST (da fare nella nuova sessione)
**Alberi (EntityTree):**
- [ ] Categorie articolo / Soggetto›Siti / Magazzino›Ubicazioni: crea/sposta (drag o "Sposta in…"), ricerca, vista Tabella, eliminazione a 3 modi.
- [ ] Selezione multipla: spunta righe → "Elimina selezionate" (spinner con avanzamento, niente sfarfallio); menu ⋯ → "Seleziona ramo".
- [ ] Pick: in un Articolo, lente Categoria → stesso albero in selezione + crea-al-volo.

**WMS Fase 1:**
- [ ] Magazzino › Ubicazioni › "Genera ubicazioni (scaffalatura)": struttura Piatta e Gerarchica, anteprima, genera.
- [ ] Menu ⋯ di un nodo → "Genera ubicazioni qui" (genera sotto quel nodo).

**Campi configurabili:**
- [ ] Stati & etichette: Tipi di sito/ubicazione/ordine rinominabili con icona+colore → si riflette negli alberi.
- [ ] Campi personalizzati › Indirizzo › Paese AR: campi argentini. Generale › Paese predefinito.
- [ ] Campi personalizzati › (entità del proprio settore) › selettore Tipo: aggiungi campo per un Tipo → compare solo su quel Tipo nel form; campo obbligatorio → blocca il salvataggio con messaggio.
- [ ] Campo di SISTEMA: clic → "Personalizza" (label/obbligo/attivo) → "personalizzato" → "Ripristina default".

**UX:**
- [ ] Modali/picker non si infilano sotto la barra del titolo; schede "nuovo" con UNA sola barra; AddressField a griglia ordinata.

## 7. TESTO DA INCOLLARE NELLA NUOVA SESSIONE
> Riprendo **siSuite** (chat 01.06). Leggi PER PRIMO `docs/analisi/2026-06-30_PASSAGGIO_CONSEGNE_nuova_sessione.md`, poi `docs/STANDARD_siSuite.md` + `docs/standards/` + `sivaf-standards/` (sono LEGGE: rispettali e aggiornali se qualcosa cambia) e `docs/BACKLOG_cantiere.md` (pendente). Stato: repo `sivaf-ai/siSuite` branch `main` HEAD `d07f844`, migrazioni 001→064 (prossima libera **065**), 90/90 test BE verdi, app up (5173/3010, login owner@sisuite.local/Owner123!, tenant vertical=software). Regole operative: **autonomia totale** (decidi e procedi, niente conferme inutili), usa **BusyOverlay** per ogni operazione che dura qualche secondo, aggiorna **JOURNAL.md** e **BACKLOG_cantiere.md** e la memoria a fine, **commit+push a fine unità**, apri e chiudi ogni risposta col timestamp `🕐 AAAA-MM-GG HH:MM:SS (giorno)`. Ho da darti gli esiti dei test della §6 del passaggio di consegne — correggi ciò che è KO. Poi proseguiamo dal backlog: il prossimo è (a) rendere il **vertical del tenant selezionabile in Generale** (così vedo i campi del settore fiber) e (b) **WMS Fase 2 (capacità/spazio per ubicazione)**. Gotcha da ricordare: i campi `vertical='fiber'` non si vedono col tenant `software` (filtro settore, vedi §4).
