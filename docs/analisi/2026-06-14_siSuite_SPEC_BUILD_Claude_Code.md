# siSuite — Specifica di BUILD per Claude Code (definitiva e dettagliata)

> **Data:** 14 giugno 2026 · **Prodotto:** siSuite (AI-first, mobile-first), sostituto del vecchio gestionale.
> **Audience:** Claude Code. **Lingua:** spiegazioni in italiano; identificatori in inglese `snake_case`.
> **Questo documento consolida e sostituisce le bozze precedenti.** Contiene il DDL completo di ogni tabella nuova o modificata.

---

## 0. Regole operative (non negoziabili)

1. **Tutto additivo e reversibile.** Solo: colonne nuove *nullable*, tabelle nuove, righe di seed. Mai rimuovere/rinominare colonne esistenti, mai operazioni distruttive. Ogni migrazione ha il suo `down` funzionante.
2. **Una migrazione per preoccupazione**, numerazione crescente, idempotente dove possibile (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).
3. **Prima su copia, test, poi merge.** Ogni migrazione provata su DB di copia con dati realistici.
4. **RLS su ogni tabella nuova** (ENABLE + FORCE) nello stile esistente (§3).
5. **Audit coerente:** `created_at`, `updated_at` (+ trigger `set_updated_at`), `created_by`, `updated_by`; `archived_at` per soft-delete dove ha senso; `client_created_at` sulle tabelle scritte da mobile.
6. **Liste di stato sempre con `canonical_state` + `lookup_value`** (§1.3). Mai nuovi `ENUM` per stati di dominio.
7. **Non inventare regole di business.** Se un dettaglio non è qui, **fermati e chiedi**.
8. **Ordine di build:** (1) Ore → (2) Rapportino AI → (3) Agenda → (4) Budget/margine → (5) Magazzino minimo 6A. **NON costruire** 6B (magazzino avanzato) né la Manutenzione: prima progettazione dedicata.

---

## 1. Standard e convenzioni

### 1.1 Identità e multi-tenant
- PK: `id uuid DEFAULT gen_random_uuid() NOT NULL`.
- `tenant_id uuid NOT NULL` su ogni tabella di dominio, FK `tenant(id) ON DELETE CASCADE`.
- Numerazioni leggibili: usare la tabella esistente `number_series` (mai numerare a mano).

### 1.2 Tempo e denaro
- Importi `numeric` (mai `float`), con `currency text` accanto. Durate `integer` in **minuti**. Istanti `timestamptz`.
- **Tariffe/costi si fotografano nella riga** al momento della registrazione; non si rileggono dalle anagrafiche.

### 1.3 Liste configurabili (pattern obbligatorio, già in uso)
- `canonical_state(category, code, sequence)` = codici di sistema (righe di sistema con `tenant_id NULL`).
- `lookup_value(tenant_id, category, canonical, code, label jsonb, abbreviation, color_token, sequence, is_default)` = etichette rinominabili; FK `(category, canonical) → canonical_state(category, code)`.
- Le colonne di stato sono `*_id uuid` con **FK a `lookup_value(id)`** (come `activity.status_id`, `engagement.status_id`).
- Etichette: JSONB con chiavi `it-IT`, `en`, `es-AR`. Colori: design token (`success|danger|info|neutral|warning`), mai esadecimali.

### 1.4 Funzioni RLS esistenti da usare
`app_current_tenant()`, `app_current_user()`, `app_sees_whole_tenant()`, `app_data_scope()`, `app_is_platform_admin()`, e il trigger `set_updated_at()`.

---

## 2. Mappa delle tabelle

**Modificate (ALTER):** `time_entry`, `material`, `engagement`, `activity`.
**Nuove:** `absence_entry`, `absence_balance`, `time_tracking_session`, `work_report`, `work_report_time_entry`, `stock_location`, `stock_movement`, `stock_balance`, `stock_document`, `stock_document_line`.
**Referenziate (esistenti, non modificate qui):** `tenant`, `app_user`, `resource`, `phase`, `capture`, `company`, `lookup_value`, `canonical_state`, `number_series`.
**Da deprecare gradualmente (non rimuovere ora):** `material_consumption` (i consumi diventano movimenti di magazzino — §8).
**Nuove categorie `canonical_state`:** `time_typology`, `time_entry_status`, `absence_type`, `billing_mode`, `work_report_status`, `schedule_mode`, `stock_movement_type`, `stock_document_type`.

---

## 3. Template riusabili (RLS e trigger)

### 3.1 RLS — tabella a livello tenant (visibile a tutto il tenant)
Per: `stock_location`, `stock_movement`, `stock_balance`, `stock_document`, `stock_document_line`.
```sql
ALTER TABLE public.<T> ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.<T> FORCE ROW LEVEL SECURITY;
CREATE POLICY <t>_select ON public.<T> FOR SELECT
  USING (public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()));
CREATE POLICY <t>_insert ON public.<T> FOR INSERT
  WITH CHECK (tenant_id = public.app_current_tenant());
CREATE POLICY <t>_modify ON public.<T> FOR UPDATE
  USING (tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());
```

