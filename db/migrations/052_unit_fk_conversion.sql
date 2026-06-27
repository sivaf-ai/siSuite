-- =====================================================================
--  052_unit_fk_conversion.sql — FASE 1.1 (Carta: integrità referenziale)
--  Converte TUTTI i riferimenti testuali all'unità di misura (colonne
--  `unit`/`weight_unit` text = codice) in FOREIGN KEY uuid verso
--  unit_of_measure(id) ON DELETE RESTRICT. Il codice testo viene rimosso.
--
--  Strategia (data-preserving):
--   0. helper app_resolve_unit(tenant, code): id UM tenant-specifico, else sistema.
--   1. per ogni colonna: i codici usati ma assenti dal catalogo vengono
--      inseriti come righe UM del tenant (così nessun dato si perde).
--   2. aggiunge la colonna uuid, fa il backfill via resolve.
--   3. crea FK ON DELETE RESTRICT + indice, poi DROPpa la colonna testo.
--
--  Contratto DTO invariato: il backend deriva `unit` (codice) via join in
--  lettura e risolve codice→id in scrittura → frontend UnitSelect immutato.
--  Worklist (11 colonne): material.unit, material.weight_unit,
--  material_consumption.unit, work_line.unit, equipment_usage.unit,
--  stock_movement.unit, stock_document_line.unit, price_list_item.unit,
--  stock_count_line.unit, purchase_order_line.unit, pick_list_line.unit.
--  PostgreSQL 16. Applicare DOPO 051.
-- =====================================================================

-- 0) Helper di risoluzione codice→id (tenant-specifico ha precedenza sul sistema)
CREATE OR REPLACE FUNCTION public.app_resolve_unit(p_tenant uuid, p_code text)
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM public.unit_of_measure
  WHERE code = p_code AND (tenant_id = p_tenant OR tenant_id IS NULL)
  ORDER BY (tenant_id IS NULL)   -- FALSE (tenant) prima di TRUE (sistema)
  LIMIT 1
$$;

-- 0-bis) La vista job_cost_ledger (027) referenzia mc.unit/eu.unit/wl.unit:
-- la droppiamo qui e la ricreiamo in fondo derivando il codice da *_id.
DROP VIEW IF EXISTS public.job_cost_ledger;

DO $mig$
DECLARE
  pairs text[] := ARRAY[
    'material:unit:unit_id',
    'material:weight_unit:weight_unit_id',
    'material_consumption:unit:unit_id',
    'work_line:unit:unit_id',
    'equipment_usage:unit:unit_id',
    'stock_movement:unit:unit_id',
    'stock_document_line:unit:unit_id',
    'price_list_item:unit:unit_id',
    'stock_count_line:unit:unit_id',
    'purchase_order_line:unit:unit_id',
    'pick_list_line:unit:unit_id'
  ];
  spec text; parts text[]; tbl text; col text; newcol text;
BEGIN
  FOREACH spec IN ARRAY pairs LOOP
    parts := string_to_array(spec, ':');
    tbl := parts[1]; col := parts[2]; newcol := parts[3];
    -- idempotenza: salta se la colonna testo non esiste più (già migrata)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=tbl AND column_name=col) THEN
      RAISE NOTICE '052: % .% già migrata, salto', tbl, col;
      CONTINUE;
    END IF;

    -- 1) i codici usati ma non in catalogo → inseriti come righe UM del tenant
    EXECUTE format($q$
      INSERT INTO public.unit_of_measure (tenant_id, code, name)
      SELECT DISTINCT t.tenant_id, t.%1$I, t.%1$I
      FROM public.%2$I t
      WHERE t.%1$I IS NOT NULL AND t.%1$I <> ''
        AND public.app_resolve_unit(t.tenant_id, t.%1$I) IS NULL
      ON CONFLICT (tenant_id, code) DO NOTHING
    $q$, col, tbl);

    -- 2) nuova colonna uuid + backfill (trigger USER disabilitati: alcune tabelle
    --    sono ledger immutabili, es. stock_movement, e bloccano l'UPDATE)
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS %I uuid', tbl, newcol);
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', tbl);
    EXECUTE format($q$
      UPDATE public.%1$I t SET %2$I = public.app_resolve_unit(t.tenant_id, t.%3$I)
      WHERE t.%3$I IS NOT NULL AND t.%3$I <> ''
    $q$, tbl, newcol, col);
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', tbl);

    -- 3) FK ON DELETE RESTRICT + indice
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.unit_of_measure(id) ON DELETE RESTRICT',
      tbl, tbl||'_'||newcol||'_fk', newcol);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(%I)', tbl||'_'||newcol||'_idx', tbl, newcol);

    -- 4) rimuove la colonna testo (CLEAN SLATE: niente shim)
    EXECUTE format('ALTER TABLE public.%I DROP COLUMN %I', tbl, col);
    RAISE NOTICE '052: % .% -> %.% (FK RESTRICT) OK', tbl, col, tbl, newcol;
  END LOOP;
