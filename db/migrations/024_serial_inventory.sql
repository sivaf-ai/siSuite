-- =====================================================================
--  024_serial_inventory.sql
--  Magazzino a SERIALI: ogni apparato (ONT, HUB6, borchia, splitter...)
--  e' un pezzo unico tracciato con il suo numero di serie.
--
--  Differenza dal LOTTO (gia' predisposto con material.tracked_by_lot /
--  *.lot_id, ancora senza tabella): il seriale identifica UNA unita'
--  (quantita' = 1), il lotto un gruppo. La fibra chiede seriali.
--
--  Pattern: seriale ad alto valore / con garanzia / assistenza
--  (cfr. leader: NetSuite, Dynamics, Salesforce Field Service).
--
--  Applicare DOPO lo stato 023. PostgreSQL 16.
-- =====================================================================

-- 1) Flag a livello di articolo: gestito a seriale?
ALTER TABLE public.material
    ADD COLUMN IF NOT EXISTS tracked_by_serial boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.material.tracked_by_serial IS
  'true = ogni unita'' di questo articolo ha un seriale univoco (apparati FTTH). Indipendente da tracked_by_lot.';

-- 2) Registro delle unita' serializzate (il "parco" fisico, pezzo per pezzo)
CREATE TABLE public.stock_serial_unit (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    material_id         uuid NOT NULL REFERENCES public.material(id) ON DELETE RESTRICT,
    serial              text NOT NULL,
    status              text NOT NULL DEFAULT 'in_stock'
                          CHECK (status IN ('in_stock','assigned','installed','faulty','returned','retired')),
    -- dov'e' ORA, quando non e' installato:
    location_id         uuid REFERENCES public.stock_location(id) ON DELETE SET NULL,
    holder_resource_id  uuid REFERENCES public.resource(id) ON DELETE SET NULL,   -- furgone/squadra che lo detiene
    -- dove e' finito, quando e' installato (parco installato del cliente):
    installed_company_id uuid REFERENCES public.company(id) ON DELETE SET NULL,
    installed_asset_id  uuid REFERENCES public.asset(id) ON DELETE SET NULL,      -- diventa customer asset
    installed_on        date,
    -- segreti dell'apparato (es. password ONT): cifrati a livello applicativo
    -- PRIMA di arrivare qui. Mai in chiaro. Accesso gated da permesso 'serial.secret.read'.
    secrets             jsonb NOT NULL DEFAULT '{}'::jsonb,
    note                text,
    source_movement_id  uuid REFERENCES public.stock_movement(id) ON DELETE SET NULL,
    attributes          jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    archived_at         timestamptz,
    UNIQUE (tenant_id, material_id, serial)
);

CREATE INDEX ON public.stock_serial_unit (tenant_id);
CREATE INDEX ON public.stock_serial_unit (material_id);
CREATE INDEX ON public.stock_serial_unit (status);
CREATE INDEX ON public.stock_serial_unit (location_id);
CREATE INDEX ON public.stock_serial_unit (installed_company_id);

COMMENT ON TABLE public.stock_serial_unit IS
  'Unita'' serializzata singola (qty=1). Ciclo: in_stock -> assigned -> installed (parco installato) / faulty / returned / retired.';

-- updated_at automatico (riusa la funzione esistente)
CREATE TRIGGER stock_serial_unit_set_updated_at
  BEFORE UPDATE ON public.stock_serial_unit
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) RLS: isolamento per tenant (la barriera fine sui "secrets" e' applicativa)
ALTER TABLE public.stock_serial_unit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_serial_unit FORCE ROW LEVEL SECURITY;

CREATE POLICY stock_serial_unit_tenant ON public.stock_serial_unit
  USING (tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());

-- nota: track del filename per il runner delle migrazioni siSuite
INSERT INTO public.sisuite_migrations (filename) VALUES ('024_serial_inventory.sql')
  ON CONFLICT DO NOTHING;
