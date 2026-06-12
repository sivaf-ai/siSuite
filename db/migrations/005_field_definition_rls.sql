-- =====================================================================
--  005 — RLS per field_definition (creata in 004, dopo le policy 002).
--  Stessa logica di lookup_value: righe di SISTEMA (tenant_id NULL)
--  visibili a tutti; righe del tenant solo al tenant. Scrittura: platform
--  admin o il tenant stesso. FORCE per non bypassare.
-- =====================================================================
ALTER TABLE field_definition ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_definition FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fd_select ON field_definition;
DROP POLICY IF EXISTS fd_modify ON field_definition;
CREATE POLICY fd_select ON field_definition FOR SELECT
    USING (app_is_platform_admin() OR tenant_id IS NULL OR tenant_id = app_current_tenant());
CREATE POLICY fd_modify ON field_definition FOR ALL
    USING (app_is_platform_admin() OR tenant_id = app_current_tenant())
    WITH CHECK (app_is_platform_admin() OR tenant_id = app_current_tenant());
