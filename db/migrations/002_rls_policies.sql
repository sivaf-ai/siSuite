-- =====================================================================
--  rls_policies.sql — ROW-LEVEL SECURITY COMPLETA
--  Da applicare DOPO schema_core.sql (con la patch pre-sviluppo).
--  Supera la policy d'ESEMPIO `tenant_isolation` su `activity`.
--
--  COSA FA
--   - Isolamento MULTI-TENANT su ogni tabella (il dato di un tenant non
--     esce mai dal tenant).
--   - data_scope: own | team | tenant | customer (la visibilità del ruolo,
--     §6 dell'MVP). Filtra INSIEME ai permessi RBAC: l'RBAC dice se puoi
--     fare l'azione, la RLS quali righe vedi/tocchi.
--
--  SESSIONE — il backend, dopo aver verificato il JWT (Supabase Auth/GoTrue)
--  e risolto l'app_user, imposta a inizio transazione:
--     SET app.current_tenant    = '<tenant uuid>';
--     SET app.current_user      = '<app_user uuid>';
--     SET app.data_scope        = 'own'|'team'|'tenant'|'customer';
--     SET app.current_company   = '<company uuid>';   -- solo utenti esterni
--     SET app.is_platform_admin = 'true'|'false';
--  Il backend si connette con un ruolo NON superuser. FORCE RLS rende
--  soggetto anche il proprietario delle tabelle (niente bypass silenzioso).
--
--  SCELTE MVP (esplicite, non sviste):
--   - 'team' è trattato come 'tenant' finché non esiste un modello di team
--     (rimandato: backlog). Il giorno che serve, si stringe qui.
--   - Utenti INTERNI: lettura tenant-wide sui dati di CONTESTO/anagrafica
--     (engagement, phase, company, asset, resource, material...). La
--     restrizione 'own' del tecnico morde sui dati OPERATIVI/personali
--     (activity, capture, time_entry, material_consumption). Lo scoping
--     fine per-commessa del tecnico è un raffinamento futuro.
--   - 'customer' (portale esterno, read-only): filtra per company sulle
--     entità del portale (engagement, phase, activity, company, asset).
--     La proiezione che NASCONDE i campi finanziari è a livello API/vista
--     (backlog #13). Le altre tabelle restano a isolamento tenant e vanno
--     riviste quando si costruisce il portale.
-- =====================================================================

-- ── HELPER (lette dalle variabili di sessione; STABLE) ────────────────
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.current_tenant', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.current_user', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_data_scope() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT coalesce(nullif(current_setting('app.data_scope', true), ''), 'own') $$;

CREATE OR REPLACE FUNCTION app_current_company() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.current_company', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_is_platform_admin() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT coalesce(nullif(current_setting('app.is_platform_admin', true), '')::boolean, false) $$;

-- comodità: "vede tutto il tenant" (interni con scope tenant/team, o platform)
CREATE OR REPLACE FUNCTION app_sees_whole_tenant() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT app_is_platform_admin() OR app_data_scope() IN ('tenant','team') $$;

-- =====================================================================
--  GRUPPO 1 — Tabelle a SOLO isolamento tenant (anagrafiche/operative non
--  scope-sensibili). FOR ALL: stesso predicato in lettura e scrittura.
-- =====================================================================
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'app_user','company_role','company_contact','resource','resource_availability',
    'material','template','number_series','subscription','activity_dependency','activity_resource'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($pol$CREATE POLICY tenant_isolation ON %I FOR ALL
        USING (app_is_platform_admin() OR tenant_id = app_current_tenant())
        WITH CHECK (app_is_platform_admin() OR tenant_id = app_current_tenant())$pol$, t);
  END LOOP;
END $do$;

-- =====================================================================
--  GRUPPO 2 — Tabelle SENZA tenant_id o con righe di SISTEMA (tenant_id NULL).
-- =====================================================================

-- tenant: si vede solo il proprio; crea/modifica = platform o tenant admin stesso
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_rls ON tenant;
CREATE POLICY tenant_rls ON tenant FOR ALL
    USING (app_is_platform_admin() OR id = app_current_tenant())
    WITH CHECK (app_is_platform_admin() OR id = app_current_tenant());

-- plan / canonical_state: cataloghi globali. Lettura a tutti, scrittura platform.
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['plan','canonical_state'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_read ON %I',   t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON %I',  t, t);
    EXECUTE format('CREATE POLICY %I_read  ON %I FOR SELECT USING (true)', t, t);
    EXECUTE format('CREATE POLICY %I_write ON %I FOR ALL USING (app_is_platform_admin()) WITH CHECK (app_is_platform_admin())', t, t);
  END LOOP;
END $do$;

-- role: tenant_id NULL = ruolo di sistema (visibile a tutti); custom = solo il tenant
ALTER TABLE role ENABLE ROW LEVEL SECURITY;
ALTER TABLE role FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_select ON role;
DROP POLICY IF EXISTS role_modify ON role;
CREATE POLICY role_select ON role FOR SELECT
    USING (app_is_platform_admin() OR tenant_id IS NULL OR tenant_id = app_current_tenant());
CREATE POLICY role_modify ON role FOR ALL
    USING (app_is_platform_admin() OR tenant_id = app_current_tenant())
    WITH CHECK (app_is_platform_admin() OR tenant_id = app_current_tenant());

-- lookup_value: stessa logica (NULL = default di sistema)
ALTER TABLE lookup_value ENABLE ROW LEVEL SECURITY;
ALTER TABLE lookup_value FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lv_select ON lookup_value;
DROP POLICY IF EXISTS lv_modify ON lookup_value;
CREATE POLICY lv_select ON lookup_value FOR SELECT
    USING (app_is_platform_admin() OR tenant_id IS NULL OR tenant_id = app_current_tenant());
CREATE POLICY lv_modify ON lookup_value FOR ALL
    USING (app_is_platform_admin() OR tenant_id = app_current_tenant())
    WITH CHECK (app_is_platform_admin() OR tenant_id = app_current_tenant());

-- role_permission: niente tenant_id; il tenant si deduce dal role
ALTER TABLE role_permission ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permission FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rp_select ON role_permission;
DROP POLICY IF EXISTS rp_insert ON role_permission;
DROP POLICY IF EXISTS rp_delete ON role_permission;
CREATE POLICY rp_select ON role_permission FOR SELECT
    USING (EXISTS (SELECT 1 FROM role r WHERE r.id = role_permission.role_id
           AND (app_is_platform_admin() OR r.tenant_id IS NULL OR r.tenant_id = app_current_tenant())));
CREATE POLICY rp_insert ON role_permission FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM role r WHERE r.id = role_permission.role_id
           AND (app_is_platform_admin() OR r.tenant_id = app_current_tenant())));
