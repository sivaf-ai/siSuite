-- =====================================================================
--  027_production_accounting.sql
--  CONTABILITA' DI PRODUZIONE (controllo costi "B completo").
--
--  Scelta confermata: opzione B (come CPM/Procore) resa indolore.
--   - WBS  = albero delle FASI (gia' esistente: phase.parent_phase_id).
--            Aggiungo solo phase.wbs_code. Nessuna tabella WBS nuova.
--   - TIPO = dedotto dalla fonte (ore=manodopera, materiali=material,
--            attrezzature=equipment, subappalti=subcontract, voci=produzione).
--   - VOCE = price_list_item (voce di capitolato a listino).
--
--  Pivot preventivo-consuntivo: la VISTA job_cost_ledger unisce tutte le
--  fonti in un'unica griglia (commessa x fase/WBS x tipo x voce x importi),
--  come la pivot multicommessa di CPM.
--
--  Applicare DOPO 026. PostgreSQL 16.
-- =====================================================================

-- 1) WBS = codice sulla fase
ALTER TABLE public.phase ADD COLUMN IF NOT EXISTS wbs_code text;
COMMENT ON COLUMN public.phase.wbs_code IS 'Codice WBS (la fase E'' il nodo WBS). Usato come dimensione nella contabilita'' di produzione.';

-- 2) LAVORAZIONI (ricavo per quantita' su voce di capitolato)
CREATE TABLE public.work_line (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    engagement_id      uuid NOT NULL REFERENCES public.engagement(id) ON DELETE CASCADE,
    phase_id           uuid REFERENCES public.phase(id) ON DELETE SET NULL,       -- WBS
    work_order_id      uuid REFERENCES public.work_order(id) ON DELETE SET NULL,  -- da quale ordinativo
    price_list_item_id uuid REFERENCES public.price_list_item(id) ON DELETE SET NULL, -- voce di capitolato
    description        text,                          -- libera, se senza voce
    quantity           numeric NOT NULL CHECK (quantity > 0),
    unit               text NOT NULL,
    cost_price         numeric,                       -- prezzo COSTO fotografato al momento
    revenue_price      numeric,                       -- prezzo RICAVO fotografato al momento
    occurred_on        date NOT NULL DEFAULT CURRENT_DATE,
    resource_id        uuid REFERENCES public.resource(id) ON DELETE SET NULL,    -- chi ha eseguito
    source_capture_id  uuid REFERENCES public.capture(id) ON DELETE SET NULL,     -- cattura vocale AI
    attributes         jsonb NOT NULL DEFAULT '{}'::jsonb,  -- competenza, area_cavo... via field_definition
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    updated_by         uuid,
    client_created_at  timestamptz
);
CREATE INDEX ON public.work_line (tenant_id);
CREATE INDEX ON public.work_line (engagement_id);
CREATE INDEX ON public.work_line (phase_id);
CREATE INDEX ON public.work_line (price_list_item_id);
CREATE TRIGGER work_line_set_updated_at
  BEFORE UPDATE ON public.work_line FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
COMMENT ON TABLE public.work_line IS 'Lavorazione: voce di capitolato x quantita'' -> ricavo (e costo). E'' la riga di contabilita'' lavori.';

-- 3) LIBRETTO DELLE MISURE (le misure che sommano alla quantita')
CREATE TABLE public.work_line_measure (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    work_line_id  uuid NOT NULL REFERENCES public.work_line(id) ON DELETE CASCADE,
    label         text,                 -- es. "Tratta A - marciapiede dx"
    formula       text,                 -- es. "12 x 1.5" (descrittiva)
    value         numeric NOT NULL,     -- il contributo numerico alla quantita'
    seq           int NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.work_line_measure (tenant_id);
CREATE INDEX ON public.work_line_measure (work_line_id);
COMMENT ON TABLE public.work_line_measure IS 'Libretto misure: righe di misura che, sommate, danno la quantita'' della lavorazione.';

-- 4) ATTREZZATURE usate (costo mezzi nel rapporto)
CREATE TABLE public.equipment_usage (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    engagement_id uuid NOT NULL REFERENCES public.engagement(id) ON DELETE CASCADE,
    phase_id      uuid REFERENCES public.phase(id) ON DELETE SET NULL,
    work_order_id uuid REFERENCES public.work_order(id) ON DELETE SET NULL,
    resource_id   uuid NOT NULL REFERENCES public.resource(id) ON DELETE RESTRICT, -- kind = 'vehicle'/'equipment'
    occurred_on   date NOT NULL DEFAULT CURRENT_DATE,
    quantity      numeric NOT NULL CHECK (quantity > 0),   -- ore o numero di usi
    unit          text NOT NULL DEFAULT 'h',
    unit_cost     numeric,
    note          text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid, updated_by uuid
);
CREATE INDEX ON public.equipment_usage (tenant_id);
CREATE INDEX ON public.equipment_usage (engagement_id);
CREATE TRIGGER equipment_usage_set_updated_at
  BEFORE UPDATE ON public.equipment_usage FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
COMMENT ON TABLE public.equipment_usage IS 'Uso attrezzature/mezzi su commessa (costo). Risorsa di kind vehicle/equipment.';

-- 5) SUBAPPALTI (costo terzi nel rapporto)
CREATE TABLE public.subcontract_line (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    engagement_id uuid NOT NULL REFERENCES public.engagement(id) ON DELETE CASCADE,
    phase_id      uuid REFERENCES public.phase(id) ON DELETE SET NULL,
    work_order_id uuid REFERENCES public.work_order(id) ON DELETE SET NULL,
    company_id    uuid NOT NULL REFERENCES public.company(id) ON DELETE RESTRICT, -- il subappaltatore
    description   text,
    amount        numeric NOT NULL,
    occurred_on   date NOT NULL DEFAULT CURRENT_DATE,
    note          text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid, updated_by uuid
);
CREATE INDEX ON public.subcontract_line (tenant_id);
CREATE INDEX ON public.subcontract_line (engagement_id);
CREATE TRIGGER subcontract_line_set_updated_at
  BEFORE UPDATE ON public.subcontract_line FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
