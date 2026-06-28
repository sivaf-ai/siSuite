# Gestione entità ad ALBERO — caso di riferimento: Categorie articolo (v1)

**Data:** 28/06/2026 · **Chat:** 01.06 · **Scopo:** documentare in dettaglio TUTTO ciò che è stato realizzato per la prima gestione gerarchica (Categorie articolo), come base per un'analisi con Claude AI volta a definire lo **standard delle entità ad albero** in siSuite. Niente è dato per scontato: modello dati, backend, frontend, regole, decisioni di design, limiti attuali e idee per il futuro.

> Entità ad albero già presenti nel prodotto: **Categorie articolo** (`material_category`) e **Siti/Località** (`site`, componente `SiteTree`). Questo documento descrive le Categorie (la più completa) e annota le differenze con SiteTree.

---

## 1. Modello dati (`material_category`)

Tabella creata in migr. **042** (+ `icon` in 051, unicità in 053). PostgreSQL 16.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `tenant_id` | uuid | multi-tenant, RLS |
| `parent_id` | uuid → `material_category(id)` | **self-FK** (gerarchia); `NULL` = categoria radice |
| `name` | text NOT NULL | nome categoria |
| `color` | text | colore esadecimale opzionale (badge/icona) |
| `icon` | text | nome icona (kebab curato o lucide PascalCase) — migr. 051 |
| `active` | bool DEFAULT true | disattivabile senza eliminare |
| `created_at/updated_at/created_by/updated_by` | | audit |
| `archived_at` | timestamptz | **soft-delete** |

**Vincoli e indici**
- `CHECK material_category_no_self_parent`: `parent_id IS NULL OR parent_id <> id` → un nodo non può essere padre di sé stesso (anti-ciclo di primo grado).
- FK `parent_id` → `material_category(id)` (NO ACTION): non si può puntare a un padre inesistente.
- Indici: `material_category_tenant_idx`, `material_category_parent_idx` (navigazione figli).
- **Unicità del nome per livello, archived-aware** (migr. 053):
  - `material_category_root_name_uniq (tenant_id, name) WHERE parent_id IS NULL AND archived_at IS NULL` (radici)
  - `material_category_child_name_uniq (tenant_id, parent_id, name) WHERE parent_id IS NOT NULL AND archived_at IS NULL` (figli)
  → due categorie con lo stesso nome non possono coesistere sotto lo stesso padre; un nome riusato dopo l'archiviazione è ammesso.
- **RLS**: ENABLE+FORCE, policy tenant, GRANT a `sisuite_app`.
- **Relazione con gli articoli**: `material.category_id` → `material_category(id)` (FK), indice `(tenant_id, category_id)`.

---

## 2. Backend (`routes/materialCatalog.ts`)

DTO: `MaterialCategoryDto { id, parentId, name, color, icon, active }`. Permessi: riusa `material:read` (lettura) e `material:update` (scrittura) — non un permesso dedicato.

- **GET `/material-categories`** → ritorna `{ items }` **piatto** (tutte le righe non archiviate, `ORDER BY name`). L'albero è costruito **lato client** dal `parent_id` (vedi §3). Scelta: payload semplice, gerarchia ricomposta nel client.
- **POST `/material-categories`** → crea (parentId opzionale = radice se null). L'unicità per livello è garantita a DB (indici parziali) → 23505 → handler globale 409 leggibile.
- **PATCH `/material-categories/:id`** → update dinamico dei campi presenti (name/parentId/color/icon/active). Consente lo **spostamento** del nodo cambiando `parent_id`.
- **DELETE `/material-categories/:id`** → **soft-delete con controllo d'uso**: conta `material` con quella categoria (non archiviati) + `material_category` figlie (non archiviate); se >0 → **409** «Impossibile eliminare la categoria: è utilizzata in N articoli, M sotto-categorie. Rimuovi prima i collegamenti.»; altrimenti `UPDATE archived_at = now()`.

> NB: il controllo d'uso conta SOLO i diretti referenti (articoli con `category_id` = nodo, e figli diretti). Non c'è un conteggio ricorsivo dell'intero sottoalbero (vedi §7, limiti).

---

## 3. Frontend (`pages/CategoriePage.tsx`)

Vista ad albero dedicata (NON `EntityList`: è una delle eccezioni "specializzate"). Componenti: `ui/Modal` (CRUD), `ui/IconPicker`, `ui/categoryIcons` (`CategoryIcon`), `ui/ConfirmDialog`.

