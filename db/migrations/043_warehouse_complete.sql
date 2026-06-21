-- =====================================================================
--  043_warehouse_complete.sql  — SPEC v1.1, BLOCCO C
--  Magazzino completo (vendibile standalone): lotti (fix bug lot_id senza
--  tabella), arricchimento ubicazioni, conteggio inventariale, ordini
--  d'acquisto, pick list.
--  Le rettifiche/ricezioni generano stock_movement (la giacenza NON si scrive
--  a mano): la logica di posting è nel backend (routes/stock.ts).
--  Applicare DOPO 042. PostgreSQL 16.
-- =====================================================================

-- ── C.1 stock_lot (la tabella mancante a cui i lot_id puntavano) ─────
CREATE TABLE public.stock_lot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    material_id uuid NOT NULL REFERENCES public.material(id),
    lot_number text NOT NULL,
    mfg_date date,
    expiry_date date,
    supplier_id uuid REFERENCES public.company(id),
    note text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid, updated_by uuid,
    PRIMARY KEY (id),
    UNIQUE (tenant_id, material_id, lot_number)
);
CREATE INDEX stock_lot_expiry_idx ON public.stock_lot (tenant_id, expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX stock_lot_material_idx ON public.stock_lot (material_id);

DROP TRIGGER IF EXISTS stock_lot_set_updated_at ON public.stock_lot;
CREATE TRIGGER stock_lot_set_updated_at
  BEFORE UPDATE ON public.stock_lot FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.stock_lot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_lot FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_lot_tenant ON public.stock_lot
  USING (public.app_is_platform_admin() OR tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stock_lot TO sisuite_app;

-- stock_serial_unit: aggiungere lot_id (assente)
ALTER TABLE public.stock_serial_unit ADD COLUMN IF NOT EXISTS lot_id uuid;

-- FK ora che la tabella esiste
ALTER TABLE public.stock_movement       ADD CONSTRAINT stock_movement_lot_fk      FOREIGN KEY (lot_id) REFERENCES public.stock_lot(id);
ALTER TABLE public.stock_document_line  ADD CONSTRAINT stock_document_line_lot_fk FOREIGN KEY (lot_id) REFERENCES public.stock_lot(id);
ALTER TABLE public.stock_serial_unit    ADD CONSTRAINT stock_serial_unit_lot_fk   FOREIGN KEY (lot_id) REFERENCES public.stock_lot(id);

-- ── C.2 stock_location: arricchimento ───────────────────────────────
ALTER TABLE public.stock_location
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS manager_user_id uuid REFERENCES public.app_user(id),
  ADD COLUMN IF NOT EXISTS note text;
CREATE UNIQUE INDEX IF NOT EXISTS stock_location_tenant_code_uk ON public.stock_location (tenant_id, code) WHERE code IS NOT NULL;

-- ── C.3 conteggio inventariale (rettifica) ──────────────────────────
CREATE TABLE public.stock_count (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    number text,
    location_id uuid NOT NULL REFERENCES public.stock_location(id),
    status text NOT NULL DEFAULT 'draft',   -- draft|counting|review|posted|cancelled
    count_date date DEFAULT CURRENT_DATE NOT NULL,
    note text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid, updated_by uuid,
    PRIMARY KEY (id)
);
CREATE INDEX stock_count_tenant_idx ON public.stock_count (tenant_id);
CREATE INDEX stock_count_location_idx ON public.stock_count (location_id);

DROP TRIGGER IF EXISTS stock_count_set_updated_at ON public.stock_count;
CREATE TRIGGER stock_count_set_updated_at
  BEFORE UPDATE ON public.stock_count FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.stock_count ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_count FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_count_tenant ON public.stock_count
  USING (public.app_is_platform_admin() OR tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stock_count TO sisuite_app;

CREATE TABLE public.stock_count_line (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    count_id uuid NOT NULL REFERENCES public.stock_count(id) ON DELETE CASCADE,
    material_id uuid NOT NULL REFERENCES public.material(id),
    lot_id uuid REFERENCES public.stock_lot(id),
    expected_qty numeric,
    counted_qty numeric,
    unit text NOT NULL,
    note text,
    PRIMARY KEY (id)
);
CREATE INDEX stock_count_line_count_idx ON public.stock_count_line (count_id);
CREATE INDEX stock_count_line_tenant_idx ON public.stock_count_line (tenant_id);

ALTER TABLE public.stock_count_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_count_line FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_count_line_tenant ON public.stock_count_line
  USING (public.app_is_platform_admin() OR tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stock_count_line TO sisuite_app;

-- ── C.4 ordini d'acquisto ───────────────────────────────────────────
CREATE TABLE public.purchase_order (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    number text,
    supplier_id uuid NOT NULL REFERENCES public.company(id),
    dest_location_id uuid REFERENCES public.stock_location(id),
    status text NOT NULL DEFAULT 'draft',   -- draft|sent|partial|received|cancelled
    order_date date DEFAULT CURRENT_DATE NOT NULL,
    expected_date date,
    currency text,
    note text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid, updated_by uuid, archived_at timestamptz,
    PRIMARY KEY (id)
);
CREATE INDEX purchase_order_tenant_idx ON public.purchase_order (tenant_id);
CREATE INDEX purchase_order_supplier_idx ON public.purchase_order (supplier_id);

DROP TRIGGER IF EXISTS purchase_order_set_updated_at ON public.purchase_order;
CREATE TRIGGER purchase_order_set_updated_at
  BEFORE UPDATE ON public.purchase_order FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.purchase_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order FORCE ROW LEVEL SECURITY;
CREATE POLICY purchase_order_tenant ON public.purchase_order
  USING (public.app_is_platform_admin() OR tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchase_order TO sisuite_app;

CREATE TABLE public.purchase_order_line (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    order_id uuid NOT NULL REFERENCES public.purchase_order(id) ON DELETE CASCADE,
    material_id uuid NOT NULL REFERENCES public.material(id),
    qty_ordered numeric NOT NULL,
    qty_received numeric DEFAULT 0 NOT NULL,
    unit text NOT NULL,
    unit_price numeric,
    note text,
    PRIMARY KEY (id),
    CONSTRAINT po_line_qty_check CHECK (qty_ordered > 0)
);
CREATE INDEX purchase_order_line_order_idx ON public.purchase_order_line (order_id);
CREATE INDEX purchase_order_line_tenant_idx ON public.purchase_order_line (tenant_id);

ALTER TABLE public.purchase_order_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_line FORCE ROW LEVEL SECURITY;
CREATE POLICY purchase_order_line_tenant ON public.purchase_order_line
  USING (public.app_is_platform_admin() OR tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchase_order_line TO sisuite_app;

-- ── C.5 pick list (prelievo in campo) ───────────────────────────────
CREATE TABLE public.pick_list (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    number text,
    source_location_id uuid NOT NULL REFERENCES public.stock_location(id),
    assigned_resource_id uuid REFERENCES public.resource(id),
    work_order_id uuid REFERENCES public.work_order(id),
    engagement_id uuid REFERENCES public.engagement(id),
    status text NOT NULL DEFAULT 'draft',   -- draft|assigned|picking|done|cancelled
    note text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid, updated_by uuid,
    PRIMARY KEY (id)
);
CREATE INDEX pick_list_tenant_idx ON public.pick_list (tenant_id);
CREATE INDEX pick_list_source_idx ON public.pick_list (source_location_id);

DROP TRIGGER IF EXISTS pick_list_set_updated_at ON public.pick_list;
CREATE TRIGGER pick_list_set_updated_at
  BEFORE UPDATE ON public.pick_list FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pick_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pick_list FORCE ROW LEVEL SECURITY;
CREATE POLICY pick_list_tenant ON public.pick_list
  USING (public.app_is_platform_admin() OR tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pick_list TO sisuite_app;

CREATE TABLE public.pick_list_line (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    pick_list_id uuid NOT NULL REFERENCES public.pick_list(id) ON DELETE CASCADE,
    material_id uuid NOT NULL REFERENCES public.material(id),
    qty_requested numeric NOT NULL,
    qty_picked numeric DEFAULT 0 NOT NULL,
    unit text NOT NULL,
    lot_id uuid REFERENCES public.stock_lot(id),
    PRIMARY KEY (id)
);
CREATE INDEX pick_list_line_pl_idx ON public.pick_list_line (pick_list_id);
CREATE INDEX pick_list_line_tenant_idx ON public.pick_list_line (tenant_id);

ALTER TABLE public.pick_list_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pick_list_line FORCE ROW LEVEL SECURITY;
CREATE POLICY pick_list_line_tenant ON public.pick_list_line
  USING (public.app_is_platform_admin() OR tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pick_list_line TO sisuite_app;

-- ── tipo movimento: rettifica inventariale (per il post del conteggio) ──
INSERT INTO public.canonical_state (category, code, sequence) VALUES
  ('stock_movement_type','count_adjust',5) ON CONFLICT DO NOTHING;
INSERT INTO public.lookup_value (tenant_id,category,canonical,code,label,abbreviation,color_token,sequence,is_default) VALUES
 (NULL,'stock_movement_type','count_adjust','count_adjust',
   '{"it-IT":"Rettifica inventariale","en":"Inventory adjustment","es-AR":"Ajuste de inventario"}','RIN','info',5,false)
ON CONFLICT (category, code) WHERE tenant_id IS NULL DO NOTHING;

INSERT INTO public.sisuite_migrations (filename) VALUES ('043_warehouse_complete.sql')
  ON CONFLICT DO NOTHING;