CREATE POLICY rp_delete ON role_permission FOR DELETE
    USING (EXISTS (SELECT 1 FROM role r WHERE r.id = role_permission.role_id
           AND (app_is_platform_admin() OR r.tenant_id = app_current_tenant())));

-- user_role: niente tenant_id; il tenant si deduce dall'app_user
ALTER TABLE user_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_role FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ur_select ON user_role;
DROP POLICY IF EXISTS ur_insert ON user_role;
DROP POLICY IF EXISTS ur_delete ON user_role;
CREATE POLICY ur_select ON user_role FOR SELECT
    USING (EXISTS (SELECT 1 FROM app_user u WHERE u.id = user_role.user_id
           AND (app_is_platform_admin() OR u.tenant_id = app_current_tenant())));
CREATE POLICY ur_insert ON user_role FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM app_user u WHERE u.id = user_role.user_id
           AND (app_is_platform_admin() OR u.tenant_id = app_current_tenant())));
CREATE POLICY ur_delete ON user_role FOR DELETE
    USING (EXISTS (SELECT 1 FROM app_user u WHERE u.id = user_role.user_id
           AND (app_is_platform_admin() OR u.tenant_id = app_current_tenant())));

-- =====================================================================
--  GRUPPO 3 — Anagrafiche scope-aware per il PORTALE CLIENTE (customer).
--  Interni: tenant-wide. Esterni: solo la propria company.
-- =====================================================================

-- company
ALTER TABLE company ENABLE ROW LEVEL SECURITY;
ALTER TABLE company FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_select ON company;
DROP POLICY IF EXISTS company_modify ON company;
CREATE POLICY company_select ON company FOR SELECT
    USING ((app_is_platform_admin() OR tenant_id = app_current_tenant())
       AND (app_sees_whole_tenant() OR app_data_scope() = 'own'
            OR (app_data_scope() = 'customer' AND id = app_current_company())));
