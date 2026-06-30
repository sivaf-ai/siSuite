-- =====================================================================
--  065_stock_location_capacity.sql — WMS Fase 2: capacità/spazio per ubicazione
--  Ogni ubicazione (bin) può avere un LIMITE di capacità secondo un criterio:
--    - 'volume'   → m³ totali (qty × volume unitario articolo)
--    - 'weight'   → kg totali (qty × peso unitario articolo)
--    - 'quantity' → numero pezzi totali (somma qty_on_hand)
--  capacity_max = valore massimo; capacity_enforce = blocca i carichi che lo
--  superano (true) oppure solo avviso/% riempimento (false, default).
--  La % riempimento si calcola da stock_balance + material.volume/weight.
--  Aggiunge anche material.volume (m³) — il peso (weight) esiste già da 042.
--  UDC/posti-pallet: fuori scope (manca il modello "unità di carico"). Dopo 064.
-- =====================================================================

ALTER TABLE public.stock_location
  ADD COLUMN IF NOT EXISTS capacity_kind    text,        -- NULL = nessun limite | 'volume' | 'weight' | 'quantity'
  ADD COLUMN IF NOT EXISTS capacity_max     numeric,     -- valore massimo nel criterio scelto
  ADD COLUMN IF NOT EXISTS capacity_enforce boolean NOT NULL DEFAULT false;  -- true = blocca il superamento

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_location_capacity_kind_chk') THEN
    ALTER TABLE public.stock_location
      ADD CONSTRAINT stock_location_capacity_kind_chk
      CHECK (capacity_kind IS NULL OR capacity_kind IN ('volume', 'weight', 'quantity'));
  END IF;
END $$;

-- volume unitario (m³) dell'articolo, per il criterio 'volume' (il peso esiste già: material.weight)
ALTER TABLE public.material
  ADD COLUMN IF NOT EXISTS volume numeric;   -- m³ per unità

INSERT INTO public.sisuite_migrations (filename) VALUES ('065_stock_location_capacity.sql')
  ON CONFLICT DO NOTHING;
