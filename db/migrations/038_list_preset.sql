-- 038_list_preset.sql — store GENERICO per i salvataggi del "motore liste":
-- un'unica tabella per i preset di Filtro/Ordina/Colonne/Export (kind), così il
-- SavedHeader è identico in tutte le funzioni (PIANO motore §1.2/§7). Additiva.
-- payload dipende dal kind: filter={mode,conditions}|sort=[{field,dir}]|columns={order,hidden}|export=[key].

CREATE TABLE IF NOT EXISTS public.list_preset (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  user_id    uuid NOT NULL,
  entity     text NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('filter','sort','columns','export')),
  name       text NOT NULL,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT list_preset_uq UNIQUE (tenant_id, user_id, entity, kind, name)
);
CREATE INDEX IF NOT EXISTS list_preset_lookup_idx ON public.list_preset (tenant_id, user_id, entity, kind);

COMMENT ON TABLE public.list_preset IS
  'Preset salvati per-utente del motore liste, discriminati da kind (filter/sort/columns/export).';

CREATE TRIGGER list_preset_set_updated_at
  BEFORE UPDATE ON public.list_preset FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.list_preset ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_preset FORCE ROW LEVEL SECURITY;
CREATE POLICY list_preset_own ON public.list_preset FOR ALL
  USING ((app_is_platform_admin() OR tenant_id = app_current_tenant()) AND user_id = app_current_user())
  WITH CHECK (tenant_id = app_current_tenant() AND user_id = app_current_user());

INSERT INTO public.sisuite_migrations (filename) VALUES ('038_list_preset.sql')
  ON CONFLICT DO NOTHING;
