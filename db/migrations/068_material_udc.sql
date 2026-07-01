-- =====================================================================
--  068_material_udc.sql — WMS: capacità per POSTI-PALLET / UDC (unità di carico).
--  material.units_per_udc = quante unità dell'articolo stanno in una UDC/pallet.
--  Il criterio di capacità 'udc' misura l'occupato come Σ(qty / units_per_udc)
--  (pallet frazionari); il massimo del bin è il n° di posti-pallet. Dopo 067.
-- =====================================================================

ALTER TABLE public.material
  ADD COLUMN IF NOT EXISTS units_per_udc numeric;   -- pezzi per unità di carico (pallet)

-- estende il criterio di capacità delle ubicazioni per includere 'udc'
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_location_capacity_kind_chk') THEN
    ALTER TABLE public.stock_location DROP CONSTRAINT stock_location_capacity_kind_chk;
  END IF;
  ALTER TABLE public.stock_location
    ADD CONSTRAINT stock_location_capacity_kind_chk
    CHECK (capacity_kind IS NULL OR capacity_kind IN ('volume', 'weight', 'quantity', 'udc'));
END $$;

INSERT INTO public.sisuite_migrations (filename) VALUES ('068_material_udc.sql')
  ON CONFLICT DO NOTHING;
