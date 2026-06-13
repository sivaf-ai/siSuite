# siSuite — Schema completo del database (riferimento)

> Documento di **riferimento dello schema DB** al **13/06/2026**, generato dallo
> **schema reale** del database (`pg_dump` + catalogo), non dai file di migrazione.
> Pensato per Claude AI e per i tecnici: usa **SQL standard**. PostgreSQL 16.
>
> **Nota**: lo schema `public` contiene anche alcuni ENUM creati da **GoTrue**
> (`aal_level`, `code_challenge_method`, …): NON fanno parte di siSuite e sono
> esclusi da questo documento. Le tabelle di GoTrue vivono nello schema `auth`.

## Come è gestito lo schema
- **Migrazioni** (idempotenti, tracciate in `public.sisuite_migrations`), eseguite dal servizio Docker `migrate`:
  - `001_schema_core.sql` — tabelle base + "patch pre-sviluppo" (working_hours, audit, soft-delete, offline, capture multimodale, seam auth) + **seed** (ruoli, stati canonici, etichette, piani).
  - `002_rls_policies.sql` — Row-Level Security completa + funzioni helper di sessione.
  - `003_app_functions.sql` — funzione `app_resolve_context` (risolve il contesto utente per l'RLS).
  - `004_field_definition.sql` — tabella `field_definition` (campi dinamici per verticale) + seed.
  - `005_field_definition_rls.sql` — RLS su `field_definition`.
  - `006_fiber_fields.sql` — **SOLO SEED** (nessun DDL): campi di sistema del verticale `fiber` in `field_definition` (vedi §5.5).
- **Bootstrap applicativo** (`packages/backend/src/bootstrap.ts`), dopo le migrazioni, con connessione admin: crea il ruolo DB `sisuite_app`, i grant dei permessi dei ruoli di sistema (`role_permission`, dal catalogo in `permissions.ts`), il primo tenant, il numeratore `engagement`, la subscription trial, una company demo e l'utente Owner (GoTrue + `app_user` + `user_role`). **Aggiunta**: se `PLATFORM_ADMIN_EMAIL` è impostato, marca quell'`app_user` con `is_platform_admin=true` (super admin di piattaforma; colonna già esistente, nessun cambio schema).

> **Nota (13/06/2026):** dalla generazione di questo documento la **struttura** dello schema è **invariata** (28 tabelle, 7 enum, 8 funzioni, ~86 indici, ~49 policy). L'unica modifica al DB è la migrazione **006** (solo seed `field_definition` fibra). I "Demo Data Pack" creano dati a runtime in tenant dedicati, non toccano lo schema né le righe di sistema (`tenant_id IS NULL`).

## Inventario oggetti (schema `public`, solo siSuite)
- **28 tabelle** di dominio (+ `sisuite_migrations` tracker).
- **7 tipi ENUM**, **8 funzioni** applicative, **trigger** `updated_at` su tabelle mutabili, **~86 indici**, **RLS** con ~49 policy.

---

## 1. Estensioni richieste
```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "btree_gist"; -- vincolo anti-sovrapposizione (no double-booking)
CREATE EXTENSION IF NOT EXISTS "vector";     -- pgvector: embedding semantici (capture.embedding)
```

## 2. Tipi ENUM (la "spina" universale; gli specifici di verticale restano TEXT)
```sql
CREATE TYPE company_type        AS ENUM ('private', 'organization');
CREATE TYPE customer_nature     AS ENUM ('episodic', 'recurring');           -- privato vs contratto
CREATE TYPE engagement_type     AS ENUM ('build', 'maintenance');            -- realizzazione vs manutenzione
CREATE TYPE resource_kind       AS ENUM ('person', 'vehicle', 'equipment');  -- persone / mezzi / attrezzature
CREATE TYPE capture_status      AS ENUM ('pending', 'proposed', 'applied', 'rejected');
CREATE TYPE subscription_status AS ENUM ('trial', 'active', 'past_due', 'suspended', 'cancelled', 'expired');
CREATE TYPE dependency_type     AS ENUM ('FS', 'SS', 'FF', 'SF');            -- finish-to-start (default) e varianti
```
> Nota di design: **gli stati** (di attività/fase/commessa) NON sono enum: il valore *canonico* sta in `canonical_state`, le *etichette* configurabili in `lookup_value`. **I ruoli** non sono enum: sono RBAC (`role`/`role_permission`/`user_role`).

## 3. Funzioni applicative
Helper di sessione (lette dalle variabili `app.*` impostate a inizio transazione via `SET LOCAL`) + risolutore di contesto + trigger `updated_at`.
```sql
CREATE OR REPLACE FUNCTION public.app_current_tenant()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$ SELECT nullif(current_setting('app.current_tenant', true), '')::uuid $function$


CREATE OR REPLACE FUNCTION public.app_current_user()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$ SELECT nullif(current_setting('app.current_user', true), '')::uuid $function$


CREATE OR REPLACE FUNCTION public.app_data_scope()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$ SELECT coalesce(nullif(current_setting('app.data_scope', true), ''), 'own') $function$


CREATE OR REPLACE FUNCTION public.app_current_company()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$ SELECT nullif(current_setting('app.current_company', true), '')::uuid $function$


CREATE OR REPLACE FUNCTION public.app_is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$ SELECT coalesce(nullif(current_setting('app.is_platform_admin', true), '')::boolean, false) $function$


CREATE OR REPLACE FUNCTION public.app_sees_whole_tenant()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$ SELECT app_is_platform_admin() OR app_data_scope() IN ('tenant','team') $function$


CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.app_resolve_context(p_auth_user_id text)
 RETURNS TABLE(user_id uuid, tenant_id uuid, full_name text, email text, locale text, is_platform_admin boolean, company_id uuid, data_scope text, permissions text[], entitlements jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$


```

---

## 4. Tabelle (DDL completo per dominio)
Ogni blocco include colonne, vincoli (PK/FK/UNIQUE/CHECK), indici, trigger `updated_at` e **policy RLS** della tabella. La RLS è `FORCE` e il backend si connette come ruolo non-superuser `sisuite_app`.

### 4.1 Piattaforma / tenancy
```sql

\restrict ZlzJPHcRZZ161M2lyntqFCLMDuhfw4tTHdiiiugT6Mad4Ils3Rsf1yZRDMgiNeA

CREATE TABLE public.plan (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    billing_model text DEFAULT 'flat'::text NOT NULL,
    price_month numeric,
    currency text DEFAULT 'EUR'::text NOT NULL,
    entitlements jsonb DEFAULT '{}'::jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.plan FORCE ROW LEVEL SECURITY;

CREATE TABLE public.subscription (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    status public.subscription_status DEFAULT 'trial'::public.subscription_status NOT NULL,
    trial_ends_at timestamp with time zone,
    current_period_end timestamp with time zone,
    cancel_at timestamp with time zone,
    provider text,
    provider_ref text,
    entitlement_overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.subscription FORCE ROW LEVEL SECURITY;

CREATE TABLE public.tenant (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    vertical text NOT NULL,
    default_locale text DEFAULT 'it-IT'::text NOT NULL,
    timezone text DEFAULT 'Europe/Rome'::text NOT NULL,
    domain_pack jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    working_hours jsonb DEFAULT '{"fri": [["08:00", "13:00"], ["14:00", "18:00"]], "mon": [["08:00", "13:00"], ["14:00", "18:00"]], "sat": [], "sun": [], "thu": [["08:00", "13:00"], ["14:00", "18:00"]], "tue": [["08:00", "13:00"], ["14:00", "18:00"]], "wed": [["08:00", "13:00"], ["14:00", "18:00"]]}'::jsonb NOT NULL
);

ALTER TABLE ONLY public.tenant FORCE ROW LEVEL SECURITY;

ALTER TABLE ONLY public.plan
    ADD CONSTRAINT plan_code_key UNIQUE (code);

ALTER TABLE ONLY public.plan
    ADD CONSTRAINT plan_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.subscription
    ADD CONSTRAINT subscription_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tenant
    ADD CONSTRAINT tenant_pkey PRIMARY KEY (id);

CREATE INDEX subscription_current_period_end_idx ON public.subscription USING btree (current_period_end);

CREATE INDEX subscription_tenant_id_idx ON public.subscription USING btree (tenant_id);

CREATE TRIGGER trg_plan_updated BEFORE UPDATE ON public.plan FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_subscription_updated BEFORE UPDATE ON public.subscription FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE ONLY public.subscription
    ADD CONSTRAINT subscription_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plan(id);

ALTER TABLE ONLY public.subscription
    ADD CONSTRAINT subscription_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;

ALTER TABLE public.plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY plan_read ON public.plan FOR SELECT USING (true);

CREATE POLICY plan_write ON public.plan USING (public.app_is_platform_admin()) WITH CHECK (public.app_is_platform_admin());

ALTER TABLE public.subscription ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tenant ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.subscription USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));

CREATE POLICY tenant_rls ON public.tenant USING ((public.app_is_platform_admin() OR (id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (id = public.app_current_tenant())));

\unrestrict ZlzJPHcRZZ161M2lyntqFCLMDuhfw4tTHdiiiugT6Mad4Ils3Rsf1yZRDMgiNeA

```

### 4.2 Identità & RBAC
```sql

\restrict NscB0GjPWx60u5czQahfNUU5asiMgEhvyqcTwFfP9lo3k3yF3RdMbiiQhbY9ARk

CREATE TABLE public.app_user (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    full_name text NOT NULL,
    email text,
    phone text,
    locale text,
    is_platform_admin boolean DEFAULT false NOT NULL,
    company_id uuid,
    active boolean DEFAULT true NOT NULL,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    auth_user_id text
);

ALTER TABLE ONLY public.app_user FORCE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.app_user.auth_user_id IS 'Identità esterna verificata (Supabase Auth/GoTrue). Nessuna credenziale in app_user; authZ resta su RBAC+RLS.';

CREATE TABLE public.role (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    name text NOT NULL,
    description text,
    is_system boolean DEFAULT false NOT NULL,
    data_scope text DEFAULT 'own'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.role FORCE ROW LEVEL SECURITY;

CREATE TABLE public.role_permission (
    role_id uuid NOT NULL,
    permission_key text NOT NULL
);

ALTER TABLE ONLY public.role_permission FORCE ROW LEVEL SECURITY;

CREATE TABLE public.user_role (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL
);

ALTER TABLE ONLY public.user_role FORCE ROW LEVEL SECURITY;

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_auth_user_id_key UNIQUE (auth_user_id);

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.role_permission
    ADD CONSTRAINT role_permission_pkey PRIMARY KEY (role_id, permission_key);

ALTER TABLE ONLY public.role
    ADD CONSTRAINT role_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.role
    ADD CONSTRAINT role_tenant_id_name_key UNIQUE (tenant_id, name);

ALTER TABLE ONLY public.user_role
    ADD CONSTRAINT user_role_pkey PRIMARY KEY (user_id, role_id);

CREATE INDEX app_user_company_id_idx ON public.app_user USING btree (company_id);

CREATE INDEX app_user_tenant_id_idx ON public.app_user USING btree (tenant_id);

CREATE UNIQUE INDEX role_system_name_uniq ON public.role USING btree (name) WHERE (tenant_id IS NULL);

CREATE INDEX user_role_role_id_idx ON public.user_role USING btree (role_id);

CREATE TRIGGER trg_app_user_updated BEFORE UPDATE ON public.app_user FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_role_updated BEFORE UPDATE ON public.role FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_company_fk FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.role_permission
    ADD CONSTRAINT role_permission_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.role(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.role
    ADD CONSTRAINT role_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_role
    ADD CONSTRAINT user_role_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.role(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_role
    ADD CONSTRAINT user_role_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;

ALTER TABLE public.app_user ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.role ENABLE ROW LEVEL SECURITY;

CREATE POLICY role_modify ON public.role USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));

ALTER TABLE public.role_permission ENABLE ROW LEVEL SECURITY;

CREATE POLICY role_select ON public.role FOR SELECT USING ((public.app_is_platform_admin() OR (tenant_id IS NULL) OR (tenant_id = public.app_current_tenant())));

CREATE POLICY rp_delete ON public.role_permission FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.role r
  WHERE ((r.id = role_permission.role_id) AND (public.app_is_platform_admin() OR (r.tenant_id = public.app_current_tenant()))))));

CREATE POLICY rp_insert ON public.role_permission FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.role r
  WHERE ((r.id = role_permission.role_id) AND (public.app_is_platform_admin() OR (r.tenant_id = public.app_current_tenant()))))));

CREATE POLICY rp_select ON public.role_permission FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.role r
  WHERE ((r.id = role_permission.role_id) AND (public.app_is_platform_admin() OR (r.tenant_id IS NULL) OR (r.tenant_id = public.app_current_tenant()))))));

CREATE POLICY tenant_isolation ON public.app_user USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));

CREATE POLICY ur_delete ON public.user_role FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.app_user u
  WHERE ((u.id = user_role.user_id) AND (public.app_is_platform_admin() OR (u.tenant_id = public.app_current_tenant()))))));

CREATE POLICY ur_insert ON public.user_role FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.app_user u
  WHERE ((u.id = user_role.user_id) AND (public.app_is_platform_admin() OR (u.tenant_id = public.app_current_tenant()))))));

CREATE POLICY ur_select ON public.user_role FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.app_user u
  WHERE ((u.id = user_role.user_id) AND (public.app_is_platform_admin() OR (u.tenant_id = public.app_current_tenant()))))));

ALTER TABLE public.user_role ENABLE ROW LEVEL SECURITY;

\unrestrict NscB0GjPWx60u5czQahfNUU5asiMgEhvyqcTwFfP9lo3k3yF3RdMbiiQhbY9ARk

```

### 4.3 Configurazione (stati, etichette, numeratori, template, campi dinamici)
```sql

\restrict isByVhvibOPOmEednMHOSGS45syF1VsnYQslXbbAbmkav2XMU1EclThDqVdqEeh

CREATE TABLE public.canonical_state (
    category text NOT NULL,
    code text NOT NULL,
    sequence integer DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY public.canonical_state FORCE ROW LEVEL SECURITY;

CREATE TABLE public.field_definition (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    vertical text,
    entity text NOT NULL,
    key text NOT NULL,
    label jsonb NOT NULL,
    help jsonb,
    data_type text NOT NULL,
    required boolean DEFAULT false NOT NULL,
    options jsonb,
    validation jsonb,
    unit text,
    placeholder jsonb,
    group_key text,
    sequence integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL
);

ALTER TABLE ONLY public.field_definition FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.field_definition IS 'Catalogo dei campi dentro attributes jsonb: guida validazione (API) e rendering form (UI). Sistema (tenant_id NULL) per verticale + override tenant.';

CREATE TABLE public.lookup_value (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    category text NOT NULL,
    canonical text NOT NULL,
    code text NOT NULL,
    label jsonb NOT NULL,
    abbreviation text,
    color_token text,
    icon text,
    sequence integer DEFAULT 0 NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.lookup_value FORCE ROW LEVEL SECURITY;

CREATE TABLE public.number_series (
    tenant_id uuid NOT NULL,
    key text NOT NULL,
    format text DEFAULT '{YYYY}-{SEQ:4}'::text NOT NULL,
    reset_period text DEFAULT 'yearly'::text NOT NULL,
    current_period text DEFAULT ''::text NOT NULL,
    last_number bigint DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY public.number_series FORCE ROW LEVEL SECURITY;

CREATE TABLE public.template (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    scope text NOT NULL,
    vertical text,
    name text NOT NULL,
    description text,
    blueprint jsonb DEFAULT '{}'::jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    archived_at timestamp with time zone
);

ALTER TABLE ONLY public.template FORCE ROW LEVEL SECURITY;

ALTER TABLE ONLY public.canonical_state
    ADD CONSTRAINT canonical_state_pkey PRIMARY KEY (category, code);

ALTER TABLE ONLY public.field_definition
    ADD CONSTRAINT field_definition_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.field_definition
    ADD CONSTRAINT field_definition_tenant_id_vertical_entity_key_key UNIQUE (tenant_id, vertical, entity, key);

ALTER TABLE ONLY public.lookup_value
    ADD CONSTRAINT lookup_value_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.lookup_value
    ADD CONSTRAINT lookup_value_tenant_id_category_code_key UNIQUE (tenant_id, category, code);

ALTER TABLE ONLY public.number_series
    ADD CONSTRAINT number_series_pkey PRIMARY KEY (tenant_id, key);

ALTER TABLE ONLY public.template
    ADD CONSTRAINT template_pkey PRIMARY KEY (id);

CREATE INDEX field_definition_entity_vertical_idx ON public.field_definition USING btree (entity, vertical);

CREATE UNIQUE INDEX field_definition_system_uniq ON public.field_definition USING btree (vertical, entity, key) WHERE (tenant_id IS NULL);

CREATE INDEX field_definition_tenant_id_idx ON public.field_definition USING btree (tenant_id);

CREATE UNIQUE INDEX lookup_value_system_code_uniq ON public.lookup_value USING btree (category, code) WHERE (tenant_id IS NULL);

CREATE INDEX lookup_value_tenant_id_category_idx ON public.lookup_value USING btree (tenant_id, category);

CREATE INDEX template_tenant_id_scope_idx ON public.template USING btree (tenant_id, scope);

CREATE TRIGGER trg_lookup_value_updated BEFORE UPDATE ON public.lookup_value FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_template_updated BEFORE UPDATE ON public.template FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE ONLY public.field_definition
    ADD CONSTRAINT field_definition_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.lookup_value
    ADD CONSTRAINT lookup_value_category_canonical_fkey FOREIGN KEY (category, canonical) REFERENCES public.canonical_state(category, code);

ALTER TABLE ONLY public.lookup_value
    ADD CONSTRAINT lookup_value_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.number_series
    ADD CONSTRAINT number_series_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.template
    ADD CONSTRAINT template_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.template
    ADD CONSTRAINT template_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.template
    ADD CONSTRAINT template_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;

ALTER TABLE public.canonical_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY canonical_state_read ON public.canonical_state FOR SELECT USING (true);

CREATE POLICY canonical_state_write ON public.canonical_state USING (public.app_is_platform_admin()) WITH CHECK (public.app_is_platform_admin());

CREATE POLICY fd_modify ON public.field_definition USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));

CREATE POLICY fd_select ON public.field_definition FOR SELECT USING ((public.app_is_platform_admin() OR (tenant_id IS NULL) OR (tenant_id = public.app_current_tenant())));

ALTER TABLE public.field_definition ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lookup_value ENABLE ROW LEVEL SECURITY;

CREATE POLICY lv_modify ON public.lookup_value USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));

CREATE POLICY lv_select ON public.lookup_value FOR SELECT USING ((public.app_is_platform_admin() OR (tenant_id IS NULL) OR (tenant_id = public.app_current_tenant())));

ALTER TABLE public.number_series ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.template ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.number_series USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));

CREATE POLICY tenant_isolation ON public.template USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));

\unrestrict isByVhvibOPOmEednMHOSGS45syF1VsnYQslXbbAbmkav2XMU1EclThDqVdqEeh

```

### 4.4 Anagrafiche
```sql

\restrict QufMzZdqzxn9vDpAQ1hduyc4IwFdzjowlKbhDC2qxYO3ash0gXTmne7rZN5OjAw

CREATE TABLE public.asset (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    company_id uuid NOT NULL,
    kind text NOT NULL,
    label text NOT NULL,
    geo point,
    installed_at date,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    archived_at timestamp with time zone
);

ALTER TABLE ONLY public.asset FORCE ROW LEVEL SECURITY;

CREATE TABLE public.company (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    display_name text NOT NULL,
    type public.company_type DEFAULT 'organization'::public.company_type NOT NULL,
    geo point,
    address text,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    archived_at timestamp with time zone
);

ALTER TABLE ONLY public.company FORCE ROW LEVEL SECURITY;

CREATE TABLE public.company_contact (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    company_id uuid NOT NULL,
    full_name text NOT NULL,
    role_title text,
    email text,
    phone text,
    is_primary boolean DEFAULT false NOT NULL,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.company_contact FORCE ROW LEVEL SECURITY;

CREATE TABLE public.company_role (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    company_id uuid NOT NULL,
    role text NOT NULL,
    customer_nature public.customer_nature,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.company_role FORCE ROW LEVEL SECURITY;

CREATE TABLE public.material (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    unit text NOT NULL,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    archived_at timestamp with time zone
);

ALTER TABLE ONLY public.material FORCE ROW LEVEL SECURITY;

CREATE TABLE public.resource (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    kind public.resource_kind NOT NULL,
    label text NOT NULL,
    user_id uuid,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    working_hours jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    archived_at timestamp with time zone
);

ALTER TABLE ONLY public.resource FORCE ROW LEVEL SECURITY;

CREATE TABLE public.resource_availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_id uuid NOT NULL,
    kind text DEFAULT 'unavailable'::text NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT resource_availability_check CHECK ((ends_at > starts_at))
);

ALTER TABLE ONLY public.resource_availability FORCE ROW LEVEL SECURITY;

ALTER TABLE ONLY public.asset
    ADD CONSTRAINT asset_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.company_contact
    ADD CONSTRAINT company_contact_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.company
    ADD CONSTRAINT company_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.company_role
    ADD CONSTRAINT company_role_company_id_role_key UNIQUE (company_id, role);

ALTER TABLE ONLY public.company_role
    ADD CONSTRAINT company_role_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.material
    ADD CONSTRAINT material_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.material
    ADD CONSTRAINT material_tenant_id_name_key UNIQUE (tenant_id, name);

ALTER TABLE ONLY public.resource_availability
    ADD CONSTRAINT resource_availability_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.resource
    ADD CONSTRAINT resource_pkey PRIMARY KEY (id);

CREATE INDEX asset_attributes_idx ON public.asset USING gin (attributes);

CREATE INDEX asset_company_id_idx ON public.asset USING btree (company_id);

CREATE INDEX asset_tenant_id_idx ON public.asset USING btree (tenant_id);

CREATE INDEX company_attributes_idx ON public.company USING gin (attributes);

CREATE INDEX company_contact_company_id_idx ON public.company_contact USING btree (company_id);

CREATE INDEX company_contact_tenant_id_idx ON public.company_contact USING btree (tenant_id);

CREATE INDEX company_role_company_id_idx ON public.company_role USING btree (company_id);

CREATE INDEX company_role_tenant_id_idx ON public.company_role USING btree (tenant_id);

CREATE INDEX company_tenant_id_idx ON public.company USING btree (tenant_id);

CREATE INDEX resource_availability_resource_id_idx ON public.resource_availability USING btree (resource_id);

CREATE INDEX resource_availability_resource_id_tstzrange_idx ON public.resource_availability USING gist (resource_id, tstzrange(starts_at, ends_at));

CREATE INDEX resource_availability_tenant_id_idx ON public.resource_availability USING btree (tenant_id);

CREATE INDEX resource_tenant_id_idx ON public.resource USING btree (tenant_id);

CREATE TRIGGER trg_asset_updated BEFORE UPDATE ON public.asset FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_company_contact_updated BEFORE UPDATE ON public.company_contact FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_company_role_updated BEFORE UPDATE ON public.company_role FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_company_updated BEFORE UPDATE ON public.company FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_material_updated BEFORE UPDATE ON public.material FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_resource_availability_updated BEFORE UPDATE ON public.resource_availability FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_resource_updated BEFORE UPDATE ON public.resource FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE ONLY public.asset
    ADD CONSTRAINT asset_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.asset
    ADD CONSTRAINT asset_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.asset
    ADD CONSTRAINT asset_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.asset
    ADD CONSTRAINT asset_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.company_contact
    ADD CONSTRAINT company_contact_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.company_contact
    ADD CONSTRAINT company_contact_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.company
    ADD CONSTRAINT company_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.company_role
    ADD CONSTRAINT company_role_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.company_role
    ADD CONSTRAINT company_role_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.company
    ADD CONSTRAINT company_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.company
    ADD CONSTRAINT company_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.material
    ADD CONSTRAINT material_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.material
    ADD CONSTRAINT material_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.material
    ADD CONSTRAINT material_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.resource_availability
    ADD CONSTRAINT resource_availability_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resource(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.resource_availability
    ADD CONSTRAINT resource_availability_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.resource
    ADD CONSTRAINT resource_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.resource
    ADD CONSTRAINT resource_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.resource
    ADD CONSTRAINT resource_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.resource
    ADD CONSTRAINT resource_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE SET NULL;

ALTER TABLE public.asset ENABLE ROW LEVEL SECURITY;

CREATE POLICY asset_modify ON public.asset USING ((public.app_is_platform_admin() OR ((tenant_id = public.app_current_tenant()) AND (public.app_data_scope() <> 'customer'::text)))) WITH CHECK ((public.app_is_platform_admin() OR ((tenant_id = public.app_current_tenant()) AND (public.app_data_scope() <> 'customer'::text))));

CREATE POLICY asset_select ON public.asset FOR SELECT USING (((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())) AND (public.app_sees_whole_tenant() OR (public.app_data_scope() = 'own'::text) OR ((public.app_data_scope() = 'customer'::text) AND (company_id = public.app_current_company())))));

ALTER TABLE public.company ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.company_contact ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_modify ON public.company USING ((public.app_is_platform_admin() OR ((tenant_id = public.app_current_tenant()) AND (public.app_data_scope() <> 'customer'::text)))) WITH CHECK ((public.app_is_platform_admin() OR ((tenant_id = public.app_current_tenant()) AND (public.app_data_scope() <> 'customer'::text))));

ALTER TABLE public.company_role ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_select ON public.company FOR SELECT USING (((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())) AND (public.app_sees_whole_tenant() OR (public.app_data_scope() = 'own'::text) OR ((public.app_data_scope() = 'customer'::text) AND (id = public.app_current_company())))));

ALTER TABLE public.material ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.resource ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.resource_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.company_contact USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));

CREATE POLICY tenant_isolation ON public.company_role USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));

CREATE POLICY tenant_isolation ON public.material USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));

CREATE POLICY tenant_isolation ON public.resource USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));

CREATE POLICY tenant_isolation ON public.resource_availability USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));

\unrestrict QufMzZdqzxn9vDpAQ1hduyc4IwFdzjowlKbhDC2qxYO3ash0gXTmne7rZN5OjAw

```

### 4.5 Lavoro / commessa
```sql

\restrict tOVhRD3klTDmx5EOcf6gSARm9cfwFHAYAsFkGg0hbuaLfzClwSN8YSOZSDVkSSZ

CREATE TABLE public.activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    engagement_id uuid NOT NULL,
    phase_id uuid,
    asset_id uuid,
    title text NOT NULL,
    kind text,
    status_id uuid NOT NULL,
    priority_id uuid,
    estimated_minutes integer,
    scheduled_start timestamp with time zone,
    scheduled_end timestamp with time zone,
    earliest_start timestamp with time zone,
    due_by timestamp with time zone,
    geo point,
    checklist jsonb DEFAULT '[]'::jsonb NOT NULL,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT activity_check CHECK (((earliest_start IS NULL) OR (due_by IS NULL) OR (earliest_start <= due_by)))
);

ALTER TABLE ONLY public.activity FORCE ROW LEVEL SECURITY;

CREATE TABLE public.activity_dependency (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    predecessor_id uuid NOT NULL,
    successor_id uuid NOT NULL,
    type public.dependency_type DEFAULT 'FS'::public.dependency_type NOT NULL,
    lag_minutes integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_dependency_check CHECK ((predecessor_id <> successor_id))
);

ALTER TABLE ONLY public.activity_dependency FORCE ROW LEVEL SECURITY;

CREATE TABLE public.activity_resource (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    resource_id uuid NOT NULL,
    planned_from timestamp with time zone,
    planned_to timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.activity_resource FORCE ROW LEVEL SECURITY;

CREATE TABLE public.engagement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    company_id uuid NOT NULL,
    asset_id uuid,
    code text NOT NULL,
    manager_id uuid,
    type public.engagement_type NOT NULL,
    title text NOT NULL,
    status_id uuid NOT NULL,
    started_on date,
    ended_on date,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    archived_at timestamp with time zone
);

ALTER TABLE ONLY public.engagement FORCE ROW LEVEL SECURITY;

CREATE TABLE public.phase (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    engagement_id uuid NOT NULL,
    parent_phase_id uuid,
    name text NOT NULL,
    seq integer NOT NULL,
    planned_start date,
    planned_end date,
    status_id uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid
);

ALTER TABLE ONLY public.phase FORCE ROW LEVEL SECURITY;

ALTER TABLE ONLY public.activity_dependency
    ADD CONSTRAINT activity_dependency_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.activity_dependency
    ADD CONSTRAINT activity_dependency_predecessor_id_successor_id_key UNIQUE (predecessor_id, successor_id);

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.activity_resource
    ADD CONSTRAINT activity_resource_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.engagement
    ADD CONSTRAINT engagement_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.engagement
    ADD CONSTRAINT engagement_tenant_id_code_key UNIQUE (tenant_id, code);

ALTER TABLE ONLY public.activity_resource
    ADD CONSTRAINT no_double_booking EXCLUDE USING gist (resource_id WITH =, tstzrange(planned_from, planned_to) WITH &&) WHERE (((planned_from IS NOT NULL) AND (planned_to IS NOT NULL)));

ALTER TABLE ONLY public.phase
    ADD CONSTRAINT phase_engagement_id_parent_phase_id_seq_key UNIQUE (engagement_id, parent_phase_id, seq);

ALTER TABLE ONLY public.phase
    ADD CONSTRAINT phase_pkey PRIMARY KEY (id);

CREATE INDEX activity_dependency_predecessor_id_idx ON public.activity_dependency USING btree (predecessor_id);

CREATE INDEX activity_dependency_successor_id_idx ON public.activity_dependency USING btree (successor_id);

CREATE INDEX activity_dependency_tenant_id_idx ON public.activity_dependency USING btree (tenant_id);

CREATE INDEX activity_engagement_id_idx ON public.activity USING btree (engagement_id);

CREATE INDEX activity_resource_activity_id_idx ON public.activity_resource USING btree (activity_id);

CREATE INDEX activity_resource_tenant_id_idx ON public.activity_resource USING btree (tenant_id);

CREATE INDEX activity_scheduled_start_idx ON public.activity USING btree (scheduled_start);

CREATE INDEX activity_tenant_id_idx ON public.activity USING btree (tenant_id);

CREATE INDEX engagement_company_id_idx ON public.engagement USING btree (company_id);

CREATE INDEX engagement_manager_id_idx ON public.engagement USING btree (manager_id);

CREATE INDEX engagement_tenant_id_idx ON public.engagement USING btree (tenant_id);

CREATE INDEX phase_parent_phase_id_idx ON public.phase USING btree (parent_phase_id);

CREATE INDEX phase_tenant_id_idx ON public.phase USING btree (tenant_id);

CREATE TRIGGER trg_activity_dependency_updated BEFORE UPDATE ON public.activity_dependency FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_activity_resource_updated BEFORE UPDATE ON public.activity_resource FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_activity_updated BEFORE UPDATE ON public.activity FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_engagement_updated BEFORE UPDATE ON public.engagement FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_phase_updated BEFORE UPDATE ON public.phase FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.asset(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.activity_dependency
    ADD CONSTRAINT activity_dependency_predecessor_id_fkey FOREIGN KEY (predecessor_id) REFERENCES public.activity(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.activity_dependency
    ADD CONSTRAINT activity_dependency_successor_id_fkey FOREIGN KEY (successor_id) REFERENCES public.activity(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.activity_dependency
    ADD CONSTRAINT activity_dependency_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagement(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_phase_id_fkey FOREIGN KEY (phase_id) REFERENCES public.phase(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_priority_id_fkey FOREIGN KEY (priority_id) REFERENCES public.lookup_value(id);

ALTER TABLE ONLY public.activity_resource
    ADD CONSTRAINT activity_resource_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activity(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.activity_resource
    ADD CONSTRAINT activity_resource_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resource(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.activity_resource
    ADD CONSTRAINT activity_resource_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.lookup_value(id);

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.engagement
    ADD CONSTRAINT engagement_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.asset(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.engagement
    ADD CONSTRAINT engagement_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.engagement
    ADD CONSTRAINT engagement_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.engagement
    ADD CONSTRAINT engagement_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.app_user(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.engagement
    ADD CONSTRAINT engagement_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.lookup_value(id);

ALTER TABLE ONLY public.engagement
    ADD CONSTRAINT engagement_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.engagement
    ADD CONSTRAINT engagement_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.phase
    ADD CONSTRAINT phase_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.phase
    ADD CONSTRAINT phase_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagement(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.phase
    ADD CONSTRAINT phase_parent_phase_id_fkey FOREIGN KEY (parent_phase_id) REFERENCES public.phase(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.phase
    ADD CONSTRAINT phase_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.lookup_value(id);

ALTER TABLE ONLY public.phase
    ADD CONSTRAINT phase_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.phase
    ADD CONSTRAINT phase_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;

CREATE POLICY act_delete ON public.activity FOR DELETE USING (((tenant_id = public.app_current_tenant()) AND public.app_sees_whole_tenant()));

CREATE POLICY act_insert ON public.activity FOR INSERT WITH CHECK (((tenant_id = public.app_current_tenant()) AND (public.app_data_scope() <> 'customer'::text)));

CREATE POLICY act_select ON public.activity FOR SELECT USING (((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())) AND (public.app_sees_whole_tenant() OR ((public.app_data_scope() = 'own'::text) AND ((created_by = public.app_current_user()) OR (EXISTS ( SELECT 1
   FROM (public.activity_resource ar
     JOIN public.resource r ON ((r.id = ar.resource_id)))
  WHERE ((ar.activity_id = activity.id) AND (r.user_id = public.app_current_user())))))) OR ((public.app_data_scope() = 'customer'::text) AND (EXISTS ( SELECT 1
   FROM public.engagement e
  WHERE ((e.id = activity.engagement_id) AND (e.company_id = public.app_current_company()))))))));

CREATE POLICY act_update ON public.activity FOR UPDATE USING (((tenant_id = public.app_current_tenant()) AND (public.app_sees_whole_tenant() OR ((public.app_data_scope() = 'own'::text) AND ((created_by = public.app_current_user()) OR (EXISTS ( SELECT 1
   FROM (public.activity_resource ar
     JOIN public.resource r ON ((r.id = ar.resource_id)))
  WHERE ((ar.activity_id = activity.id) AND (r.user_id = public.app_current_user()))))))))) WITH CHECK (((tenant_id = public.app_current_tenant()) AND (public.app_data_scope() <> 'customer'::text)));

ALTER TABLE public.activity ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.activity_dependency ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.activity_resource ENABLE ROW LEVEL SECURITY;

CREATE POLICY eng_modify ON public.engagement USING ((public.app_is_platform_admin() OR ((tenant_id = public.app_current_tenant()) AND (public.app_data_scope() <> 'customer'::text)))) WITH CHECK ((public.app_is_platform_admin() OR ((tenant_id = public.app_current_tenant()) AND (public.app_data_scope() <> 'customer'::text))));

CREATE POLICY eng_select ON public.engagement FOR SELECT USING (((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())) AND (public.app_sees_whole_tenant() OR (public.app_data_scope() = 'own'::text) OR ((public.app_data_scope() = 'customer'::text) AND (company_id = public.app_current_company())))));

ALTER TABLE public.engagement ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.phase ENABLE ROW LEVEL SECURITY;

CREATE POLICY phase_modify ON public.phase USING ((public.app_is_platform_admin() OR ((tenant_id = public.app_current_tenant()) AND (public.app_data_scope() <> 'customer'::text)))) WITH CHECK ((public.app_is_platform_admin() OR ((tenant_id = public.app_current_tenant()) AND (public.app_data_scope() <> 'customer'::text))));

CREATE POLICY phase_select ON public.phase FOR SELECT USING (((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())) AND (public.app_sees_whole_tenant() OR (public.app_data_scope() = 'own'::text) OR ((public.app_data_scope() = 'customer'::text) AND (EXISTS ( SELECT 1
   FROM public.engagement e
  WHERE ((e.id = phase.engagement_id) AND (e.company_id = public.app_current_company()))))))));

CREATE POLICY tenant_isolation ON public.activity_dependency USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));

CREATE POLICY tenant_isolation ON public.activity_resource USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));

\unrestrict tOVhRD3klTDmx5EOcf6gSARm9cfwFHAYAsFkGg0hbuaLfzClwSN8YSOZSDVkSSZ

```

### 4.6 AI & rendicontazione
```sql

\restrict kKcwpba90ZQmBBAiPJ18uSJkaOZfPnclRE6EWBxK5l1Jwqbs3chyTeKyKhgjJ6C

CREATE TABLE public.capture (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    channel text DEFAULT 'voice'::text NOT NULL,
    media_url text,
    raw_text text,
    extraction jsonb,
    status public.capture_status DEFAULT 'pending'::public.capture_status NOT NULL,
    embedding public.vector(1536),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_by uuid,
    client_created_at timestamp with time zone,
    media_type text
);

ALTER TABLE ONLY public.capture FORCE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.capture.channel IS 'voice | text | photo (estendibile, resta TEXT)';

COMMENT ON COLUMN public.capture.media_url IS 'object storage (S3/R2/MinIO), NON nel DB; audio o immagine secondo channel';

CREATE TABLE public.material_consumption (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    activity_id uuid,
    material_id uuid NOT NULL,
    quantity numeric NOT NULL,
    unit text NOT NULL,
    occurred_on date NOT NULL,
    source_capture_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    client_created_at timestamp with time zone,
    CONSTRAINT material_consumption_quantity_check CHECK ((quantity > (0)::numeric))
);

ALTER TABLE ONLY public.material_consumption FORCE ROW LEVEL SECURITY;

CREATE TABLE public.time_entry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    engagement_id uuid,
    activity_id uuid,
    resource_id uuid,
    typology text NOT NULL,
    minutes integer NOT NULL,
    occurred_on date NOT NULL,
    notes text,
    source_capture_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    client_created_at timestamp with time zone,
    CONSTRAINT time_entry_minutes_check CHECK ((minutes > 0))
);

ALTER TABLE ONLY public.time_entry FORCE ROW LEVEL SECURITY;

ALTER TABLE ONLY public.capture
    ADD CONSTRAINT capture_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.material_consumption
    ADD CONSTRAINT material_consumption_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.time_entry
    ADD CONSTRAINT time_entry_pkey PRIMARY KEY (id);

CREATE INDEX capture_embedding_idx ON public.capture USING hnsw (embedding public.vector_cosine_ops);

CREATE INDEX capture_tenant_id_idx ON public.capture USING btree (tenant_id);

CREATE INDEX material_consumption_activity_id_idx ON public.material_consumption USING btree (activity_id);

CREATE INDEX material_consumption_tenant_id_idx ON public.material_consumption USING btree (tenant_id);

CREATE INDEX time_entry_engagement_id_idx ON public.time_entry USING btree (engagement_id);

CREATE INDEX time_entry_occurred_on_idx ON public.time_entry USING btree (occurred_on);

CREATE INDEX time_entry_tenant_id_idx ON public.time_entry USING btree (tenant_id);

CREATE TRIGGER trg_capture_updated BEFORE UPDATE ON public.capture FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_material_consumption_updated BEFORE UPDATE ON public.material_consumption FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_time_entry_updated BEFORE UPDATE ON public.time_entry FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE ONLY public.capture
    ADD CONSTRAINT capture_applied_by_fkey FOREIGN KEY (applied_by) REFERENCES public.app_user(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.capture
    ADD CONSTRAINT capture_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.capture
    ADD CONSTRAINT capture_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.material_consumption
    ADD CONSTRAINT material_consumption_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activity(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.material_consumption
    ADD CONSTRAINT material_consumption_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.material_consumption
    ADD CONSTRAINT material_consumption_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.material(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.material_consumption
    ADD CONSTRAINT material_consumption_source_capture_id_fkey FOREIGN KEY (source_capture_id) REFERENCES public.capture(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.material_consumption
    ADD CONSTRAINT material_consumption_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.material_consumption
    ADD CONSTRAINT material_consumption_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.time_entry
    ADD CONSTRAINT time_entry_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activity(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.time_entry
    ADD CONSTRAINT time_entry_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.time_entry
    ADD CONSTRAINT time_entry_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagement(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.time_entry
    ADD CONSTRAINT time_entry_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resource(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.time_entry
    ADD CONSTRAINT time_entry_source_capture_id_fkey FOREIGN KEY (source_capture_id) REFERENCES public.capture(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.time_entry
    ADD CONSTRAINT time_entry_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.time_entry
    ADD CONSTRAINT time_entry_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;

CREATE POLICY cap_insert ON public.capture FOR INSERT WITH CHECK (((tenant_id = public.app_current_tenant()) AND (public.app_sees_whole_tenant() OR (user_id = public.app_current_user()))));

CREATE POLICY cap_modify ON public.capture FOR UPDATE USING (((tenant_id = public.app_current_tenant()) AND (public.app_sees_whole_tenant() OR (user_id = public.app_current_user())))) WITH CHECK ((tenant_id = public.app_current_tenant()));

CREATE POLICY cap_select ON public.capture FOR SELECT USING (((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())) AND (public.app_sees_whole_tenant() OR ((public.app_data_scope() = 'own'::text) AND (user_id = public.app_current_user())))));

ALTER TABLE public.capture ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.material_consumption ENABLE ROW LEVEL SECURITY;

CREATE POLICY mc_insert ON public.material_consumption FOR INSERT WITH CHECK ((tenant_id = public.app_current_tenant()));

CREATE POLICY mc_modify ON public.material_consumption FOR UPDATE USING (((tenant_id = public.app_current_tenant()) AND (public.app_sees_whole_tenant() OR (created_by = public.app_current_user())))) WITH CHECK ((tenant_id = public.app_current_tenant()));

CREATE POLICY mc_select ON public.material_consumption FOR SELECT USING (((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())) AND (public.app_sees_whole_tenant() OR ((public.app_data_scope() = 'own'::text) AND (created_by = public.app_current_user())))));

CREATE POLICY te_insert ON public.time_entry FOR INSERT WITH CHECK ((tenant_id = public.app_current_tenant()));

CREATE POLICY te_modify ON public.time_entry FOR UPDATE USING (((tenant_id = public.app_current_tenant()) AND (public.app_sees_whole_tenant() OR (created_by = public.app_current_user()) OR (EXISTS ( SELECT 1
   FROM public.resource r
  WHERE ((r.id = time_entry.resource_id) AND (r.user_id = public.app_current_user()))))))) WITH CHECK ((tenant_id = public.app_current_tenant()));

CREATE POLICY te_select ON public.time_entry FOR SELECT USING (((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())) AND (public.app_sees_whole_tenant() OR ((public.app_data_scope() = 'own'::text) AND ((created_by = public.app_current_user()) OR (EXISTS ( SELECT 1
   FROM public.resource r
  WHERE ((r.id = time_entry.resource_id) AND (r.user_id = public.app_current_user())))))))));

ALTER TABLE public.time_entry ENABLE ROW LEVEL SECURITY;

\unrestrict kKcwpba90ZQmBBAiPJ18uSJkaOZfPnclRE6EWBxK5l1Jwqbs3chyTeKyKhgjJ6C

```

---

## 5. Dati standard (seed "di sistema")
Righe con `tenant_id NULL` = **di sistema/default**, valide per tutti i tenant. Caricate dalle migrazioni.

### 5.1 Stati canonici riconosciuti dal sistema (`canonical_state`)
```sql
INSERT INTO canonical_state (category, code, sequence) VALUES
  ('activity_status',  'planned',     1),
  ('activity_status',  'in_progress', 2),
  ('activity_status',  'done',        3),
  ('activity_status',  'cancelled',   4),
  ('engagement_status','open',        1),
  ('engagement_status','active',      2),
  ('engagement_status','closed',      3),
  ('engagement_status','cancelled',   4),
  ('phase_status',     'pending',     1),
  ('phase_status',     'active',      2),
  ('phase_status',     'done',        3),
  ('priority',         'low',         1),
  ('priority',         'medium',      2),
  ('priority',         'high',        3),
  ('priority',         'urgent',      4);
INSERT INTO canonical_state (category, code, sequence) VALUES
  ('company_role', 'customer', 1),
  ('company_role', 'supplier', 2),
  ('company_role', 'partner',  3);
```

### 5.2 Etichette di default (`lookup_value`, tenant_id NULL) — rinominabili/ricolorabili dal tenant
```sql
INSERT INTO lookup_value (tenant_id, category, canonical, code, label, abbreviation, color_token, sequence, is_default) VALUES
  -- activity_status
  (NULL,'activity_status','planned',    'planned',    '{"it-IT":"Pianificata","en":"Planned","es-AR":"Planificada"}','PIA','neutral',1,true),
  (NULL,'activity_status','in_progress','in_progress','{"it-IT":"In corso","en":"In progress","es-AR":"En curso"}',  'COR','info',   2,true),
  (NULL,'activity_status','done',       'done',       '{"it-IT":"Completata","en":"Done","es-AR":"Finalizada"}',     'FIN','success',3,true),
  (NULL,'activity_status','cancelled',  'cancelled',  '{"it-IT":"Annullata","en":"Cancelled","es-AR":"Cancelada"}', 'ANN','danger', 4,true),
  -- engagement_status
  (NULL,'engagement_status','open',     'open',       '{"it-IT":"Aperta","en":"Open","es-AR":"Abierta"}',           'APE','neutral',1,true),
  (NULL,'engagement_status','active',   'active',     '{"it-IT":"Attiva","en":"Active","es-AR":"Activa"}',          'ATT','info',   2,true),
  (NULL,'engagement_status','closed',   'closed',     '{"it-IT":"Chiusa","en":"Closed","es-AR":"Cerrada"}',         'CHI','success',3,true),
  (NULL,'engagement_status','cancelled','cancelled',  '{"it-IT":"Annullata","en":"Cancelled","es-AR":"Cancelada"}', 'ANN','danger', 4,true),
  -- phase_status
  (NULL,'phase_status','pending',       'pending',    '{"it-IT":"Da iniziare","en":"Pending","es-AR":"Pendiente"}', 'DAI','neutral',1,true),
  (NULL,'phase_status','active',        'active',     '{"it-IT":"Attiva","en":"Active","es-AR":"Activa"}',          'ATT','info',   2,true),
  (NULL,'phase_status','done',          'done',       '{"it-IT":"Completata","en":"Done","es-AR":"Finalizada"}',     'FIN','success',3,true),
  -- priority
  (NULL,'priority','low',    'low',    '{"it-IT":"Bassa","en":"Low","es-AR":"Baja"}',       'B','neutral',1,true),
  (NULL,'priority','medium', 'medium', '{"it-IT":"Media","en":"Medium","es-AR":"Media"}',   'M','info',   2,true),
  (NULL,'priority','high',   'high',   '{"it-IT":"Alta","en":"High","es-AR":"Alta"}',       'A','warning',3,true),
  (NULL,'priority','urgent', 'urgent', '{"it-IT":"Urgente","en":"Urgent","es-AR":"Urgente"}','U','danger', 4,true);
```

### 5.3 Piani della piattaforma (`plan`) — prezzi illustrativi, il prezzo reale vive nel provider
```sql
INSERT INTO plan (code, name, billing_model, price_month, currency, entitlements) VALUES
  ('trial','Prova', 'flat',   0, 'EUR', '{"max_users":3,"verticals":["software"],"ai_quota_month":300,"features":["templates"]}'),
  ('basic','Basic', 'flat',  49, 'EUR', '{"max_users":5,"verticals":["software"],"ai_quota_month":1000,"features":["templates"]}'),
  ('pro',  'Pro',   'flat', 149, 'EUR', '{"max_users":20,"verticals":["software"],"ai_quota_month":5000,"features":["templates","external_portal"]}');
```

### 5.4 Ruoli di sistema (`role`, tenant_id NULL)
```sql
INSERT INTO role (tenant_id, name, description, is_system, data_scope) VALUES
  (NULL, 'Owner',        'Amministratore del tenant (tutti i permessi)', true, 'tenant'),
  (NULL, 'Planner',      'Pianifica progetti e assegna risorse',         true, 'tenant'),
  (NULL, 'Tecnico',      'Esegue e rendiconta le proprie attività',      true, 'own'),
  (NULL, 'Contabile',    'Consultazione ed export amministrativo',       true, 'tenant'),
  (NULL, 'Sola lettura', 'Accesso in sola lettura',                      true, 'tenant'),
  (NULL, 'Cliente esterno', 'Utente esterno: vede solo i progetti del proprio cliente, in sola lettura, senza costi', true, 'customer');
```

### 5.5 Campi dinamici di default (`field_definition`) — seed verticale
```sql
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, validation, group_key, sequence) VALUES
 (NULL, NULL, 'company', 'vat_number',  '{"it-IT":"P.IVA","en":"VAT number","es-AR":"CUIT"}',            'text',  false, '{"pattern":"^[0-9]{11}$","maxLength":13}', 'fiscal', 1),
 (NULL, NULL, 'company', 'tax_code',    '{"it-IT":"Codice fiscale","en":"Tax code","es-AR":"CUIL"}',     'text',  false, '{"maxLength":16}',                         'fiscal', 2),
 (NULL, NULL, 'company', 'pec',         '{"it-IT":"PEC","en":"Certified email","es-AR":"Email"}',        'email', false, NULL,                                       'fiscal', 3),
 (NULL, NULL, 'company', 'sdi_code',    '{"it-IT":"Codice SDI","en":"SDI code","es-AR":"Punto venta"}',  'text',  false, '{"maxLength":7}',                          'fiscal', 4),
 (NULL, NULL, 'company', 'street',      '{"it-IT":"Indirizzo","en":"Address","es-AR":"Domicilio"}',      'text',  false, NULL,                                       'registry', 1),
 (NULL, NULL, 'company', 'city',        '{"it-IT":"Città","en":"City","es-AR":"Ciudad"}',                'text',  false, NULL,                                       'registry', 2),
 (NULL, NULL, 'company', 'province',    '{"it-IT":"Provincia","en":"Province","es-AR":"Provincia"}',     'text',  false, '{"maxLength":4}',                          'registry', 3),
 (NULL, NULL, 'company', 'postal_code', '{"it-IT":"CAP","en":"Postal code","es-AR":"CP"}',               'text',  false, NULL,                                       'registry', 4),
 (NULL, NULL, 'company', 'website',     '{"it-IT":"Sito web","en":"Website","es-AR":"Sitio web"}',       'url',   false, NULL,                                       'registry', 5),
 (NULL, NULL, 'company', 'notes',       '{"it-IT":"Note","en":"Notes","es-AR":"Notas"}',                 'textarea', false, '{"maxLength":2000}',                    'notes', 1);
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, unit, validation, options, group_key, sequence) VALUES
 (NULL, NULL, 'engagement', 'budget',       '{"it-IT":"Budget","en":"Budget","es-AR":"Presupuesto"}',         'money',   false, '€', '{"min":0}', NULL, 'contract', 1),
 (NULL, NULL, 'engagement', 'contract_ref', '{"it-IT":"Rif. contratto","en":"Contract ref.","es-AR":"Ref. contrato"}', 'text', false, NULL, NULL, NULL, 'contract', 2),
 (NULL, NULL, 'engagement', 'sla',          '{"it-IT":"SLA","en":"SLA","es-AR":"SLA"}',                       'select',  false, NULL, NULL,
   '[{"value":"none","label":{"it-IT":"Nessuno","en":"None","es-AR":"Ninguno"}},{"value":"8x5","label":{"it-IT":"8x5","en":"8x5","es-AR":"8x5"}},{"value":"24x7","label":{"it-IT":"24x7","en":"24x7","es-AR":"24x7"}}]', 'contract', 3);
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, group_key, sequence) VALUES
 (NULL, NULL, 'activity', 'billable',     '{"it-IT":"Fatturabile","en":"Billable","es-AR":"Facturable"}', 'boolean', false, 'general', 1),
 (NULL, NULL, 'activity', 'external_ref', '{"it-IT":"Rif. esterno","en":"External ref.","es-AR":"Ref. externa"}', 'text', false, 'general', 2);
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, unit, options, group_key, sequence) VALUES
 (NULL, NULL, 'resource', 'hourly_cost', '{"it-IT":"Costo orario","en":"Hourly cost","es-AR":"Costo por hora"}', 'money', false, '€', NULL, 'economics', 1),
 (NULL, NULL, 'resource', 'skills',      '{"it-IT":"Competenze","en":"Skills","es-AR":"Competencias"}',          'multiselect', false, NULL,
   '[{"value":"backend","label":{"it-IT":"Backend","en":"Backend","es-AR":"Backend"}},{"value":"frontend","label":{"it-IT":"Frontend","en":"Frontend","es-AR":"Frontend"}},{"value":"sysadmin","label":{"it-IT":"Sistemista","en":"Sysadmin","es-AR":"Sysadmin"}},{"value":"pm","label":{"it-IT":"PM","en":"PM","es-AR":"PM"}}]', 'skills', 1),
 (NULL, NULL, 'resource', 'plate',       '{"it-IT":"Targa","en":"Plate","es-AR":"Patente"}',                    'text', false, NULL, NULL, 'vehicle', 1);
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, group_key, sequence) VALUES
 (NULL, 'software', 'material', 'brand',       '{"it-IT":"Marca","en":"Brand","es-AR":"Marca"}',          'text', false, 'catalog', 1),
 (NULL, 'software', 'material', 'part_number', '{"it-IT":"Codice prod.","en":"Part number","es-AR":"Código"}', 'text', false, 'catalog', 2);
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, options, group_key, sequence) VALUES
 (NULL, 'software', 'asset', 'version',     '{"it-IT":"Versione","en":"Version","es-AR":"Versión"}',     'text',   false, NULL, 'technical', 1),
 (NULL, 'software', 'asset', 'environment', '{"it-IT":"Ambiente","en":"Environment","es-AR":"Entorno"}', 'select', false,
   '[{"value":"prod","label":{"it-IT":"Produzione","en":"Production","es-AR":"Producción"}},{"value":"staging","label":{"it-IT":"Staging","en":"Staging","es-AR":"Staging"}},{"value":"dev","label":{"it-IT":"Sviluppo","en":"Development","es-AR":"Desarrollo"}}]', 'technical', 2),
 (NULL, 'software', 'asset', 'repo_url',    '{"it-IT":"Repository","en":"Repository","es-AR":"Repositorio"}', 'url', false, NULL, 'technical', 3);
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, unit, options, group_key, sequence) VALUES
 (NULL, 'pools', 'asset', 'volume_m3', '{"it-IT":"Volume","en":"Volume","es-AR":"Volumen"}',     'number', false, 'm³', NULL, 'technical', 1),
 (NULL, 'pools', 'asset', 'heating',   '{"it-IT":"Riscaldamento","en":"Heating","es-AR":"Calefacción"}', 'select', false, NULL,
   '[{"value":"none","label":{"it-IT":"Nessuno","en":"None","es-AR":"Ninguno"}},{"value":"heat_pump","label":{"it-IT":"Pompa di calore","en":"Heat pump","es-AR":"Bomba de calor"}}]', 'technical', 2);
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, unit, group_key, sequence) VALUES
 (NULL, 'solar', 'asset', 'kwp',     '{"it-IT":"Potenza","en":"Power","es-AR":"Potencia"}',  'number',  false, 'kWp', 'technical', 1),
 (NULL, 'solar', 'asset', 'panels',  '{"it-IT":"N. pannelli","en":"Panels","es-AR":"Paneles"}', 'integer', false, NULL, 'technical', 2),
 (NULL, 'solar', 'asset', 'inverter','{"it-IT":"Inverter","en":"Inverter","es-AR":"Inversor"}', 'text',   false, NULL, 'technical', 3);

-- === AGGIUNTI da migrazione 006 (verticale FIBRA) ===
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, options, unit, group_key, sequence) VALUES
 (NULL, 'fiber', 'asset', 'connection_type', '{"it-IT":"Tipo connessione",...}', 'select', false, '[FTTH|FTTB|FTTC]', NULL, 'technical', 1),
 (NULL, 'fiber', 'asset', 'socket_id',      '{"it-IT":"ID presa / ROE",...}',   'text',   false, NULL, NULL,  'technical', 2),
 (NULL, 'fiber', 'asset', 'distance_m',     '{"it-IT":"Distanza dalla centrale",...}', 'number', false, NULL, 'm',  'technical', 3),
 (NULL, 'fiber', 'asset', 'attenuation_db', '{"it-IT":"Attenuazione misurata",...}', 'number', false, NULL, 'dB', 'technical', 4),
 (NULL, 'fiber', 'asset', 'ont_serial',     '{"it-IT":"Seriale ONT",...}',      'text',   false, NULL, NULL,  'technical', 5);
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, group_key, sequence) VALUES
 (NULL, 'fiber', 'engagement', 'work_order_ref', '{"it-IT":"Rif. ordine di lavoro",...}', 'text', false, 'contract', 4);
```

### 5.6 Grant dei permessi ai ruoli di sistema (`role_permission`)
Non sono in una migrazione: il **bootstrap** li scrive a partire dal catalogo permessi nel codice (`packages/shared/src/permissions.ts`), così lista permessi e grant non vanno mai in drift. Conteggi attuali per ruolo di sistema:

| Ruolo | data_scope | # permessi |
|---|---|---|
| Owner | tenant | 61 (tutti) |
| Planner | tenant | 29 |
| Contabile | tenant | 12 |
| Tecnico | own | 12 |
| Sola lettura | tenant | 14 |
| Cliente esterno | customer | 3 |

### 5.7 Dati creati dal bootstrap (runtime, per-tenant — non "seed di sistema")
Il bootstrap applicativo crea, in modo idempotente, la baseline minima per far girare il sistema:
- **Ruolo DB** `sisuite_app` (LOGIN, NOSUPERUSER, **NOBYPASSRLS**) + grant su `public` + `search_path = public`.
- **Tenant** iniziale (da env `TENANT_NAME/VERTICAL/LOCALE/TIMEZONE`).
- **Numeratore** `engagement` → formato `{YYYY}-{SEQ:4}`, reset `yearly`.
- **Subscription** `trial` (plan `trial`, scadenza +14 giorni).
- **Company demo** (`Cliente Demo`, ruolo `customer`).
- **Owner**: utente su GoTrue + `app_user` collegato (`auth_user_id`) + `user_role` = Owner.

---

## 6. Note RLS (sintesi del modello di visibilità)
- **Isolamento tenant** su tutte le tabelle (`FORCE ROW LEVEL SECURITY`); il backend (`sisuite_app`) non bypassa.
- Sessione impostata a inizio transazione: `app.current_tenant`, `app.current_user`, `app.data_scope` (`own|team|tenant|customer`), `app.current_company`, `app.is_platform_admin`.
- `data_scope='own'` morde sui dati **operativi/personali** (`activity`, `capture`, `time_entry`, `material_consumption`); le anagrafiche/contesto restano tenant-wide in lettura.
- `lookup_value`/`role` con `tenant_id NULL` (sistema) sono **leggibili da tutti** ma **non modificabili** dal tenant.
- `plan`/`canonical_state` = cataloghi globali: lettura a tutti, scrittura solo `is_platform_admin`.
- `customer` (portale esterno) predisposto in RLS; il portale non è ancora costruito.

## 7. Rigenerare questo documento
```bash
# DDL autorevole (escludere i tipi GoTrue nello schema public):
docker compose exec -T db pg_dump -U sisuite_admin -d sisuite \
  --schema=public --schema-only --no-owner --no-privileges
# Seed di sistema:
docker compose exec -T db psql -U sisuite_admin -d sisuite \
  -c "SELECT * FROM canonical_state ORDER BY category, sequence;" \
  -c "SELECT category, code, label FROM lookup_value WHERE tenant_id IS NULL ORDER BY category, sequence;" \
  -c "SELECT code, name, price_month, entitlements FROM plan;" \
  -c "SELECT name, data_scope FROM role WHERE tenant_id IS NULL;"
```
