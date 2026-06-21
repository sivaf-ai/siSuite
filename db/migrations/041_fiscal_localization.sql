-- =====================================================================
--  041_fiscal_localization.sql  — SPEC Anagrafiche/Fiscale v1.1, BLOCCO A
--  Localizzazione fiscale multi-paese (SENZA emissione documenti) + indirizzi
--  strutturati jsonb country-driven.
--
--  CLEAN SLATE: software nuovo, nessun dato. Le colonne/seed legacy errati si
--  DROPpano direttamente (niente shim di compatibilità).
--
--  NB sulla NUMERAZIONE: la SPEC indicava V038 come prima libera (schema a 037).
--  Nel frattempo altre chat hanno occupato 038 (list_preset), 039 (saved_report)
--  e 040 (material_resource_fields). Per non rinumerare/toccare migrazioni di
--  altre chat, questo set parte da 041. Vedi DONE_A.md.
--
--  Convenzione campi fiscali: field_definition con entity='company' e
--  country IS NOT NULL → vivono in company.fiscal_attributes (non in attributes).
--  Gli indirizzi (entity='address', country-driven) sono renderizzati da un
--  unico AddressField su legal_address/operational_address.
--  Applicare DOPO 040. PostgreSQL 16.
-- =====================================================================

-- ── A.1 field_definition: asse PAESE ────────────────────────────────
ALTER TABLE public.field_definition ADD COLUMN IF NOT EXISTS country char(2);
COMMENT ON COLUMN public.field_definition.country IS
  'Scope paese del campo (IT/AR/...). NULL = vale per tutti i paesi. Si combina con vertical.';
CREATE INDEX IF NOT EXISTS field_definition_scope_idx
  ON public.field_definition (entity, country, vertical) WHERE active;

-- L'unicità di sistema deve includere il paese: stesse chiavi possono ripetersi
-- per paesi diversi (es. address.provincia esiste sia IT sia AR).
DROP INDEX IF EXISTS public.field_definition_system_uniq;
CREATE UNIQUE INDEX field_definition_system_uniq
  ON public.field_definition (vertical, entity, key, country) WHERE tenant_id IS NULL;

-- ── A.2 catalogo imposte country-scoped ─────────────────────────────
CREATE TABLE public.tax_rate (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,                       -- NULL = riga di sistema (seed); valorizzato = override tenant
    country char(2) NOT NULL,
    code text NOT NULL,                   -- 'IT22','IT10','AR21','AR_EXENTO'...
    label text NOT NULL,                  -- 'IVA 22%'
    percent numeric NOT NULL,             -- 22, 10, 21, 10.5, 0
    is_default boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (tenant_id, country, code)
);
CREATE INDEX tax_rate_country_idx ON public.tax_rate (country) WHERE active;

DROP TRIGGER IF EXISTS tax_rate_set_updated_at ON public.tax_rate;
CREATE TRIGGER tax_rate_set_updated_at
  BEFORE UPDATE ON public.tax_rate FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: catalogo con righe di sistema (tenant_id NULL) visibili a tutti, come lookup_value
ALTER TABLE public.tax_rate ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rate FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tax_rate_select ON public.tax_rate;
DROP POLICY IF EXISTS tax_rate_modify ON public.tax_rate;
CREATE POLICY tax_rate_select ON public.tax_rate FOR SELECT
  USING (public.app_is_platform_admin() OR tenant_id IS NULL OR tenant_id = public.app_current_tenant());
