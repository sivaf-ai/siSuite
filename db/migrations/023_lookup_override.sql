-- =====================================================================
--  023 — lookup_override: personalizzazione per-tenant delle righe di SISTEMA
--  di lookup_value (stati/etichette/priorità/tipologie...). Ogni azienda può
--  cambiare nome/sigla/colore/ordine di una voce di sistema SENZA toccare la
--  riga condivisa (che resta la sorgente stabile degli id referenziati dai
--  record). Stesso pattern di term_override: default di sistema + override
--  per-tenant, risolti in lettura. Niente cancellazione delle voci di sistema:
--  il "ripristino" elimina solo l'override. Additivo + idempotente.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.lookup_override (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  lookup_id uuid NOT NULL REFERENCES public.lookup_value(id) ON DELETE CASCADE,
  label jsonb,                 -- override etichetta per-locale (NULL = usa sistema)
  abbreviation text,           -- override sigla
  color_token text,            -- override colore (chiave palette/semantica)
  sequence integer,            -- override ordine
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT lookup_override_pkey PRIMARY KEY (id),
  CONSTRAINT lookup_override_uk UNIQUE (tenant_id, lookup_id)
);
CREATE INDEX IF NOT EXISTS lookup_override_tenant_idx ON public.lookup_override(tenant_id);
CREATE INDEX IF NOT EXISTS lookup_override_lookup_idx ON public.lookup_override(lookup_id);

DROP TRIGGER IF EXISTS trg_lookup_override_updated ON public.lookup_override;
CREATE TRIGGER trg_lookup_override_updated BEFORE UPDATE ON public.lookup_override
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.lookup_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.lookup_override FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lookup_override_select ON public.lookup_override;
DROP POLICY IF EXISTS lookup_override_insert ON public.lookup_override;
DROP POLICY IF EXISTS lookup_override_modify ON public.lookup_override;
DROP POLICY IF EXISTS lookup_override_delete ON public.lookup_override;
CREATE POLICY lookup_override_select ON public.lookup_override FOR SELECT
  USING (public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()));
CREATE POLICY lookup_override_insert ON public.lookup_override FOR INSERT
  WITH CHECK (tenant_id = public.app_current_tenant());
CREATE POLICY lookup_override_modify ON public.lookup_override FOR UPDATE
  USING (tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());
CREATE POLICY lookup_override_delete ON public.lookup_override FOR DELETE
  USING (tenant_id = public.app_current_tenant());
