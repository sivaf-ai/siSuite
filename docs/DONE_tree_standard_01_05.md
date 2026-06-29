# DONE — Standard "Entità ad albero (EntityTree)" + migrazione 058

- **Chat:** 01.06 (esecuzione) · **Spec:** Claude AI 01.05 (`sivaf-standards/tree/`) · **Data:** 29/06/2026
- **Esito:** caso pilota **Categorie articolo** completo end-to-end + componente generico `EntityTree` + pick mode. Migrazione 058 applicata. **86/86 test backend verdi** (era 79; +7 nuovi su albero). Typecheck shared+BE+FE puliti.

---

## Cosa è stato fatto, per blocco

### BLOCCO A — Migrazione 058 (`db/migrations/058_tree_standard.sql`)
> Adattata dal `V058__tree_standard.sql` fornito: **niente `BEGIN/COMMIT`** (il runner siSuite avvolge già ogni migrazione in transazione — a differenza di Flyway), formato nome `058_*.sql`, footer di tracciamento `sisuite_migrations`.
- **material_category:** +`description`, +`image_url`, +`sequence` (def 0), +`is_system`; FK `parent_id` resa **`ON DELETE RESTRICT`** esplicita; **trigger anti-ciclo** `material_category_no_cycle`; indice fratelli `(tenant_id, parent_id, sequence)`. Unicità per livello archived-aware: già presenti (non ammette righe di sistema → niente COALESCE §2.4).
- **site:** FK `parent_id` **`ON DELETE CASCADE` → `RESTRICT`** (correzione critica regola A); +`sequence`; trigger `site_no_cycle`; indice fratelli. *Nota:* il `purge` dei siti era già scritto aspettandosi RESTRICT (commento nel codice) → la 058 allinea DB e intento, nessuna regressione.
- **stock_location:** +`sequence` + indice fratelli (anti-ciclo `stock_location_no_cycle` già presente).
- **Verificato a DB:** entrambe le FK self `confdeltype = r` (RESTRICT); 3 trigger anti-ciclo attivi; 4 colonne nuove su material_category.

### Palette C "Ponte" (ADR-0013) — `packages/frontend/src/theme/variables.css`
- `--brand` viola → **bordeaux `#801E1D`** (azione), `--flow` ciano `#1FC8C2` + nuovo `--flow-ink` (AI/dati), `--danger` → **corallo `#E8552D`**, `--brand-press/wash/ink`, gradiente, `--shadow-pop`, mappature Ionic (`--ion-color-primary-rgb` ecc.). Variante **dark** derivata (bordeaux schiarito) per coerenza tema scuro.
- ⚠️ **Cambio visivo globale**: l'identità colore dell'INTERA app passa da viola a bordeaux. Da validare a video su più maschere.

### BLOCCO B — Shared + Backend
- **`packages/shared/src/entities.ts`:** nuovo `TreeNodeDto` (contratto comune a tutte le tabelle self-FK), `MaterialCategoryDto = TreeNodeDto`, schema create/update estesi (`description`, `imageUrl`, `sequence`), `moveTreeNodeSchema`, `treeDeleteMode`.
- **`packages/backend/src/routes/materialCatalog.ts`:**
  - `GET /material-categories` — lista **piatta**, `ORDER BY sequence, name`, `direct_count` per nodo (articoli non archiviati), `?includeArchived=true`.
  - `POST` — `parentId` null = radice; **sequence in coda** ai fratelli; **ritorna il NodeDto** (serve al pick §6.10); blocco `is_system`.
  - `PATCH` — update dinamico incl. `parentId` (spostamento → anti-ciclo a DB), `sequence`, `description`, `image_url`; blocco `is_system`.
  - `DELETE ?mode=block|reassign|cascade` — **in transazione**, conteggi **ricorsivi** (CTE): `block` (409 con conteggi se figli/articoli, altrimenti archivia), `reassign` (figli al nonno + articoli al genitore, archivia solo il nodo), `cascade` (archivia nodo+discendenti, articoli del ramo → `category_id NULL`).
  - `POST /:id/duplicate` (regole C/D: no `is_system`, suffisso «(copia)» se serve) · `POST /:id/restore`.
- **`packages/backend/src/index.ts`:** error handler globale **`P0001` (anti-ciclo trigger) → 409** leggibile (utile a tutti gli alberi). 23503/23505 già gestiti.

### BLOCCO C — Componente generico `EntityTree` (`packages/frontend/src/ui/EntityTree.tsx`)
UN solo componente config-driven (ADR-0012). Implementa §6: clic-riga → scheda CRUD; chevron espandi/comprimi (+ Espandi/Comprimi tutto, stato per-utente via `useStickyState`); **una sola** riga di inserimento rapido in cima (radice); **drag&drop a 3 zone** (sopra=fratello prima / centro=figlio / sotto=fratello dopo) con esclusione del sottoalbero; **"Sposta in…"** (selettore che esclude il sottoalbero, primario su mobile); **ricerca** con `<mark>`, auto-espansione antenati, potatura, contatore, x; **conteggi ricorsivi** (diretti · sottoalbero, sommati client-side); toggle **Albero⇄Tabella** (colonna Percorso) e **Manuale⇄Alfabetico**; toggle **Mostra archiviati** + Ripristina; menu ⋯ (Modifica/Aggiungi sotto-voce/Duplica/Sposta in…/Elimina). **Pick mode** (§6.10): checkbox→radio + `onPick(node)`, filtra inattivi, toolbar e creazione al volo intatte.