### 3.2 RLS — tabella con scope "own" (riga propria del tecnico)
Per: `absence_entry`, `work_report`, `time_tracking_session` (lega la proprietà alla risorsa/utente, stile `time_entry`).
```sql
ALTER TABLE public.<T> ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.<T> FORCE ROW LEVEL SECURITY;
CREATE POLICY <t>_insert ON public.<T> FOR INSERT
  WITH CHECK (tenant_id = public.app_current_tenant());
CREATE POLICY <t>_modify ON public.<T> FOR UPDATE
  USING ((tenant_id = public.app_current_tenant())
         AND (public.app_sees_whole_tenant()
              OR (created_by = public.app_current_user())
              OR EXISTS (SELECT 1 FROM public.resource r
                         WHERE r.id = <T>.resource_id AND r.user_id = public.app_current_user())))
  WITH CHECK (tenant_id = public.app_current_tenant());
CREATE POLICY <t>_select ON public.<T> FOR SELECT
  USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))
         AND (public.app_sees_whole_tenant()
              OR ((public.app_data_scope() = 'own')
                  AND ((created_by = public.app_current_user())
                       OR EXISTS (SELECT 1 FROM public.resource r
                                  WHERE r.id = <T>.resource_id AND r.user_id = public.app_current_user())))));
```
(Per `work_report` che non ha `resource_id`, usare solo la parte `created_by`.)

### 3.3 Trigger updated_at
Su ogni tabella nuova con `updated_at`:
```sql
CREATE TRIGGER trg_<t>_updated BEFORE UPDATE ON public.<T>
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

---

## 4. MODULO ORE  (costruire ora — sotto-passi 4.1 → 4.6 in ordine)

### 4.1 — Tipo di ore come lista + natura (orchestratore)
```sql
-- canonici: la "natura" del tipo di ora
INSERT INTO canonical_state (category, code, sequence) VALUES
  ('time_typology','work',1),('time_typology','absence',2),('time_typology','material',3),
  ('time_typology','performance',4),('time_typology','cost',5)
ON CONFLICT DO NOTHING;

INSERT INTO lookup_value (tenant_id,category,canonical,code,label,abbreviation,color_token,sequence,is_default) VALUES
 (NULL,'time_typology','work',    'ordinary','{"it-IT":"Ordinarie","en":"Regular","es-AR":"Normales"}','ORD','info',   1,true),
 (NULL,'time_typology','work',    'overtime','{"it-IT":"Straordinario","en":"Overtime","es-AR":"Extra"}','STR','warning',2,false),
 (NULL,'time_typology','work',    'travel',  '{"it-IT":"Viaggio","en":"Travel","es-AR":"Viaje"}','VIA','neutral',3,false),
 (NULL,'time_typology','absence', 'absence', '{"it-IT":"Assenza","en":"Absence","es-AR":"Ausencia"}','ASS','neutral',4,false),
 (NULL,'time_typology','material','material','{"it-IT":"Materiale","en":"Material","es-AR":"Material"}','MAT','success',5,false)
ON CONFLICT DO NOTHING;

ALTER TABLE public.time_entry
  ADD COLUMN IF NOT EXISTS typology_id uuid REFERENCES public.lookup_value(id);
CREATE INDEX IF NOT EXISTS time_entry_typology_id_idx ON public.time_entry(typology_id);
```
**Maschera:** dal `lookup_value` scelto si ricava la `canonical` (natura) → i campi visibili sono pilotati da `field_definition` (entità `time_entry`). `typology text` resta deprecato (non rimuovere ora).

### 4.2 — Tariffa fotografata
```sql
ALTER TABLE public.time_entry
  ADD COLUMN IF NOT EXISTS cost_rate numeric,
  ADD COLUMN IF NOT EXISTS bill_rate numeric,
  ADD COLUMN IF NOT EXISTS currency  text,
  ADD COLUMN IF NOT EXISTS billable  boolean DEFAULT true NOT NULL;
```
**Risoluzione all'inserimento** (funzione isolata `resolveRates(resource, engagement, tenant)`): `cost_rate` da risorsa → default tenant; `bill_rate` da override commessa → tariffa risorsa → default tenant; `currency` da commessa/tenant. (Listino multilivello = evoluzione futura, annotare in `BACKLOG_futuro.md`.)

### 4.3 — Approvazione + blocco
```sql
INSERT INTO canonical_state (category, code, sequence) VALUES
  ('time_entry_status','draft',1),('time_entry_status','submitted',2),
  ('time_entry_status','approved',3),('time_entry_status','rejected',4)
