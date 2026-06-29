# STANDARD — Entità ad albero (EntityTree) · siSuite

- **Versione:** v1.0 · **Chat:** 01.05 · **Data:** 28/06/2026
- **Stato:** Normativo (binding) · **Destinazione repo:** `docs/architecture/STANDARD_entita_albero.md` (documento *living*)
- **Pubblico:** Claude Code, **generatore di codice interno**, tecnici Si.Va.F.
- **Schema di riferimento:** `2026-06-28_schema_db_completo.md` (migrazioni 001→057, prossima libera **058**)

> **Come leggere.** Le parole **DEVE / NON DEVE / DOVREBBE / PUÒ** sono normative (RFC 2119). Tutto ciò marcato **DEVE** è vincolante per il generatore di codice e per Code: una gestione ad albero che non lo rispetta **non è conforme** e non passa la Definition of Done (§9).

---

## 0. Cos'è un'entità ad albero (in parole semplici, per i tecnici)

È un elenco di voci organizzate come **cartelle e sotto-cartelle**, a profondità libera. Ogni voce ricorda **chi è il suo genitore**; da questi legami il sistema ricostruisce l'albero. Una voce con figli è un **contenitore** (raggruppa/somma); una voce senza figli è una **foglia**.

In siSuite oggi sono alberi: **Categorie articolo** (`material_category`), **Siti/Località** (`site`), **Ubicazioni magazzino** (`stock_location`). Lo stesso standard si applica a: **WBS commessa**, **Piano dei conti**, **Reparti**. Tutte **DEVONO** usare **un solo** componente (`EntityTree`, §6) e **un solo** modello dati (§1).

---

## 1. Modello dati

### 1.1 Principio (ADR-0001)
La **verità** è la **lista di adiacenza**: `parent_id` (self-FK) + `sequence` (ordine tra fratelli). Il **percorso materializzato** (path "A › B › C") **NON DEVE** essere colonna sorgente: si **deriva a runtime** con CTE ricorsiva. Una colonna `path` di cache **PUÒ** essere aggiunta solo se i volumi di lettura lo richiedono, e allora **DEVE** essere ricalcolata in transazione a ogni spostamento (§3).

### 1.2 DDL canonico (template per ogni nuova entità ad albero)
Allineato alle convenzioni reali (uuid `gen_random_uuid()`, `tenant_id`, audit, soft-delete, RLS `FORCE`, `app_current_tenant()`/`app_is_platform_admin()`).

```sql
CREATE TABLE public.<entity> (
    id          uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id   uuid NOT NULL,                 -- system rows globali = NULL (vedi §2.4)
    parent_id   uuid,                          -- NULL = radice
    name        text NOT NULL,
    description text,
    color       text,                          -- esadecimale #RRGGBB opzionale
    icon        text,                          -- nome icona libreria (EN) oppure NULL
    image_url   text,                          -- chiave/URL oggetto MinIO se icona = immagine
    active      boolean DEFAULT true NOT NULL,
    sequence    integer DEFAULT 0 NOT NULL,    -- ordine manuale tra fratelli (convenzione siSuite)
    is_system   boolean DEFAULT false NOT NULL,-- record di sistema: non editabile/eliminabile, duplicabile
    created_at  timestamptz DEFAULT now() NOT NULL,
    updated_at  timestamptz DEFAULT now() NOT NULL,
    created_by  uuid,
    updated_by  uuid,
    archived_at timestamptz,                    -- soft-delete
    archived_by uuid,
    CONSTRAINT <entity>_no_self_parent CHECK ((parent_id IS NULL) OR (parent_id <> id))
);

-- FK gerarchia: MAI testo, sempre uuid; RESTRICT (un genitore con figli non si elimina)
ALTER TABLE ONLY public.<entity>
  ADD CONSTRAINT <entity>_parent_id_fkey FOREIGN KEY (parent_id)
  REFERENCES public.<entity>(id) ON DELETE RESTRICT;

CREATE INDEX <entity>_tenant_idx  ON public.<entity> (tenant_id);
CREATE INDEX <entity>_parent_idx  ON public.<entity> (parent_id);
CREATE INDEX <entity>_sibling_idx ON public.<entity> (tenant_id, parent_id, sequence);

-- Unicità del nome PER LIVELLO, archived-aware
CREATE UNIQUE INDEX <entity>_root_name_uniq  ON public.<entity> (tenant_id, name)
  WHERE parent_id IS NULL  AND archived_at IS NULL;
CREATE UNIQUE INDEX <entity>_child_name_uniq ON public.<entity> (tenant_id, parent_id, name)
  WHERE parent_id IS NOT NULL AND archived_at IS NULL;

-- RLS (pattern siSuite)
ALTER TABLE public.<entity> ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.<entity> FORCE ROW LEVEL SECURITY;
CREATE POLICY <entity>_tenant ON public.<entity>
  USING (public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))
  WITH CHECK (tenant_id = public.app_current_tenant());
```