### 3.1 Costruzione e ordinamento dell'albero
- `buildTree(items)`: da lista piatta → nodi con `children[]` via `parent_id`; chi non ha un padre noto diventa **radice** (robusto anche se il padre è filtrato/assente).
- `sortRec`: ordina ricorsivamente i figli per `name` (`localeCompare('it')`).

### 3.2 Rendering ricorsivo + espandi/collassa
- `renderNode(n, depth)`: riga con **indentazione** per livello (`paddingLeft: 8 + depth*22`).
- **Chevron** espandi/collassa per i nodi con figli (stato `open: Set<id>`); nascosto se foglia.
- **Icona** del nodo (colore opzionale) via `CategoryIcon`; **nome**; badge "disattivata" se `!active`.
- Profondità **illimitata** (ricorsione).

### 3.3 Azioni per nodo (hover) — tutte con hint
- **Aggiungi sotto-categoria** (`+`): apre il CRUD "nuovo" con `parentId` preimpostato al nodo.
- **Modifica** (matita): apre il CRUD precompilato.
- **Elimina** (cestino): apre `ConfirmDialog` col nome (vedi §3.5).
- In testata: **Nuova categoria** (radice).

### 3.4 CRUD in Modal centrato (label nel bordo)
Campi: **Nome** (obbligatorio), **Colore** (`<input type=color>`), **Categoria padre** (`<select>` con opzioni indentate per livello), **Icona** (`IconPicker` con ricerca full-lucide).
- **Selezione del padre con esclusione del sottoalbero**: `flatten(roots, 0, editing.id, …)` salta il nodo in modifica **e i suoi discendenti** → impossibile creare un ciclo spostando un nodo sotto un proprio figlio (anti-ciclo lato UI; il CHECK DB copre solo il self-parent diretto).
- Dopo la creazione di un figlio, il padre viene **auto-espanso** (`open.add(parentId)`) così il nuovo nodo è subito visibile.
- Reattività: `useReloadOnEnter` + `reload()` dopo ogni salvataggio.

