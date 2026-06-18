-- 034_export_preset.sql — preset di export PER-UTENTE (funzione standard liste).
-- Memorizza, per ogni utente, le scelte di export (campi + ordine) di un'entità,
-- con un nome. `entity` = identificatore della lista (es. 'soggetti','risorse').

CREATE TABLE IF NOT EXISTS public.export_preset (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  user_id    uuid NOT NULL,
  entity     text NOT NULL,
  name       text NOT NULL,
  fields     jsonb NOT NULL,            -- array di chiavi-campo NELL'ORDINE scelto
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT export_preset_uq UNIQUE (tenant_id, user_id, entity, name)
);
CREATE INDEX IF NOT EXISTS export_preset_lookup_idx ON public.export_preset (tenant_id, user_id, entity);

COMMENT ON TABLE public.export_preset IS
  'Preset di export per-utente (campi + ordine) per ogni lista/entità. Standard delle maschere.';

CREATE TRIGGER export_preset_set_updated_at
  BEFORE UPDATE ON public.export_preset FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.export_preset ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_preset FORCE ROW LEVEL SECURITY;
-- ognuno vede/gestisce SOLO i propri preset del proprio tenant
CREATE POLICY export_preset_own ON public.export_preset FOR ALL
  USING ((app_is_platform_admin() OR tenant_id = app_current_tenant()) AND user_id = app_current_user())
  WITH CHECK (tenant_id = app_current_tenant() AND user_id = app_current_user());

INSERT INTO public.sisuite_migrations (filename) VALUES ('034_export_preset.sql')
  ON CONFLICT DO NOTHING;