### 1.3 Stato reale e disallineamenti (→ migrazione 058)
- `material_category`: **manca** `sequence`, `description`, `image_url`, `is_system` e il **trigger anti-ciclo** (§3) → allineare.
- `site`: FK `parent_id` con **`ON DELETE CASCADE`** → **viola** la regola canonica A → portare a **`ON DELETE RESTRICT`**.
- `stock_location`: già conforme su anti-ciclo (`stock_location_no_cycle`) e RESTRICT → allineare `sequence` se assente.

> `058_tree_standard.sql` allinea le tre tabelle e installa il trigger generico (§3). Regola clean-slate: DROP/ricrea, niente shim.

---

## 2. Invarianti e integrità (regole canoniche A–G sull'albero)

- **(A) Integrità.** Riferimenti **uuid FK, mai testo**. `parent_id` = **RESTRICT**: un nodo con figli o referenziato **NON DEVE** essere eliminabile/archiviabile; in blocco un popup **nomina** i record bloccanti (§8).
- **(B) Unicità.** Nome **unico per livello**, a livello **DB**, su INSERT **e** UPDATE, **archived-aware**. `"Cavi › Fibra"` e `"Connettori › Fibra"` entrambi validi.
- **(C) Record di sistema.** `is_system = true` ⇒ non editabile/eliminabile, ma **duplicabile** in record di tenant (la copia non eredita `is_system` né collide).
- **(D) Duplica.** Apre CREATE pre-compilata senza chiavi di sistema; suffisso "(copia)" solo se serve a passare l'unicità.
- **(E) Reattività.** Creare/modificare/spostare/archiviare **DEVE** aggiornare liste, picker, etichette risolte e breadcrumb (bus invalidazione cache). **MAI** relogin.
- **(F) Toolbar completa.** Nessuna toolbar ridotta.
- **(G) Definition of Done.** §9.

### 2.4 System rows e collisione tenant/sistema
Se l'entità ammette righe globali (`tenant_id IS NULL`, `is_system = true`), l'unicità **DEVE** impedire collisioni tra riga di sistema e riga di tenant a pari nome/livello: indici parziali su `COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000')` come scope, oppure vincolo applicativo in transazione. Il generatore usa la variante a indice quando `supportsSystemRows: true`.

---

## 3. Anti-ciclo (obbligatorio su ogni albero)

Spostando un nodo (cambio `parent_id`) si **DEVE** impedire di metterlo sotto una propria discendente.

**DB (autorevole)** — trigger generalizzato dal reale `stock_location_no_cycle`:

```sql
CREATE FUNCTION public.<entity>_no_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (
      WITH RECURSIVE anc AS (
        SELECT NEW.parent_id AS id
        UNION ALL
        SELECT t.parent_id FROM public.<entity> t JOIN anc ON t.id = anc.id
        WHERE t.parent_id IS NOT NULL
      ) SELECT 1 FROM anc WHERE id = NEW.id
    ) THEN
      RAISE EXCEPTION '<entity>: ciclo non ammesso (% non può stare sotto una propria discendente)', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER <entity>_no_cycle_trg
  BEFORE INSERT OR UPDATE OF parent_id ON public.<entity>
  FOR EACH ROW EXECUTE FUNCTION public.<entity>_no_cycle();
```

**UI (preventiva)** — "Sposta in…" e drag&drop **DEVONO** escludere il nodo e i suoi discendenti dai bersagli.

---

## 4. Ordinamento

