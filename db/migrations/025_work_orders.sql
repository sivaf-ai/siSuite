-- =====================================================================
--  025_work_orders.sql
--  ORDINATIVI FTTH (i "ticket" di attivazione).
--
--  Modello dei leader del field service (Salesforce / Dynamics /
--  ServiceTitan): l'ordine di lavoro e' un oggetto di PRIMA CLASSE, con
--  righe figlie (apparati da installare) e visite separate (agenda).
--
--  Gerarchia siSuite:
--    engagement (commessa = gestore/area)  ->  work_order (1 attivazione)
--    work_order -> activity (la visita pianificata in agenda)
--
--  PRIVACY by design: i dati dell'utente finale (PII) stanno in una
--  tabella SEPARATA (work_order_subject), per poterli mascherare,
--  scope-are e cancellare a fine pratica senza toccare lo storico tecnico.
--  (POWERCOM teme i contenziosi privacy dei gestori: e' una leva, non un costo.)
--
--  Applicare DOPO 024. PostgreSQL 16.
-- =====================================================================

-- 1) ORDINATIVO
CREATE TABLE public.work_order (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    engagement_id       uuid NOT NULL REFERENCES public.engagement(id) ON DELETE CASCADE,
    code                text NOT NULL,                       -- number_series key 'work_order'
    operator_company_id uuid REFERENCES public.company(id) ON DELETE SET NULL,  -- il gestore (Sirti, Open Fiber...)
    operator_order_id   text,                                -- ID univoco rilasciato dal gestore (es. "Id Fenice")
    status_id           uuid NOT NULL REFERENCES public.lookup_value(id),       -- category 'work_order_status'
    assigned_resource_id uuid REFERENCES public.resource(id) ON DELETE SET NULL,-- squadra/tecnico
    activity_id         uuid REFERENCES public.activity(id) ON DELETE SET NULL, -- visita in agenda
    address             text,                                -- indirizzo di attivazione (non PII di per se')
    geo                 point,
    scheduled_on        date,
    completed_on        date,
    attributes          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- campi fibra extra via field_definition
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    archived_at         timestamptz,
    client_created_at   timestamptz,                         -- per cattura offline/mobile
    UNIQUE (tenant_id, code),
    -- l'ID del gestore e' unico PER gestore (evita doppioni in import CSV)
    UNIQUE (tenant_id, operator_company_id, operator_order_id)
);

CREATE INDEX ON public.work_order (tenant_id);
CREATE INDEX ON public.work_order (engagement_id);
CREATE INDEX ON public.work_order (status_id);
CREATE INDEX ON public.work_order (assigned_resource_id);

COMMENT ON TABLE public.work_order IS
  'Ordinativo / ticket di attivazione FTTH. 1 commessa = N ordinativi. PII dell''intestatario in work_order_subject.';

CREATE TRIGGER work_order_set_updated_at
  BEFORE UPDATE ON public.work_order FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) INTESTATARIO (PII isolata) — 1:1 con l'ordinativo
CREATE TABLE public.work_order_subject (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    work_order_id   uuid NOT NULL UNIQUE REFERENCES public.work_order(id) ON DELETE CASCADE,
    full_name       text,
    phone           text,
    phone_alt       text,
    email           text,
    fiscal_code     text,
    address         text,
    attributes      jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid
);

CREATE INDEX ON public.work_order_subject (tenant_id);

COMMENT ON TABLE public.work_order_subject IS
  'Dati personali dell''utente finale (PII). Tabella isolata: mascheramento + permesso ''pii.read'' + retention gestiti a livello applicativo. RLS = solo tenant.';

CREATE TRIGGER work_order_subject_set_updated_at
  BEFORE UPDATE ON public.work_order_subject FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) APPARATI/MATERIALI PIANIFICATI da installare (la "distinta" dell'ordinativo)
CREATE TABLE public.work_order_item (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    work_order_id   uuid NOT NULL REFERENCES public.work_order(id) ON DELETE CASCADE,
    material_id     uuid NOT NULL REFERENCES public.material(id) ON DELETE RESTRICT,
    planned_qty     numeric NOT NULL DEFAULT 1 CHECK (planned_qty > 0),
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.work_order_item (tenant_id);
CREATE INDEX ON public.work_order_item (work_order_id);

COMMENT ON TABLE public.work_order_item IS
  'Apparati/materiali pianificati su un ordinativo (es. 1 ONT, 1 borchia, 1 splitter). I seriali EFFETTIVAMENTE installati sono in stock_serial_unit.';

-- 4) Collego il seriale installato all'ordinativo (parco installato by-order)
ALTER TABLE public.stock_serial_unit
    ADD COLUMN IF NOT EXISTS work_order_id      uuid REFERENCES public.work_order(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS work_order_item_id uuid REFERENCES public.work_order_item(id) ON DELETE SET NULL;

CREATE INDEX ON public.stock_serial_unit (work_order_id);

-- 5) Taggo i movimenti/consumi con l'ordinativo (lo scarico genera i movimenti)
ALTER TABLE public.stock_movement
    ADD COLUMN IF NOT EXISTS work_order_id uuid REFERENCES public.work_order(id) ON DELETE SET NULL;
ALTER TABLE public.material_consumption
    ADD COLUMN IF NOT EXISTS work_order_id uuid REFERENCES public.work_order(id) ON DELETE SET NULL;

-- 6) RLS — isolamento per tenant
ALTER TABLE public.work_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order FORCE ROW LEVEL SECURITY;
CREATE POLICY work_order_tenant ON public.work_order
  USING (tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());

ALTER TABLE public.work_order_subject ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_subject FORCE ROW LEVEL SECURITY;
-- NB: il gating fine sui PII (permesso 'pii.read', mascheramento) e' applicativo.
-- A DB isoliamo per tenant; la UI nasconde, l'API verifica il permesso.
CREATE POLICY work_order_subject_tenant ON public.work_order_subject
  USING (tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());

ALTER TABLE public.work_order_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_item FORCE ROW LEVEL SECURITY;
CREATE POLICY work_order_item_tenant ON public.work_order_item
  USING (tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());

INSERT INTO public.sisuite_migrations (filename) VALUES ('025_work_orders.sql')
  ON CONFLICT DO NOTHING;
