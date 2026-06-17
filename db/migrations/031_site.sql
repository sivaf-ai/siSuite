-- =====================================================================
--  031_site.sql — Anagrafica SITI/LOCALITÀ (brief Blocco C-bis, ADR-0005).
--  Gerarchia di luoghi di un soggetto (company): stabilimento › edificio ›
--  piano › locale › armadio/POP. Allinea ai leader (ServiceTitan service
--  location, Dynamics functional location). Additiva: non rompe nulla; la fibra
--  residenziale continua a usare l'indirizzo sull'ordinativo.
--  Applicare DOPO 030. PostgreSQL 16.
-- =====================================================================

CREATE TABLE public.site (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    company_id  uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,   -- il soggetto proprietario/occupante
    parent_id   uuid REFERENCES public.site(id) ON DELETE CASCADE,              -- gerarchia (self-reference), come phase
    name        text NOT NULL,
    kind        text NOT NULL DEFAULT 'building',   -- plant|building|floor|room|cabinet|pop|... (estendibile via lookup)
    address     text,
    geo         point,
    attributes  jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid,
    updated_by  uuid,
    archived_at timestamptz,
    CONSTRAINT site_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX ON public.site (tenant_id);
CREATE INDEX ON public.site (company_id);
CREATE INDEX ON public.site (parent_id);

COMMENT ON TABLE public.site IS
  'Sito/Località di un soggetto (modello service-location). Gerarchia via parent_id. L''asset si colloca su un nodo (asset.site_id).';

CREATE TRIGGER site_set_updated_at
  BEFORE UPDATE ON public.site FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.site ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site FORCE ROW LEVEL SECURITY;
CREATE POLICY site_tenant ON public.site
  USING (tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());

-- l'asset può vivere in un sito preciso (nullable, additivo)
ALTER TABLE public.asset ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.site(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS asset_site_id_idx ON public.asset (site_id);

INSERT INTO public.sisuite_migrations (filename) VALUES ('031_site.sql')
  ON CONFLICT DO NOTHING;
