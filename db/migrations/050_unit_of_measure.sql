-- =====================================================================
--  050_unit_of_measure.sql — Anagrafica Unità di misura
--  Catalogo unità di misura: righe di SISTEMA (tenant_id NULL, visibili a
--  tutti i tenant, immutabili dal tenant) + righe per-tenant (override/aggiunte).
--  Stesso pattern di tax_rate (catalogo country-scoped). RLS a DB.
--  PostgreSQL 16.
-- =====================================================================

CREATE TABLE public.unit_of_measure (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,                              -- NULL = riga di sistema
    code text NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    PRIMARY KEY (id),
    UNIQUE (tenant_id, code)
);
CREATE INDEX unit_of_measure_tenant_idx ON public.unit_of_measure (tenant_id);

DROP TRIGGER IF EXISTS unit_of_measure_set_updated_at ON public.unit_of_measure;
CREATE TRIGGER unit_of_measure_set_updated_at
  BEFORE UPDATE ON public.unit_of_measure FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.unit_of_measure ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_of_measure FORCE ROW LEVEL SECURITY;
CREATE POLICY unit_of_measure_tenant ON public.unit_of_measure
  USING (public.app_is_platform_admin() OR tenant_id IS NULL OR tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.unit_of_measure TO sisuite_app;

-- ── Seed righe di SISTEMA (tenant_id NULL) ───────────────────────────
INSERT INTO public.unit_of_measure (tenant_id, code, name) VALUES
  (NULL, 'pz',      'Pezzo'),
  (NULL, 'cad',     'Cadauno'),
  (NULL, 'kg',      'Chilogrammo'),
  (NULL, 'g',       'Grammo'),
  (NULL, 't',       'Tonnellata'),
  (NULL, 'l',       'Litro'),
  (NULL, 'ml',      'Millilitro'),
  (NULL, 'm',       'Metro'),
  (NULL, 'cm',      'Centimetro'),
  (NULL, 'mm',      'Millimetro'),
  (NULL, 'm2',      'Metro quadro'),
  (NULL, 'm3',      'Metro cubo'),
  (NULL, 'h',       'Ora'),
  (NULL, 'gg',      'Giorno'),
  (NULL, 'conf',    'Confezione'),
  (NULL, 'scatola', 'Scatola'),
  (NULL, 'pallet',  'Pallet'),
  (NULL, 'km',      'Chilometro')
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.sisuite_migrations (filename) VALUES ('050_unit_of_measure.sql')
  ON CONFLICT DO NOTHING;
