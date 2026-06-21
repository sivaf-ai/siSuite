-- =====================================================================
--  044_resources_skills.sql  — SPEC v1.1, BLOCCO D
--  Risorse: anagrafica (sigla/colore/avatar/recapiti come COLONNE) +
--  catalogo competenze + collegamento risorsa↔competenza + certificazioni
--  con scadenza (alert). Tabelle dedicate, non tag jsonb (servono filtri/join
--  per l'assegnazione AI e una data di scadenza per gli alert).
--
--  CLEAN SLATE: i campi che 040 aveva messo in attributes e che la SPEC vuole
--  come colonne (code/color/email/phone) vengono rimossi dai field_definition.
--  Restano come attributes i veri long-tail (icon lucide, role_title,
--  department, notes) + lo specifico mezzi/attrezzature (targa, modello...).
--  Applicare DOPO 043. PostgreSQL 16.
-- =====================================================================

-- ── D.1 resource: colonne nuove ─────────────────────────────────────
ALTER TABLE public.resource
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text;

-- ── D.2 catalogo competenze + collegamento ──────────────────────────
CREATE TABLE public.skill (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    name text NOT NULL,
    category text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (tenant_id, name)
);
CREATE INDEX skill_tenant_idx ON public.skill (tenant_id);

DROP TRIGGER IF EXISTS skill_set_updated_at ON public.skill;
CREATE TRIGGER skill_set_updated_at
  BEFORE UPDATE ON public.skill FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.skill ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill FORCE ROW LEVEL SECURITY;
CREATE POLICY skill_tenant ON public.skill
  USING (public.app_is_platform_admin() OR tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.skill TO sisuite_app;

CREATE TABLE public.resource_skill (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    resource_id uuid NOT NULL REFERENCES public.resource(id) ON DELETE CASCADE,
    skill_id uuid NOT NULL REFERENCES public.skill(id),
    level smallint,                  -- 1..3 opzionale
    note text,
    created_at timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (tenant_id, resource_id, skill_id)
);
CREATE INDEX resource_skill_resource_idx ON public.resource_skill (resource_id);
CREATE INDEX resource_skill_skill_idx ON public.resource_skill (skill_id);

ALTER TABLE public.resource_skill ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_skill FORCE ROW LEVEL SECURITY;
CREATE POLICY resource_skill_tenant ON public.resource_skill
  USING (public.app_is_platform_admin() OR tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.resource_skill TO sisuite_app;

-- ── D.3 certificazioni ──────────────────────────────────────────────
CREATE TABLE public.resource_certification (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    resource_id uuid NOT NULL REFERENCES public.resource(id) ON DELETE CASCADE,
    name text NOT NULL,
    issuer text,
    cert_number text,
    valid_from date,
    valid_until date,                -- scadenza → alert
    document_object_key text,        -- scansione su MinIO (opzionale)
    note text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid, updated_by uuid,
    PRIMARY KEY (id)
);
CREATE INDEX resource_cert_expiry_idx ON public.resource_certification (tenant_id, valid_until) WHERE valid_until IS NOT NULL;
CREATE INDEX resource_cert_resource_idx ON public.resource_certification (resource_id);

DROP TRIGGER IF EXISTS resource_certification_set_updated_at ON public.resource_certification;
CREATE TRIGGER resource_certification_set_updated_at
  BEFORE UPDATE ON public.resource_certification FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.resource_certification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_certification FORCE ROW LEVEL SECURITY;
CREATE POLICY resource_certification_tenant ON public.resource_certification
  USING (public.app_is_platform_admin() OR tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.resource_certification TO sisuite_app;

-- ── CLEAN SLATE: rimuovo i field_definition resource superati (ora colonne) ──
DELETE FROM public.field_definition
 WHERE tenant_id IS NULL AND entity = 'resource'
   AND key IN ('code','color','email','phone');
-- 004 'skills' (multiselect demo) sostituito dal catalogo skill/resource_skill.
DELETE FROM public.field_definition
 WHERE tenant_id IS NULL AND entity = 'resource' AND key = 'skills';

INSERT INTO public.sisuite_migrations (filename) VALUES ('044_resources_skills.sql')
  ON CONFLICT DO NOTHING;
