-- =====================================================================
--  045_entity_refinements.sql  — SPEC v1.1, BLOCCO E
--  Affinamenti a basso rischio su work_order / engagement / asset /
--  company_contact + risoluzione asset.company_id vs end-user FTTH.
--  CLEAN SLATE: company_id/site_id non più obbligatori; l'asset si àncora a
--  luogo e/o intestatario.
--  Applicare DOPO 044. PostgreSQL 16.
-- =====================================================================

-- ── E.1 work_order ──────────────────────────────────────────────────
ALTER TABLE public.work_order
  ADD COLUMN IF NOT EXISTS priority text,                 -- low|normal|high|urgent (lookup)
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.site(id);
CREATE INDEX IF NOT EXISTS work_order_site_idx ON public.work_order (site_id);

-- engagement
ALTER TABLE public.engagement
  ADD COLUMN IF NOT EXISTS planned_start date,
  ADD COLUMN IF NOT EXISTS planned_end date,
  ADD COLUMN IF NOT EXISTS priority text;

-- asset (E.1 campi)
ALTER TABLE public.asset
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS manufacturer text,
  ADD COLUMN IF NOT EXISTS warranty_until date,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS parent_asset_id uuid REFERENCES public.asset(id);
CREATE INDEX IF NOT EXISTS asset_parent_idx ON public.asset (parent_asset_id);

-- ── E.2 asset.company_id vs end-user FTTH ───────────────────────────
ALTER TABLE public.asset ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.asset
  ADD COLUMN IF NOT EXISTS work_order_subject_id uuid REFERENCES public.work_order_subject(id);
CREATE INDEX IF NOT EXISTS asset_wos_idx ON public.asset (work_order_subject_id);
ALTER TABLE public.asset
  ADD CONSTRAINT asset_anchor_check
  CHECK (company_id IS NOT NULL OR site_id IS NOT NULL OR work_order_subject_id IS NOT NULL);

-- ── E.3 company_contact: campi minori ───────────────────────────────
ALTER TABLE public.company_contact
  ADD COLUMN IF NOT EXISTS mobile text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS note text;

INSERT INTO public.sisuite_migrations (filename) VALUES ('045_entity_refinements.sql')
  ON CONFLICT DO NOTHING;
