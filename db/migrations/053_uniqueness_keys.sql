-- =====================================================================
--  053_uniqueness_keys.sql — FASE 1.2 (Carta: mai chiavi duplicate)
--  Unicità a DB su ogni chiave naturale, INCLUSE le righe di sistema.
--   - unit_of_measure / tax_rate: indice parziale sulle righe di sistema
--     (tenant_id IS NULL) — prima mancante → righe di sistema duplicabili.
--   - material_category, template: chiave naturale prima assente.
--   - resource.code, app_user.code: codici a video senza UNIQUE.
--   - numeri documento (stock_document/stock_count/purchase_order/pick_list):
--     UNIQUE (tenant_id, number) — prima dipendeva solo da number_series app.
--  La collisione tenant-vs-sistema su INSERT/UPDATE è gestita a livello
--  applicativo (le righe di sistema non hanno tenant_id, quindi l'indice
--  parziale da solo non la blocca): vedi handler nelle route UM/IVA.
--  Pre-verificato: nessun duplicato esistente. PostgreSQL 16. Dopo 052.
-- =====================================================================

-- Cataloghi con righe di sistema: impedisci system-duplicati (tenant_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS unit_of_measure_system_code_uniq
  ON public.unit_of_measure (code) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tax_rate_system_uniq
  ON public.tax_rate (country, code) WHERE tenant_id IS NULL;

-- Categorie articolo: nome unico per livello (radice vs sotto-categoria), tra le NON archiviate
CREATE UNIQUE INDEX IF NOT EXISTS material_category_root_name_uniq
  ON public.material_category (tenant_id, name) WHERE parent_id IS NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS material_category_child_name_uniq
  ON public.material_category (tenant_id, parent_id, name) WHERE parent_id IS NOT NULL AND archived_at IS NULL;

-- Template: nome unico per (tenant, verticale) tra i NON archiviati
CREATE UNIQUE INDEX IF NOT EXISTS template_tenant_name_uniq
  ON public.template (tenant_id, vertical, name) WHERE archived_at IS NULL;

-- Codici a video senza UNIQUE
CREATE UNIQUE INDEX IF NOT EXISTS resource_tenant_code_uk
  ON public.resource (tenant_id, code) WHERE code IS NOT NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS app_user_tenant_code_uk
  ON public.app_user (tenant_id, code) WHERE code IS NOT NULL;

-- Numeri documento: unicità a DB (oltre alla generazione da number_series)
CREATE UNIQUE INDEX IF NOT EXISTS stock_document_tenant_number_uk
  ON public.stock_document (tenant_id, number) WHERE number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS stock_count_tenant_number_uk
  ON public.stock_count (tenant_id, number) WHERE number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS purchase_order_tenant_number_uk
  ON public.purchase_order (tenant_id, number) WHERE number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pick_list_tenant_number_uk
  ON public.pick_list (tenant_id, number) WHERE number IS NOT NULL;

INSERT INTO public.sisuite_migrations (filename) VALUES ('053_uniqueness_keys.sql')
  ON CONFLICT DO NOTHING;
