-- =====================================================================
--  003_app_functions.sql — funzioni di supporto applicativo.
--  Applicata DOPO schema (001) e RLS (002).
--
--  app_resolve_context(auth_user_id): mappa l'identità esterna verificata
--  (subject del JWT GoTrue) all'app_user e calcola, in un colpo solo:
--   - tenant, anagrafica minima
--   - data_scope EFFETTIVO = il più ampio tra i ruoli (own < team < tenant)
--   - l'insieme dei permessi (chiavi 'risorsa:azione')
--   - gli entitlement effettivi del piano (plan + override subscription)
--
--  È SECURITY DEFINER (gira come il proprietario = ruolo privilegiato) così
--  RISOLVE il chicken-and-egg: il backend si connette come sisuite_app
--  (soggetto a RLS) ma per impostare la sessione RLS deve PRIMA sapere chi è
--  l'utente — e quella lettura non può ancora essere filtrata da RLS.
--  La funzione legge SOLO i dati di identità/autorizzazione, niente dati di
--  business. L'EXECUTE è concesso a sisuite_app nel bootstrap.
-- =====================================================================
CREATE OR REPLACE FUNCTION app_resolve_context(p_auth_user_id text)
RETURNS TABLE (
  user_id           uuid,
  tenant_id         uuid,
  full_name         text,
  email             text,
  locale            text,
  is_platform_admin boolean,
  company_id        uuid,
  data_scope        text,
  permissions       text[],
  entitlements      jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH u AS (
    SELECT id, tenant_id, full_name, email, locale, is_platform_admin, company_id
    FROM app_user
    WHERE auth_user_id = p_auth_user_id AND active
    LIMIT 1
  ),
  scopes AS (
    SELECT r.data_scope
    FROM user_role ur JOIN role r ON r.id = ur.role_id
    WHERE ur.user_id = (SELECT id FROM u)
  ),
  perms AS (
    SELECT DISTINCT rp.permission_key
    FROM user_role ur JOIN role_permission rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = (SELECT id FROM u)
  ),
  ent AS (
    SELECT COALESCE(p.entitlements, '{}'::jsonb) || COALESCE(s.entitlement_overrides, '{}'::jsonb) AS e
    FROM subscription s JOIN plan p ON p.id = s.plan_id
    WHERE s.tenant_id = (SELECT tenant_id FROM u)
    ORDER BY s.created_at DESC
    LIMIT 1
  )
  SELECT
    u.id,
    u.tenant_id,
    u.full_name,
    u.email,
    COALESCE(u.locale, t.default_locale),
    u.is_platform_admin,
    u.company_id,
    COALESCE((
      SELECT CASE
        WHEN bool_or(data_scope = 'tenant')   THEN 'tenant'
        WHEN bool_or(data_scope = 'team')     THEN 'team'
        WHEN bool_or(data_scope = 'customer') THEN 'customer'
        ELSE 'own'
      END
      FROM scopes
    ), 'own'),
    COALESCE((SELECT array_agg(permission_key) FROM perms), ARRAY[]::text[]),
    COALESCE((SELECT e FROM ent), '{}'::jsonb)
  FROM u JOIN tenant t ON t.id = u.tenant_id;
$$;

COMMENT ON FUNCTION app_resolve_context(text) IS
  'Mappa auth_user_id (JWT sub) -> contesto utente (tenant, data_scope effettivo, permessi, entitlement). SECURITY DEFINER: bypassa RLS per la sola risoluzione identità.';