CREATE POLICY company_modify ON company FOR ALL
    USING (app_is_platform_admin() OR (tenant_id = app_current_tenant() AND app_data_scope() <> 'customer'))
    WITH CHECK (app_is_platform_admin() OR (tenant_id = app_current_tenant() AND app_data_scope() <> 'customer'));

-- asset
ALTER TABLE asset ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS asset_select ON asset;
DROP POLICY IF EXISTS asset_modify ON asset;
CREATE POLICY asset_select ON asset FOR SELECT
    USING ((app_is_platform_admin() OR tenant_id = app_current_tenant())
       AND (app_sees_whole_tenant() OR app_data_scope() = 'own'
            OR (app_data_scope() = 'customer' AND company_id = app_current_company())));
CREATE POLICY asset_modify ON asset FOR ALL
    USING (app_is_platform_admin() OR (tenant_id = app_current_tenant() AND app_data_scope() <> 'customer'))
    WITH CHECK (app_is_platform_admin() OR (tenant_id = app_current_tenant() AND app_data_scope() <> 'customer'));

-- =====================================================================
--  GRUPPO 4 — Struttura di progetto scope-aware.
--  Interni: tenant-wide in lettura. Esterni: solo la propria company.
-- =====================================================================

-- engagement
ALTER TABLE engagement ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eng_select ON engagement;
DROP POLICY IF EXISTS eng_modify ON engagement;
CREATE POLICY eng_select ON engagement FOR SELECT
    USING ((app_is_platform_admin() OR tenant_id = app_current_tenant())
       AND (app_sees_whole_tenant() OR app_data_scope() = 'own'
            OR (app_data_scope() = 'customer' AND company_id = app_current_company())));
CREATE POLICY eng_modify ON engagement FOR ALL
    USING (app_is_platform_admin() OR (tenant_id = app_current_tenant() AND app_data_scope() <> 'customer'))
    WITH CHECK (app_is_platform_admin() OR (tenant_id = app_current_tenant() AND app_data_scope() <> 'customer'));

-- phase (customer: via engagement)
ALTER TABLE phase ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS phase_select ON phase;
DROP POLICY IF EXISTS phase_modify ON phase;
CREATE POLICY phase_select ON phase FOR SELECT
    USING ((app_is_platform_admin() OR tenant_id = app_current_tenant())
       AND (app_sees_whole_tenant() OR app_data_scope() = 'own'
            OR (app_data_scope() = 'customer' AND EXISTS (
                  SELECT 1 FROM engagement e WHERE e.id = phase.engagement_id
                  AND e.company_id = app_current_company()))));
CREATE POLICY phase_modify ON phase FOR ALL
    USING (app_is_platform_admin() OR (tenant_id = app_current_tenant() AND app_data_scope() <> 'customer'))
    WITH CHECK (app_is_platform_admin() OR (tenant_id = app_current_tenant() AND app_data_scope() <> 'customer'));

-- =====================================================================
--  GRUPPO 5 — Dati OPERATIVI/PERSONALI: qui 'own' del tecnico morde davvero.
--  Supera la policy d'esempio su activity.
-- =====================================================================

-- activity: 'own' = creata da me OPPURE assegnata a me (via activity_resource)
DROP POLICY IF EXISTS tenant_isolation ON activity;  -- rimuove l'esempio dello schema base
ALTER TABLE activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS act_select ON activity;
DROP POLICY IF EXISTS act_insert ON activity;
DROP POLICY IF EXISTS act_update ON activity;
DROP POLICY IF EXISTS act_delete ON activity;
CREATE POLICY act_select ON activity FOR SELECT
    USING ((app_is_platform_admin() OR tenant_id = app_current_tenant())
       AND (app_sees_whole_tenant()
            OR (app_data_scope() = 'own' AND (
                  activity.created_by = app_current_user()
                  OR EXISTS (SELECT 1 FROM activity_resource ar JOIN resource r ON r.id = ar.resource_id
                             WHERE ar.activity_id = activity.id AND r.user_id = app_current_user())))
            OR (app_data_scope() = 'customer' AND EXISTS (
                  SELECT 1 FROM engagement e WHERE e.id = activity.engagement_id
                  AND e.company_id = app_current_company()))));
CREATE POLICY act_insert ON activity FOR INSERT
    WITH CHECK (tenant_id = app_current_tenant() AND app_data_scope() <> 'customer');