END
$mig$;

-- 5) Ricrea job_cost_ledger identica, con il codice UM derivato da *_id
CREATE VIEW public.job_cost_ledger AS
  SELECT te.tenant_id, te.engagement_id, te.activity_id, NULL::uuid AS phase_id,
         'labor'::text AS cost_type, NULL::uuid AS price_list_item_id,
         te.minutes::numeric / 60.0 AS quantity, 'h'::text AS unit,
         te.minutes::numeric / 60.0 * COALESCE(te.cost_rate, 0::numeric) AS cost_amount,
         CASE WHEN te.billable THEN te.minutes::numeric / 60.0 * COALESCE(te.bill_rate, 0::numeric)
              ELSE 0::numeric END AS revenue_amount,
         te.occurred_on
    FROM time_entry te
  UNION ALL
  SELECT mc.tenant_id,
         (SELECT a.engagement_id FROM activity a WHERE a.id = mc.activity_id) AS engagement_id,
         mc.activity_id, NULL::uuid AS phase_id, 'material'::text AS cost_type,
         NULL::uuid AS price_list_item_id, mc.quantity,
         (SELECT u.code FROM unit_of_measure u WHERE u.id = mc.unit_id) AS unit,
         mc.quantity * COALESCE(m.default_cost, 0::numeric) AS cost_amount,
         0::numeric AS revenue_amount, mc.occurred_on
    FROM material_consumption mc LEFT JOIN material m ON m.id = mc.material_id
  UNION ALL
  SELECT eu.tenant_id, eu.engagement_id, NULL::uuid AS activity_id, eu.phase_id,
         'equipment'::text AS cost_type, NULL::uuid AS price_list_item_id, eu.quantity,
         (SELECT u.code FROM unit_of_measure u WHERE u.id = eu.unit_id) AS unit,
         eu.quantity * COALESCE(eu.unit_cost, 0::numeric) AS cost_amount,
         0::numeric AS revenue_amount, eu.occurred_on
    FROM equipment_usage eu
  UNION ALL
  SELECT sc.tenant_id, sc.engagement_id, NULL::uuid AS activity_id, sc.phase_id,
         'subcontract'::text AS cost_type, NULL::uuid AS price_list_item_id,
         1::numeric AS quantity, 'a corpo'::text AS unit,
         sc.amount AS cost_amount, 0::numeric AS revenue_amount, sc.occurred_on
    FROM subcontract_line sc
  UNION ALL
  SELECT wl.tenant_id, wl.engagement_id, NULL::uuid AS activity_id, wl.phase_id,
         'production'::text AS cost_type, wl.price_list_item_id, wl.quantity,
         (SELECT u.code FROM unit_of_measure u WHERE u.id = wl.unit_id) AS unit,
         wl.quantity * COALESCE(wl.cost_price, 0::numeric) AS cost_amount,
         wl.quantity * COALESCE(wl.revenue_price, 0::numeric) AS revenue_amount, wl.occurred_on
    FROM work_line wl;
GRANT SELECT ON public.job_cost_ledger TO sisuite_app;

INSERT INTO public.sisuite_migrations (filename) VALUES ('052_unit_fk_conversion.sql')
  ON CONFLICT DO NOTHING;
