-- =====================================================================
--  021 — MAGAZZINO MINIMO 6A §8.3+§8.4+§8.5: registro movimenti + saldo.
--  stock_movement: registro IMMUTABILE (quantità con segno; trigger blocca
--  UPDATE/DELETE → si rettifica, non si modifica). stock_balance: giacenza
--  mantenuta (perpetual) a media mobile, aggiornata da trigger AFTER INSERT.
--  Vista di riconciliazione per verifica. RLS tenant-scoped §3.1.
--  Additivo + idempotente.
-- =====================================================================

-- ── §8.3 tipi movimento ─────────────────────────────────────────────
INSERT INTO canonical_state (category, code, sequence) VALUES
  ('stock_movement_type','in',1),('stock_movement_type','out',2),
  ('stock_movement_type','adjust',3),('stock_movement_type','transfer',4) ON CONFLICT DO NOTHING;
INSERT INTO lookup_value (tenant_id,category,canonical,code,label,abbreviation,color_token,sequence,is_default) VALUES
 (NULL,'stock_movement_type','in','in','{"it-IT":"Carico","en":"Receipt","es-AR":"Ingreso"}','CAR','success',1,false),
 (NULL,'stock_movement_type','out','out','{"it-IT":"Scarico","en":"Issue","es-AR":"Egreso"}','SCA','warning',2,false),
 (NULL,'stock_movement_type','adjust','adjust','{"it-IT":"Rettifica","en":"Adjustment","es-AR":"Ajuste"}','RET','info',3,false),
 (NULL,'stock_movement_type','transfer','transfer','{"it-IT":"Trasferimento","en":"Transfer","es-AR":"Transferencia"}','TRA','neutral',4,false)
ON CONFLICT DO NOTHING;

