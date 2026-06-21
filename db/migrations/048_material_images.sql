-- =====================================================================
--  048_material_images.sql  — SPEC Identità&Accessi v1.0, BLOCCO J.1
--  Integrità immagini articolo. CLEAN SLATE: l'immagine primaria È
--  material_image WHERE is_primary → la colonna material.primary_image_url è
--  ridondante e si DROPpa. Al massimo UNA primaria per articolo.
--  Applicare DOPO 047. PostgreSQL 16.
-- =====================================================================

ALTER TABLE public.material DROP COLUMN IF EXISTS primary_image_url;

CREATE UNIQUE INDEX IF NOT EXISTS material_image_one_primary_uidx
  ON public.material_image (material_id) WHERE is_primary;

INSERT INTO public.sisuite_migrations (filename) VALUES ('048_material_images.sql')
  ON CONFLICT DO NOTHING;
