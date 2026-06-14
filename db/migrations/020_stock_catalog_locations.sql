-- =====================================================================
--  020 — MAGAZZINO MINIMO 6A §8.1+§8.2: catalogo articoli + ubicazioni.
--  material: campi di stock (sku, track_stock, costing_method, default_cost).
--  stock_location: albero magazzini/ubicazioni con anti-ciclo. Seed di un
--  "Magazzino principale" per ogni tenant esistente. RLS tenant-scoped §3.1.
--  Additivo + idempotente.
-- =====================================================================

-- ── §8.1 catalogo articoli ──────────────────────────────────────────
ALTER TABLE public.material
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS track_stock    boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS costing_method text DEFAULT 'avg' NOT NULL,  -- 'avg' (minimo) | 'fifo' (6B)
  ADD COLUMN IF NOT EXISTS tracked_by_lot boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS default_cost   numeric;                       -- costo di listino (fallback)
CREATE UNIQUE INDEX IF NOT EXISTS material_tenant_sku_uk
  ON public.material(tenant_id, sku) WHERE sku IS NOT NULL;

-- ── §8.2 magazzini/ubicazioni (albero) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_location (
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
CREATE INDEX IF NOT EXISTS stock_location_tenant_id_idx ON public.stock_location(tenant_id);
CREATE INDEX IF NOT EXISTS stock_location_parent_id_idx ON public.stock_location(parent_id);

DROP TRIGGER IF EXISTS trg_stock_location_updated ON public.stock_location;
CREATE TRIGGER trg_stock_location_updated BEFORE UPDATE ON public.stock_location
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.stock_location ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.stock_location FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_location_select ON public.stock_location;
DROP POLICY IF EXISTS stock_location_insert ON public.stock_location;
DROP POLICY IF EXISTS stock_location_modify ON public.stock_location;
CREATE POLICY stock_location_select ON public.stock_location FOR SELECT
  USING (public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()));
CREATE POLICY stock_location_insert ON public.stock_location FOR INSERT
  WITH CHECK (tenant_id = public.app_current_tenant());
CREATE POLICY stock_location_modify ON public.stock_location FOR UPDATE
  USING (tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());

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
DROP TRIGGER IF EXISTS trg_stock_location_no_cycle ON public.stock_location;
CREATE TRIGGER trg_stock_location_no_cycle BEFORE INSERT OR UPDATE ON public.stock_location
  FOR EACH ROW EXECUTE FUNCTION public.stock_location_no_cycle();

-- Seed: un "Magazzino principale" per ogni tenant che non ne ha uno di default.
-- (Idempotente. La migrazione gira come superuser → RLS bypassata.)
INSERT INTO public.stock_location (tenant_id, parent_id, name, kind, holds_stock, is_default)
SELECT t.id, NULL, 'Magazzino principale', 'warehouse', true, true
FROM public.tenant t
WHERE NOT EXISTS (SELECT 1 FROM public.stock_location sl WHERE sl.tenant_id = t.id AND sl.is_default = true);