-- ── §8.4 registro movimenti (immutabile) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_movement (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.material(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.stock_location(id) ON DELETE RESTRICT,
  type_id uuid NOT NULL REFERENCES public.lookup_value(id),   -- stock_movement_type
  quantity numeric NOT NULL,                 -- CON SEGNO: + aumenta, − diminuisce (mai 0)
  unit text NOT NULL,
  unit_cost numeric,                         -- costo unitario fotografato
  unit_price numeric,                        -- prezzo cliente fotografato (lato ricavo)
  currency text,
  occurred_on date NOT NULL DEFAULT CURRENT_DATE,
  document_ref text,                         -- rif. documento esterno (DDT fornitore)
  stock_document_id uuid,                    -- testata che ha generato il movimento (§8.7), nullable
  engagement_id uuid REFERENCES public.engagement(id) ON DELETE SET NULL,
  activity_id uuid REFERENCES public.activity(id) ON DELETE SET NULL,
  transfer_group_id uuid,                    -- lega le due righe di un trasferimento (out+in)
  lot_id uuid,                               -- gancio lotti/scadenze (6B); NULL nel minimo
  source_capture_id uuid REFERENCES public.capture(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  client_created_at timestamptz,
  CONSTRAINT stock_movement_pkey PRIMARY KEY (id),
  CONSTRAINT stock_movement_qty_nonzero CHECK (quantity <> 0)
);
CREATE INDEX IF NOT EXISTS stock_movement_tenant_id_idx ON public.stock_movement(tenant_id);
CREATE INDEX IF NOT EXISTS stock_movement_mat_loc_idx ON public.stock_movement(material_id, location_id);
CREATE INDEX IF NOT EXISTS stock_movement_occurred_idx ON public.stock_movement(occurred_on);
CREATE INDEX IF NOT EXISTS stock_movement_activity_idx ON public.stock_movement(activity_id);
CREATE INDEX IF NOT EXISTS stock_movement_transfer_idx ON public.stock_movement(transfer_group_id);
CREATE INDEX IF NOT EXISTS stock_movement_document_idx ON public.stock_movement(stock_document_id);

ALTER TABLE public.stock_movement ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.stock_movement FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_movement_select ON public.stock_movement;
DROP POLICY IF EXISTS stock_movement_insert ON public.stock_movement;
CREATE POLICY stock_movement_select ON public.stock_movement FOR SELECT
  USING (public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()));
CREATE POLICY stock_movement_insert ON public.stock_movement FOR INSERT
  WITH CHECK (tenant_id = public.app_current_tenant());

-- immutabilità (niente UPDATE/DELETE: si rettifica)
CREATE OR REPLACE FUNCTION public.stock_movement_is_immutable()
RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'stock_movement è immutabile: usa una rettifica, non modifiche o cancellazioni'; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_stock_movement_no_update ON public.stock_movement;
CREATE TRIGGER trg_stock_movement_no_update BEFORE UPDATE ON public.stock_movement
  FOR EACH ROW EXECUTE FUNCTION public.stock_movement_is_immutable();
DROP TRIGGER IF EXISTS trg_stock_movement_no_delete ON public.stock_movement;
CREATE TRIGGER trg_stock_movement_no_delete BEFORE DELETE ON public.stock_movement
  FOR EACH ROW EXECUTE FUNCTION public.stock_movement_is_immutable();

-- ── §8.5 saldo mantenuto + media mobile + fallback costo ────────────
CREATE TABLE IF NOT EXISTS public.stock_balance (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.material(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.stock_location(id) ON DELETE CASCADE,
  qty_on_hand   numeric DEFAULT 0 NOT NULL,
  avg_cost      numeric,
  value_on_hand numeric DEFAULT 0 NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT stock_balance_pkey PRIMARY KEY (id),
  CONSTRAINT stock_balance_uk UNIQUE (tenant_id, material_id, location_id)
);
CREATE INDEX IF NOT EXISTS stock_balance_tenant_id_idx ON public.stock_balance(tenant_id);

ALTER TABLE public.stock_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.stock_balance FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_balance_select ON public.stock_balance;
DROP POLICY IF EXISTS stock_balance_insert ON public.stock_balance;
DROP POLICY IF EXISTS stock_balance_modify ON public.stock_balance;
CREATE POLICY stock_balance_select ON public.stock_balance FOR SELECT
  USING (public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()));
CREATE POLICY stock_balance_insert ON public.stock_balance FOR INSERT
  WITH CHECK (tenant_id = public.app_current_tenant());
CREATE POLICY stock_balance_modify ON public.stock_balance FOR UPDATE
  USING (tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());

CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS trigger AS $$
DECLARE b public.stock_balance%ROWTYPE; new_qty numeric; new_value numeric; def_cost numeric;
BEGIN
  SELECT default_cost INTO def_cost FROM public.material WHERE id = NEW.material_id;
  SELECT * INTO b FROM public.stock_balance
   WHERE tenant_id=NEW.tenant_id AND material_id=NEW.material_id AND location_id=NEW.location_id FOR UPDATE;
  IF NOT FOUND THEN
    IF NEW.quantity > 0 THEN new_value := NEW.quantity*COALESCE(NEW.unit_cost,def_cost,0);
    ELSE                     new_value := NEW.quantity*COALESCE(def_cost,0);  -- uscita senza giacenza → listino
    END IF;
    INSERT INTO public.stock_balance(tenant_id,material_id,location_id,qty_on_hand,avg_cost,value_on_hand,updated_at)
    VALUES (NEW.tenant_id,NEW.material_id,NEW.location_id,NEW.quantity,
            CASE WHEN NEW.quantity>0 THEN new_value/NEW.quantity ELSE NULL END,new_value,now());
    RETURN NEW;
  END IF;
  new_qty := b.qty_on_hand + NEW.quantity;
  IF NEW.quantity > 0 THEN new_value := b.value_on_hand + NEW.quantity*COALESCE(NEW.unit_cost,b.avg_cost,def_cost,0);
  ELSE                     new_value := b.value_on_hand + NEW.quantity*COALESCE(b.avg_cost,def_cost,0);
  END IF;
  UPDATE public.stock_balance
     SET qty_on_hand=new_qty, value_on_hand=new_value,
         avg_cost = CASE WHEN new_qty>0 THEN new_value/new_qty ELSE b.avg_cost END, updated_at=now()
   WHERE id=b.id;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_stock_movement_apply ON public.stock_movement;
CREATE TRIGGER trg_stock_movement_apply AFTER INSERT ON public.stock_movement
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- vista di riconciliazione (verifica/ricostruzione, deve coincidere col saldo).
-- security_invoker=true: la RLS si valuta con il ruolo CHIAMANTE (sisuite_app),
-- non con l'owner (superuser, che bypasserebbe la RLS) → niente leak cross-tenant.
CREATE OR REPLACE VIEW public.stock_balance_recompute
  WITH (security_invoker = true) AS
SELECT tenant_id, material_id, location_id, SUM(quantity) AS qty_on_hand
FROM public.stock_movement GROUP BY tenant_id, material_id, location_id;