ON CONFLICT DO NOTHING;
INSERT INTO lookup_value (tenant_id,category,canonical,code,label,abbreviation,color_token,sequence,is_default) VALUES
 (NULL,'time_entry_status','draft','draft','{"it-IT":"Bozza","en":"Draft","es-AR":"Borrador"}','BOZ','neutral',1,true),
 (NULL,'time_entry_status','submitted','submitted','{"it-IT":"Inviata","en":"Submitted","es-AR":"Enviada"}','INV','info',2,false),
 (NULL,'time_entry_status','approved','approved','{"it-IT":"Approvata","en":"Approved","es-AR":"Aprobada"}','APP','success',3,false),
 (NULL,'time_entry_status','rejected','rejected','{"it-IT":"Respinta","en":"Rejected","es-AR":"Rechazada"}','RES','danger',4,false)
ON CONFLICT DO NOTHING;

ALTER TABLE public.time_entry
  ADD COLUMN IF NOT EXISTS approval_status_id uuid REFERENCES public.lookup_value(id),
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES public.app_user(id),
  ADD COLUMN IF NOT EXISTS approved_at  timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by  uuid REFERENCES public.app_user(id),
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS is_locked   boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS locked_at   timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by   uuid REFERENCES public.app_user(id),
  ADD COLUMN IF NOT EXISTS lock_reason text;  -- 'PAYROLL'|'INVOICED'|'PERIOD_CLOSE'|'MANUAL'

-- blocco duro: riga bloccata non modificabile (eccetto sblocco esplicito)
CREATE OR REPLACE FUNCTION public.block_locked_time_entry()
RETURNS trigger AS $$
BEGIN
  IF OLD.is_locked = true THEN
    IF NEW.is_locked = false AND NEW.lock_reason IS NULL THEN RETURN NEW; END IF;  -- sblocco controllato
    RAISE EXCEPTION 'time_entry % bloccata (%): modifica non consentita', OLD.id, OLD.lock_reason;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_time_entry_lock BEFORE UPDATE ON public.time_entry
  FOR EACH ROW EXECUTE FUNCTION public.block_locked_time_entry();
```
Nuova riga = `draft`. Approvazione **in blocco** (endpoint che porta una lista di id a `approved` in transazione; solo ruoli con scope `tenant` o ruolo approvatore). Sblocco = azione amministrativa tracciata.

### 4.4 — Assenze e saldi
```sql
INSERT INTO canonical_state (category, code, sequence) VALUES
 ('absence_type','vacation',1),('absence_type','sick',2),('absence_type','leave_paid',3),
 ('absence_type','leave_unpaid',4),('absence_type','rol',5),('absence_type','ex_festivita',6),
 ('absence_type','law104',7),('absence_type','maternity',8),('absence_type','paternity',9),
 ('absence_type','bereavement',10),('absence_type','marriage',11),('absence_type','study',12)
ON CONFLICT DO NOTHING;
-- + lookup_value con etichette it-IT/en/es-AR: Ferie, Malattia, Permesso retribuito, Permesso non retribuito,
--   ROL, Ex-festività, Legge 104, Maternità, Paternità, Lutto, Matrimonio, Studio.

