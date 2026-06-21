-- =====================================================================
--  042_material_complete.sql  — SPEC v1.1, BLOCCO B
--  Articolo (material) completo + categorie gerarchiche, immagini multiple
--  (MinIO), più fornitori per articolo.
--
--  CLEAN SLATE: i campi che la SPEC vuole come COLONNE e che la migrazione 040
--  aveva (erroneamente) messo in attributes via field_definition vengono qui
--  rimossi dai field_definition di sistema e promossi a colonne reali.
--  Non si tocca il file 040 (immutabile): si DELETE-ano le righe superate.
--  Applicare DOPO 041. PostgreSQL 16.
-- =====================================================================

-- ── B.1 material: colonne nuove ─────────────────────────────────────
ALTER TABLE public.material
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'article',  -- 'article'|'service'|'kit'
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS category_id uuid,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS manufacturer text,
  ADD COLUMN IF NOT EXISTS mpn text,
  ADD COLUMN IF NOT EXISTS default_sale_price numeric,
  ADD COLUMN IF NOT EXISTS tax_rate_id uuid REFERENCES public.tax_rate(id),
  ADD COLUMN IF NOT EXISTS reorder_point numeric,
  ADD COLUMN IF NOT EXISTS safety_stock numeric,
  ADD COLUMN IF NOT EXISTS min_qty numeric,
  ADD COLUMN IF NOT EXISTS max_qty numeric,
  ADD COLUMN IF NOT EXISTS lead_time_days integer,
  ADD COLUMN IF NOT EXISTS preferred_vendor_id uuid REFERENCES public.company(id),
  ADD COLUMN IF NOT EXISTS weight numeric,
  ADD COLUMN IF NOT EXISTS weight_unit text,
  ADD COLUMN IF NOT EXISTS dimensions jsonb,
  ADD COLUMN IF NOT EXISTS is_returnable boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS shelf_life_days integer,
  ADD COLUMN IF NOT EXISTS primary_image_url text,
  ADD COLUMN IF NOT EXISTS note text;

-- ── B.2 material_category (gerarchica) ──────────────────────────────
CREATE TABLE public.material_category (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
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
CREATE INDEX material_category_tenant_idx ON public.material_category (tenant_id);
CREATE INDEX material_category_parent_idx ON public.material_category (parent_id);

DROP TRIGGER IF EXISTS material_category_set_updated_at ON public.material_category;
CREATE TRIGGER material_category_set_updated_at
  BEFORE UPDATE ON public.material_category FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.material_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_category FORCE ROW LEVEL SECURITY;
CREATE POLICY material_category_tenant ON public.material_category
  USING (public.app_is_platform_admin() OR tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.material_category TO sisuite_app;

-- FK material.category_id ora che la tabella esiste
ALTER TABLE public.material
  ADD CONSTRAINT material_category_fk FOREIGN KEY (category_id) REFERENCES public.material_category(id);
CREATE INDEX material_barcode_idx ON public.material (tenant_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX material_category_idx ON public.material (tenant_id, category_id);
CREATE UNIQUE INDEX IF NOT EXISTS material_tenant_code_uk ON public.material (tenant_id, code) WHERE code IS NOT NULL;

-- ── B.3 material_image (foto multiple, MinIO) ───────────────────────
CREATE TABLE public.material_image (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    material_id uuid NOT NULL REFERENCES public.material(id) ON DELETE CASCADE,
    object_key text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    sequence integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    PRIMARY KEY (id)
);
CREATE INDEX material_image_material_idx ON public.material_image (material_id);
CREATE INDEX material_image_tenant_idx ON public.material_image (tenant_id);

ALTER TABLE public.material_image ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_image FORCE ROW LEVEL SECURITY;
CREATE POLICY material_image_tenant ON public.material_image
  USING (public.app_is_platform_admin() OR tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.material_image TO sisuite_app;

-- ── B.4 material_supplier (più fornitori per articolo) ──────────────
CREATE TABLE public.material_supplier (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
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
CREATE INDEX material_supplier_material_idx ON public.material_supplier (material_id);
CREATE INDEX material_supplier_tenant_idx ON public.material_supplier (tenant_id);

DROP TRIGGER IF EXISTS material_supplier_set_updated_at ON public.material_supplier;
CREATE TRIGGER material_supplier_set_updated_at
  BEFORE UPDATE ON public.material_supplier FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.material_supplier ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_supplier FORCE ROW LEVEL SECURITY;
CREATE POLICY material_supplier_tenant ON public.material_supplier
  USING (public.app_is_platform_admin() OR tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.material_supplier TO sisuite_app;

-- ── CLEAN SLATE: rimuovo i field_definition material superati (ora colonne) ──
-- 040 (sistema, vertical NULL): diventano colonne reali. Restano come attributes
-- solo i veri long-tail (abc_class, warranty_months, currency, hs_code,
-- country_origin, default_location).
DELETE FROM public.field_definition
 WHERE tenant_id IS NULL AND entity = 'material'
   AND key IN ('barcode','supplier','sale_price','vat_rate','image_url','max_stock',
               'reorder_qty','shelf_life_days','weight_kg','dimensions','notes');
-- 004 (vertical software): brand → colonna; part_number → mpn colonna.
DELETE FROM public.field_definition
 WHERE tenant_id IS NULL AND entity = 'material' AND vertical = 'software'
   AND key IN ('brand','part_number');

INSERT INTO public.sisuite_migrations (filename) VALUES ('042_material_complete.sql')
  ON CONFLICT DO NOTHING;
