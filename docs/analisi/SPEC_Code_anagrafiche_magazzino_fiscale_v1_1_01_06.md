# SPEC per Claude Code — Anagrafiche, Fiscale multi-paese, Magazzino completo, Risorse

**Chat:** 01.06 · **Data:** 21 giugno 2026 · **Versione:** v1.1
**Documento sorgente:** `ANALISI_struttura_entita_db_v1_1_01_06.md`
**Base schema:** migrazioni 001→037 (prossima libera: **038**)
**Destinatario:** Claude Code — questo è un piano di implementazione vincolante, non ispirazione.

> **Changelog v1.0 → v1.1:** (1) **Clean slate**: software nuovo, nessun dato/utente → le colonne legacy errate si **DROPpano**, niente shim di compatibilità né "deprecare invece di droppare". (2) Risolto il nodo **`asset.company_id` vs end-user FTTH** (Blocco E.2): `company_id` diventa nullable, l'asset si àncora al luogo/intestatario. (3) Aggiunta la sezione **🚧 CANTIERE** (cose rimandate, tracciate qui e in `BACKLOG_futuro.md`).

---

## 0. REGOLE GENERALI — valgono per OGNI blocco (leggere prima di scrivere codice)

1. **Migrazioni Flyway immutabili.** Una migrazione `V0NN__<slug>.sql` per blocco logico. Numerazione consecutiva da **038**. Non modificare migrazioni già unite.
2. **Ogni nuova tabella** deve avere, senza eccezioni:
   - PK `id uuid DEFAULT gen_random_uuid() NOT NULL`.
   - `tenant_id uuid NOT NULL` con FK a `tenant(id)` (tranne tabelle di sistema/catalogo globali, dove `tenant_id` è nullable per le righe di sistema).
   - Audit: `created_at timestamptz DEFAULT now() NOT NULL`, `updated_at timestamptz DEFAULT now() NOT NULL`, `created_by uuid`, `updated_by uuid`. Aggiungere `archived_at timestamptz` sulle tabelle "anagrafica" (non sulle righe di movimento/append-only).
   - `attributes jsonb DEFAULT '{}'::jsonb NOT NULL` su ogni anagrafica (coda lunga di verticale via `field_definition`).
   - **RLS**: `ALTER TABLE x ENABLE ROW LEVEL SECURITY; ALTER TABLE x FORCE ROW LEVEL SECURITY;` + le **stesse policy di isolamento tenant** già usate dalle tabelle esistenti (vedi `rls_policies.sql`: USING `tenant_id = app_current_tenant()`). Non inventare nuove forme di policy.
   - Grant: `GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE x TO sisuite_app;`
   - Owner coerente con le tabelle esistenti (`sisuite_admin`).