CREATE POLICY act_update ON activity FOR UPDATE
    USING (tenant_id = app_current_tenant() AND (
              app_sees_whole_tenant()
              OR (app_data_scope() = 'own' AND (
                    activity.created_by = app_current_user()
                    OR EXISTS (SELECT 1 FROM activity_resource ar JOIN resource r ON r.id = ar.resource_id
                               WHERE ar.activity_id = activity.id AND r.user_id = app_current_user())))))
    WITH CHECK (tenant_id = app_current_tenant() AND app_data_scope() <> 'customer');
CREATE POLICY act_delete ON activity FOR DELETE
    USING (tenant_id = app_current_tenant() AND app_sees_whole_tenant());

-- capture: personale -> 'own' = user_id mio
ALTER TABLE capture ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cap_select ON capture;
DROP POLICY IF EXISTS cap_insert ON capture;
DROP POLICY IF EXISTS cap_modify ON capture;
CREATE POLICY cap_select ON capture FOR SELECT
    USING ((app_is_platform_admin() OR tenant_id = app_current_tenant())
       AND (app_sees_whole_tenant()
            OR (app_data_scope() = 'own' AND capture.user_id = app_current_user())));
CREATE POLICY cap_insert ON capture FOR INSERT
    WITH CHECK (tenant_id = app_current_tenant()
       AND (app_sees_whole_tenant() OR capture.user_id = app_current_user()));
CREATE POLICY cap_modify ON capture FOR UPDATE
    USING (tenant_id = app_current_tenant()
       AND (app_sees_whole_tenant() OR capture.user_id = app_current_user()))
    WITH CHECK (tenant_id = app_current_tenant());

-- time_entry: 'own' = creata da me OPPURE risorsa-persona collegata a me
ALTER TABLE time_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entry FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS te_select ON time_entry;
DROP POLICY IF EXISTS te_insert ON time_entry;
DROP POLICY IF EXISTS te_modify ON time_entry;
CREATE POLICY te_select ON time_entry FOR SELECT
    USING ((app_is_platform_admin() OR tenant_id = app_current_tenant())
       AND (app_sees_whole_tenant()
            OR (app_data_scope() = 'own' AND (
                  time_entry.created_by = app_current_user()
                  OR EXISTS (SELECT 1 FROM resource r WHERE r.id = time_entry.resource_id
                             AND r.user_id = app_current_user())))));
CREATE POLICY te_insert ON time_entry FOR INSERT
    WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY te_modify ON time_entry FOR UPDATE
    USING (tenant_id = app_current_tenant() AND (
              app_sees_whole_tenant()
              OR time_entry.created_by = app_current_user()
              OR EXISTS (SELECT 1 FROM resource r WHERE r.id = time_entry.resource_id
                         AND r.user_id = app_current_user())))
    WITH CHECK (tenant_id = app_current_tenant());

-- material_consumption: 'own' = creata da me
ALTER TABLE material_consumption ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_consumption FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mc_select ON material_consumption;
DROP POLICY IF EXISTS mc_insert ON material_consumption;
DROP POLICY IF EXISTS mc_modify ON material_consumption;
CREATE POLICY mc_select ON material_consumption FOR SELECT
    USING ((app_is_platform_admin() OR tenant_id = app_current_tenant())
       AND (app_sees_whole_tenant()
            OR (app_data_scope() = 'own' AND material_consumption.created_by = app_current_user())));
CREATE POLICY mc_insert ON material_consumption FOR INSERT
    WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY mc_modify ON material_consumption FOR UPDATE
    USING (tenant_id = app_current_tenant()
       AND (app_sees_whole_tenant() OR material_consumption.created_by = app_current_user()))
    WITH CHECK (tenant_id = app_current_tenant());

-- =====================================================================
--  NOTE / RIMANDATI (vedi BACKLOG)
--   - Modello di TEAM (data_scope='team' oggi = 'tenant').
--   - Proiezione client-safe (nascondere i campi finanziari) per il portale
--     esterno: livello API/vista, non RLS (backlog #13).
--   - Scoping fine per-commessa del tecnico sulle entità di contesto.
--   - Le tabelle del Gruppo 1 andranno riviste per 'customer' quando si
--     costruisce il portale (oggi un esterno non è provisionato).
-- =====================================================================