CREATE POLICY tax_rate_modify ON public.tax_rate FOR ALL
  USING (public.app_is_platform_admin() OR tenant_id = public.app_current_tenant())
  WITH CHECK (public.app_is_platform_admin() OR tenant_id = public.app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tax_rate TO sisuite_app;

-- Seed IT (sistema)
INSERT INTO public.tax_rate (tenant_id, country, code, label, percent, is_default) VALUES
 (NULL,'IT','IT22','IVA 22%',22,true),
 (NULL,'IT','IT10','IVA 10%',10,false),
 (NULL,'IT','IT5','IVA 5%',5,false),
 (NULL,'IT','IT4','IVA 4%',4,false),
 (NULL,'IT','IT0_ESENTE','Esente art.10',0,false),
 (NULL,'IT','IT0_NI','Non imponibile',0,false)
ON CONFLICT (tenant_id, country, code) DO NOTHING;

-- Seed AR (predisposizione)
INSERT INTO public.tax_rate (tenant_id, country, code, label, percent, is_default) VALUES
 (NULL,'AR','AR21','IVA 21%',21,true),
 (NULL,'AR','AR105','IVA 10,5%',10.5,false),
 (NULL,'AR','AR27','IVA 27%',27,false),
 (NULL,'AR','AR_EXENTO','Exento',0,false),
 (NULL,'AR','AR_NO_GRAVADO','No gravado',0,false)
ON CONFLICT (tenant_id, country, code) DO NOTHING;

-- ── A.3 company: colonne universali (no campi italiani cablati) ──────
ALTER TABLE public.company
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS country char(2) NOT NULL DEFAULT 'IT',
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS tax_id_kind text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS default_price_list_id uuid REFERENCES public.price_list(id),
  ADD COLUMN IF NOT EXISTS legal_address jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS operational_address jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS fiscal_attributes jsonb DEFAULT '{}'::jsonb NOT NULL;
CREATE INDEX IF NOT EXISTS company_tax_id_idx ON public.company (tenant_id, tax_id) WHERE tax_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS company_tenant_code_uk ON public.company (tenant_id, code) WHERE code IS NOT NULL;

-- CLEAN SLATE: la vecchia colonna address (text) non serve più.
ALTER TABLE public.company DROP COLUMN IF EXISTS address;

-- ── A.4 campi fiscali country-driven → company.fiscal_attributes ─────
-- CLEAN SLATE: rimuovo i vecchi field_definition company cablati (004): i fiscali
-- diventano country-scoped (qui sotto), gli indirizzi vanno in entity='address'
-- (V046), website/vat sono ora COLONNE.
DELETE FROM public.field_definition
 WHERE tenant_id IS NULL AND entity = 'company'
   AND key IN ('vat_number','tax_code','pec','sdi_code','street','city','province','postal_code','website','notes');

INSERT INTO public.field_definition
  (tenant_id, vertical, country, entity, key, label, data_type, required, options, validation, group_key, sequence) VALUES
 -- IT
 (NULL, NULL, 'IT', 'company', 'sdi_code',
    '{"it-IT":"Codice SDI","en":"SDI code","es-AR":"Código SDI"}','text', false, NULL,
    '{"pattern":"^[A-Z0-9]{7}$","maxLength":7}', 'fiscal', 1),
 (NULL, NULL, 'IT', 'company', 'pec',
    '{"it-IT":"PEC","en":"Certified email","es-AR":"PEC"}','email', false, NULL, NULL, 'fiscal', 2),
 (NULL, NULL, 'IT', 'company', 'regime_fiscale',
    '{"it-IT":"Regime fiscale","en":"Tax regime","es-AR":"Régimen fiscal"}','select', false,
    '[{"value":"RF01","label":{"it-IT":"RF01 Ordinario","en":"RF01","es-AR":"RF01"}},{"value":"RF02","label":{"it-IT":"RF02 Minimi","en":"RF02","es-AR":"RF02"}},{"value":"RF04","label":{"it-IT":"RF04 Agricoltura","en":"RF04","es-AR":"RF04"}},{"value":"RF19","label":{"it-IT":"RF19 Forfettario","en":"RF19","es-AR":"RF19"}}]',
    NULL, 'fiscal', 3),
 (NULL, NULL, 'IT', 'company', 'is_pa',
    '{"it-IT":"Pubblica Amministrazione","en":"Public Administration","es-AR":"Administración Pública"}','boolean', false, NULL, NULL, 'fiscal', 4),
 (NULL, NULL, 'IT', 'company', 'tax_code',
    '{"it-IT":"Codice fiscale","en":"Tax code","es-AR":"Código fiscal"}','text', false, NULL,
    '{"pattern":"^([A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST]{1}[0-9LMNPQRSTUV]{2}[A-Z]{1}[0-9LMNPQRSTUV]{3}[A-Z]{1}|[0-9]{11})$","maxLength":16}', 'fiscal', 5),
 -- AR
 (NULL, NULL, 'AR', 'company', 'condicion_iva',
    '{"it-IT":"Condición IVA","en":"VAT condition","es-AR":"Condición frente al IVA"}','select', false,
    '[{"value":"responsable_inscripto","label":{"it-IT":"Responsable Inscripto","en":"Responsable Inscripto","es-AR":"Responsable Inscripto"}},{"value":"monotributo","label":{"it-IT":"Monotributo","en":"Monotributo","es-AR":"Monotributo"}},{"value":"exento","label":{"it-IT":"Exento","en":"Exento","es-AR":"Exento"}},{"value":"consumidor_final","label":{"it-IT":"Consumidor Final","en":"Consumidor Final","es-AR":"Consumidor Final"}},{"value":"no_categorizado","label":{"it-IT":"No Categorizado","en":"No Categorizado","es-AR":"No Categorizado"}},{"value":"sujeto_exterior","label":{"it-IT":"Sujeto del Exterior","en":"Foreign Subject","es-AR":"Sujeto del Exterior"}}]',
    NULL, 'fiscal', 1),
 (NULL, NULL, 'AR', 'company', 'tipo_documento',
    '{"it-IT":"Tipo documento","en":"Document type","es-AR":"Tipo de documento"}','select', false,
    '[{"value":"CUIT","label":{"it-IT":"CUIT","en":"CUIT","es-AR":"CUIT"}},{"value":"CUIL","label":{"it-IT":"CUIL","en":"CUIL","es-AR":"CUIL"}},{"value":"DNI","label":{"it-IT":"DNI","en":"DNI","es-AR":"DNI"}}]',
    NULL, 'fiscal', 2),
 (NULL, NULL, 'AR', 'company', 'punto_venta',
    '{"it-IT":"Punto de venta","en":"Point of sale","es-AR":"Punto de venta"}','text', false, NULL, NULL, 'fiscal', 3)
ON CONFLICT (vertical, entity, key, country) WHERE tenant_id IS NULL DO NOTHING;

-- ── A.6 site: indirizzo a jsonb (clean slate) + company_id nullable ──
ALTER TABLE public.site DROP COLUMN IF EXISTS address;
ALTER TABLE public.site ADD COLUMN IF NOT EXISTS address jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE public.site ALTER COLUMN company_id DROP NOT NULL;

-- ── A.7 tenant: paese di casa ───────────────────────────────────────
ALTER TABLE public.tenant ADD COLUMN IF NOT EXISTS default_country char(2) NOT NULL DEFAULT 'IT';

INSERT INTO public.sisuite_migrations (filename) VALUES ('041_fiscal_localization.sql')
  ON CONFLICT DO NOTHING;