### BLOCCO D — Scheda CRUD nodo (`packages/frontend/src/ui/TreeNodeCard.tsx`)
Overlay centrato, **barra azioni FISSA in alto** (Annulla sx · Salva dx). Niente titolo/sottotitolo; **label nel bordo**; **anteprima icona/colore** accanto al Nome (cartella colorata se solo colore). Linguette **Libreria** (IconPicker ricercabile) / **Immagine** (`image_url`). **Colore**: preset HEX + **＋** popup con **selettore HSL/HEX dentro il popup** (slider H/S/L + campo HEX, niente picker nativo flottante). Chip **«✨ AI»**: dal nome propone icona+colore.
- **Ricerca/AI con traduzione (§6.9.1)** in `categoryIcons.ts`: mappa sinonimi **IT/ES→EN** (`ICON_SYNONYMS`, es. "cavo"→"cable") usata sia dalla ricerca icone sia da `suggestAppearance` (suggerimento deterministico offline).

### BLOCCO E — Pick mode + Articolo
- `CategoryPickerDialog` ora apre **lo stesso `EntityTree`** in `mode:'pick'` dentro un Modal (zero duplicazione). `CategoriePage` ridotta a wrapper su `EntityTree` con config esportata e **riusata** dal picker.
- `MaterialeDetailPage`: campo Categoria con **lente** → picker; mostra il **breadcrumb** completo del nodo scelto; «×» per rimuovere; creazione al volo del ramo senza uscire dall'Articolo.

### BLOCCO F — Definition of Done
- **Test** `packages/backend/test/tree.test.ts` (7, verdi): anti-ciclo (trigger + self-check), unicità per livello su INSERT e UPDATE, riuso nome dopo archiviazione, FK RESTRICT (23503).
- **Smoke HTTP** (manuale, OK): create con auto-sequence, anti-ciclo→409, delete block→409 con conteggi, duplicate→«(copia)», delete reassign→figlio a radice.
- **Suite completa:** 86/86. **Typecheck:** shared+BE+FE = 0 errori.

| Gate DoD (§8) | Stato |
|---|---|
| Integrità (blocco con record nominati) | ✅ (block 409 con conteggi; FK RESTRICT) |
| Unicità (insert+update, riuso dopo archivio) | ✅ (test) |
| Anti-ciclo (DB + UI) | ✅ (trigger + esclusione sottoalbero in dnd/sposta) |
| Reattività (no relogin) | ✅ (reload + bus cache `api/cache.ts`) |
| Pick mode (crea-al-volo + radio + ritorno id) | ✅ |
| Semantica elimina (doppia conferma, cascade con nome, conteggi ricorsivi) | ✅ |
| Componente unico (clic-riga→scheda, una scorciatoia in alto) | ✅ |

---

## Scostamenti dallo STANDARD (motivati)
1. **Migrazione non-Flyway**: siSuite usa runner proprio `NNN_*.sql` con transazione esterna → rimossi `BEGIN/COMMIT` e `V…__`. Contenuto SQL invariato nella sostanza.
2. **Upload immagine su MinIO** nella scheda nodo: per ora il tab "Immagine" accetta un **URL/chiave** (`image_url`); l'upload diretto a MinIO per le categorie richiede un endpoint dedicato (esiste solo per `material_image`). Colonna pronta. → TODO.
3. **Chip AI**: suggerimento **deterministico offline** via mappa sinonimi IT/ES→EN (esplicitamente ammesso dallo standard §6.9.1 "mappa sinonimi … o servizio di traduzione"). Un vero LLM-call è un'aggiunta futura.
4. **Colore**: salvato in **HEX** (coerente con DDL §1.2 e con `CategoryIcon`), non come chiave palette dei lookup. Preset HEX + HSL/HEX nel popup.

## TODO residui
- **Siti** (`site`) e **Ubicazioni magazzino** (`stock_location`): **DB già allineato** dalla 058 (FK RESTRICT, sequence, anti-ciclo). UI ancora su `SitiPage`/`SiteTree`/`MagazzinoPage`: **da migrare a `EntityTree`** creando i rispettivi set di route albero (GET piatto+conteggi, POST/PATCH move, DELETE 3 modi, duplicate) — `site` con scope `companyId`, `stock_location` con radice = magazzino. Il componente è pronto e generico.
- Upload immagine categoria su MinIO (vedi scostamento 2).
- WBS commessa: specializzazione di `EntityTree` con colonne economiche (`SPEC_WBS_commessa`), fuori scope ora.
- Validare a video la **Palette C** su tutte le maschere (cambio colore globale).

## File toccati
- DB: `db/migrations/058_tree_standard.sql`
- shared: `packages/shared/src/entities.ts`
- backend: `packages/backend/src/routes/materialCatalog.ts`, `packages/backend/src/index.ts`, `packages/backend/test/tree.test.ts`
- frontend: `ui/EntityTree.tsx` (nuovo), `ui/TreeNodeCard.tsx` (nuovo), `ui/categoryIcons.ts`, `ui/ConfirmDialog.tsx`, `ui/CategoryPickerDialog.tsx`, `pages/CategoriePage.tsx`, `pages/MaterialeDetailPage.tsx`, `theme/variables.css`
- docs: `docs/architecture/STANDARD_entita_albero.md`, `docs/adr/ADR-0011/0012/0013-*.md`, questo report

> ADR rinumerati 0011/0012/0013 (i numeri 0001-0003 erano già usati nel repo; i doc indicavano numerazione provvisoria da allineare).
