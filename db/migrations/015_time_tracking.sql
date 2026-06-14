-- =====================================================================
--  015 — MODULO ORE §4.5: cronometro.
--  time_entry.start_at/end_at = intervallo misurato (sola lettura una volta
--  confermato). time_tracking_session = timer in corso/storico; alla conferma
--  genera una time_entry (committed_time_entry_id). RLS "own" §3.2.
--  Additivo + idempotente.
-- =====================================================================

ALTER TABLE public.time_entry
  ADD COLUMN IF NOT EXISTS start_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_at   timestamptz;

CREATE TABLE IF NOT EXISTS public.time_tracking_session (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.resource(id) ON DELETE CASCADE,
  activity_id uuid REFERENCES public.activity(id) ON DELETE SET NULL,
  engagement_id uuid REFERENCES public.engagement(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL,
  stopped_at timestamptz,                 -- NULL = timer in corso
  committed_time_entry_id uuid REFERENCES public.time_entry(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  CONSTRAINT time_tracking_session_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS time_tracking_session_tenant_id_idx ON public.time_tracking_session(tenant_id);
CREATE INDEX IF NOT EXISTS time_tracking_session_resource_idx ON public.time_tracking_session(resource_id);

DROP TRIGGER IF EXISTS trg_time_tracking_session_updated ON public.time_tracking_session;
CREATE TRIGGER trg_time_tracking_session_updated BEFORE UPDATE ON public.time_tracking_session
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.time_tracking_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.time_tracking_session FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tts_insert ON public.time_tracking_session;
DROP POLICY IF EXISTS tts_modify ON public.time_tracking_session;
DROP POLICY IF EXISTS tts_select ON public.time_tracking_session;
CREATE POLICY tts_insert ON public.time_tracking_session FOR INSERT
  WITH CHECK (tenant_id = public.app_current_tenant());
CREATE POLICY tts_modify ON public.time_tracking_session FOR UPDATE
  USING ((tenant_id = public.app_current_tenant())
         AND (public.app_sees_whole_tenant()
              OR (created_by = public.app_current_user())
              OR EXISTS (SELECT 1 FROM public.resource r
                         WHERE r.id = time_tracking_session.resource_id AND r.user_id = public.app_current_user())))
  WITH CHECK (tenant_id = public.app_current_tenant());
CREATE POLICY tts_select ON public.time_tracking_session FOR SELECT
  USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))
         AND (public.app_sees_whole_tenant()
              OR ((public.app_data_scope() = 'own')
                  AND ((created_by = public.app_current_user())
                       OR EXISTS (SELECT 1 FROM public.resource r
                                  WHERE r.id = time_tracking_session.resource_id AND r.user_id = public.app_current_user())))));
