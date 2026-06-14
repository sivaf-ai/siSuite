-- =====================================================================
--  017 — RAPPORTINO AI §5.
--  §5.1 billing_mode (hourly/fixed) su engagement: pilota cosa mostra il
--       rapportino cliente (fixed = prezzo concordato, mai ore/costi;
--       hourly = ore, mai costi). §5.2 work_report (testata) + link alle ore.
--  Stati via canonical_state. RLS: work_report "own" (created_by) §3.2;
--  link tenant-scoped §3.1. Additivo + idempotente.
-- =====================================================================

-- ── §5.1 modalità di vendita commessa ───────────────────────────────
INSERT INTO canonical_state (category, code, sequence) VALUES
  ('billing_mode','hourly',1),('billing_mode','fixed',2) ON CONFLICT DO NOTHING;
INSERT INTO lookup_value (tenant_id,category,canonical,code,label,abbreviation,color_token,sequence,is_default) VALUES
 (NULL,'billing_mode','hourly','hourly','{"it-IT":"A ore","en":"Hourly","es-AR":"Por hora"}','ORE','info',1,true),
 (NULL,'billing_mode','fixed','fixed','{"it-IT":"A corpo","en":"Fixed price","es-AR":"A precio fijo"}','CRP','neutral',2,false)
ON CONFLICT DO NOTHING;
ALTER TABLE public.engagement
  ADD COLUMN IF NOT EXISTS billing_mode_id uuid REFERENCES public.lookup_value(id);

-- ── §5.2 rapportino ─────────────────────────────────────────────────
INSERT INTO canonical_state (category, code, sequence) VALUES
  ('work_report_status','raw',1),('work_report_status','ai_proposed',2),
  ('work_report_status','confirmed',3),('work_report_status','signed',4) ON CONFLICT DO NOTHING;
INSERT INTO lookup_value (tenant_id,category,canonical,code,label,abbreviation,color_token,sequence,is_default) VALUES
 (NULL,'work_report_status','raw','raw','{"it-IT":"Grezzo","en":"Raw","es-AR":"Borrador"}','GRZ','neutral',1,true),
 (NULL,'work_report_status','ai_proposed','ai_proposed','{"it-IT":"Proposto dall''AI","en":"AI proposed","es-AR":"Propuesto por IA"}','AI','info',2,false),
 (NULL,'work_report_status','confirmed','confirmed','{"it-IT":"Confermato","en":"Confirmed","es-AR":"Confirmado"}','CNF','warning',3,false),
 (NULL,'work_report_status','signed','signed','{"it-IT":"Firmato","en":"Signed","es-AR":"Firmado"}','FRM','success',4,false)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.work_report (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  engagement_id uuid NOT NULL REFERENCES public.engagement(id) ON DELETE CASCADE,
  activity_id uuid REFERENCES public.activity(id) ON DELETE SET NULL,
  period_start date, period_end date,
  audience text NOT NULL DEFAULT 'customer',     -- 'customer' | 'internal'
  status_id uuid NOT NULL REFERENCES public.lookup_value(id),   -- work_report_status
  raw_text text, ai_text text, final_text text,
  signer_name text, signature_url text, signed_at timestamptz,
  generated_by_ai boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  client_created_at timestamptz,
  CONSTRAINT work_report_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS work_report_tenant_id_idx ON public.work_report(tenant_id);
CREATE INDEX IF NOT EXISTS work_report_engagement_id_idx ON public.work_report(engagement_id);

DROP TRIGGER IF EXISTS trg_work_report_updated ON public.work_report;
CREATE TRIGGER trg_work_report_updated BEFORE UPDATE ON public.work_report
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.work_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.work_report FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS work_report_insert ON public.work_report;
DROP POLICY IF EXISTS work_report_modify ON public.work_report;
DROP POLICY IF EXISTS work_report_select ON public.work_report;
CREATE POLICY work_report_insert ON public.work_report FOR INSERT
  WITH CHECK (tenant_id = public.app_current_tenant());
CREATE POLICY work_report_modify ON public.work_report FOR UPDATE
  USING ((tenant_id = public.app_current_tenant())
         AND (public.app_sees_whole_tenant() OR (created_by = public.app_current_user())))
  WITH CHECK (tenant_id = public.app_current_tenant());
CREATE POLICY work_report_select ON public.work_report FOR SELECT
  USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))
         AND (public.app_sees_whole_tenant()
              OR ((public.app_data_scope() = 'own') AND (created_by = public.app_current_user()))));

-- link rapportino <-> ore confermate (molti-a-molti)
CREATE TABLE IF NOT EXISTS public.work_report_time_entry (
  work_report_id uuid NOT NULL REFERENCES public.work_report(id) ON DELETE CASCADE,
  time_entry_id  uuid NOT NULL REFERENCES public.time_entry(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  CONSTRAINT work_report_time_entry_pkey PRIMARY KEY (work_report_id, time_entry_id)
);
CREATE INDEX IF NOT EXISTS work_report_time_entry_tenant_idx ON public.work_report_time_entry(tenant_id);

ALTER TABLE public.work_report_time_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.work_report_time_entry FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wrte_select ON public.work_report_time_entry;
DROP POLICY IF EXISTS wrte_insert ON public.work_report_time_entry;
DROP POLICY IF EXISTS wrte_delete ON public.work_report_time_entry;
CREATE POLICY wrte_select ON public.work_report_time_entry FOR SELECT
  USING (public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()));
CREATE POLICY wrte_insert ON public.work_report_time_entry FOR INSERT
  WITH CHECK (tenant_id = public.app_current_tenant());
CREATE POLICY wrte_delete ON public.work_report_time_entry FOR DELETE
  USING (tenant_id = public.app_current_tenant());