### 3.5 Eliminazione
`ConfirmDialog` (in-app, mai popup nativo) col **nome**; messaggio: «"X" verrà eliminata. Le eventuali sotto-categorie e gli articoli collegati restano senza categoria.» Il backend però **blocca** se ci sono referenti (controllo d'uso) → in pratica si elimina solo una foglia non usata. *(Incoerenza messaggio↔comportamento: vedi §7.)*

---

## 4. Elenco puntuale delle FUNZIONI implementate
1. Gerarchia padre-figlio a profondità illimitata (`parent_id` self-FK).
2. Costruzione albero client da lista piatta.
3. Ordinamento alfabetico per livello (it).
4. Espandi/collassa per nodo (stato locale).
5. Indentazione visiva per livello.
6. Creazione radice e **sotto-categoria** (parent precompilato).
7. Modifica nodo (nome/colore/icona/padre/attivo).
8. **Spostamento** nodo cambiando il padre (via select).
9. Anti-ciclo: CHECK DB (self) + esclusione sottoalbero nel select padre.
10. Soft-delete con **controllo d'uso** (articoli + figli diretti) → 409 col motivo.
11. Unicità nome **per livello**, archived-aware.
12. Icona per nodo (palette curata + **ricerca full-lucide**) e colore.
13. Flag **attivo/disattivato** (badge).
14. Auto-espansione del padre dopo creazione figlio.
15. Reattività (reload on enter + dopo save), nessun popup nativo, hint sulle azioni.
16. RLS multi-tenant; permessi `material:read/update`.
17. Relazione con gli articoli (`material.category_id`) usata nelle liste/filtri articolo.

---

## 5. Decisioni di design (e perché)
- **Albero ricostruito lato client** da lista piatta: payload semplice, una sola query; ok per cataloghi di categorie (decine/centinaia di nodi). Per migliaia di nodi servirebbe lazy-loading (vedi §7).
- **Soft-delete invece di hard-delete**: coerente con la regola canonica; gli articoli storici mantengono il riferimento; recuperabile.
- **Unicità per livello (non globale)**: "Cavi > Fibra" e "Connettori > Fibra" sono entrambi validi (stesso nome, padri diversi).
- **Anti-ciclo a due livelli**: CHECK DB (self) + UI (esclude i discendenti dal select padre). *Manca* un anti-ciclo server-side completo (vedi §7).
- **Vista dedicata (non EntityList)**: l'albero ha esigenze di navigazione (espandi/collassa, indentazione) che la lista tabellare non copre — è un'eccezione "specializzata" allo standard entità.
- **Icona+colore** per riconoscibilità visiva rapida nel catalogo.

---

## 6. Confronto con l'altro albero (`SiteTree`, Siti/Località)
- Stesso impianto: `parent_id` self-FK, `buildTree` client, render ricorsivo, CRUD inline.
- Differenze: `SiteTree` è **embeddato** in una scheda (sotto il Soggetto, scope `companyId`), più scarno (no icona/colore, no IconPicker), add/del inline senza Modal ricco. Le Categorie sono una **pagina** a sé con CRUD in Modal completo.
- **Conclusione**: i due alberi condividono ~70% della logica ma ognuno ha reimplementato `buildTree`/render. → forte candidato a un **componente albero generico riusabile** (vedi §7).

---

## 7. Limiti attuali e FUNZIONALITÀ DA VALUTARE (materiale per l'analisi con Claude AI)

### 7.1 Limiti/incoerenze note
- **Conteggio d'uso non ricorsivo**: il blocco eliminazione conta solo articoli/figli *diretti*; un sottoalbero profondo con articoli più in basso non è conteggiato a fondo. Da definire la semantica (vedi sotto).
- **Messaggio elimina ↔ comportamento**: il dialog dice "le sotto-categorie restano senza categoria", ma il backend in realtà **blocca** se ci sono figli/articoli. Da allineare.
- **Anti-ciclo server-side incompleto**: spostando il padre via API si potrebbe (teoricamente) creare un ciclo profondo; solo la UI lo previene. Serve un controllo `WITH RECURSIVE` sul PATCH del parent.
- **Nessun ordinamento manuale**: ordine solo alfabetico (manca `sequence`/drag&drop).
- **Due implementazioni di albero** (Categorie + Siti) non condividono un componente.

### 7.2 Funzionalità candidate per lo STANDARD "entità ad albero"
Da discutere/definire con Claude AI quali entrano nello standard:
1. **Componente albero generico riusabile** (`<EntityTree>`): build/render/espandi-collassa/azioni/CRUD parametrizzati per qualunque tabella self-FK (Categorie, Siti, WBS commessa, conti, reparti…).
2. **Spostamento nodi via drag & drop** (oltre al select padre) con **anti-ciclo server-side** (`WITH RECURSIVE`) e ricalcolo.
3. **Ordinamento manuale** (`sequence`) per livello + riordino drag&drop, alternativo all'alfabetico.
4. **Conteggi ricorsivi** per nodo: n. articoli (diretti e dell'intero sottoalbero), badge sul nodo.
5. **Semantica eliminazione/spostamento di un sottoalbero**: opzioni "blocca se usato" / "riassegna figli al nonno" / "sposta articoli alla categoria padre" / "elimina a cascata (con conferma)".
6. **Ricerca/filtro nell'albero** (evidenzia e auto-espande i rami che contengono il match).
7. **Espandi tutto / Collassa tutto**; persistenza dello stato espanso (come `useStickyState`).
8. **Breadcrumb** del percorso (Radice › … › nodo) nella scheda e nei picker.
9. **Picker ad albero** per scegliere una categoria da altre maschere (oggi: `<select>` indentato).
10. **Lazy-loading / virtualizzazione** per alberi molto grandi (migliaia di nodi).
11. **Profondità massima** configurabile (alcuni domini vogliono max N livelli).
12. **Merge/fusione** di due nodi (riassegna articoli e figli) — come il dedup Soggetti.
13. **Drag di articoli** dentro una categoria (assegnazione rapida) dalla lista articoli.
14. **Import/Export** dell'albero (CSV/Excel con percorso) per popolamento massivo.
15. **Colore/icona ereditati** dal padre (default) con override.
16. **Vista alternativa** (tabellare con colonna "percorso") oltre all'albero.
17. **Audit/soft-delete** già canonici: vista archiviati + ripristino anche per i nodi albero (oggi `material_category` ha `archived_at` ma non la UI archiviati).
18. **Conteggio e protezione**: impedire disattivazione/eliminazione di un nodo con sottoalbero attivo, con messaggi ricorsivi chiari.

---

## 8. File coinvolti (riferimento)
- DB: `db/migrations/042_material_complete.sql` (tabella+FK), `051_material_category_icon.sql` (icona), `053_uniqueness_keys.sql` (unicità per livello archived-aware).
- Backend: `packages/backend/src/routes/materialCatalog.ts` (categorie CRUD + delete con controllo d'uso).
- Frontend: `packages/frontend/src/pages/CategoriePage.tsx` (albero+CRUD), `ui/IconPicker.tsx`, `ui/categoryIcons.ts`, `ui/SiteTree.tsx` (albero gemello).
- Shared: `packages/shared/src/entities.ts` (`MaterialCategoryDto`, schemi create/update).
- Memoria: `project_tree_pattern` (pattern albero gerarchico di riferimento).
