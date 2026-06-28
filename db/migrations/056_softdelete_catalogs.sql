-- =====================================================================
--  056_softdelete_catalogs.sql — Soft-delete su cataloghi UM/IVA/Competenze
--  unit_of_measure, tax_rate, skill finora avevano solo `active` (no archivio).
--  Aggiungiamo archived_at/archived_by per abilitare la gestione soft-delete
--  standard (vista archiviati + ripristino + eliminazione definitiva + audit).
--  Le righe di SISTEMA (tenant_id IS NULL) restano non archiviabili dal tenant
--  (la RLS limita già UPDATE/DELETE alle righe del tenant). PostgreSQL 16. Dopo 055.
-- =====================================================================

ALTER TABLE public.unit_of_measure ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.unit_of_measure ADD COLUMN IF NOT EXISTS archived_by uuid;
ALTER TABLE public.tax_rate        ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.tax_rate        ADD COLUMN IF NOT EXISTS archived_by uuid;
ALTER TABLE public.skill           ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.skill           ADD COLUMN IF NOT EXISTS archived_by uuid;

INSERT INTO public.sisuite_migrations (filename) VALUES ('056_softdelete_catalogs.sql')
  ON CONFLICT DO NOTHING;