CREATE TABLE public.absence_entry (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.resource(id) ON DELETE RESTRICT,
  type_id uuid NOT NULL REFERENCES public.lookup_value(id),          -- category 'absence_type'
  starts_on date NOT NULL,
  ends_on   date NOT NULL,
  hours numeric,                       -- per assenze a ore (permessi); NULL = giornate intere
  half_day boolean DEFAULT false NOT NULL,
  note text,
  attachment_url text,                 -- certificato/protocollo INPS (storage, non DB)
  approval_status_id uuid REFERENCES public.lookup_value(id),        -- riusa category 'time_entry_status'
  source_capture_id uuid REFERENCES public.capture(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  client_created_at timestamptz,
  CONSTRAINT absence_entry_pkey PRIMARY KEY (id),
  CONSTRAINT absence_entry_dates_check CHECK (ends_on >= starts_on)
);
CREATE INDEX absence_entry_tenant_id_idx ON public.absence_entry(tenant_id);
CREATE INDEX absence_entry_resource_id_idx ON public.absence_entry(resource_id);
-- trigger updated_at (§3.3); RLS scope "own" (§3.2).

CREATE TABLE public.absence_balance (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.resource(id) ON DELETE CASCADE,
  type_id uuid NOT NULL REFERENCES public.lookup_value(id),          -- category 'absence_type'
  year integer NOT NULL,
  accrued numeric DEFAULT 0 NOT NULL,   -- maturate
  used    numeric DEFAULT 0 NOT NULL,   -- godute (residuo = accrued - used, calcolato)
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT absence_balance_pkey PRIMARY KEY (id),
  CONSTRAINT absence_balance_uk UNIQUE (tenant_id, resource_id, type_id, year)
);
CREATE INDEX absence_balance_tenant_id_idx ON public.absence_balance(tenant_id);
-- trigger updated_at; RLS tenant-scoped (§3.1).
```
All'approvazione di un'assenza tipo "ferie": aggiornare `absence_balance.used`. Mostrare il residuo in fase di richiesta. Maturazione (`accrued`): carico/rettifica manuale nel minimo; regola CCNL automatica in backlog.

### 4.5 — Cronometro
```sql
ALTER TABLE public.time_entry
  ADD COLUMN IF NOT EXISTS start_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_at   timestamptz;

CREATE TABLE public.time_tracking_session (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.resource(id) ON DELETE CASCADE,
  activity_id uuid REFERENCES public.activity(id) ON DELETE SET NULL,
  engagement_id uuid REFERENCES public.engagement(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL,
  stopped_at timestamptz,                 -- NULL = timer in corso
  committed_time_entry_id uuid REFERENCES public.time_entry(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  CONSTRAINT time_tracking_session_pkey PRIMARY KEY (id)
);
CREATE INDEX time_tracking_session_tenant_id_idx ON public.time_tracking_session(tenant_id);
CREATE INDEX time_tracking_session_resource_idx ON public.time_tracking_session(resource_id);
-- trigger updated_at; RLS scope "own" (§3.2).
```
Alla conferma: si crea una `time_entry` con `start_at`/`end_at` = misurato, `minutes` = differenza; il tempo misurato è di sola lettura.

### 4.6 — Irrobustimento contesto
```sql
-- prima verificare che non esistano righe in violazione, poi:
ALTER TABLE public.time_entry
  ADD CONSTRAINT time_entry_context_check
  CHECK (engagement_id IS NOT NULL OR activity_id IS NOT NULL) NOT VALID;
ALTER TABLE public.time_entry VALIDATE CONSTRAINT time_entry_context_check;
```

---

## 5. RAPPORTINO AI  (costruire ora)

### 5.1 — Modalità di vendita commessa
```sql
INSERT INTO canonical_state (category, code, sequence) VALUES
  ('billing_mode','hourly',1),('billing_mode','fixed',2) ON CONFLICT DO NOTHING;
-- + lookup_value: "A ore" / "A corpo"
ALTER TABLE public.engagement
  ADD COLUMN IF NOT EXISTS billing_mode_id uuid REFERENCES public.lookup_value(id);
```
Regola: `fixed` → il rapportino cliente mostra descrizione + prezzo concordato, **mai** ore né costi. `hourly` → descrizione + ore, mai costi.

### 5.2 — Rapportino
```sql
INSERT INTO canonical_state (category, code, sequence) VALUES
  ('work_report_status','raw',1),('work_report_status','ai_proposed',2),
  ('work_report_status','confirmed',3),('work_report_status','signed',4) ON CONFLICT DO NOTHING;
-- + lookup_value: Grezzo / Proposto dall'AI / Confermato / Firmato

CREATE TABLE public.work_report (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  engagement_id uuid NOT NULL REFERENCES public.engagement(id) ON DELETE CASCADE,
  activity_id uuid REFERENCES public.activity(id) ON DELETE SET NULL,
  period_start date, period_end date,
  audience text NOT NULL DEFAULT 'customer',     -- 'customer' | 'internal'
  status_id uuid NOT NULL REFERENCES public.lookup_value(id),   -- work_report_status
  raw_text text, ai_text text, final_text text,
  signer_name text, signature_url text, signed_at timestamptz,
  generated_by_ai boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  client_created_at timestamptz,
  CONSTRAINT work_report_pkey PRIMARY KEY (id)
);
CREATE INDEX work_report_tenant_id_idx ON public.work_report(tenant_id);
CREATE INDEX work_report_engagement_id_idx ON public.work_report(engagement_id);
-- trigger updated_at; RLS scope "own" (§3.2, solo parte created_by).

CREATE TABLE public.work_report_time_entry (
  work_report_id uuid NOT NULL REFERENCES public.work_report(id) ON DELETE CASCADE,
  time_entry_id  uuid NOT NULL REFERENCES public.time_entry(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  CONSTRAINT work_report_time_entry_pkey PRIMARY KEY (work_report_id, time_entry_id)
);
-- RLS tenant-scoped (§3.1).
```
**Flusso:** raccogli `time_entry` confermate + note grezze → l'AI (lo stesso livello del "narratore") genera `ai_text` (senza costi; ore secondo `billing_mode`) → stato `ai_proposed` → l'uomo modifica `final_text`, conferma → `confirmed` → si abilita la firma → `signed`. Il documento interno (`audience='internal'`) riassume le ore per categoria con costi. L'AI non scrive mai lo stato finale.

---

## 6. AGENDA VIVA  (costruire ora — schema minimo + logica nel motore esistente)

### 6.1 — Esiste già (non ricostruire)
`activity.estimated_minutes`, `scheduled_start/end`, `earliest_start`, `due_by`, `priority_id`; `resource.working_hours`; `resource_availability`; motore `scheduler`+`dependencyPlan`; `activity_dependency`.

### 6.2 — Aggiunta a schema
```sql
INSERT INTO canonical_state (category, code, sequence) VALUES
  ('schedule_mode','floating',1),('schedule_mode','fixed',2) ON CONFLICT DO NOTHING;
-- + lookup_value: "Distribuita" / "A orario fisso"
ALTER TABLE public.activity
  ADD COLUMN IF NOT EXISTS schedule_mode_id uuid REFERENCES public.lookup_value(id),
  ADD COLUMN IF NOT EXISTS pinned_day date;
```
`floating` (default): il pianificatore calcola `scheduled_start/end`. `fixed`: `scheduled_start` è autorevole (appuntamento), non si sposta. `pinned_day`: l'attività resta in quel giorno (trascina-e-inchioda).

### 6.3 — Logica del pianificatore (per ogni tecnico, indipendente)
1. **Ancora = adesso:** `max(now, fine attività in corso)`. Le completate restano ferme.
2. **Ricalcolo a eventi** (apertura vista, completamento, aggiunta/inchiodatura/spostamento, "Ricalcola"), **non in continuo**.
3. Si rispettano per prime le `fixed` e le `resource_availability` (blocchi invalicabili).
4. Le `floating` scorrono per sequenza/priorità e dipendenze (B non prima della fine di A), consumando `estimated_minutes` dentro le `working_hours` del tecnico.
5. Spill al giorno lavorativo successivo quando non entrano.
6. Persistenza in `activity.scheduled_start/end` e `activity_resource.planned_from/planned_to`.
> Isolare l'ancora in `planningAnchor(resource, now)` (per cambiare in futuro a "inizio giornata" se richiesto).

### 6.4 — Schermata
Vista web **multi-tecnico a colonne** (riprendere quella già fatta). Trascina-e-inchioda (`pinned_day`/`fixed`); riassunti leggeri ("ho spostato N attività"); interruttore Auto on/off + "Ricalcola"; badge Distribuita/A orario fisso; mobile su "Oggi" + commutatore "Agenda / Da pianificare (N)".

---

## 7. BUDGET / MARGINE  (costruire ora — dipende da §4.2 e §8)

### 7.1 — Budget previsto
```sql
ALTER TABLE public.engagement
  ADD COLUMN IF NOT EXISTS budget_amount numeric,
  ADD COLUMN IF NOT EXISTS budget_minutes integer,
  ADD COLUMN IF NOT EXISTS budget_currency text;
```
In assenza di budget esplicito, "previsto" = `Σ estimated_minutes × bill_rate` delle attività del ramo. (Campi budget su `phase` opzionali, valutare in build.)

### 7.2 — Calcolo (rollup ricorsivo sull'albero `phase`/`activity`)
- **Fatto (costo)** = `Σ(time_entry.minutes/60 × cost_rate)` + `Σ(movimenti 'out' su lavoro: |quantity| × unit_cost)`.
- **Fatto (ricavo)** = idem con `bill_rate`/`unit_price`, escluse righe `billable=false`; se commessa `a corpo`, ricavo = prezzo concordato.
- **Margine** = ricavo − costo. **Rimane** = previsto − fatto. Allarme se `fatto/previsto > 0.85`.

### 7.3 — Schermata
Barretta per ramo (previsto/fatto/rimane + allarme); interruttore Costo→Ricavo→Margine; trascina-e-riorganizza con anti-ciclo (riusare `WITH RECURSIVE` sull'albero `phase`).

---

## 8. MAGAZZINO — MINIMO 6A  (costruire ora)

**Principi:** movimenti **sempre** registrati (un consumo su lavoro è un movimento di uscita); magazzini e ubicazioni in **un solo albero**; **giacenza mantenuta** (perpetual) con costo a **media mobile**; FIFO/lotti opzionali per articolo (6B). Documento → movimenti.

### 8.1 — Catalogo articoli
```sql
ALTER TABLE public.material
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS track_stock    boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS costing_method text DEFAULT 'avg' NOT NULL,  -- 'avg' (minimo) | 'fifo' (6B)
  ADD COLUMN IF NOT EXISTS tracked_by_lot boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS default_cost   numeric;                       -- costo di listino (fallback)
CREATE UNIQUE INDEX IF NOT EXISTS material_tenant_sku_uk
  ON public.material(tenant_id, sku) WHERE sku IS NOT NULL;
```
**REGOLA DEL COSTO (fissata):** valorizzazione di un'uscita = `costo medio corrente → material.default_cost → 0`.

### 8.2 — Magazzini/ubicazioni (albero)
```sql
CREATE TABLE public.stock_location (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.stock_location(id) ON DELETE RESTRICT,  -- NULL = magazzino (primo livello)
  name text NOT NULL,
  kind text DEFAULT 'warehouse' NOT NULL,   -- 'warehouse' | 'sub_location' | 'van'
  resource_id uuid REFERENCES public.resource(id) ON DELETE SET NULL,       -- se 'van': tecnico
  address jsonb DEFAULT '{}'::jsonb NOT NULL,
  holds_stock boolean DEFAULT true NOT NULL, -- false = nodo di solo raggruppamento
  is_default boolean DEFAULT false NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  archived_at timestamptz,
  CONSTRAINT stock_location_pkey PRIMARY KEY (id),
  CONSTRAINT stock_location_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX stock_location_tenant_id_idx ON public.stock_location(tenant_id);
CREATE INDEX stock_location_parent_id_idx ON public.stock_location(parent_id);
-- trigger updated_at; RLS tenant-scoped (§3.1).

-- ANTI-CICLO: impedisce di porre un'ubicazione sotto una propria discendente
CREATE OR REPLACE FUNCTION public.stock_location_no_cycle()
RETURNS trigger AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (
      WITH RECURSIVE anc AS (
        SELECT NEW.parent_id AS id
        UNION ALL
        SELECT sl.parent_id FROM public.stock_location sl JOIN anc ON sl.id = anc.id WHERE sl.parent_id IS NOT NULL
      ) SELECT 1 FROM anc WHERE id = NEW.id
    ) THEN
      RAISE EXCEPTION 'stock_location: ciclo non ammesso (% non può stare sotto una propria discendente)', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_stock_location_no_cycle BEFORE INSERT OR UPDATE ON public.stock_location
  FOR EACH ROW EXECUTE FUNCTION public.stock_location_no_cycle();
```
**Seed:** un "Magazzino principale" (`parent_id NULL`, `kind 'warehouse'`, `is_default true`) per ogni tenant.

### 8.3 — Tipi movimento
```sql
INSERT INTO canonical_state (category, code, sequence) VALUES
  ('stock_movement_type','in',1),('stock_movement_type','out',2),
  ('stock_movement_type','adjust',3),('stock_movement_type','transfer',4) ON CONFLICT DO NOTHING;
-- + lookup_value: Carico / Scarico / Rettifica / Trasferimento
```

### 8.4 — Registro movimenti (immutabile)
```sql
CREATE TABLE public.stock_movement (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.material(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.stock_location(id) ON DELETE RESTRICT,
  type_id uuid NOT NULL REFERENCES public.lookup_value(id),   -- stock_movement_type
  quantity numeric NOT NULL,                 -- CON SEGNO: + aumenta, − diminuisce (mai 0)
  unit text NOT NULL,
  unit_cost numeric,                         -- costo unitario fotografato
  unit_price numeric,                        -- prezzo cliente fotografato (lato ricavo)
  currency text,
  occurred_on date NOT NULL DEFAULT CURRENT_DATE,
  document_ref text,                         -- rif. documento esterno (DDT fornitore)
  stock_document_id uuid,                    -- testata che ha generato il movimento (§8.7), nullable
  engagement_id uuid REFERENCES public.engagement(id) ON DELETE SET NULL,
  activity_id uuid REFERENCES public.activity(id) ON DELETE SET NULL,
  transfer_group_id uuid,                    -- lega le due righe di un trasferimento (out+in)
  lot_id uuid,                               -- gancio lotti/scadenze (6B); NULL nel minimo
  source_capture_id uuid REFERENCES public.capture(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  client_created_at timestamptz,
  CONSTRAINT stock_movement_pkey PRIMARY KEY (id),
  CONSTRAINT stock_movement_qty_nonzero CHECK (quantity <> 0)
);
CREATE INDEX stock_movement_tenant_id_idx ON public.stock_movement(tenant_id);
CREATE INDEX stock_movement_mat_loc_idx ON public.stock_movement(material_id, location_id);
CREATE INDEX stock_movement_occurred_idx ON public.stock_movement(occurred_on);
CREATE INDEX stock_movement_activity_idx ON public.stock_movement(activity_id);
CREATE INDEX stock_movement_transfer_idx ON public.stock_movement(transfer_group_id);
CREATE INDEX stock_movement_document_idx ON public.stock_movement(stock_document_id);
-- RLS tenant-scoped (§3.1). NIENTE updated_at: immutabile.

-- immutabilità
CREATE OR REPLACE FUNCTION public.stock_movement_is_immutable()
RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'stock_movement è immutabile: usa una rettifica, non modifiche o cancellazioni'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_stock_movement_no_update BEFORE UPDATE ON public.stock_movement
  FOR EACH ROW EXECUTE FUNCTION public.stock_movement_is_immutable();
CREATE TRIGGER trg_stock_movement_no_delete BEFORE DELETE ON public.stock_movement
  FOR EACH ROW EXECUTE FUNCTION public.stock_movement_is_immutable();
```

### 8.5 — Saldo mantenuto + media mobile + fallback costo
```sql
CREATE TABLE public.stock_balance (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.material(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.stock_location(id) ON DELETE CASCADE,
  qty_on_hand   numeric DEFAULT 0 NOT NULL,
  avg_cost      numeric,
  value_on_hand numeric DEFAULT 0 NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT stock_balance_pkey PRIMARY KEY (id),
  CONSTRAINT stock_balance_uk UNIQUE (tenant_id, material_id, location_id)
);
CREATE INDEX stock_balance_tenant_id_idx ON public.stock_balance(tenant_id);
-- RLS tenant-scoped (§3.1).

CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS trigger AS $$
DECLARE b public.stock_balance%ROWTYPE; new_qty numeric; new_value numeric; def_cost numeric;
BEGIN
  SELECT default_cost INTO def_cost FROM public.material WHERE id = NEW.material_id;
  SELECT * INTO b FROM public.stock_balance
   WHERE tenant_id=NEW.tenant_id AND material_id=NEW.material_id AND location_id=NEW.location_id FOR UPDATE;
  IF NOT FOUND THEN
    IF NEW.quantity > 0 THEN new_value := NEW.quantity*COALESCE(NEW.unit_cost,def_cost,0);
    ELSE                     new_value := NEW.quantity*COALESCE(def_cost,0);  -- uscita senza giacenza → listino
    END IF;
    INSERT INTO public.stock_balance(tenant_id,material_id,location_id,qty_on_hand,avg_cost,value_on_hand,updated_at)
    VALUES (NEW.tenant_id,NEW.material_id,NEW.location_id,NEW.quantity,
            CASE WHEN NEW.quantity>0 THEN new_value/NEW.quantity ELSE NULL END,new_value,now());
    RETURN NEW;
  END IF;
  new_qty := b.qty_on_hand + NEW.quantity;
  IF NEW.quantity > 0 THEN new_value := b.value_on_hand + NEW.quantity*COALESCE(NEW.unit_cost,b.avg_cost,def_cost,0);
  ELSE                     new_value := b.value_on_hand + NEW.quantity*COALESCE(b.avg_cost,def_cost,0);
  END IF;
  UPDATE public.stock_balance
     SET qty_on_hand=new_qty, value_on_hand=new_value,
         avg_cost = CASE WHEN new_qty>0 THEN new_value/new_qty ELSE b.avg_cost END, updated_at=now()
   WHERE id=b.id;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_stock_movement_apply AFTER INSERT ON public.stock_movement
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- vista di riconciliazione (verifica/ricostruzione, deve coincidere col saldo)
CREATE OR REPLACE VIEW public.stock_balance_recompute AS
SELECT tenant_id, material_id, location_id, SUM(quantity) AS qty_on_hand
FROM public.stock_movement GROUP BY tenant_id, material_id, location_id;
```

### 8.6 — Consumo su lavoro = movimento (sempre)
Registrare un materiale usato su un'attività = inserire un `stock_movement` `out` con `engagement_id`/`activity_id`. `material_consumption` **deprecata gradualmente** (si scrive su `stock_movement`; il costo materiale per la marginalità si legge da qui). Rimozione in migrazione dedicata futura. Chi non gestisce giacenze: il movimento c'è, il saldo non si mostra come "scorta".

### 8.7 — Documenti (testata → movimenti) + bolla
```sql
INSERT INTO canonical_state (category, code, sequence) VALUES
  ('stock_document_type','receipt',1),('stock_document_type','transfer',2),('stock_document_type','adjustment',3)
ON CONFLICT DO NOTHING;
-- + lookup_value: Carico / Trasferimento / Rettifica

CREATE TABLE public.stock_document (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  type_id uuid NOT NULL REFERENCES public.lookup_value(id),     -- stock_document_type
  number text,                          -- da number_series
  doc_date date NOT NULL DEFAULT CURRENT_DATE,
  source_location_id uuid REFERENCES public.stock_location(id) ON DELETE RESTRICT, -- per transfer/scarico
  dest_location_id   uuid REFERENCES public.stock_location(id) ON DELETE RESTRICT, -- per receipt/transfer
  company_id uuid REFERENCES public.company(id) ON DELETE SET NULL,                 -- fornitore (carico) opzionale
  external_ref text,                    -- n. bolla/DDT fornitore
  status text NOT NULL DEFAULT 'draft', -- 'draft' | 'confirmed' | 'cancelled'
  note text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  CONSTRAINT stock_document_pkey PRIMARY KEY (id)
);
CREATE INDEX stock_document_tenant_id_idx ON public.stock_document(tenant_id);
-- trigger updated_at; RLS tenant-scoped (§3.1).

CREATE TABLE public.stock_document_line (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.stock_document(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.material(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit text NOT NULL,
  unit_cost numeric, unit_price numeric, currency text,
  lot_id uuid,                          -- 6B
  note text,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT stock_document_line_pkey PRIMARY KEY (id)
);
CREATE INDEX stock_document_line_doc_idx ON public.stock_document_line(document_id);
-- RLS tenant-scoped (§3.1).
```
Aggiungere ora la FK del movimento alla testata:
```sql
ALTER TABLE public.stock_movement
  ADD CONSTRAINT stock_movement_document_fkey
  FOREIGN KEY (stock_document_id) REFERENCES public.stock_document(id) ON DELETE SET NULL;
```

**Generazione movimenti alla conferma (logica backend, in transazione):**
- `receipt` (Carico): per ogni riga → `in` (quantità positiva) su `dest_location_id`, con `unit_cost`/`unit_price`/`document_ref`.
- `transfer` (Trasferimento): per ogni riga → coppia con stesso `transfer_group_id`: `out` (negativa) su `source_location_id` + `in` (positiva) su `dest_location_id`. Stampa **bolla/DDT** numerata (`number_series`).
- `adjustment` (Rettifica): per ogni riga → `adjust` (segno secondo differenza), nota obbligatoria.
- Numero documento da `number_series` alla conferma. Stato `draft→confirmed`. Un documento confermato non si rimodifica (le correzioni = nuovo documento), coerente con l'immutabilità del registro.

### 8.8 — Maschere (come e quando)
1. **Scarico da lavoro** (mobile, **senza documento**): nella schermata attività, "materiali usati" (articolo+quantità) → `out` con contesto commessa.
2. **Carico** (documento "Carico"): fornitore opz., n. DDT, data, magazzino destinazione, righe → conferma → `in`.
3. **Trasferimento** (documento "Trasferimento"): da/a magazzino, data, righe → conferma → coppie `out`+`in` → bolla stampabile.
4. **Rettifica** (modulo rapido): articolo, ubicazione, quantità contata/differenza, motivo → `adjust`.
5. **Giacenza** (da `stock_balance`): per ubicazione + totale per magazzino (somma del sottoalbero); evidenza per quantità ≤ 0.
6. **Storico movimenti** per articolo. **Anagrafica articoli** (`sku`, `track_stock`, `default_cost`).

### 8.9 — Allineamento budget/margine
Il costo materiale per il margine (§7.2) si legge da `stock_movement` (`out` su lavoro: `|quantity| × unit_cost`); il ricavo da `unit_price`. (Questo sostituisce la vecchia idea di colonne costo su `material_consumption`.)

---

## 9. MAGAZZINO AVANZATO 6B — ⚠️ PROGETTAZIONE PRIMA (NON costruire)
Lotti/scadenze/FEFO (per articolo), costo FIFO a strati, furgoni completi, caso albergo (punti di consumo → centrale), ubicazioni virtuali (transito/scarti/perdite) e tipi ubicazione, scorte minime/riordino, barcode, ricezione contro ordine d'acquisto, passaggi multipli/in-transito, inventari periodici, distinta base, vendita standalone. **Azione:** nessuna costruzione; prima documento di design + approvazione.

## 10. MANUTENZIONE — ⚠️ PROGETTAZIONE PRIMA (NON costruire)
Ordini di lavoro, preventiva ricorrente "fluttuante" (prossima scadenza dalla chiusura dell'ultimo; nessun accumulo), fermi macchina, asset ad albero, integrazione con ore/magazzino/rapportino. Prima analizzare **cosa mancava al vecchio** ("non si vendeva"). **Azione:** nessuna costruzione; prima design + approvazione.

---

## 11. Ordine di esecuzione e dipendenze

| # | Modulo | Stato | Dipende da |
|---|--------|-------|-----------|
| 1 | Ore (4.1→4.6) | **Costruire ora** | — |
| 2 | Rapportino AI (5) | **Costruire ora** | §4 (ore confermate) |
| 3 | Agenda (6) | **Costruire ora** | motore esistente + §6.2 |
| 4 | Budget/margine (7) | **Costruire ora** | §4.2 (tariffe) + §8 (costo materiale dai movimenti) |
| 5 | Magazzino minimo (8) | **Costruire ora** | catalogo `material` |
| — | Magazzino avanzato (9) | Progettazione prima | sessione di design |
| — | Manutenzione (10) | Progettazione prima | design + §4,§8,§5 |

## 12. Checklist di consegna per ogni step
- [ ] Migrazione `up` additiva + `down` funzionante.
- [ ] RLS (ENABLE+FORCE+policy §3.1/§3.2) su ogni tabella nuova.
- [ ] Trigger `set_updated_at` dove c'è `updated_at`; trigger specifici (lock, immutabilità, saldo, anti-ciclo) dove previsti.
- [ ] Indici su `tenant_id` e FK principali.
- [ ] Seed di sistema (`tenant_id NULL`) per canonici e lookup, idempotenti.
- [ ] Test: schema applica/ripristina pulito; RLS isola i tenant; trigger di blocco/immutabilità/saldo verificati; saldo coincide con `stock_balance_recompute`.
- [ ] Aggiornati i documenti di schema; voci rimandate in `BACKLOG_futuro.md`.
- [ ] Nessuna modifica distruttiva.

---

## APPENDICE — Messaggio di avvio per Claude Code
(È il testo da incollare nella prima interazione, insieme a questo documento. Riportato anche qui per comodità.)

Vedi blocco fornito separatamente nella chat.
