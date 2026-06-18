-- 036_saved_view.sql — VISTE salvate (Blocco 5.3): impacchettano filtro + ordinamento
-- + colonne (+ riferimento export) sotto un nome, per ricaricare una lista "pronta".
-- Per-utente (is_shared=false) con possibilità futura di condivisione col tenant (is_shared=true).
-- payload = { filter:{mode,conditions[]}|null, sort:[{field,dir}], columns:{order[],hidden[]}, exportRef:string|null }

CREATE TABLE IF NOT EXISTS public.saved_view (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  user_id    uuid NOT NULL,
  entity     text NOT NULL,
  name       text NOT NULL,
  payload    jsonb NOT NULL,
  is_shared  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_view_uq UNIQUE (tenant_id, user_id, entity, name)
);
CREATE INDEX IF NOT EXISTS saved_view_lookup_idx ON public.saved_view (tenant_id, user_id, entity);

COMMENT ON TABLE public.saved_view IS
  'Viste salvate per-utente per ogni lista/entità: filtro + ordinamento + colonne (+ export) sotto un nome.';

CREATE TRIGGER saved_view_set_updated_at
  BEFORE UPDATE ON public.saved_view FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.saved_view ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_view FORCE ROW LEVEL SECURITY;
-- lettura: le proprie viste + quelle condivise nel tenant. scrittura: solo le proprie.
CREATE POLICY saved_view_read ON public.saved_view FOR SELECT
  USING ((app_is_platform_admin() OR tenant_id = app_current_tenant())
         AND (user_id = app_current_user() OR is_shared = true));
CREATE POLICY saved_view_write ON public.saved_view FOR INSERT
  WITH CHECK (tenant_id = app_current_tenant() AND user_id = app_current_user());
CREATE POLICY saved_view_update ON public.saved_view FOR UPDATE
  USING (tenant_id = app_current_tenant() AND user_id = app_current_user())
  WITH CHECK (tenant_id = app_current_tenant() AND user_id = app_current_user());
CREATE POLICY saved_view_delete ON public.saved_view FOR DELETE
  USING (tenant_id = app_current_tenant() AND user_id = app_current_user());

INSERT INTO public.sisuite_migrations (filename) VALUES ('036_saved_view.sql')
  ON CONFLICT DO NOTHING;