- **Manuale** (default): per `sequence` tra fratelli; modificabile con drag&drop e "Sposta in…".
- **Alfabetico:** per `name` (`localeCompare`, locale di sistema) come *vista* commutabile; **NON** tocca `sequence`.
- Toggle **Manuale ⇄ Alfabetico** in toolbar; stato **DOVREBBE** persistere per-utente.

---

## 5. Contratto API (REST)

L'albero **DEVE** essere servito **piatto** e ricostruito client-side (`buildTree` dal `parent_id`).

| Metodo | Rotta | Note |
|---|---|---|
| `GET` | `/<entity>` | `{ items: NodeDto[] }` piatto, `ORDER BY sequence, name`. `?includeArchived=true` opzionale. |
| `POST` | `/<entity>` | Crea (`parentId` null = radice). Unicità a DB → `23505` → **409** leggibile. **Ritorna il NodeDto creato** (serve al pick-mode §6.10). |
| `PATCH` | `/<entity>/:id` | Update dinamico dei soli campi presenti. Cambio `parentId` = spostamento (anti-ciclo). |
| `DELETE` | `/<entity>/:id?mode=block\|reassign\|cascade` | Soft-delete §8. Default `block`. |
| `POST` | `/<entity>/:id/duplicate` | Regole (C)/(D). |

```ts
type NodeDto = {
  id: string; parentId: string | null; name: string; description?: string;
  color?: string | null; icon?: string | null; imageUrl?: string | null;
  active: boolean; sequence: number; isSystem: boolean;
  directCount?: number; subtreeCount?: number; // conteggi ricorsivi (§6.7)
};
```
Errori `409` per unicità (messaggio che nomina il conflitto) e cancellazione bloccata (elenco record bloccanti). Permessi: riusano quelli dell'entità ospite (es. `material:read`/`material:update`).

---

## 6. Componente generico `EntityTree` (ADR-0002)

Un **solo** componente per tutti gli alberi, parametrizzato; **NIENTE** reimplementazioni. Riferimento visivo: `standard_entita_albero_v1_4_01_05.html`.

### 6.1 Config
```ts
type EntityTreeConfig = {
  entity: string;                 // "material_category"
  endpoint: string;               // "/material-categories"
  labels: { singular: string; plural: string };
  permissions: { read: string; write: string };
  supportsSystemRows?: boolean;
  maxDepth?: number | null;       // null = profondità libera (default)
  columns?: ColumnDef[];          // colonne extra (es. WBS: Ore/Margine)
  defaultSort?: 'manual' | 'alpha';
  mode?: 'manage' | 'pick';       // §6.10 — default 'manage'
  onPick?: (node: NodeDto) => void; // richiesto se mode='pick'
};
```

### 6.2 Navigazione
Guide d'indentazione; chevron espandi/collassa (nascosto sulle foglie); **Espandi/Comprimi tutto**; stato espansione **DOVREBBE** persistere per-utente; **breadcrumb** del nodo selezionato.

### 6.3 Apertura scheda (vincolante)
**Il clic sulla riga apre direttamente la scheda CRUD** (coerente con le entità *non* ad albero: lista → scheda). Chevron = espansione; checkbox = selezione. **"Modifica"** resta anche nel menu ⋯. **Niente** rinomina inline al clic sul nome.

### 6.4 Creazione
- **`＋` su riga** o **⋯ → Aggiungi sotto-voce** → scheda con `parentId` preimpostato.
- **"Nuova <entità>"** in testata → scheda radice.
- **Una sola** riga di **inserimento rapido in cima** ("nome + Invio") crea alla radice (poi si sposta). **NIENTE** quick-add sotto ogni ramo (rumore su alberi grandi/filtrati — ADR-0002).

### 6.5 Spostamento (entrambi i modi)
- **Desktop:** drag&drop **3 zone** — bordo sopra = fratello prima, bordo sotto = fratello dopo, centro = figlio; linea per i fratelli, bordo evidenziato per "dentro"; auto-espansione al passaggio.
- **Tutte le piattaforme (primario su mobile):** **"Sposta in…"** = selettore che esclude nodo + discendenti.
- **Taglia/Incolla** e **selezione multipla → Sposta in…** ammessi. Ogni spostamento passa per anti-ciclo (§3) e, se presente `path`, ricalcolo in transazione.

