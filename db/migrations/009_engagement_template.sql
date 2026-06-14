-- =====================================================================
--  009 — engagement_template: MODELLI di commessa (instanziazione blueprint).
--  Un modello cattura la struttura (fasi, attività, dipendenze FS) di una
--  commessa-tipo in un blueprint jsonb; da esso si istanziano nuove commesse.
--  RLS: solo del tenant corrente (nessuna riga di sistema).
-- =====================================================================
CREATE TABLE IF NOT EXISTS engagement_template (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    name        text NOT NULL,
    type        text NOT NULL DEFAULT 'build',   -- build | maintenance (allineato a engagement.type)
    blueprint   jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS engagement_template_tenant_idx ON engagement_template (tenant_id);

ALTER TABLE engagement_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_template FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tpl_select ON engagement_template;
DROP POLICY IF EXISTS tpl_modify ON engagement_template;
CREATE POLICY tpl_select ON engagement_template FOR SELECT
    USING (app_is_platform_admin() OR tenant_id = app_current_tenant());
CREATE POLICY tpl_modify ON engagement_template FOR ALL
    USING (app_is_platform_admin() OR tenant_id = app_current_tenant())
    WITH CHECK (app_is_platform_admin() OR tenant_id = app_current_tenant());
