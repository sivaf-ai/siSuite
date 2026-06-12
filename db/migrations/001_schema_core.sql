-- =====================================================================
--  CORE SCHEMA — piattaforma gestione attività AI-first, multi-verticale
--  PostgreSQL 16+
--
--  Principio guida: SPINA RELAZIONALE rigida (le entità universali)
--  + STRATO FLESSIBILE in jsonb (gli specifici di ogni verticale)
--  + STRATO SEMANTICO (pgvector, per la ricerca/recupero contestuale).
--
--  Convenzione: nomi tecnici in inglese; i concetti della nostra
--  discussione sono richiamati nei commenti.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "btree_gist";  -- per il vincolo anti-sovrapposizione
CREATE EXTENSION IF NOT EXISTS "vector";      -- pgvector: embedding semantici

-- ---------------------------------------------------------------------
--  ENUM SOLO per ciò che è VERAMENTE universale (la spina).
--  Tutto ciò che dipende dal verticale (tipologie di ore, tipi di
--  attività, generi di asset) resta TEXT, governato dal domain pack a
--  livello applicativo: è la regola "spina rigida, dominio flessibile"
--  che si riflette perfino nel sistema di tipi.
-- ---------------------------------------------------------------------
CREATE TYPE company_type   AS ENUM ('private', 'organization');
CREATE TYPE customer_nature AS ENUM ('episodic', 'recurring');     -- privato vs contratto
CREATE TYPE engagement_type   AS ENUM ('build', 'maintenance');      -- realizzazione vs manutenzione
CREATE TYPE resource_kind   AS ENUM ('person', 'vehicle', 'equipment'); -- persone / mezzi / attrezzature
-- (gli STATI non sono più enum: stato canonico in canonical_state, etichette
--  configurabili dall'utente in lookup_value — vedi più sotto)
-- (i ruoli non sono più un enum: sono gestiti da RBAC — vedi role / user_role)
CREATE TYPE capture_status  AS ENUM ('pending', 'proposed', 'applied', 'rejected');
CREATE TYPE subscription_status AS ENUM ('trial','active','past_due','suspended','cancelled','expired');
CREATE TYPE dependency_type AS ENUM ('FS', 'SS', 'FF', 'SF');  -- finish-to-start (default) e varianti

-- =====================================================================
--  TENANT — l'azienda che USA il software (il piscinaio, la software
--  house, l'installatore di fotovoltaico). Multi-tenant by design.
-- =====================================================================
CREATE TABLE tenant (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    vertical        text NOT NULL,            -- 'pools' | 'software' | 'solar' | ...
    default_locale  text NOT NULL DEFAULT 'it-IT', -- locale di default; supportati: it-IT, en, es-AR
    timezone        text NOT NULL DEFAULT 'Europe/Rome',
    domain_pack     jsonb NOT NULL DEFAULT '{}',  -- dizionario (per-locale), tipologie ore attive,
                                                   -- dimensioni accese/spente, materiali base...
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
--  APP_USER — gli utenti dentro un tenant (titolare, pianificatori, tecnici).
--  I permessi NON stanno qui: arrivano dai ruoli (RBAC, sotto).
--  is_platform_admin = noi, il fornitore SaaS (gestione tenant); il
--  "tenant admin" è semplicemente un utente con un ruolo che concede
--  user:manage e settings:manage.
-- =====================================================================
CREATE TABLE app_user (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    full_name         text NOT NULL,
    email             text,
    phone             text,
    locale            text,                       -- override del default del tenant (it-IT, en, es-AR)
    is_platform_admin boolean NOT NULL DEFAULT false, -- fornitore della piattaforma
    company_id       uuid,                       -- valorizzato = UTENTE ESTERNO legato a quel cliente
                                                   -- (FK aggiunta dopo la tabella company). Vede solo
                                                   -- i progetti del suo cliente, in sola lettura, senza costi.
    active            boolean NOT NULL DEFAULT true,
    attributes        jsonb NOT NULL DEFAULT '{}',
    created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON app_user (tenant_id);

-- =====================================================================
--  RBAC — utente → ruoli → permessi.
--  I PERMESSI (es. 'activity:create', 'engagement:delete', 'user:manage')
--  sono un catalogo definito NEL CODICE (versionato con l'app); qui nel DB
--  stanno i ruoli e le assegnazioni. role.tenant_id NULL = ruolo di sistema
--  (Owner, Planner, Tecnico, Contabile, Sola lettura) seminato di default;
--  un tenant admin può creare ruoli custom componendo i permessi.
--  Le AUTORIZZAZIONI si impongono al livello dati (RLS) e API, mai solo UI.
-- =====================================================================
CREATE TABLE role (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid REFERENCES tenant(id) ON DELETE CASCADE,  -- NULL = ruolo di sistema
    name        text NOT NULL,
    description text,
    is_system   boolean NOT NULL DEFAULT false,
    data_scope  text NOT NULL DEFAULT 'own',  -- visibilità: 'own' | 'team' | 'tenant' | 'customer' (RLS)
    UNIQUE (tenant_id, name)
);

CREATE TABLE role_permission (
    role_id        uuid NOT NULL REFERENCES role(id) ON DELETE CASCADE,
    permission_key text NOT NULL,               -- 'risorsa:azione', es. 'time_entry:read'
    PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE user_role (
    user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    role_id uuid NOT NULL REFERENCES role(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);
CREATE INDEX ON user_role (role_id);

-- =====================================================================
--  CANONICAL_STATE — i valori che IL SISTEMA riconosce e su cui ragiona
--  (fatturazione, agenda, AI), per categoria. Definiti dal sistema, NON
--  dall'utente. Es. ('activity_status','done'), ('priority','urgent').
-- =====================================================================
CREATE TABLE canonical_state (
    category  text NOT NULL,
    code      text NOT NULL,
    sequence  int  NOT NULL DEFAULT 0,
    PRIMARY KEY (category, code)
);

-- =====================================================================
--  LOOKUP_VALUE — le etichette configurabili dall'utente, con metadati di
--  visualizzazione (sigla, colore, icona, ordine). Ogni riga DEVE mappare
--  su uno stato canonico (FK obbligatoria): l'utente può creare più
--  etichette diverse sullo stesso canonico (es. "Archiviata", "Completata"
--  → entrambe canonical 'done'), ma il sistema sa sempre cosa fare.
--  tenant_id NULL = valore di sistema/default. color_token è un RUOLO di
--  colore (success/warning/...), non un hex grezzo: così vive bene in
--  light e dark mode (il tema lo risolve).
-- =====================================================================
CREATE TABLE lookup_value (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid REFERENCES tenant(id) ON DELETE CASCADE,  -- NULL = default di sistema
    category     text NOT NULL,                -- 'activity_status' | 'priority' | ...
    canonical    text NOT NULL,                -- OBBLIGATORIO: a cosa corrisponde per il sistema
    code         text NOT NULL,                -- identificativo stabile della riga
    label        jsonb NOT NULL,               -- per-locale: {"it-IT":..,"en":..,"es-AR":..}
    abbreviation text,                          -- sigla breve per le liste
    color_token  text,                          -- ruolo colore: 'success'|'warning'|'danger'|...
    icon         text,                          -- nome icona da un set curato
    sequence     int  NOT NULL DEFAULT 0,       -- ordinamento / priorità nelle liste
    is_default   boolean NOT NULL DEFAULT false,
    active       boolean NOT NULL DEFAULT true,
    FOREIGN KEY (category, canonical) REFERENCES canonical_state(category, code),
    UNIQUE (tenant_id, category, code)
);
CREATE INDEX ON lookup_value (tenant_id, category);
-- unicità dei codici di sistema (tenant_id NULL non è coperto dall'UNIQUE sopra)
CREATE UNIQUE INDEX lookup_value_system_code_uniq
    ON lookup_value (category, code) WHERE tenant_id IS NULL;

-- =====================================================================
--  NUMBER_SERIES — numeratori generici, una riga per "cosa" si numera.
--  REGOLA: ogni identificativo sequenziale VISIBILE all'utente passa da
--  qui; gli UUID non si mostrano mai in interfaccia.
--
--  Generazione (in transazione, gapless):
--    1) SELECT ... FOR UPDATE della riga (tenant_id, key)
--    2) period = formato di now() secondo reset_period ('2026' o '2026-06' o '')
--    3) se period <> current_period  -> current_period=period, last_number=0
--    4) last_number = last_number + 1
--    5) componi il codice da `format`. Se il documento fa rollback, il
--       numero NON viene consumato (resta senza buchi).
--
--  Placeholder di `format`: {YYYY} {YY} {MM} {SEQ:n}
--  Esempi: '{YYYY}-{SEQ:4}' -> 2026-0042 ; 'FAT{YYYY}{SEQ:4}' -> FAT20260012
--  I numeratori di default sono creati al bootstrap del tenant; l'admin
--  (settings:manage) può modificarne formato e reset per ogni key.
-- =====================================================================
CREATE TABLE number_series (
    tenant_id      uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    key            text NOT NULL,               -- 'engagement' | 'receipt' | 'invoice' | 'ddt' | ...
    format         text NOT NULL DEFAULT '{YYYY}-{SEQ:4}',
    reset_period   text NOT NULL DEFAULT 'yearly', -- 'never' | 'yearly' | 'monthly'
    current_period text NOT NULL DEFAULT '',
    last_number    bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, key)
);

-- =====================================================================
--  TEMPLATE — modelli riusabili (di attività, checklist, fasi, progetto).
--  Il corpo è un BLUEPRINT in jsonb (si applica come un tutto, non si
--  interroga pezzo per pezzo). tenant_id NULL = template di sistema/domain
--  pack; altrimenti custom del tenant. L'AI può generarli, sceglierli e
--  adattarli, e (fast-follow) estrarli dallo storico.
--
--  blueprint (esempio, scope='engagement'):
--   {
--     "phases":[
--       {"name":"Analisi","seq":1,"offset_days":0,
--        "activities":[
--          {"title":"Raccolta requisiti","kind":"analysis",
--           "estimated_minutes":480,"priority":"medium",
--           "checklist":["intervista","documento","validazione"],
--           "depends_on":[]}
--        ]}
--     ]
--   }
--  Gli offset sono RELATIVI (giorni/durate); l'istanziazione calcola le
--  date reali e crea le righe phase/activity/checklist/dependency.
-- =====================================================================
CREATE TABLE template (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid REFERENCES tenant(id) ON DELETE CASCADE,  -- NULL = di sistema/domain pack
    scope       text NOT NULL,               -- 'engagement' | 'phase' | 'activity' | 'checklist'
    vertical    text,                         -- opzionale, per filtrare per verticale
    name        text NOT NULL,
    description text,
    blueprint   jsonb NOT NULL DEFAULT '{}',
    version     int NOT NULL DEFAULT 1,
    active      boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON template (tenant_id, scope);

-- =====================================================================
--  PLAN — catalogo dei piani della PIATTAFORMA (li definiamo noi, uguali
--  per tutti i tenant). Ogni piano porta i suoi entitlements di default
--  (limiti + feature). Il prezzo qui è informativo: il prezzo reale e
--  l'incasso stanno nel provider (Lemon Squeezy / Paddle).
-- =====================================================================
CREATE TABLE plan (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code          text NOT NULL UNIQUE,          -- 'trial' | 'basic' | 'pro'
    name          text NOT NULL,
    billing_model text NOT NULL DEFAULT 'flat',  -- 'flat' | 'per_seat' | 'hybrid' (si parte flat)
    price_month   numeric,                        -- informativo
    currency      text NOT NULL DEFAULT 'EUR',
    entitlements  jsonb NOT NULL DEFAULT '{}',    -- es. {"max_users":5,"verticals":["software"],"ai_quota_month":1000,"features":["templates"]}
    active        boolean NOT NULL DEFAULT true
);

-- =====================================================================
--  SUBSCRIPTION — l'abbonamento/licenza di un tenant. Vale sia per il
--  SaaS sia per l'on-prem (lì current_period_end = scadenza della licenza
--  firmata). Gli entitlements EFFETTIVI = plan.entitlements + overrides.
--  Il gating è al livello API, SEPARATO dall'RBAC (piano vs ruolo).
--  Gli avvisi di scadenza (a 30/7/1 giorni, alla scadenza, in grazia)
--  leggono trial_ends_at / current_period_end e notificano tenant e noi.
--  La quota AI si verifica contando gli eventi `capture` del periodo.
-- =====================================================================
CREATE TABLE subscription (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    plan_id               uuid NOT NULL REFERENCES plan(id),
    status                subscription_status NOT NULL DEFAULT 'trial',
    trial_ends_at         timestamptz,
    current_period_end    timestamptz,            -- rinnovo (SaaS) o scadenza licenza (on-prem)
    cancel_at             timestamptz,
    provider              text,                    -- 'stripe'/SDI (Italia) | 'mercadopago' (Argentina) | MoR (internaz.) | NULL (on-prem)
    provider_ref          text,                    -- id abbonamento lato provider (sync via webhook)
    entitlement_overrides jsonb NOT NULL DEFAULT '{}',
    created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON subscription (tenant_id);
CREATE INDEX ON subscription (current_period_end);


-- =====================================================================
--  COMPANY — anagrafica UNICA delle aziende (e persone): clienti,
--  fornitori, partner... Un'azienda può ricoprire PIÙ ruoli insieme
--  (es. cliente E fornitore) — i ruoli stanno in company_role, non qui.
--  `type` distingue persona fisica (private) da organizzazione.
-- =====================================================================
CREATE TABLE company (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    display_name  text NOT NULL,
    type          company_type NOT NULL DEFAULT 'organization', -- 'private' | 'organization'
    geo           point,                       -- per la pianificazione geografica
    address       text,
    attributes    jsonb NOT NULL DEFAULT '{}', -- P.IVA, codice fiscale, note...
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON company (tenant_id);
CREATE INDEX ON company USING gin (attributes);

-- FK posticipata: app_user.company_id -> company (company è definita qui sopra).
ALTER TABLE app_user
    ADD CONSTRAINT app_user_company_fk
    FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE;
CREATE INDEX ON app_user (company_id);

-- =====================================================================
--  COMPANY_ROLE — i ruoli che un'azienda ricopre. Più righe = più ruoli
--  (cliente + fornitore senza duplicare l'azienda). `role` è canonico
--  (vedi canonical_state categoria 'company_role'): il sistema sa se
--  trattarla come cliente (entra negli engagement) o fornitore (acquisti).
--  customer_nature ha senso solo per il ruolo 'customer'.
-- =====================================================================
CREATE TABLE company_role (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    company_id      uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    role            text NOT NULL,               -- canonico: 'customer'|'supplier'|'partner'|...
    customer_nature customer_nature,             -- 'episodic'|'recurring' (solo per role='customer')
    attributes      jsonb NOT NULL DEFAULT '{}',
    UNIQUE (company_id, role)
);
CREATE INDEX ON company_role (tenant_id);
CREATE INDEX ON company_role (company_id);

-- =====================================================================
--  COMPANY_CONTACT — i contatti (persone) associati a un'azienda,
--  gestiti separatamente dall'azienda stessa.
-- =====================================================================
CREATE TABLE company_contact (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    company_id   uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    full_name    text NOT NULL,
    role_title   text,                            -- ruolo/mansione (es. "Responsabile acquisti")
    email        text,
    phone        text,
    is_primary   boolean NOT NULL DEFAULT false,
    attributes   jsonb NOT NULL DEFAULT '{}',
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON company_contact (tenant_id);
CREATE INDEX ON company_contact (company_id);


-- =====================================================================
--  ASSET — l'oggetto gestito che NASCE da una build e poi vive di
--  manutenzione: la piscina, l'impianto FV, il sistema software installato.
--  Lo strato jsonb porta gli specifici di verticale.
-- =====================================================================
CREATE TABLE asset (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    company_id   uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    kind          text NOT NULL,               -- 'pool' | 'pv_plant' | 'software_system'
    label         text NOT NULL,
    geo           point,
    installed_at  date,
    attributes    jsonb NOT NULL DEFAULT '{}', -- es. {"volume_m3":48,"heating":"heat_pump"}
                                                --     {"kwp":6.5,"panels":16}
                                                --     {"version":"3.2","env":"prod"}
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON asset (tenant_id);
CREATE INDEX ON asset (company_id);
CREATE INDEX ON asset USING gin (attributes);

-- =====================================================================
--  ENGAGEMENT (it. "commessa") — l'ingaggio. Due archetipi (build / maintenance).
--  asset_id è NULL all'inizio di una build: la build PRODUCE l'asset.
-- =====================================================================
CREATE TABLE engagement (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    company_id   uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    asset_id      uuid REFERENCES asset(id) ON DELETE SET NULL,
    code          text NOT NULL,               -- numero umano da number_series key 'engagement' (es. 2026-0042)
    manager_id    uuid REFERENCES app_user(id) ON DELETE SET NULL, -- responsabile/PM (uno, opzionale)
    type          engagement_type NOT NULL,
    title         text NOT NULL,
    status_id     uuid NOT NULL REFERENCES lookup_value(id), -- categoria 'engagement_status' (validata in app)
    started_on    date,
    ended_on      date,
    attributes    jsonb NOT NULL DEFAULT '{}',  -- budget, SLA, riferimenti contratto...
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, code)
);
CREATE INDEX ON engagement (tenant_id);
CREATE INDEX ON engagement (company_id);
CREATE INDEX ON engagement (manager_id);

-- =====================================================================
--  PHASE — il "ramo / modulo / work-package" del progetto. Solo per le
--  commesse build (scavo→collaudo / analisi→deploy / sopralluogo→allaccio).
--  parent_phase_id consente un annidamento LIMITATO (modulo→sotto-modulo)
--  per i progetti grandi; il default è piatto. NON andare in profondità:
--  se servono molti livelli, è il segnale che è un'altra commessa.
-- =====================================================================
CREATE TABLE phase (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    engagement_id   uuid NOT NULL REFERENCES engagement(id) ON DELETE CASCADE,
    parent_phase_id uuid REFERENCES phase(id) ON DELETE CASCADE,  -- annidamento opzionale, poco profondo
    name            text NOT NULL,
    seq             int  NOT NULL,                -- ordine tra fratelli
    planned_start   date,
    planned_end     date,
    status_id       uuid NOT NULL REFERENCES lookup_value(id), -- categoria 'phase_status'
    UNIQUE (engagement_id, parent_phase_id, seq)
);
CREATE INDEX ON phase (tenant_id);
CREATE INDEX ON phase (parent_phase_id);

-- =====================================================================
--  ACTIVITY — l'unità atomica che finisce IN AGENDA (l'intervento).
--  È la SOLA cosa che porta ore, risorse e materiali e compare in agenda.
--  Le "sotto-attività" NON sono entità: o diventano un'altra activity
--  (se vanno schedulate a parte) o vivono come passi nella checklist.
--
--  FISSA vs DINAMICA (senza flag):
--   - scheduled_start VALORIZZATO  -> attività FISSA (pin dell'utente, ancora).
--   - scheduled_start NULL          -> attività DINAMICA: ha solo
--     estimated_minutes; la sua posizione sul calendario la calcola il
--     motore di flusso e NON va riscritta qui (vive in proiezione/cache).
--  VINCOLI TEMPORALI (per le dinamiche): earliest_start (non prima di) e
--  due_by (deve finire entro). Insieme formano una FINESTRA; stesso giorno
--  = "data fissa, ora libera". Il motore rispetta i vincoli e, se una
--  scadenza non è raggiungibile, la segnala invece di violarla in silenzio.
-- =====================================================================
CREATE TABLE activity (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    engagement_id     uuid NOT NULL REFERENCES engagement(id) ON DELETE CASCADE,
    phase_id          uuid REFERENCES phase(id) ON DELETE SET NULL,
    asset_id          uuid REFERENCES asset(id) ON DELETE SET NULL,
    title             text NOT NULL,
    kind              text,                       -- domain-pack (sopralluogo, deploy, addestramento...)
    status_id         uuid NOT NULL REFERENCES lookup_value(id), -- categoria 'activity_status'
    priority_id       uuid REFERENCES lookup_value(id),           -- categoria 'priority' (opzionale)
    estimated_minutes int,                          -- durata stimata (input delle DINAMICHE)
    scheduled_start   timestamptz,                  -- PIN utente: se valorizzato l'attività è FISSA
    scheduled_end     timestamptz,
    earliest_start    timestamptz,                  -- vincolo: non può iniziare prima (earliest-start)
    due_by            timestamptz,                  -- vincolo: deve FINIRE entro (scadenza/deadline)
    -- earliest_start + due_by formano una FINESTRA; stesso giorno = "data fissa, ora libera".
    geo               point,
    checklist         jsonb NOT NULL DEFAULT '[]', -- passi: [{"text":"svuota","done":false}, ...]
    attributes        jsonb NOT NULL DEFAULT '{}',
    created_at        timestamptz NOT NULL DEFAULT now(),
    CHECK (earliest_start IS NULL OR due_by IS NULL OR earliest_start <= due_by)
);
CREATE INDEX ON activity (tenant_id);
CREATE INDEX ON activity (engagement_id);
CREATE INDEX ON activity (scheduled_start);

-- =====================================================================
--  ACTIVITY_DEPENDENCY — il GRAFO delle dipendenze (NON un albero: una
--  rete DAG). Alimenta il solver di pianificazione. Finish-to-start è
--  il caso normale (non impermeabilizzi prima di scavare).
-- =====================================================================
CREATE TABLE activity_dependency (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    predecessor_id  uuid NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
    successor_id    uuid NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
    type            dependency_type NOT NULL DEFAULT 'FS',
    lag_minutes     int NOT NULL DEFAULT 0,      -- attesa/anticipo tra le due (lead/lag)
    CHECK (predecessor_id <> successor_id),
    UNIQUE (predecessor_id, successor_id)
);
CREATE INDEX ON activity_dependency (tenant_id);
CREATE INDEX ON activity_dependency (predecessor_id);
CREATE INDEX ON activity_dependency (successor_id);

-- =====================================================================
--  RESOURCE — persone, mezzi, attrezzature. Una persona-risorsa può
--  essere legata a un app_user.
-- =====================================================================
CREATE TABLE resource (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    kind          resource_kind NOT NULL,
    label         text NOT NULL,
    user_id       uuid REFERENCES app_user(id) ON DELETE SET NULL, -- solo per kind='person'
    attributes    jsonb NOT NULL DEFAULT '{}', -- skill, targa, capacità, costo orario...
    active        boolean NOT NULL DEFAULT true
);
CREATE INDEX ON resource (tenant_id);

-- =====================================================================
--  ACTIVITY_RESOURCE — assegnazione risorsa→attività.
--  Qui vive il VINCOLO ANTI-DOPPIA-PRENOTAZIONE: una stessa risorsa
--  (es. l'escavatore) non può stare su due intervalli sovrapposti.
--  È il caso perfetto del "perché serve il relazionale".
-- =====================================================================
CREATE TABLE activity_resource (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    activity_id   uuid NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
    resource_id   uuid NOT NULL REFERENCES resource(id) ON DELETE CASCADE,
    planned_from  timestamptz,
    planned_to    timestamptz,
    CONSTRAINT no_double_booking EXCLUDE USING gist (
        resource_id  WITH =,
        tstzrange(planned_from, planned_to) WITH &&
    ) WHERE (planned_from IS NOT NULL AND planned_to IS NOT NULL)
);
CREATE INDEX ON activity_resource (tenant_id);
CREATE INDEX ON activity_resource (activity_id);

-- =====================================================================
--  MATERIAL — catalogo materiali/prodotti del tenant
-- =====================================================================
CREATE TABLE material (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    name          text NOT NULL,
    unit          text NOT NULL,               -- sacco, m³, pezzo, ora...
    attributes    jsonb NOT NULL DEFAULT '{}',
    UNIQUE (tenant_id, name)
);

-- =====================================================================
--  CAPTURE — l'input grezzo in linguaggio naturale (PROVENIENZA).
--  È la tabella-cardine dell'AI-first: si scrive PRIMA di qualunque
--  interpretazione. Conserva audio, testo, l'estrazione proposta e
--  l'embedding per il recupero semantico.
-- =====================================================================
CREATE TABLE capture (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    user_id       uuid NOT NULL REFERENCES app_user(id) ON DELETE SET NULL,
    channel       text NOT NULL DEFAULT 'voice', -- voice | text
    audio_url     text,                          -- object storage (S3...), NON nel DB
    raw_text      text NOT NULL,                 -- la trascrizione integrale
    extraction    jsonb,                         -- intento strutturato PROPOSTO (pre-commit)
    status        capture_status NOT NULL DEFAULT 'pending',
    embedding     vector(1536),                  -- ricerca semantica sui lavori passati
    created_at    timestamptz NOT NULL DEFAULT now(),
    processed_at  timestamptz
);
CREATE INDEX ON capture (tenant_id);
CREATE INDEX ON capture USING hnsw (embedding vector_cosine_ops);

-- =====================================================================
--  TIME_ENTRY — registrazione ore. La typology è TEXT perché dipende
--  dal verticale (sviluppo/assistenza/addestramento | costruzione/manut.).
--  source_capture_id lega il dato alla frase da cui è nato.
-- =====================================================================
CREATE TABLE time_entry (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    engagement_id       uuid REFERENCES engagement(id) ON DELETE SET NULL,
    activity_id       uuid REFERENCES activity(id) ON DELETE SET NULL,
    resource_id       uuid REFERENCES resource(id) ON DELETE SET NULL, -- chi ha lavorato
    typology          text NOT NULL,            -- domain-pack
    minutes           int  NOT NULL CHECK (minutes > 0),
    occurred_on       date NOT NULL,
    notes             text,
    source_capture_id uuid REFERENCES capture(id) ON DELETE SET NULL,
    created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON time_entry (tenant_id);
CREATE INDEX ON time_entry (engagement_id);
CREATE INDEX ON time_entry (occurred_on);

-- =====================================================================
--  MATERIAL_CONSUMPTION — consumi di materiale su un'attività.
-- =====================================================================
CREATE TABLE material_consumption (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    activity_id       uuid REFERENCES activity(id) ON DELETE SET NULL,
    material_id       uuid NOT NULL REFERENCES material(id) ON DELETE RESTRICT,
    quantity          numeric NOT NULL CHECK (quantity > 0),
    unit              text NOT NULL,
    occurred_on       date NOT NULL,
    source_capture_id uuid REFERENCES capture(id) ON DELETE SET NULL,
    created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON material_consumption (tenant_id);
CREATE INDEX ON material_consumption (activity_id);

-- =====================================================================
--  MULTI-TENANCY — abilita la Row-Level Security su ogni tabella e
--  isola i dati per tenant. (Policy d'esempio sulla tabella activity;
--  va replicata su tutte. Il tenant corrente si imposta a inizio
--  transazione: SET app.current_tenant = '...').
-- =====================================================================
ALTER TABLE activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON activity
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
-- ... ripetere ENABLE RLS + POLICY per le altre tabelle con tenant_id.

-- =====================================================================
--  SEED (PROPOSTA, da confermare) — ruoli di sistema per il verticale
--  software. I grant dei permessi (role_permission) sono applicati al
--  bootstrap dell'app dal catalogo di permessi definito NEL CODICE;
--  qui seminiamo solo i ruoli e il loro data_scope.
--
--  Nota: UNIQUE(tenant_id, name) NON garantisce l'unicità tra i ruoli di
--  sistema (tenant_id NULL, e NULL != NULL in un UNIQUE). Serve un indice
--  parziale dedicato.
-- =====================================================================
CREATE UNIQUE INDEX role_system_name_uniq ON role (name) WHERE tenant_id IS NULL;

INSERT INTO role (tenant_id, name, description, is_system, data_scope) VALUES
  (NULL, 'Owner',        'Amministratore del tenant (tutti i permessi)', true, 'tenant'),
  (NULL, 'Planner',      'Pianifica progetti e assegna risorse',         true, 'tenant'),
  (NULL, 'Tecnico',      'Esegue e rendiconta le proprie attività',      true, 'own'),
  (NULL, 'Contabile',    'Consultazione ed export amministrativo',       true, 'tenant'),
  (NULL, 'Sola lettura', 'Accesso in sola lettura',                      true, 'tenant'),
  (NULL, 'Cliente esterno', 'Utente esterno: vede solo i progetti del proprio cliente, in sola lettura, senza costi', true, 'customer');

-- =====================================================================
--  SEED (PROPOSTA) — stati canonici riconosciuti dal sistema.
-- =====================================================================
INSERT INTO canonical_state (category, code, sequence) VALUES
  ('activity_status',  'planned',     1),
  ('activity_status',  'in_progress', 2),
  ('activity_status',  'done',        3),
  ('activity_status',  'cancelled',   4),
  ('engagement_status','open',        1),
  ('engagement_status','active',      2),
  ('engagement_status','closed',      3),
  ('engagement_status','cancelled',   4),
  ('phase_status',     'pending',     1),
  ('phase_status',     'active',      2),
  ('phase_status',     'done',        3),
  ('priority',         'low',         1),
  ('priority',         'medium',      2),
  ('priority',         'high',        3),
  ('priority',         'urgent',      4);

-- ruoli aziendali riconosciuti dal sistema (un'azienda può averne più d'uno)
INSERT INTO canonical_state (category, code, sequence) VALUES
  ('company_role', 'customer', 1),
  ('company_role', 'supplier', 2),
  ('company_role', 'partner',  3);

-- =====================================================================
--  SEED (PROPOSTA) — etichette di default (di sistema, tenant_id NULL),
--  una per canonico. Il tenant può rinominarle, ricolorarle o crearne
--  altre sullo stesso canonico. color_token = ruolo (risolto dal tema).
-- =====================================================================
INSERT INTO lookup_value (tenant_id, category, canonical, code, label, abbreviation, color_token, sequence, is_default) VALUES
  -- activity_status
  (NULL,'activity_status','planned',    'planned',    '{"it-IT":"Pianificata","en":"Planned","es-AR":"Planificada"}','PIA','neutral',1,true),
  (NULL,'activity_status','in_progress','in_progress','{"it-IT":"In corso","en":"In progress","es-AR":"En curso"}',  'COR','info',   2,true),
  (NULL,'activity_status','done',       'done',       '{"it-IT":"Completata","en":"Done","es-AR":"Finalizada"}',     'FIN','success',3,true),
  (NULL,'activity_status','cancelled',  'cancelled',  '{"it-IT":"Annullata","en":"Cancelled","es-AR":"Cancelada"}', 'ANN','danger', 4,true),
  -- engagement_status
  (NULL,'engagement_status','open',     'open',       '{"it-IT":"Aperta","en":"Open","es-AR":"Abierta"}',           'APE','neutral',1,true),
  (NULL,'engagement_status','active',   'active',     '{"it-IT":"Attiva","en":"Active","es-AR":"Activa"}',          'ATT','info',   2,true),
  (NULL,'engagement_status','closed',   'closed',     '{"it-IT":"Chiusa","en":"Closed","es-AR":"Cerrada"}',         'CHI','success',3,true),
  (NULL,'engagement_status','cancelled','cancelled',  '{"it-IT":"Annullata","en":"Cancelled","es-AR":"Cancelada"}', 'ANN','danger', 4,true),
  -- phase_status
  (NULL,'phase_status','pending',       'pending',    '{"it-IT":"Da iniziare","en":"Pending","es-AR":"Pendiente"}', 'DAI','neutral',1,true),
  (NULL,'phase_status','active',        'active',     '{"it-IT":"Attiva","en":"Active","es-AR":"Activa"}',          'ATT','info',   2,true),
  (NULL,'phase_status','done',          'done',       '{"it-IT":"Completata","en":"Done","es-AR":"Finalizada"}',     'FIN','success',3,true),
  -- priority
  (NULL,'priority','low',    'low',    '{"it-IT":"Bassa","en":"Low","es-AR":"Baja"}',       'B','neutral',1,true),
  (NULL,'priority','medium', 'medium', '{"it-IT":"Media","en":"Medium","es-AR":"Media"}',   'M','info',   2,true),
  (NULL,'priority','high',   'high',   '{"it-IT":"Alta","en":"High","es-AR":"Alta"}',       'A','warning',3,true),
  (NULL,'priority','urgent', 'urgent', '{"it-IT":"Urgente","en":"Urgent","es-AR":"Urgente"}','U','danger', 4,true);

-- =====================================================================
--  SEED (PROPOSTA) — piani della piattaforma. Prezzi illustrativi; il
--  prezzo reale vive nel provider. La quota AI è il tetto che protegge
--  i margini senza fatturazione a consumo.
-- =====================================================================
INSERT INTO plan (code, name, billing_model, price_month, currency, entitlements) VALUES
  ('trial','Prova', 'flat',   0, 'EUR', '{"max_users":3,"verticals":["software"],"ai_quota_month":300,"features":["templates"]}'),
  ('basic','Basic', 'flat',  49, 'EUR', '{"max_users":5,"verticals":["software"],"ai_quota_month":1000,"features":["templates"]}'),
  ('pro',  'Pro',   'flat', 149, 'EUR', '{"max_users":20,"verticals":["software"],"ai_quota_month":5000,"features":["templates","external_portal"]}');


-- #####################################################################
-- #  PATCH PRE-SVILUPPO (v0.2) — da applicare in coda allo schema base.
-- #  Siamo PRE-DEPLOY: nessun DB in produzione, quindi gli ALTER in fondo
-- #  sono leciti e si eseguono dopo che le tabelle esistono.
-- #
-- #  Contenuto:
-- #   (1) Disponibilità e orari delle risorse  -> serve al motore di flusso
-- #   (2) updated_at + audit (created_by/updated_by/applied_by)
-- #   (3) Soft-delete/archive + cascate pericolose rese sicure
-- #   (4) Idempotenza / offline (ID generati dal client)
-- #   (F) capture multimodale (aggancio foto, cheap ora)
-- #
-- #  NOTA sui nomi dei vincoli: i FK inline assumono il nome di default di
-- #  PostgreSQL "{tabella}_{colonna}_fkey". Se nel tuo ambiente differiscono,
-- #  verificali con \d <tabella> e adatta i DROP CONSTRAINT.
-- #####################################################################

-- =====================================================================
--  (1) ORARI E DISPONIBILITÀ DELLE RISORSE
--  Il motore di flusso colloca le attività dinamiche DENTRO l'orario di
--  lavoro e SALTANDO le indisponibilità. Senza questi dati non può lavorare.
--   - tenant.working_hours: il template settimanale standard (ora LOCALE,
--     si interpreta con tenant.timezone). Formato: per giorno, lista di
--     intervalli [inizio,fine]. Giorno assente o lista vuota = non si lavora.
--   - resource.working_hours: override per singola risorsa (NULL = usa il
--     tenant). Es. un part-time o un mezzo disponibile solo certi giorni.
--   - resource_availability: le ECCEZIONI puntuali (ferie, malattia, mezzo
--     in officina = 'unavailable'; straordinari = 'available').
--  Disponibilità EFFETTIVA = (resource.working_hours ?? tenant.working_hours)
--     - intervalli 'unavailable'  + intervalli 'available'.
-- =====================================================================
ALTER TABLE tenant ADD COLUMN working_hours jsonb NOT NULL DEFAULT
  '{"mon":[["08:00","13:00"],["14:00","18:00"]],
    "tue":[["08:00","13:00"],["14:00","18:00"]],
    "wed":[["08:00","13:00"],["14:00","18:00"]],
    "thu":[["08:00","13:00"],["14:00","18:00"]],
    "fri":[["08:00","13:00"],["14:00","18:00"]],
    "sat":[], "sun":[]}';

ALTER TABLE resource ADD COLUMN working_hours jsonb;  -- override; NULL = usa il tenant

CREATE TABLE resource_availability (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES tenant(id)   ON DELETE CASCADE,
    resource_id  uuid NOT NULL REFERENCES resource(id) ON DELETE CASCADE,
    kind         text NOT NULL DEFAULT 'unavailable',  -- 'unavailable' (ferie, fermo) | 'available' (straordinario)
    starts_at    timestamptz NOT NULL,
    ends_at      timestamptz NOT NULL,
    reason       text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);
CREATE INDEX ON resource_availability (tenant_id);
CREATE INDEX ON resource_availability (resource_id);
-- query per intervallo (il motore chiede "questa risorsa è libera tra X e Y?")
CREATE INDEX ON resource_availability USING gist (resource_id, tstzrange(starts_at, ends_at));

-- =====================================================================
--  (2) updated_at + AUDIT
--  Sapere QUANDO e DA CHI è cambiata una riga è oro su dati fatturabili e
--  si perde per sempre se aggiunto dopo. Il log d'audit completo resta in
--  backlog; le colonne e il trigger no.
--   - updated_at: su tutte le tabelle mutabili, con trigger automatico.
--   - created_by/updated_by: sulle tabelle di business operative. Per le
--     modifiche applicate dall'AI = l'utente per conto del quale agisce
--     (l'AI agisce sempre dentro i permessi di quell'utente).
--   - capture.applied_by: chi ha CONFERMATO/applicato l'estrazione proposta
--     (può differire da user_id, chi ha creato la cattura sul campo).
-- =====================================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- updated_at + trigger su tutte le tabelle mutabili
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'engagement','phase','activity','activity_dependency',
    'company','company_role','company_contact','asset',
    'resource','resource_availability','activity_resource',
    'material','time_entry','material_consumption','capture',
    'lookup_value','template','role','plan','subscription','app_user'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

-- created_by / updated_by sulle tabelle di business operative
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'engagement','phase','activity','company','asset',
    'resource','material','time_entry','material_consumption','template'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES app_user(id) ON DELETE SET NULL', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES app_user(id) ON DELETE SET NULL', t);
  END LOOP;
END $$;

-- chi ha applicato l'estrazione proposta (≠ user_id che ha creato la cattura)
ALTER TABLE capture ADD COLUMN applied_by uuid REFERENCES app_user(id) ON DELETE SET NULL;

-- =====================================================================
--  (3) SOFT-DELETE / ARCHIVE + CASCATE SICURE
--  I dati di business non si cancellano, si ARCHIVIANO. Le query applicative
--  filtrano archived_at IS NULL per default. Le cascate che avrebbero
--  azzerato storia fatturabile diventano RESTRICT (obbligano ad archiviare).
--  NB: template e resource hanno già 'active' (sospensione temporanea);
--  archived_at è la rimozione logica, semantica diversa.
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['company','asset','engagement','resource','material','template']
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS archived_at timestamptz', t);
  END LOOP;
END $$;

-- cancellare un'azienda NON deve azzerare commesse/asset/storia: si archivia.
ALTER TABLE engagement DROP CONSTRAINT engagement_company_id_fkey,
    ADD  CONSTRAINT engagement_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE RESTRICT;
ALTER TABLE asset DROP CONSTRAINT asset_company_id_fkey,
    ADD  CONSTRAINT asset_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE RESTRICT;
-- l'utente esterno legato a un cliente: se il cliente sparisce, scollega
-- l'account, non distruggerlo.
ALTER TABLE app_user DROP CONSTRAINT app_user_company_fk,
    ADD  CONSTRAINT app_user_company_fk
    FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE SET NULL;

-- =====================================================================
--  (4) IDEMPOTENZA / OFFLINE
--  Il tecnico crea catture/ore/consumi OFFLINE che risalgono dopo. Contratto:
--   - Gli ID delle entità nate sul campo (capture, time_entry,
--     material_consumption, activity) sono UUID GENERATI DAL CLIENT: la PK è
--     stabile prima del sync. Il DEFAULT gen_random_uuid() resta per le
--     creazioni lato server.
--   - Idempotenza scritture: INSERT ... ON CONFLICT (id) DO NOTHING/UPDATE
--     (un re-sync con lo stesso id è un no-op, niente duplicati).
--   - Idempotenza operazioni: capture.status (pending -> applied) impedisce
--     la doppia applicazione della stessa estrazione.
--   - client_created_at: l'istante di cattura SUL DISPOSITIVO (per ordinare
--     gli eventi offline); created_at resta l'istante di ingestione server.
-- =====================================================================
ALTER TABLE capture              ADD COLUMN client_created_at timestamptz;
ALTER TABLE time_entry           ADD COLUMN client_created_at timestamptz;
ALTER TABLE material_consumption ADD COLUMN client_created_at timestamptz;

-- =====================================================================
--  (F) CAPTURE MULTIMODALE — aggancio foto (cheap ora, pipeline in backlog).
--  Le scelte di schema sulla cardine `capture` condizionano il supporto
--  foto domani; le facciamo ORA che stiamo già toccando la tabella, per
--  non rifare una migrazione sulla tabella più delicata.
--   - audio_url -> media_url: un media generico, non solo audio.
--   - media_type: il MIME ('audio/m4a' | 'image/jpeg' | ...).
--   - raw_text NULLABLE: per la foto il testo arriva dalla vision/OCR, async,
--     e all'inizio può non esserci.
--   - channel resta TEXT (già estensibile): valori 'voice' | 'text' | 'photo'.
-- =====================================================================
ALTER TABLE capture RENAME COLUMN audio_url TO media_url;
ALTER TABLE capture ADD COLUMN media_type text;
ALTER TABLE capture ALTER COLUMN raw_text DROP NOT NULL;
COMMENT ON COLUMN capture.channel IS 'voice | text | photo (estendibile, resta TEXT)';
COMMENT ON COLUMN capture.media_url IS 'object storage (S3/R2/MinIO), NON nel DB; audio o immagine secondo channel';

-- =====================================================================
--  (AUTH) SEAM VERSO L'AUTENTICAZIONE — provider scelto: Supabase Auth (GoTrue),
--  open-source e self-hostable (gira on-prem con le stesse immagini Docker).
--  PRINCIPIO: il provider risponde solo a "chi sei" (authN); il "cosa puoi
--  fare / cosa vedi" resta NOSTRO (RBAC + RLS + entitlement). Così il provider
--  è SOSTITUIBILE (via di fuga documentata: Keycloak, se servirà SSO enterprise).
--   - auth_user_id: l'id dell'identità esterna verificata (subject del JWT
--     emesso da GoTrue). UNIQUE, NULLABLE (utenti esterni o non ancora
--     provisionati). NESSUNA credenziale vive in app_user.
--  Mappatura a runtime: JWT verificato (chiave pubblica, anche OFFLINE)
--     -> auth_user_id -> app_user -> tenant + ruoli + entitlement.
-- =====================================================================
ALTER TABLE app_user ADD COLUMN auth_user_id text UNIQUE;  -- subject dell'identità esterna (GoTrue); NULL = esterno/non provisionato
COMMENT ON COLUMN app_user.auth_user_id IS 'Identità esterna verificata (Supabase Auth/GoTrue). Nessuna credenziale in app_user; authZ resta su RBAC+RLS.';

-- #####################################################################
-- #  FINE PATCH PRE-SVILUPPO v0.2
-- #####################################################################
