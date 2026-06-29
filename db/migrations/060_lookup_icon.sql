-- =====================================================================
--  060_lookup_icon.sql — Icona configurabile sulle etichette (lookup_value)
--  Aggiunge la colonna `icon` (nome icona libreria, EN/kebab) a lookup_value e
--  al suo override per-tenant. Seed delle icone per i Tipi di sito e di ubicazione,
--  così l'albero li mostra colorati per tipo (icona + color_token). Nullable: le
--  altre categorie restano senza icona. PostgreSQL 16. Dopo 059. Niente BEGIN/COMMIT.
-- =====================================================================

ALTER TABLE public.lookup_value    ADD COLUMN IF NOT EXISTS icon text;
ALTER TABLE public.lookup_override ADD COLUMN IF NOT EXISTS icon text;

-- Tipi di SITO (canonici → icona lucide)
UPDATE public.lookup_value SET icon = CASE canonical
    WHEN 'plant'    THEN 'warehouse'
    WHEN 'building' THEN 'building-2'
    WHEN 'floor'    THEN 'layers'
    WHEN 'room'     THEN 'door-open'
    WHEN 'cabinet'  THEN 'archive'
    WHEN 'pop'      THEN 'antenna'
    WHEN 'area'     THEN 'map'
    ELSE 'map-pin' END
  WHERE category = 'site_kind' AND tenant_id IS NULL;

-- Tipi di UBICAZIONE
UPDATE public.lookup_value SET icon = CASE canonical
    WHEN 'warehouse'    THEN 'warehouse'
    WHEN 'sub_location' THEN 'corner-down-right'
    WHEN 'van'          THEN 'truck'
    ELSE 'package' END
  WHERE category = 'stock_location_kind' AND tenant_id IS NULL;

INSERT INTO public.sisuite_migrations (filename) VALUES ('060_lookup_icon.sql')
  ON CONFLICT DO NOTHING;
