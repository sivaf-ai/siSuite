-- =====================================================================
--  054_unique_exclude_archived.sql — FASE 1.2 (correzione)
--  Regola canonica: un record ARCHIVIATO (soft-delete, archived_at) NON deve
--  bloccare l'inserimento di un nuovo record con la stessa chiave naturale.
--  Bug osservato: creato e poi cancellato (archiviato) l'articolo «Prova»,
--  ricrearlo dava "esiste già" perché gli UNIQUE includevano le righe archiviate.
--  Qui rendiamo tutti gli unique "chiave naturale" PARZIALI su
--  `WHERE archived_at IS NULL` (più l'eventuale "... IS NOT NULL").
--
--  Alcuni unique sono CONSTRAINT (UNIQUE in CREATE TABLE), altri INDEX
--  (CREATE UNIQUE INDEX): per ognuno proviamo a togliere ENTRAMBI (uno è no-op).
--  Eccezione: stock_serial_unit (serie = identità fisica) → NON modificato.
--  PostgreSQL 16. Dopo 053.
-- =====================================================================

DO $mig$
DECLARE
  -- name : table : new index def (colonne+WHERE)
  specs text[] := ARRAY[
    'material_tenant_id_name_key : material : (tenant_id, name) WHERE archived_at IS NULL',
    'material_tenant_name_uk     : material : (tenant_id, name) WHERE archived_at IS NULL',
    'material_tenant_sku_uk      : material : (tenant_id, sku) WHERE sku IS NOT NULL AND archived_at IS NULL',
    'material_tenant_code_uk     : material : (tenant_id, code) WHERE code IS NOT NULL AND archived_at IS NULL',
    'company_tenant_code_uk      : company : (tenant_id, code) WHERE code IS NOT NULL AND archived_at IS NULL',
    'engagement_tenant_id_code_key : engagement : (tenant_id, code) WHERE archived_at IS NULL',
    'engagement_tenant_code_uk     : engagement : (tenant_id, code) WHERE archived_at IS NULL',
    'work_order_tenant_id_code_key : work_order : (tenant_id, code) WHERE archived_at IS NULL',
    'work_order_tenant_code_uk     : work_order : (tenant_id, code) WHERE archived_at IS NULL',
    'work_order_principal_ref_uk   : work_order : (tenant_id, principal_company_id, principal_order_ref) WHERE principal_order_ref IS NOT NULL AND archived_at IS NULL',
    'purchase_order_tenant_number_uk : purchase_order : (tenant_id, number) WHERE number IS NOT NULL AND archived_at IS NULL',
    'stock_location_tenant_code_uk   : stock_location : (tenant_id, code) WHERE code IS NOT NULL AND archived_at IS NULL',
    'saved_report_uq : saved_report : (tenant_id, user_id, entity, name) WHERE archived_at IS NULL'
  ];
  spec text; parts text[]; nm text; tbl text; defn text;
BEGIN
  FOREACH spec IN ARRAY specs LOOP
    parts := string_to_array(spec, ':');
    nm := btrim(parts[1]); tbl := btrim(parts[2]); defn := btrim(parts[3]);
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', tbl, nm);
    EXECUTE format('DROP INDEX IF EXISTS public.%I', nm);
  END LOOP;

  -- (ri)crea gli unique parziali col nome "canonico" (i vecchi *_key sono sostituiti dagli *_uk)
  CREATE UNIQUE INDEX IF NOT EXISTS material_tenant_name_uk ON public.material (tenant_id, name) WHERE archived_at IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS material_tenant_sku_uk ON public.material (tenant_id, sku) WHERE sku IS NOT NULL AND archived_at IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS material_tenant_code_uk ON public.material (tenant_id, code) WHERE code IS NOT NULL AND archived_at IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS company_tenant_code_uk ON public.company (tenant_id, code) WHERE code IS NOT NULL AND archived_at IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS engagement_tenant_code_uk ON public.engagement (tenant_id, code) WHERE archived_at IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS work_order_tenant_code_uk ON public.work_order (tenant_id, code) WHERE archived_at IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS work_order_principal_ref_uk ON public.work_order (tenant_id, principal_company_id, principal_order_ref) WHERE principal_order_ref IS NOT NULL AND archived_at IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS purchase_order_tenant_number_uk ON public.purchase_order (tenant_id, number) WHERE number IS NOT NULL AND archived_at IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS stock_location_tenant_code_uk ON public.stock_location (tenant_id, code) WHERE code IS NOT NULL AND archived_at IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS saved_report_uq ON public.saved_report (tenant_id, user_id, entity, name) WHERE archived_at IS NULL;
END
$mig$;

INSERT INTO public.sisuite_migrations (filename) VALUES ('054_unique_exclude_archived.sql')
  ON CONFLICT DO NOTHING;