COMMENT ON TABLE public.subcontract_line IS 'Riga di subappalto (costo terzi) su commessa.';

-- 6) VISTA UNIFICATA per la pivot preventivo-consuntivo
--    Unisce tutte le fonti in: tenant, commessa, fase/WBS, tipo, voce,
--    quantita', costo, ricavo, data. Il "tipo" e' DEDOTTO dalla fonte.
--    Valorizzazione:
--      - manodopera: ore x time_entry.cost_rate (costo) e x bill_rate (ricavo, se billable).
--      - materiali : quantita' x material.default_cost (costo).
--      - mezzi     : quantita' x equipment_usage.unit_cost.
--      - subappalti: importo a corpo.
--      - lavorazioni: quantita' x prezzo costo/ricavo fotografato.
--    Le tariffe orarie sono gia' "fotografate" sulla riga time_entry, quindi
--    niente risoluzione rate_card esterna per il caso comune.
CREATE VIEW public.job_cost_ledger WITH (security_invoker = true) AS
  -- manodopera (ore) — valorizzata con le tariffe fotografate sulla riga
  SELECT te.tenant_id, te.engagement_id,
         te.activity_id,            -- per risalire alla fase via activity (app)
         NULL::uuid          AS phase_id,
         'labor'::text       AS cost_type,
         NULL::uuid          AS price_list_item_id,
         (te.minutes/60.0)   AS quantity,
         'h'::text           AS unit,
         ((te.minutes/60.0) * COALESCE(te.cost_rate,0))                       AS cost_amount,
         (CASE WHEN te.billable THEN (te.minutes/60.0) * COALESCE(te.bill_rate,0) ELSE 0 END) AS revenue_amount,
         te.occurred_on
  FROM public.time_entry te
  UNION ALL
  -- materiali (consumi) — valorizzati a costo medio di magazzino
  SELECT mc.tenant_id,
         (SELECT a.engagement_id FROM public.activity a WHERE a.id = mc.activity_id),
         mc.activity_id, NULL::uuid, 'material', NULL::uuid,
         mc.quantity, mc.unit,
         (mc.quantity * COALESCE(m.default_cost,0)), 0::numeric, mc.occurred_on
  FROM public.material_consumption mc
  LEFT JOIN public.material m ON m.id = mc.material_id
  UNION ALL
  -- attrezzature/mezzi
  SELECT eu.tenant_id, eu.engagement_id, NULL::uuid, eu.phase_id, 'equipment', NULL::uuid,
         eu.quantity, eu.unit, (eu.quantity * COALESCE(eu.unit_cost,0)), 0::numeric, eu.occurred_on
  FROM public.equipment_usage eu
  UNION ALL
  -- subappalti
  SELECT sc.tenant_id, sc.engagement_id, NULL::uuid, sc.phase_id, 'subcontract', NULL::uuid,
         1::numeric, 'a corpo', sc.amount, 0::numeric, sc.occurred_on
  FROM public.subcontract_line sc
  UNION ALL
  -- lavorazioni (RICAVO + eventuale costo voce)
  SELECT wl.tenant_id, wl.engagement_id, NULL::uuid, wl.phase_id, 'production', wl.price_list_item_id,
         wl.quantity, wl.unit,
         (wl.quantity * COALESCE(wl.cost_price,0)),
         (wl.quantity * COALESCE(wl.revenue_price,0)),
         wl.occurred_on
  FROM public.work_line wl;

COMMENT ON VIEW public.job_cost_ledger IS
  'Libro mastro di commessa: unisce ore/materiali/mezzi/subappalti (costi) e lavorazioni (ricavi). Base della pivot preventivo-consuntivo.';

-- 7) RLS
ALTER TABLE public.work_line ENABLE ROW LEVEL SECURITY;        ALTER TABLE public.work_line FORCE ROW LEVEL SECURITY;
CREATE POLICY work_line_tenant ON public.work_line USING (tenant_id = public.app_current_tenant()) WITH CHECK (tenant_id = public.app_current_tenant());
ALTER TABLE public.work_line_measure ENABLE ROW LEVEL SECURITY; ALTER TABLE public.work_line_measure FORCE ROW LEVEL SECURITY;
CREATE POLICY work_line_measure_tenant ON public.work_line_measure USING (tenant_id = public.app_current_tenant()) WITH CHECK (tenant_id = public.app_current_tenant());
ALTER TABLE public.equipment_usage ENABLE ROW LEVEL SECURITY;   ALTER TABLE public.equipment_usage FORCE ROW LEVEL SECURITY;
CREATE POLICY equipment_usage_tenant ON public.equipment_usage USING (tenant_id = public.app_current_tenant()) WITH CHECK (tenant_id = public.app_current_tenant());
ALTER TABLE public.subcontract_line ENABLE ROW LEVEL SECURITY;  ALTER TABLE public.subcontract_line FORCE ROW LEVEL SECURITY;
CREATE POLICY subcontract_line_tenant ON public.subcontract_line USING (tenant_id = public.app_current_tenant()) WITH CHECK (tenant_id = public.app_current_tenant());

INSERT INTO public.sisuite_migrations (filename) VALUES ('027_production_accounting.sql')
  ON CONFLICT DO NOTHING;
