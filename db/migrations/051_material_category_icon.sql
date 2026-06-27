-- =====================================================================
--  051_material_category_icon.sql
--  Icona per le categorie articolo: nome di un'icona della libreria SVG
--  pubblica (lucide), così si adatta a dimensione e colore. Additiva.
--  Applicare DOPO 050. PostgreSQL 16.
-- =====================================================================

ALTER TABLE public.material_category ADD COLUMN IF NOT EXISTS icon text;

INSERT INTO public.sisuite_migrations (filename) VALUES ('051_material_category_icon.sql')
  ON CONFLICT DO NOTHING;
