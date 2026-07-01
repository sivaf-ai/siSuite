-- =====================================================================
--  066_wms_location_code_path.sql — WMS professionale: codice ubicazione
--  UNIVOCO PER PADRE (non più per tenant) + funzione "catena" (path) +
--  ubicazioni a livello di RIGA documento (default dal master).
--
--  (1) Il codice locale (es. 01-01-A) si RIPETE tra scaffali diversi: è la
--      CATENA (scaffale-padre + codice) a renderlo univoco, come nei WMS
--      leader. Quindi l'unicità del `code` è per (tenant, parent, code),
--      non globale. Per i magazzini (parent NULL) resta unico per tenant.
--  (2) stock_location_path(id): la catena leggibile "Magazzino › Scaffale › Bin"
--      per mostrare SEMPRE dove si preleva/versa (mai il solo codice ambiguo).
--  (3) stock_document_line.source/dest_location_id: ogni RIGA può avere la
--      sua ubicazione di prelievo/versamento; il master resta come default.
--  Dopo 065.
-- =====================================================================

-- (1) unicità del codice PER PADRE (COALESCE(parent_id, tenant_id): i magazzini
--     radice restano unici per tenant; i bin sono unici tra i fratelli).
DROP INDEX IF EXISTS public.stock_location_tenant_code_uk;
CREATE UNIQUE INDEX IF NOT EXISTS stock_location_parent_code_uk
  ON public.stock_location (tenant_id, COALESCE(parent_id, tenant_id), code)
  WHERE code IS NOT NULL AND archived_at IS NULL;

-- (2) catena leggibile dell'ubicazione (dalla radice alla foglia). SECURITY INVOKER
--     (default) → la RLS del chiamante si applica: nessun leak cross-tenant.
CREATE OR REPLACE FUNCTION public.stock_location_path(loc uuid) RETURNS text AS $$
  WITH RECURSIVE up AS (
    SELECT id, parent_id, name, 0 AS lvl FROM public.stock_location WHERE id = loc
    UNION ALL
    SELECT s.id, s.parent_id, s.name, up.lvl + 1
      FROM public.stock_location s JOIN up ON s.id = up.parent_id
  )
  SELECT string_agg(name, ' › ' ORDER BY lvl DESC) FROM up;
$$ LANGUAGE sql STABLE;

-- (3) ubicazione di prelievo/versamento a livello di RIGA (default dal master).
ALTER TABLE public.stock_document_line
  ADD COLUMN IF NOT EXISTS source_location_id uuid REFERENCES public.stock_location(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS dest_location_id   uuid REFERENCES public.stock_location(id) ON DELETE RESTRICT;

INSERT INTO public.sisuite_migrations (filename) VALUES ('066_wms_location_code_path.sql')
  ON CONFLICT DO NOTHING;
