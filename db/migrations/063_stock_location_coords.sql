-- =====================================================================
--  063_stock_location_coords.sql — WMS Fase 1: coordinate ubicazione (bin)
--  Aggiunge le coordinate strutturate a stock_location per le scaffalature:
--  corsia (aisle) × scaffale (rack) × ripiano (level) × posizione (position).
--  Opzionali: chi usa alberi semplici li lascia vuoti. Il generatore massivo
--  (POST /stock/locations/:id/generate) le valorizza e compone il code. Dopo 062.
-- =====================================================================

ALTER TABLE public.stock_location
  ADD COLUMN IF NOT EXISTS aisle    text,
  ADD COLUMN IF NOT EXISTS rack     text,
  ADD COLUMN IF NOT EXISTS level    text,
  ADD COLUMN IF NOT EXISTS position text;

INSERT INTO public.sisuite_migrations (filename) VALUES ('063_stock_location_coords.sql')
  ON CONFLICT DO NOTHING;