### 6.6 Ricerca
Filtro con **evidenziazione** del testo (`<mark>`), **auto-espansione antenati**, **potatura** rami senza match; contatore match; **x** per pulire.

### 6.7 Conteggi ricorsivi
Ogni nodo mostra riferimenti **diretti** e dell'**intero sottoalbero** (es. `14` · `28▾`). Servono anche alla semantica elimina (§8).

### 6.8 Viste
Toggle **Albero ⇄ Tabella** (colonna **Percorso**). Stato **attivo/archiviato** con badge "off" e ripristino; un nodo disattivato resta in gestione ma **NON** compare nei picker dei cataloghi.

### 6.9 Scheda CRUD del nodo (vincoli UI) — vedi `standard_entita_albero_v1_4`
- **Barra azioni in alto, fissa:** **Annulla** sx, **Salva** dx (mai in fondo).
- **Niente titolo/sottotitolo** (il campo Nome basta).
- **Label nel bordo del campo**, righe compatte.
- **Anteprima icona/colore accanto al Nome** in tempo reale; se solo colore → **cartella** colorata.
- **Aspetto:** linguette **Libreria** (griglia icone max 2 righe, ricercabile) / **Immagine** (upload → **MinIO**, `image_url`). **Colore** = preset + **＋** che apre un **popup** con tavolozza estesa **e selettore HSL/HEX dentro il popup** (mai picker nativo fuori contesto).
- **Chip "✨ AI"**: dal nome propone icona+colore, **rispettando la lingua** (§6.9.1).

#### 6.9.1 Ricerca icona e AI con traduzione (vincolante)
Libreria icone in **inglese** (Lucide). Ricerca e AI **DEVONO**: parola nella **lingua configurata** (it/es-AR/en) → **traduzione in inglese** → ricerca. Es.: "cavo" → "cable" → icona `cable`. Implementazione: mappa sinonimi per lingua o servizio di traduzione.

### 6.10 ⭐ Selettore ad albero richiamato da un'altra entità (pick mode) — VINCOLANTE

Quando **un'altra entità** deve **associare** un nodo di una tabella ad albero (es. **Articolo → Categoria merceologica**), la scheda di quell'entità **NON DEVE** usare un `<select>` indentato. **DEVE** invece:

1. Mostrare il campo con una **lente** (icona ricerca). Cliccando la lente si apre **lo stesso identico `EntityTree`** in un **modale** (`mode: 'pick'`), **con tutta la toolbar e tutte le funzioni**: ricerca, espandi/comprimi, **Nuova voce**, **＋ sotto-voce**, **scheda completa** (con icona/colore/immagine/AI), **Sposta in…**, ordina, vista Tabella, ecc.
2. **L'unica differenza in modalità `pick`:** le **checkbox** di selezione diventano **radio button** (selezione **singola**). Al clic sul nodo (o sul radio) il modale **restituisce il codice/ID** del nodo alla scheda chiamante tramite `onPick(node)`, si chiude, e il campo dell'entità ospite mostra **nome + breadcrumb** del nodo scelto.
3. **Vantaggio chiave:** se **manca il ramo** che serve, lo **crei sul momento** dentro lo stesso modale (scheda completa) e lo **selezioni immediatamente**, **senza uscire** dalla maschera di inserimento dell'Articolo.

> È **lo stesso componente**, stessa lista, stessa scheda, stesso codice: cambia solo `mode` (`manage` ↔ `pick`) e il fatto che `pick` usa radio + `onPick`. **Zero duplicazione.** (Regola di prodotto: "una lista + un CRUD per entità, riusati ovunque, anche in selezione".)

**Esempio passo-passo (Articolo → Categoria):**
1. Apro la scheda **Articolo**, campo "Categoria merceologica": premo la **lente**.
2. Si apre `EntityTree` (categorie) in `pick`: cerco "fibra", non trovo il sotto-ramo "Cavo drop 2F".
3. Dentro il modale premo **＋** su "Fibra ottica" → **scheda completa** → creo "Cavo drop 2F" con icona `cable` (suggerita da AI traducendo) e colore → **Salva**.
4. La nuova voce appare nell'albero **già selezionabile** (regola E, reattività): premo il **radio** accanto.
5. Il modale restituisce l'ID; la scheda Articolo mostra "Cavi › Fibra ottica › Cavo drop 2F". Non sono mai uscito dall'Articolo.

