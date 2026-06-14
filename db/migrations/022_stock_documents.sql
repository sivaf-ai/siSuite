-- =====================================================================
--  022 — MAGAZZINO MINIMO 6A §8.7: documenti (testata → movimenti) + bolla.
--  stock_document (receipt/transfer/adjustment) + righe. Alla conferma il
--  backend genera i movimenti in transazione e numera da number_series.
--  FK stock_movement.stock_document_id → stock_document. RLS tenant §3.1.
--  Additivo + idempotente.
-- =====================================================================

INSERT INTO canonical_state (category, code, sequence) VALUES
  ('stock_document_type','receipt',1),('stock_document_type','transfer',2),('stock_document_type','adjustment',3)
ON CONFLICT DO NOTHING;
INSERT INTO lookup_value (tenant_id,category,canonical,code,label,abbreviation,color_token,sequence,is_default) VALUES
 (NULL,'stock_document_type','receipt','receipt','{"it-IT":"Carico","en":"Receipt","es-AR":"Ingreso"}','CAR','success',1,true),
 (NULL,'stock_document_type','transfer','transfer','{"it-IT":"Trasferimento","en":"Transfer","es-AR":"Transferencia"}','TRA','neutral',2,false),
 (NULL,'stock_document_type','adjustment','adjustment','{"it-IT":"Rettifica","en":"Adjustment","es-AR":"Ajuste"}','RET','info',3,false)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.stock_document (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  type_id uuid NOT NULL REFERENCES public.lookup_value(id),     -- stock_document_type
  number text,                          -- da number_series
  doc_date date NOT NULL DEFAULT CURRENT_DATE,
  source_location_id uuid REFERENCES public.stock_location(id) ON DELETE RESTRICT, -- per transfer/scarico
  dest_location_id   uuid REFERENCES public.stock_location(id) ON DELETE RESTRICT, -- per receipt/transfer
  company_id uuid REFERENCES public.company(id) ON DELETE SET NULL,                 -- fornitore (carico) opzionale
  external_ref text,                    -- n. bolla/DDT fornitore
  status text NOT NULL DEFAULT 'draft', -- 'draft' | 'confirmed' | 'cancelled'
  note text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  CONSTRAINT stock_document_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS stock_document_tenant_id_idx ON public.stock_document(tenant_id);

DROP TRIGGER IF EXISTS trg_stock_document_updated ON public.stock_document;
CREATE TRIGGER trg_stock_document_updated BEFORE UPDATE ON public.stock_document
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.stock_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.stock_document FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_document_select ON public.stock_document;
DROP POLICY IF EXISTS stock_document_insert ON public.stock_document;
DROP POLICY IF EXISTS stock_document_modify ON public.stock_document;
CREATE POLICY stock_document_select ON public.stock_document FOR SELECT
  USING (public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()));
CREATE POLICY stock_document_insert ON public.stock_document FOR INSERT
  WITH CHECK (tenant_id = public.app_current_tenant());
CREATE POLICY stock_document_modify ON public.stock_document FOR UPDATE
  USING (tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());

CREATE TABLE IF NOT EXISTS public.stock_document_line (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.stock_document(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.material(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit text NOT NULL,
  unit_cost numeric, unit_price numeric, currency text,
  lot_id uuid,                          -- 6B
  note text,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT stock_document_line_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS stock_document_line_doc_idx ON public.stock_document_line(document_id);
CREATE INDEX IF NOT EXISTS stock_document_line_tenant_idx ON public.stock_document_line(tenant_id);

ALTER TABLE public.stock_document_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.stock_document_line FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_document_line_select ON public.stock_document_line;
DROP POLICY IF EXISTS stock_document_line_insert ON public.stock_document_line;
DROP POLICY IF EXISTS stock_document_line_modify ON public.stock_document_line;
DROP POLICY IF EXISTS stock_document_line_delete ON public.stock_document_line;
CREATE POLICY stock_document_line_select ON public.stock_document_line FOR SELECT
  USING (public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()));
CREATE POLICY stock_document_line_insert ON public.stock_document_line FOR INSERT
  WITH CHECK (tenant_id = public.app_current_tenant());
CREATE POLICY stock_document_line_modify ON public.stock_document_line FOR UPDATE
  USING (tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());
CREATE POLICY stock_document_line_delete ON public.stock_document_line FOR DELETE
  USING (tenant_id = public.app_current_tenant());

-- FK del movimento alla testata (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_movement_document_fkey'
       AND conrelid = 'public.stock_movement'::regclass
  ) THEN
    ALTER TABLE public.stock_movement
      ADD CONSTRAINT stock_movement_document_fkey
      FOREIGN KEY (stock_document_id) REFERENCES public.stock_document(id) ON DELETE SET NULL;
  END IF;
END $$;
