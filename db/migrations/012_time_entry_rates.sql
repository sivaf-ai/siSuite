-- =====================================================================
--  012 — MODULO ORE §4.2: tariffa/costo FOTOGRAFATI nella riga + LISTINO.
--  Scelta utente (2026-06-15): listino dedicato `rate_card` CON fallback al
--  Minimo (campi tariffa su risorsa/commessa + default tenant). La
--  risoluzione (backend resolveRates) sceglie la riga di listino più
--  specifica e valida alla data; se assente, applica la catena Minimo:
--    bill_rate = override commessa -> tariffa risorsa -> default tenant
--    cost_rate = costo orario risorsa -> default tenant
--  Il valore risolto si CONGELA in time_entry alla registrazione.
--  Additivo + idempotente.
-- =====================================================================

-- (a) colonne "fotografate" sulla riga ore
ALTER TABLE public.time_entry
  ADD COLUMN IF NOT EXISTS cost_rate numeric,
  ADD COLUMN IF NOT EXISTS bill_rate numeric,
  ADD COLUMN IF NOT EXISTS currency  text,
  ADD COLUMN IF NOT EXISTS billable  boolean DEFAULT true NOT NULL;

-- (b) MINIMO/fallback: campi tariffa via field_definition (config-over-code).
--  resource.hourly_cost (costo) esiste già da 008. Aggiungo:
--   - resource.bill_rate         (tariffa di vendita della risorsa)
--   - engagement.bill_rate_override (tariffa concordata di commessa)
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, unit, group_key, sequence) VALUES
 (NULL, NULL, 'resource',   'bill_rate',          '{"it-IT":"Tariffa oraria (vendita)","en":"Hourly bill rate","es-AR":"Tarifa por hora"}', 'money', false, '€/h', 'economics', 51),
 (NULL, NULL, 'engagement', 'bill_rate_override', '{"it-IT":"Tariffa oraria concordata","en":"Agreed hourly rate","es-AR":"Tarifa acordada"}', 'money', false, '€/h', 'economics', 51)
ON CONFLICT DO NOTHING;

-- (c) default tariffa a livello tenant (ultimo anello della catena Minimo)
ALTER TABLE public.tenant
  ADD COLUMN IF NOT EXISTS default_cost_rate numeric,
  ADD COLUMN IF NOT EXISTS default_bill_rate numeric,
  ADD COLUMN IF NOT EXISTS default_currency  text DEFAULT 'EUR';

-- (d) LISTINO dedicato (multilivello). RLS tenant-scoped (§3.1).
--  Specificità (più specifica vince): commessa+risorsa+tipologia > ... > generica.
--  Validità temporale opzionale (valid_from/valid_to NULL = sempre valida).
CREATE TABLE IF NOT EXISTS public.rate_card (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  resource_id   uuid REFERENCES public.resource(id)   ON DELETE CASCADE,  -- NULL = tutte le risorse
  engagement_id uuid REFERENCES public.engagement(id) ON DELETE CASCADE,  -- NULL = non specifico a commessa
  typology_id   uuid REFERENCES public.lookup_value(id),                  -- NULL = tutte le tipologie
  valid_from date,
  valid_to   date,
  cost_rate numeric,
  bill_rate numeric,
  currency  text,
  note text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  CONSTRAINT rate_card_pkey PRIMARY KEY (id),
  CONSTRAINT rate_card_dates_check CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);
CREATE INDEX IF NOT EXISTS rate_card_tenant_id_idx ON public.rate_card(tenant_id);
CREATE INDEX IF NOT EXISTS rate_card_resource_idx ON public.rate_card(resource_id);
CREATE INDEX IF NOT EXISTS rate_card_engagement_idx ON public.rate_card(engagement_id);

ALTER TABLE public.rate_card ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.rate_card FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rate_card_select ON public.rate_card;
DROP POLICY IF EXISTS rate_card_insert ON public.rate_card;
DROP POLICY IF EXISTS rate_card_modify ON public.rate_card;
CREATE POLICY rate_card_select ON public.rate_card FOR SELECT
  USING (public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()));
CREATE POLICY rate_card_insert ON public.rate_card FOR INSERT
  WITH CHECK (tenant_id = public.app_current_tenant());
CREATE POLICY rate_card_modify ON public.rate_card FOR UPDATE
  USING (tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());

DROP TRIGGER IF EXISTS trg_rate_card_updated ON public.rate_card;
CREATE TRIGGER trg_rate_card_updated BEFORE UPDATE ON public.rate_card
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
