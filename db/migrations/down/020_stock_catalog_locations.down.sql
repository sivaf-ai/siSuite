-- DOWN 020 — rimuove catalogo stock + ubicazioni. NON auto-eseguito.
DROP TRIGGER IF EXISTS trg_stock_location_no_cycle ON public.stock_location;
DROP FUNCTION IF EXISTS public.stock_location_no_cycle();
DROP TABLE IF EXISTS public.stock_location;
DROP INDEX IF EXISTS public.material_tenant_sku_uk;
ALTER TABLE public.material
  DROP COLUMN IF EXISTS sku,
  DROP COLUMN IF EXISTS track_stock,
  DROP COLUMN IF EXISTS costing_method,
  DROP COLUMN IF EXISTS tracked_by_lot,
  DROP COLUMN IF EXISTS default_cost;
