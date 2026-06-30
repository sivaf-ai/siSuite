-- =====================================================================
--  064_field_definition_override.sql — Personalizzazione per-tenant dei campi
--  di SISTEMA (field_definition con tenant_id NULL). Come lookup_override: il tenant
--  può cambiare etichetta (multilingua), obbligatorietà, attivo, ordine, segnaposto,
--  aiuto, unità — SENZA toccare la riga di sistema condivisa, e senza poter cambiare
--  chiave/tipo/scope né eliminarla. "Ripristina default" = cancella l'override.
--  PostgreSQL 16. Dopo 063.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.field_definition_override (
  tenant_id            uuid NOT NULL,
  field_definition_id  uuid NOT NULL,
  label        jsonb,
  required     boolean,
  active       boolean,
  sequence     integer,
  help         jsonb,
  placeholder  jsonb,
  unit         text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid,
  CONSTRAINT field_definition_override_pkey PRIMARY KEY (tenant_id, field_definition_id),
  CONSTRAINT field_definition_override_fd_fkey FOREIGN KEY (field_definition_id)
    REFERENCES public.field_definition(id) ON DELETE CASCADE,
  CONSTRAINT field_definition_override_tenant_fkey FOREIGN KEY (tenant_id)
    REFERENCES public.tenant(id) ON DELETE CASCADE
);

ALTER TABLE public.field_definition_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.field_definition_override FORCE ROW LEVEL SECURITY;
CREATE POLICY field_definition_override_tenant ON public.field_definition_override
  USING (public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))
  WITH CHECK (tenant_id = public.app_current_tenant());

INSERT INTO public.sisuite_migrations (filename) VALUES ('064_field_definition_override.sql')
  ON CONFLICT DO NOTHING;