**Contratto host (entità che associa):** la scheda chiamante apre `<EntityTree config={{...catalogConfig, mode:'pick', onPick:(n)=>setCategoryId(n.id)}}/>`; salva l'`id` come FK (es. `material.category_id`), mostra il breadcrumb risolto in sola lettura con la lente per cambiarlo.

---

## 7. Semantica di eliminazione/spostamento di un sottoalbero

Sempre **soft-delete** (`archived_at`), con **conteggio d'uso ricorsivo** (figli + record collegati dell'intero sottoalbero). **Doppia conferma**:

**Passo 1 — avviso + scelta** (se ci sono figli/usi):
- **Blocca** (default se riferimenti vincolanti): mostra *quali* record bloccano.
- **Riassegna i figli al livello superiore**, archivia solo il nodo (sotto-rami salgono al nonno; collegati passano al genitore).
- **Elimina tutto il ramo (cascata)**: archivia nodo + discendenti; i collegati restano senza categoria (avviso col numero).

**Passo 2 — conferma definitiva.** Per la **cascata** si **DEVE** richiedere la **digitazione del nome** del nodo. Per "riassegna" basta una seconda conferma. Messaggio e comportamento **DEVONO** coincidere. Tutto in **transazione**.

---

## 8. Definition of Done (gate per ogni albero)

1. **Integrità (A):** elimina/archivia bloccato con messaggio che **nomina** i record.
2. **Unicità (B):** duplicati per livello rifiutati su INSERT e UPDATE; nome riusabile dopo archiviazione.
3. **Anti-ciclo (§3):** spostare sotto una discendente è rifiutato da trigger DB **e** UI.
4. **Reattività (E):** create/modifica/sposta/archivia visibili **senza relogin** in liste, picker, etichette, breadcrumb.
5. **Pick mode (§6.10):** la lente apre `EntityTree` completo; crea-al-volo + radio + ritorno codice funzionano senza uscire dalla scheda ospite.
6. **Semantica elimina (§7):** doppia conferma; cascata con digitazione nome; conteggi **ricorsivi**.
7. **Componente unico (§6):** usa `EntityTree`; clic-riga → scheda; **una sola** scorciatoia in alto.

---

## 9. Esempi applicativi
- **Categorie articolo** (`material_category`): caso canonico (`EntityTree` puro). Conteggio = articoli `category_id` = nodo (diretti) + sottoalbero. Pick mode da scheda Articolo (§6.10).
- **Siti/Località** (`site`): albero in scheda Soggetto (scope `companyId`); correggere CASCADE→RESTRICT.
- **Ubicazioni magazzino** (`stock_location`): già conforme; magazzino = radice.
- **WBS commessa**: **specializzazione** con colonne economiche — `SPEC_WBS_commessa_v1_1_01_05.md`.
- **Piano dei conti**: `EntityTree` con eventuale `maxDepth`.

---

## 10. Direttive per il generatore di codice
Per ogni entità `isTree: true`, generare:
1. **Migrazione** (`0NN_<entity>_tree.sql`) da §1.2 + trigger §3 (Flyway `V*.sql` immutabile).
2. **Rotte** REST §5 (Zod + Drizzle), `23505`→409, DELETE a tre modi §7.
3. **Frontend**: istanza `EntityTree` (§6) + scheda (§6.9) via config §6.1; per le entità che la **associano**, la lente che apre `mode:'pick'` (§6.10). **Nessuna** vista custom, **nessun** `<select>` indentato.
4. **Test DoD** §8 verdi.
Il generatore **NON DEVE** produrre: FK testuali, `ON DELETE CASCADE` sulla gerarchia, quick-add per ramo, rinomina inline, picker `<select>`, hard-delete, toolbar ridotte.

---

## 11. Decisioni collegate (ADR)
- **ADR-0001** Modello dati albero · **ADR-0002** Componente `EntityTree`/UX · **ADR-0003** Palette C · **ADR-0004** Offline sync = PowerSync · **ADR-0005** Solver = Timefold.

*Fine STANDARD entità ad albero v1.0.*
