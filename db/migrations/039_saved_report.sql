-- 039_saved_report.sql — REPORT salvati (PIANO motore §2.5/§7). Config del report designer
-- (campi da mostrare, totali, raggruppa, opzioni, layout) sotto un nome. Additiva.
-- payload = { show:[key], sum:[key], group:string|null, options:{griglia,hideRep,subtot,grandtot,pagine}, layout:'elenco'|'scheda' }

CREATE TABLE IF NOT EXISTS public.saved_report (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  user_id    uuid NOT NULL,
  entity     text NOT NULL,
  name       text NOT NULL,
  payload    jsonb NOT NULL,
  is_shared  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT saved_report_uq UNIQUE (tenant_id, user_id, entity, name)
);
CREATE INDEX IF NOT EXISTS saved_report_lookup_idx ON public.saved_report (tenant_id, user_id, entity);

COMMENT ON TABLE public.saved_report IS 'Report salvati per-utente del report designer (config: show/sum/group/options/layout).';

CREATE TRIGGER saved_report_set_updated_at
  BEFORE UPDATE ON public.saved_report FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.saved_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_report FORCE ROW LEVEL SECURITY;
CREATE POLICY saved_report_read ON public.saved_report FOR SELECT
  USING ((app_is_platform_admin() OR tenant_id = app_current_tenant()) AND (user_id = app_current_user() OR is_shared = true));
CREATE POLICY saved_report_write ON public.saved_report FOR INSERT
  WITH CHECK (tenant_id = app_current_tenant() AND user_id = app_current_user());
CREATE POLICY saved_report_update ON public.saved_report FOR UPDATE
  USING (tenant_id = app_current_tenant() AND user_id = app_current_user())
  WITH CHECK (tenant_id = app_current_tenant() AND user_id = app_current_user());
CREATE POLICY saved_report_delete ON public.saved_report FOR DELETE
  USING (tenant_id = app_current_tenant() AND user_id = app_current_user());

INSERT INTO public.sisuite_migrations (filename) VALUES ('039_saved_report.sql')
  ON CONFLICT DO NOTHING;
