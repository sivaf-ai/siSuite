-- =====================================================================
--  067_pick_list_line_location.sql — WMS: ubicazione di prelievo a livello di
--  RIGA nelle pick list (come i DDT). Ogni riga può prelevare da un bin diverso;
--  se NULL eredita la source della testata. Dopo 066.
-- =====================================================================

ALTER TABLE public.pick_list_line
  ADD COLUMN IF NOT EXISTS source_location_id uuid REFERENCES public.stock_location(id) ON DELETE RESTRICT;

INSERT INTO public.sisuite_migrations (filename) VALUES ('067_pick_list_line_location.sql')
  ON CONFLICT DO NOTHING;
