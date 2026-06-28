-- =====================================================================
--  055_archive_audit.sql — Soft-delete: tracciabilità + audit (parte B)
--   1. archived_by uuid su tutte le tabelle archiviabili (chi ha archiviato).
--   2. audit_log: registro generale delle azioni rilevanti (archive/restore/
--      purge, estendibile a create/update) → "chi ha fatto cosa e quando".
--  Abilita la vista archiviati + ripristino (A) e l'eliminazione definitiva (C),
--  gestite a livello applicativo. PostgreSQL 16. Dopo 054.
-- =====================================================================

-- 1) archived_by su ogni tabella con archived_at
DO $mig$
DECLARE t text;
  tbls text[] := ARRAY['asset','company','engagement','material','material_category','purchase_order',
                       'resource','saved_report','site','stock_location','stock_serial_unit','template','work_order'];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS archived_by uuid', t);
  END LOOP;
END $mig$;

-- 2) audit_log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  entity text NOT NULL,                 -- tabella logica (es. 'material')
  entity_id uuid NOT NULL,
  action text NOT NULL,                 -- archive | restore | purge | create | update | delete
  label text,                           -- nome leggibile del record al momento dell'azione
  user_id uuid,                         -- chi (app_user.id)
  at timestamptz NOT NULL DEFAULT now(),
  detail jsonb
);
CREATE INDEX IF NOT EXISTS audit_log_tenant_entity_idx ON public.audit_log (tenant_id, entity, entity_id);
CREATE INDEX IF NOT EXISTS audit_log_tenant_at_idx ON public.audit_log (tenant_id, at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_log_tenant ON public.audit_log
  USING (public.app_is_platform_admin() OR tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());
GRANT SELECT, INSERT ON TABLE public.audit_log TO sisuite_app;

INSERT INTO public.sisuite_migrations (filename) VALUES ('055_archive_audit.sql')
  ON CONFLICT DO NOTHING;