3. **ID visibili sempre da `number_series`** (codice articolo, codice soggetto, numero documento magazzino, numero ordine d'acquisto, numero conteggio). **Mai mostrare UUID in UI.**
4. **Regola colonna vs jsonb** (vincolante): colonna se universale / con vincolo-FK / filtrata-ordinata-joinata / pilota logica. `attributes jsonb` solo per la coda lunga di verticale, guidata da `field_definition`. **Non mettere in jsonb** i campi elencati come colonne in questo documento.
5. **UI — TUTTE le entità standard usano la stessa lista e lo stesso CRUD** (questo è il punto su cui il lavoro era disomogeneo):
   - Archetipi: **Lista (List Report)** e **Scheda (Object Page)** per le anagrafiche; **Documento (testata+righe)** solo per DDT/ordini/conteggi.
   - Riferimenti canonici vincolanti: lista+CRUD = `41_web_aziende_standard.html`; documento = `42_web_ddt_carico.html`; navigazione = `43_web_menu_due_livelli.html`; standard scritto = `2026-06-15_STANDARD_UI_liste_e_maschere_v2.md`.
   - Toolbar ricca icon-only con tooltip (ricerca, Filtri/Gruppo, Ordina, Colonne, Export, azioni AI; separatore; azioni dato a destra con "Nuova +" per ultima). Selezione = solo numero. Niente icone-funzione sulle righe.
   - La **stessa lista** si usa anche in modalità selezione (popup) per associare da un'altra maschera; la **stessa scheda** per la creazione inline. Una lista + un CRUD per entità, riusati ovunque.
6. **Niente colori/spazi hard-coded**: usare i design token di `base.css` v5.
7. **Verticale ≠ paese.** `field_definition` ha già l'asse `vertical`; questo piano aggiunge l'asse `country`. Un campo può essere: solo-paese (fiscale), solo-verticale (fibra/piscina), entrambi, o nessuno (universale = colonna).

> **NESSUNA FATTURAZIONE.** Non si emettono fatture. Niente SdI, niente XML FatturaPA, niente web service ARCA, niente CAE, niente numeratori fiscali. I dati fiscali servono **come anagrafica da esportare verso un gestionale esterno**. Quindi: catturare e validare i dati fiscali correttamente, ma **non** costruire alcun motore di emissione documenti fiscali.

> **CLEAN SLATE (vincolante).** Il software è nuovo, senza dati né utenti. Per ogni correzione strutturale: **DROP** diretto di colonne/tabelle errate o legacy. Niente compatibilità all'indietro, niente "deprecare invece di droppare". Lasciare lo schema definitivo e pulito.

---

## 🚧 CANTIERE — cose rimandate (tracciate anche in `BACKLOG_futuro.md`)

Da NON dimenticare. Questo elenco va ricordato a Sivaf a ogni risposta e tenuto allineato col backlog del repo.

- **Motore di sync offline** (PowerSync vs ElectricSQL) — decisione di piattaforma, post-questo-giro. *Prerequisito del magazzino mobile vero.*
- **Solver di pianificazione** (Timefold vs OR-Tools) — post-MVP.
- **Wiring autenticazione GoTrue/Supabase Auth** — deploy + callback + provisioning `app_user` al primo login.
- **Narrazione AI** (raccontare in linguaggio naturale i dati strutturati) — priorità roadmap.
- **Export anagrafiche fiscali verso gestionale esterno** — formato/mapping di handoff (nuovo: deriva dal "non fatturiamo, esportiamo").
- **Stampa/generazione etichette barcode** — feature app del magazzino (non schema).
- **Sottosistema notifiche** — su cui poggiano gli alert scorta minima e scadenza lotti/certificazioni.
- **Demo data pack** (fibra/piscine/software) con loader/unloader per-tenant.
- **ADR + doc architetturale** da scrivere DOPO l'implementazione di questo piano (vedi F.4).

---

## BLOCCO A — Localizzazione fiscale base + indirizzi (migrazione V038)

### A.1 Estendere `field_definition` con l'asse paese
```sql
ALTER TABLE public.field_definition ADD COLUMN country char(2);   -- ISO 3166-1 alpha-2; NULL = universale
COMMENT ON COLUMN public.field_definition.country IS 'Scope paese del campo (IT/AR/...). NULL = vale per tutti i paesi. Si combina con vertical.';
-- Indice per il caricamento del catalogo per (entity, country, vertical)
CREATE INDEX field_definition_scope_idx ON public.field_definition (entity, country, vertical) WHERE active;
```
Il caricatore del catalogo campi deve filtrare per `entity` + (`country` = paese-soggetto OR `country` IS NULL) + (`vertical` = verticale-tenant OR `vertical` IS NULL).

### A.2 Catalogo imposte country-scoped `tax_rate`
```sql
CREATE TABLE public.tax_rate (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,                       -- NULL = riga di sistema (seed); valorizzato = override tenant
    country char(2) NOT NULL,
    code text NOT NULL,                   -- es. 'IT22','IT10','AR21','AR105','AR_EXENTO'
    label text NOT NULL,                  -- 'IVA 22%'
    percent numeric NOT NULL,             -- 22, 10, 21, 10.5, 0
    is_default boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (tenant_id, country, code)
);
```
**Seed IT (righe di sistema, tenant_id NULL):** 22 (default), 10, 5, 4, 0 esente, 0 non imponibile.
**Seed AR (predisposizione):** 21 (default), 10.5, 27, 0 exento, 0 no gravado.
> Nota: percezioni/ritenute AR (IIBB, retenciones) e split payment IT **non** vanno qui: sono a livello documento/giurisdizione e — non fatturando — fuori scope.

### A.3 `company`: colonne universali (NO campi italiani cablati)
```sql
ALTER TABLE public.company
  ADD COLUMN code text,                       -- ID visibile via number_series
  ADD COLUMN country char(2) NOT NULL DEFAULT 'IT',  -- decide set fiscale + form indirizzo
  ADD COLUMN tax_id text,                      -- P.IVA (IT) / CUIT (AR) / VAT (EU)
  ADD COLUMN tax_id_kind text,                 -- 'vat'|'cuit'|'cuil'|'dni'|'nif'
  ADD COLUMN email text,
  ADD COLUMN phone text,
  ADD COLUMN website text,
  ADD COLUMN iban text,
  ADD COLUMN payment_terms text,               -- lookup ('30gg','60gg','RiBa'...)
  ADD COLUMN default_price_list_id uuid REFERENCES public.price_list(id),
  ADD COLUMN legal_address jsonb DEFAULT '{}'::jsonb NOT NULL,   -- vedi A.5
  ADD COLUMN operational_address jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN fiscal_attributes jsonb DEFAULT '{}'::jsonb NOT NULL;  -- campi fiscali country-driven (A.4)
CREATE INDEX company_tax_id_idx ON public.company (tenant_id, tax_id) WHERE tax_id IS NOT NULL;
-- CLEAN SLATE: la vecchia colonna text non serve, si elimina.
ALTER TABLE public.company DROP COLUMN address;
```

### A.4 Campi fiscali specifici del paese → `company.fiscal_attributes` (via `field_definition(country)`)
**Non sono colonne.** Seed delle definizioni in `field_definition` con `entity='company'`:
- **IT** (`country='IT'`): `sdi_code` (text, len 7, regex `[A-Z0-9]{7}`), `pec` (text, email), `regime_fiscale` (select RF01…RF19), `is_pa` (bool), `tax_code` (codice fiscale, regex CF).
- **AR** (`country='AR'`): `condicion_iva` (select: responsable_inscripto | monotributo | exento | consumidor_final | no_categorizado | sujeto_exterior), `tipo_documento` (select: CUIT|CUIL|DNI), `punto_venta` (text).

### A.5 Indirizzo strutturato `jsonb` — forma canonica country-driven
Indirizzo come `jsonb` (confermato: il modello argentino non entra in colonne piatte — provincia ISO, partido/departamento/comuna, CPA alfanumerico 8 caratteri). Forma canonica con chiave `country` interna:
```jsonc
// IT
{ "country":"IT", "street":"Via Roma", "civic":"12", "cap":"24100",
  "comune":"Bergamo", "provincia":"BG" }
// AR
{ "country":"AR", "calle":"San Martín", "numero":"230", "piso":"4", "depto":"A",
  "localidad":"Villa María", "partido":"General San Martín", "provincia":"X",
  "cpa":"X5900FNF" }
```
Render tramite **un unico componente `AddressField`** pilotato da `field_definition` con `entity='address'` + `country`. Allineare `site` (A.6) e `stock_location` (già jsonb) alla **stessa** forma.

### A.6 `site`: indirizzo a jsonb (clean slate)
```sql
ALTER TABLE public.site DROP COLUMN address;                 -- via il text legacy
ALTER TABLE public.site ADD COLUMN address jsonb DEFAULT '{}'::jsonb NOT NULL;  -- stessa forma di A.5
ALTER TABLE public.site ALTER COLUMN company_id DROP NOT NULL;  -- vedi Blocco E.2: un sito di installazione può non avere soggetto
```

### A.7 `tenant`: paese di casa
```sql
ALTER TABLE public.tenant ADD COLUMN default_country char(2) NOT NULL DEFAULT 'IT';
```

> **NON FARE nel Blocco A:** non creare tabelle fattura/comprobante; non aggiungere colonne `sdi_code`/`pec`/`condicion_iva` su `company` (vanno in `fiscal_attributes`); non tenere la vecchia `address` "per sicurezza" (clean slate: si DROPpa).

---

## BLOCCO B — Articolo (`material`) completo + categorie, immagini, fornitori (V039)

### B.1 `material`: colonne nuove
```sql
ALTER TABLE public.material
  ADD COLUMN code text,                         -- ID visibile via number_series (distinto da sku)
  ADD COLUMN item_type text NOT NULL DEFAULT 'article',  -- 'article'|'service'|'kit'
  ADD COLUMN barcode text,                      -- EAN/UPC, distinto da sku
  ADD COLUMN category_id uuid REFERENCES public.material_category(id),
  ADD COLUMN description text,
  ADD COLUMN brand text,
  ADD COLUMN manufacturer text,
  ADD COLUMN mpn text,                          -- manufacturer part number
  ADD COLUMN default_sale_price numeric,        -- MANCAVA: senza, niente marginalità
  ADD COLUMN tax_rate_id uuid REFERENCES public.tax_rate(id),
  ADD COLUMN reorder_point numeric,
  ADD COLUMN safety_stock numeric,
  ADD COLUMN min_qty numeric,
  ADD COLUMN max_qty numeric,
  ADD COLUMN lead_time_days integer,
  ADD COLUMN preferred_vendor_id uuid REFERENCES public.company(id),
  ADD COLUMN weight numeric,
  ADD COLUMN weight_unit text,
  ADD COLUMN dimensions jsonb,                   -- {l,w,h,unit}
  ADD COLUMN is_returnable boolean DEFAULT true NOT NULL,
  ADD COLUMN shelf_life_days integer,            -- genera scadenza lotto di default
  ADD COLUMN primary_image_url text,
  ADD COLUMN note text;
CREATE INDEX material_barcode_idx ON public.material (tenant_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX material_category_idx ON public.material (tenant_id, category_id);
```
Resta in `attributes jsonb` (via `field_definition`) tutto il verticale: fibra (`attenuation_db`, `connection_type`, `ont_serial`…), piscina (`concentrazione`, `formato`…).

### B.2 `material_category` (gerarchica)
```sql
CREATE TABLE public.material_category (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    parent_id uuid REFERENCES public.material_category(id),
    name text NOT NULL,
    color text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid, updated_by uuid, archived_at timestamptz,
    PRIMARY KEY (id),
    CONSTRAINT material_category_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id)
);
```

### B.3 `material_image` (foto multiple, MinIO)
```sql
CREATE TABLE public.material_image (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    material_id uuid NOT NULL REFERENCES public.material(id) ON DELETE CASCADE,
    object_key text NOT NULL,            -- chiave MinIO
    is_primary boolean DEFAULT false NOT NULL,
    sequence integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    PRIMARY KEY (id)
);
```
`material.primary_image_url` è il puntatore rapido all'immagine `is_primary` (denormalizzato per le liste).

### B.4 `material_supplier` (più fornitori per articolo)
```sql
CREATE TABLE public.material_supplier (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    material_id uuid NOT NULL REFERENCES public.material(id) ON DELETE CASCADE,
    supplier_id uuid NOT NULL REFERENCES public.company(id),
    supplier_sku text,
    purchase_price numeric,
    currency text,
    lead_time_days integer,
    is_preferred boolean DEFAULT false NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid, updated_by uuid,
    PRIMARY KEY (id),
    UNIQUE (tenant_id, material_id, supplier_id)
);
```

> **NON FARE nel Blocco B:** non duplicare `default_cost` (già esiste); non usare `sku` come barcode (sono campi distinti); non mettere prezzo di vendita o categoria in `attributes`.

---

## BLOCCO C — Magazzino completo (V040)

> Scope deciso: **magazzino completo da subito** (vendibile standalone). Include lotti, conteggio inventariale, ordini d'acquisto e pick list.

### C.1 Fix bug lotto — `stock_lot` (la tabella mancante a cui i `lot_id` puntavano)
```sql
CREATE TABLE public.stock_lot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    material_id uuid NOT NULL REFERENCES public.material(id),
    lot_number text NOT NULL,
    mfg_date date,
    expiry_date date,
    supplier_id uuid REFERENCES public.company(id),
    note text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid, updated_by uuid,
    PRIMARY KEY (id),
    UNIQUE (tenant_id, material_id, lot_number)
);
-- Aggiungere le FK ora che la tabella esiste:
ALTER TABLE public.stock_movement       ADD CONSTRAINT stock_movement_lot_fk       FOREIGN KEY (lot_id) REFERENCES public.stock_lot(id);
ALTER TABLE public.stock_document_line  ADD CONSTRAINT stock_document_line_lot_fk  FOREIGN KEY (lot_id) REFERENCES public.stock_lot(id);
ALTER TABLE public.stock_serial_unit    ADD CONSTRAINT stock_serial_unit_lot_fk    FOREIGN KEY (lot_id) REFERENCES public.stock_lot(id);  -- aggiungere col lot_id se assente
CREATE INDEX stock_lot_expiry_idx ON public.stock_lot (tenant_id, expiry_date) WHERE expiry_date IS NOT NULL;
```

### C.2 `stock_location`: arricchimento
```sql
ALTER TABLE public.stock_location
  ADD COLUMN code text,                  -- sigla magazzino (ID visibile)
  ADD COLUMN manager_user_id uuid REFERENCES public.app_user(id),
  ADD COLUMN note text;
```

### C.3 Conteggio inventariale (rettifica) — `stock_count` / `stock_count_line`
```sql
CREATE TABLE public.stock_count (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    number text,                         -- da number_series
    location_id uuid NOT NULL REFERENCES public.stock_location(id),
    status text NOT NULL DEFAULT 'draft',  -- draft|counting|review|posted|cancelled
    count_date date DEFAULT CURRENT_DATE NOT NULL,
    note text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid, updated_by uuid,
    PRIMARY KEY (id)
);
CREATE TABLE public.stock_count_line (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    count_id uuid NOT NULL REFERENCES public.stock_count(id) ON DELETE CASCADE,
    material_id uuid NOT NULL REFERENCES public.material(id),
    lot_id uuid REFERENCES public.stock_lot(id),
    expected_qty numeric,                -- giacenza a sistema al momento del conteggio
    counted_qty numeric,                 -- conteggio fisico
    unit text NOT NULL,
    note text,
    PRIMARY KEY (id)
);
```
Al `post`: genera i `stock_movement` di rettifica (differenza `counted - expected`) con un `type` "rettifica inventariale".

### C.4 Ordini d'acquisto — `purchase_order` / `purchase_order_line`
```sql
CREATE TABLE public.purchase_order (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    number text,                         -- da number_series
    supplier_id uuid NOT NULL REFERENCES public.company(id),
    dest_location_id uuid REFERENCES public.stock_location(id),
    status text NOT NULL DEFAULT 'draft',  -- draft|sent|partial|received|cancelled
    order_date date DEFAULT CURRENT_DATE NOT NULL,
    expected_date date,
    currency text,
    note text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid, updated_by uuid, archived_at timestamptz,
    PRIMARY KEY (id)
);
CREATE TABLE public.purchase_order_line (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    order_id uuid NOT NULL REFERENCES public.purchase_order(id) ON DELETE CASCADE,
    material_id uuid NOT NULL REFERENCES public.material(id),
    qty_ordered numeric NOT NULL,
    qty_received numeric DEFAULT 0 NOT NULL,
    unit text NOT NULL,
    unit_price numeric,
    note text,
    PRIMARY KEY (id),
    CONSTRAINT po_line_qty_check CHECK (qty_ordered > 0)
);
```
Ricezione: genera `stock_movement` di carico sul `dest_location_id`, aggiorna `qty_received` e lo `status` (partial/received). La lista articoli sotto-scorta (reorder_point) propone l'ordine al `preferred_vendor_id`.

### C.5 Pick list (prelievo in campo) — `pick_list` / `pick_list_line`
```sql
CREATE TABLE public.pick_list (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    number text,                         -- da number_series
    source_location_id uuid NOT NULL REFERENCES public.stock_location(id),
    assigned_resource_id uuid REFERENCES public.resource(id),
    work_order_id uuid REFERENCES public.work_order(id),
    engagement_id uuid REFERENCES public.engagement(id),
    status text NOT NULL DEFAULT 'draft',  -- draft|assigned|picking|done|cancelled
    note text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid, updated_by uuid,
    PRIMARY KEY (id)
);
CREATE TABLE public.pick_list_line (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    pick_list_id uuid NOT NULL REFERENCES public.pick_list(id) ON DELETE CASCADE,
    material_id uuid NOT NULL REFERENCES public.material(id),
    qty_requested numeric NOT NULL,
    qty_picked numeric DEFAULT 0 NOT NULL,
    unit text NOT NULL,
    lot_id uuid REFERENCES public.stock_lot(id),
    PRIMARY KEY (id)
);
```

### C.6 Maschera magazzino — struttura Object Page (vincolante)
```
LISTA magazzini (stock_location)  →  SCHEDA magazzino
  Header sticky: solo Salva / Annulla
  Dati: code, name, kind (warehouse/van/site), manager, indirizzo (AddressField), note
  Tab in basso (ognuno = la lista standard dell'entità, filtrata su questo location):
   • Giacenze   → stock_balance (articolo · qty · valore · scorta min · ▲ sotto-scorta)
   • Movimenti  → stock_movement
   • Seriali    → stock_serial_unit @ location
   • Lotti      → stock_lot presenti + evidenza scadenze
   • Documenti  → stock_document (DDT) + purchase_order + pick_list correlati
```

> **NON FARE nel Blocco C:** non creare `stock_lot` con PK diversa da quella attesa dai `lot_id` esistenti; non ricalcolare `stock_balance` con logica nuova (esiste già la vista `stock_balance_recompute`); non fare la maschera magazzino come master-detail "documento" (è Object Page con tab); non saltare il passaggio che le rettifiche/ricezioni generano `stock_movement` (la giacenza non si scrive a mano).

---

## BLOCCO D — Risorse: anagrafica + competenze + certificazioni (V041)

**Analisi richiesta (domanda 4) — esito:** tabelle dedicate, non tag jsonb. Motivo: (a) le competenze devono pilotare l'assegnazione AI-first del tecnico giusto → servono filtri/join, non testo libero; (b) le certificazioni hanno **scadenza** → serve una data + alert, che un tag non esprime. Soluzione robusta ma non sovradimensionata: un catalogo competenze + due tabelle di collegamento.

### D.1 `resource`: colonne nuove (le richieste esplicite)
```sql
ALTER TABLE public.resource
  ADD COLUMN code text,            -- sigla per visualizzazione compatta in pianificazione
  ADD COLUMN color text,           -- hex per agenda/Gantt
  ADD COLUMN avatar_url text,      -- icona/immagine (MinIO)
  ADD COLUMN email text,           -- comunicazioni (serve anche se la risorsa non è utente)
  ADD COLUMN phone text;
```
**Ruoli:** restano su `app_user` via `user_role` (RBAC) — corretto. Nella **scheda risorsa**, se `resource.user_id` è valorizzato, mostrare (sola lettura o con link di gestione) i ruoli dell'utente collegato. Non duplicare i ruoli su `resource`.

### D.2 Catalogo competenze `skill` + collegamento `resource_skill`
```sql
CREATE TABLE public.skill (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,              -- 'Giuntista fibra', 'Manutentore piscine'
    category text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (tenant_id, name)
);
CREATE TABLE public.resource_skill (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_id uuid NOT NULL REFERENCES public.resource(id) ON DELETE CASCADE,
    skill_id uuid NOT NULL REFERENCES public.skill(id),
    level smallint,                  -- 1..3 opzionale (un liv.3 copre liv.2 e 1)
    note text,
    created_at timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (tenant_id, resource_id, skill_id)
);
```

### D.3 Certificazioni `resource_certification`
```sql
CREATE TABLE public.resource_certification (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_id uuid NOT NULL REFERENCES public.resource(id) ON DELETE CASCADE,
    name text NOT NULL,              -- 'PES/PAV', 'Attestato sicurezza', 'Patentino PLE'
    issuer text,
    cert_number text,
    valid_from date,
    valid_until date,                -- scadenza → alert
    document_object_key text,        -- scansione su MinIO (opzionale)
    note text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid, updated_by uuid,
    PRIMARY KEY (id)
);
CREATE INDEX resource_cert_expiry_idx ON public.resource_certification (tenant_id, valid_until) WHERE valid_until IS NOT NULL;
```
Specifico di mezzi/attrezzature (targa, modello, revisione) resta in `resource.attributes` via `field_definition` (kind = vehicle/equipment).

> **NON FARE nel Blocco D:** non mettere i ruoli RBAC su `resource`; non mettere competenze/certificazioni in `attributes jsonb`; non rendere `email` obbligatoria (un mezzo non ha email).

---

## BLOCCO E — Affinamenti altre entità (V042) — basso rischio

```sql
ALTER TABLE public.work_order
  ADD COLUMN priority text,                 -- low|normal|high|urgent (lookup)
  ADD COLUMN due_date date,
  ADD COLUMN site_id uuid REFERENCES public.site(id);

ALTER TABLE public.engagement
  ADD COLUMN planned_start date,
  ADD COLUMN planned_end date,
  ADD COLUMN priority text;

ALTER TABLE public.asset
  ADD COLUMN model text,
  ADD COLUMN manufacturer text,
  ADD COLUMN warranty_until date,
  ADD COLUMN status text,
  ADD COLUMN parent_asset_id uuid REFERENCES public.asset(id);
```

### E.2 Risolto: `asset.company_id` vs end-user FTTH
**Decisione presa** (niente più "aperto"). L'asset si àncora al **luogo** e/o all'**intestatario**, non obbligatoriamente a un soggetto in anagrafica:
```sql
ALTER TABLE public.asset ALTER COLUMN company_id DROP NOT NULL;        -- non più obbligatorio
ALTER TABLE public.asset ADD COLUMN work_order_subject_id uuid REFERENCES public.work_order_subject(id);  -- end-user FTTH (PII già isolata)
ALTER TABLE public.asset ADD CONSTRAINT asset_anchor_check
  CHECK (company_id IS NOT NULL OR site_id IS NOT NULL OR work_order_subject_id IS NOT NULL);
```
Motivo: in fibra l'apparato (ONT/borchia) è installato a casa dell'**utente finale**, che NON è un cliente/soggetto del tenant (il cliente è l'operatore, es. POWERCOM). L'identità dell'utente finale è già in `work_order_subject` (PII isolata); il luogo è in `site`/indirizzo. Forzare `company_id` costringerebbe a creare un "soggetto" fasullo per ogni abitazione, inquinando l'anagrafica. Per le piscine l'asset resta legato al soggetto cliente (company_id valorizzato): la stessa tabella copre entrambi i casi.

> **NON FARE nel Blocco E:** non lasciare `asset.company_id` o `site.company_id` come NOT NULL; non creare soggetti "civetta" per gli utenti finali FTTH (usare `work_order_subject` + `site`).

### E.3 `company_contact`: campi minori
```sql
ALTER TABLE public.company_contact
  ADD COLUMN mobile text,
  ADD COLUMN department text,
  ADD COLUMN note text;
```

---

## BLOCCO F — Vendibilità standalone + number_series + chiusura

### F.1 Entitlement per vendere il magazzino da solo
Le serie sono già in `plan.entitlements jsonb`. Definire le chiavi:
- `module.warehouse` (magazzino completo: location, articoli, movimenti, lotti, conteggi, PO, pick list).
- `module.warehouse.mobile` (magazzino da mobile + barcode/scansione + pick list in campo).
La UI nasconde i moduli per entitlement+RBAC, **ma il backend resta la barriera di sicurezza** (RLS + check entitlement), non il menu.

### F.2 `number_series`: registrare le nuove serie
Censire le serie per: `material.code`, `company.code`, `stock_location.code`, `stock_document.number`, `purchase_order.number`, `pick_list.number`, `stock_count.number`.

### F.3 Criteri di accettazione (DONE_*.md per blocco)
- **A**: creo un soggetto IT → vedo sdi_code/pec/regime nel form; cambio paese a AR → il form mostra condicion_iva/tipo_documento/punto_venta e l'AddressField passa alla forma argentina. `tax_rate` IT/AR seedate.
- **B**: articolo con categoria, barcode, prezzo vendita, IVA, scorta minima, più immagini e più fornitori; ricerca per barcode funziona.
- **C**: carico/scarico/trasferimento aggiornano `stock_balance`; un lotto con scadenza compare nel tab Lotti; un conteggio "posted" genera i movimenti di rettifica; un PO ricevuto genera carico; una pick list assegnabile a risorsa/commessa. Maschera magazzino = Object Page con i 5 tab.
- **D**: risorsa con sigla/colore/avatar/email; assegnazione competenze dal catalogo; certificazione con scadenza che entra negli alert; ruoli visibili se la risorsa è utente.
- **E/F**: posso registrare un asset installato a casa di un utente finale FTTH **senza** creare un soggetto in anagrafica (àncora = site + work_order_subject); un asset piscina resta legato al soggetto cliente; entitlement `module.warehouse` nasconde/mostra il modulo.

### F.4 Documenti da produrre dopo l'implementazione
- **ADR** "Localizzazione fiscale multi-paese senza emissione documenti" (asse `country` su field_definition; fiscal_attributes; tax_rate; indirizzi jsonb).
- **ADR** "Modulo Magazzino completo e vendibile standalone" (stock_lot, count, PO, pick list, entitlement).
- **1 documento architetturale** che lega i due ADR e aggiorna lo schema di riferimento.
- Aggiornare `2026-06-20_schema_db_completo.md` dopo le migrazioni (rigenerare con `pg_dump`).

---

## Ordine di esecuzione consigliato
A → B → C → D → E → F. Test funzionali tra un blocco e l'altro. A e B sono prerequisiti di C (FK material/tax_rate). D ed E sono indipendenti e si possono parallelizzare dopo A.
