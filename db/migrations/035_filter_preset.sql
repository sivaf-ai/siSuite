-- 035_filter_preset.sql — set di FILTRI salvati PER-UTENTE (filtro AI delle liste).
-- L'utente costruisce un filtro (anche a voce, via AI) e lo memorizza con un nome,
-- per ricaricarlo. `payload` = { query, conditions:[{field,op,value}] }.

CREATE TABLE IF NOT EXISTS public.filter_preset (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  user_id    uuid NOT NULL,
  entity     text NOT NULL,
  name       text NOT NULL,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT filter_preset_uq UNIQUE (tenant_id, user_id, entity, name)
);
CREATE INDEX IF NOT EXISTS filter_preset_lookup_idx ON public.filter_preset (tenant_id, user_id, entity);

COMMENT ON TABLE public.filter_preset IS
  'Set di filtri salvati per-utente per ogni lista/entità (filtro AI/linguaggio naturale + voce).';

CREATE TRIGGER filter_preset_set_updated_at
  BEFORE UPDATE ON public.filter_preset FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.filter_preset ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filter_preset FORCE ROW LEVEL SECURITY;
CREATE POLICY filter_preset_own ON public.filter_preset FOR ALL
  USING ((app_is_platform_admin() OR tenant_id = app_current_tenant()) AND user_id = app_current_user())
  WITH CHECK (tenant_id = app_current_tenant() AND user_id = app_current_user());

INSERT INTO public.sisuite_migrations (filename) VALUES ('035_filter_preset.sql')
  ON CONFLICT DO NOTHING;
