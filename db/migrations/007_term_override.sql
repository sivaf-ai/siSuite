-- =====================================================================
--  007 — term_override: glossario di DOMINIO per-tenant (parte 8 §1).
--  Ogni azienda usa le proprie parole ("Cantiere" vs "Commessa"). Si
--  sovrappone alle traduzioni standard SOLO per ~30 termini di dominio
--  (non tutte le stringhe UI). Stessa filosofia di field_definition/lookup_value:
--  default di sistema (nei file i18n) + override per-tenant (qui).
--  RLS: lettura/scrittura SOLO del tenant corrente; nessuna riga di sistema.
-- =====================================================================
CREATE TABLE IF NOT EXISTS term_override (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    locale          text NOT NULL,
    term_key        text NOT NULL,
    value_singular  text NOT NULL,
    value_plural    text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, locale, term_key)
);

ALTER TABLE term_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE term_override FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS term_select ON term_override;
DROP POLICY IF EXISTS term_modify ON term_override;
CREATE POLICY term_select ON term_override FOR SELECT
    USING (app_is_platform_admin() OR tenant_id = app_current_tenant());
CREATE POLICY term_modify ON term_override FOR ALL
    USING (app_is_platform_admin() OR tenant_id = app_current_tenant())
    WITH CHECK (app_is_platform_admin() OR tenant_id = app_current_tenant());
