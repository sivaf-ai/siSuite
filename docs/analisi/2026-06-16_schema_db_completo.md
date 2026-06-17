# Schema DB siSuite — stato al 16/06/2026 (dopo migrazioni 024–028 POWERCOM)

> Generato con `pg_dump --schema-only -n public` dopo l'applicazione delle migrazioni 001→028.
> Migrazioni nuove: 024 seriali, 025 ordinativi FTTH, 026 listino, 027 contabilità produzione, 028 seed lookup.

```sql
--
-- PostgreSQL database dump
--

\restrict QxvLLbYBXqWLFVDd871bIdsoqbah86KuWLlZhgGqN5Nj5yAeR584fc3TYI4vRrB

-- Dumped from database version 16.14 (Debian 16.14-1.pgdg12+1)
-- Dumped by pg_dump version 16.14 (Debian 16.14-1.pgdg12+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: aal_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


--
-- Name: capture_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.capture_status AS ENUM (
    'pending',
    'proposed',
    'applied',
    'rejected'
);


--
-- Name: code_challenge_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.code_challenge_method AS ENUM (
    's256',
    'plain'
);


--
-- Name: company_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.company_type AS ENUM (
    'private',
    'organization'
);


--
-- Name: customer_nature; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.customer_nature AS ENUM (
    'episodic',
    'recurring'
);


--
-- Name: dependency_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dependency_type AS ENUM (
    'FS',
    'SS',
    'FF',
    'SF'
);


--
-- Name: engagement_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.engagement_type AS ENUM (
    'build',
    'maintenance'
);


--
-- Name: factor_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.factor_status AS ENUM (
    'unverified',
    'verified'
);


--
-- Name: factor_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.factor_type AS ENUM (
    'totp',
    'webauthn'
);


--
-- Name: one_time_token_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


--
-- Name: resource_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.resource_kind AS ENUM (
    'person',
    'vehicle',
    'equipment'
);


--
-- Name: subscription_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.subscription_status AS ENUM (
    'trial',
    'active',
    'past_due',
    'suspended',
    'cancelled',
    'expired'
);


--
-- Name: app_current_company(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_current_company() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ SELECT nullif(current_setting('app.current_company', true), '')::uuid $$;


--
-- Name: app_current_tenant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_current_tenant() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ SELECT nullif(current_setting('app.current_tenant', true), '')::uuid $$;


--
-- Name: app_current_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_current_user() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ SELECT nullif(current_setting('app.current_user', true), '')::uuid $$;


--
-- Name: app_data_scope(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_data_scope() RETURNS text
    LANGUAGE sql STABLE
    AS $$ SELECT coalesce(nullif(current_setting('app.data_scope', true), ''), 'own') $$;


--
-- Name: app_is_platform_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_is_platform_admin() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$ SELECT coalesce(nullif(current_setting('app.is_platform_admin', true), '')::boolean, false) $$;


--
-- Name: app_resolve_context(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_resolve_context(p_auth_user_id text) RETURNS TABLE(user_id uuid, tenant_id uuid, full_name text, email text, locale text, is_platform_admin boolean, company_id uuid, data_scope text, permissions text[], entitlements jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: FUNCTION app_resolve_context(p_auth_user_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_resolve_context(p_auth_user_id text) IS 'Mappa auth_user_id (JWT sub) -> contesto utente (tenant, data_scope effettivo, permessi, entitlement). SECURITY DEFINER: bypassa RLS per la sola risoluzione identità.';


--
-- Name: app_sees_whole_tenant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_sees_whole_tenant() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$ SELECT app_is_platform_admin() OR app_data_scope() IN ('tenant','team') $$;


--
-- Name: apply_stock_movement(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_stock_movement() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE b public.stock_balance%ROWTYPE; new_qty numeric; new_value numeric; def_cost numeric;
BEGIN
  SELECT default_cost INTO def_cost FROM public.material WHERE id = NEW.material_id;
  SELECT * INTO b FROM public.stock_balance
   WHERE tenant_id=NEW.tenant_id AND material_id=NEW.material_id AND location_id=NEW.location_id FOR UPDATE;
  IF NOT FOUND THEN
    IF NEW.quantity > 0 THEN new_value := NEW.quantity*COALESCE(NEW.unit_cost,def_cost,0);
    ELSE                     new_value := NEW.quantity*COALESCE(def_cost,0);  -- uscita senza giacenza → listino
    END IF;
    INSERT INTO public.stock_balance(tenant_id,material_id,location_id,qty_on_hand,avg_cost,value_on_hand,updated_at)
    VALUES (NEW.tenant_id,NEW.material_id,NEW.location_id,NEW.quantity,
            CASE WHEN NEW.quantity>0 THEN new_value/NEW.quantity ELSE NULL END,new_value,now());
    RETURN NEW;
  END IF;
  new_qty := b.qty_on_hand + NEW.quantity;
  IF NEW.quantity > 0 THEN new_value := b.value_on_hand + NEW.quantity*COALESCE(NEW.unit_cost,b.avg_cost,def_cost,0);
  ELSE                     new_value := b.value_on_hand + NEW.quantity*COALESCE(b.avg_cost,def_cost,0);
  END IF;
  UPDATE public.stock_balance
     SET qty_on_hand=new_qty, value_on_hand=new_value,
         avg_cost = CASE WHEN new_qty>0 THEN new_value/new_qty ELSE b.avg_cost END, updated_at=now()
   WHERE id=b.id;
  RETURN NEW;
END; $$;


--
-- Name: block_locked_time_entry(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.block_locked_time_entry() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.is_locked = true THEN
    IF NEW.is_locked = false AND NEW.lock_reason IS NULL THEN RETURN NEW; END IF;  -- sblocco controllato
    RAISE EXCEPTION 'time_entry % bloccata (%): modifica non consentita', OLD.id, OLD.lock_reason;
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: stock_location_no_cycle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stock_location_no_cycle() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (
      WITH RECURSIVE anc AS (
        SELECT NEW.parent_id AS id
        UNION ALL
        SELECT sl.parent_id FROM public.stock_location sl JOIN anc ON sl.id = anc.id WHERE sl.parent_id IS NOT NULL
      ) SELECT 1 FROM anc WHERE id = NEW.id
    ) THEN
      RAISE EXCEPTION 'stock_location: ciclo non ammesso (% non può stare sotto una propria discendente)', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: stock_movement_is_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stock_movement_is_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN RAISE EXCEPTION 'stock_movement è immutabile: usa una rettifica, non modifiche o cancellazioni'; END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: absence_balance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.absence_balance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_id uuid NOT NULL,
    type_id uuid NOT NULL,
    year integer NOT NULL,
    accrued numeric DEFAULT 0 NOT NULL,
    used numeric DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.absence_balance FORCE ROW LEVEL SECURITY;


--
-- Name: absence_entry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.absence_entry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_id uuid NOT NULL,
    type_id uuid NOT NULL,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    hours numeric,
    half_day boolean DEFAULT false NOT NULL,
    note text,
    attachment_url text,
    approval_status_id uuid,
    source_capture_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    client_created_at timestamp with time zone,
    CONSTRAINT absence_entry_dates_check CHECK ((ends_on >= starts_on))
);

ALTER TABLE ONLY public.absence_entry FORCE ROW LEVEL SECURITY;


--
-- Name: activity; Type: TABLE; Schema: public; Owner: -
--

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
    schedule_mode_id uuid,
    pinned_day date,
    CONSTRAINT activity_check CHECK (((earliest_start IS NULL) OR (due_by IS NULL) OR (earliest_start <= due_by)))
);

ALTER TABLE ONLY public.activity FORCE ROW LEVEL SECURITY;


--
-- Name: activity_dependency; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: activity_resource; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: app_user; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: COLUMN app_user.auth_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.app_user.auth_user_id IS 'Identità esterna verificata (Supabase Auth/GoTrue). Nessuna credenziale in app_user; authZ resta su RBAC+RLS.';


--
-- Name: asset; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: canonical_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canonical_state (
    category text NOT NULL,
    code text NOT NULL,
    sequence integer DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY public.canonical_state FORCE ROW LEVEL SECURITY;


--
-- Name: capture; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: COLUMN capture.channel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.capture.channel IS 'voice | text | photo (estendibile, resta TEXT)';


--
-- Name: COLUMN capture.media_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.capture.media_url IS 'object storage (S3/R2/MinIO), NON nel DB; audio o immagine secondo channel';


--
-- Name: company; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: company_contact; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: company_role; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: engagement; Type: TABLE; Schema: public; Owner: -
--

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
    archived_at timestamp with time zone,
    billing_mode_id uuid,
    budget_amount numeric,
    budget_minutes integer,
    budget_currency text
);

ALTER TABLE ONLY public.engagement FORCE ROW LEVEL SECURITY;


--
-- Name: equipment_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipment_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    engagement_id uuid NOT NULL,
    phase_id uuid,
    work_order_id uuid,
    resource_id uuid NOT NULL,
    occurred_on date DEFAULT CURRENT_DATE NOT NULL,
    quantity numeric NOT NULL,
    unit text DEFAULT 'h'::text NOT NULL,
    unit_cost numeric,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT equipment_usage_quantity_check CHECK ((quantity > (0)::numeric))
);

ALTER TABLE ONLY public.equipment_usage FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE equipment_usage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.equipment_usage IS 'Uso attrezzature/mezzi su commessa (costo). Risorsa di kind vehicle/equipment.';


--
-- Name: field_definition; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: TABLE field_definition; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.field_definition IS 'Catalogo dei campi dentro attributes jsonb: guida validazione (API) e rendering form (UI). Sistema (tenant_id NULL) per verticale + override tenant.';


--
-- Name: material; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    unit text NOT NULL,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    archived_at timestamp with time zone,
    sku text,
    track_stock boolean DEFAULT false NOT NULL,
    costing_method text DEFAULT 'avg'::text NOT NULL,
    tracked_by_lot boolean DEFAULT false NOT NULL,
    default_cost numeric,
    tracked_by_serial boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.material FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN material.tracked_by_serial; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.material.tracked_by_serial IS 'true = ogni unita'' di questo articolo ha un seriale univoco (apparati FTTH). Indipendente da tracked_by_lot.';


--
-- Name: material_consumption; Type: TABLE; Schema: public; Owner: -
--

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
    work_order_id uuid,
    CONSTRAINT material_consumption_quantity_check CHECK ((quantity > (0)::numeric))
);

ALTER TABLE ONLY public.material_consumption FORCE ROW LEVEL SECURITY;


--
-- Name: subcontract_line; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subcontract_line (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    engagement_id uuid NOT NULL,
    phase_id uuid,
    work_order_id uuid,
    company_id uuid NOT NULL,
    description text,
    amount numeric NOT NULL,
    occurred_on date DEFAULT CURRENT_DATE NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid
);

ALTER TABLE ONLY public.subcontract_line FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE subcontract_line; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.subcontract_line IS 'Riga di subappalto (costo terzi) su commessa.';


--
-- Name: time_entry; Type: TABLE; Schema: public; Owner: -
--

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
    typology_id uuid,
    cost_rate numeric,
    bill_rate numeric,
    currency text,
    billable boolean DEFAULT true NOT NULL,
    approval_status_id uuid,
    submitted_at timestamp with time zone,
    submitted_by uuid,
    approved_at timestamp with time zone,
    approved_by uuid,
    rejection_reason text,
    is_locked boolean DEFAULT false NOT NULL,
    locked_at timestamp with time zone,
    locked_by uuid,
    lock_reason text,
    start_at timestamp with time zone,
    end_at timestamp with time zone,
    CONSTRAINT time_entry_context_check CHECK (((engagement_id IS NOT NULL) OR (activity_id IS NOT NULL))),
    CONSTRAINT time_entry_minutes_check CHECK ((minutes > 0))
);

ALTER TABLE ONLY public.time_entry FORCE ROW LEVEL SECURITY;


--
-- Name: work_line; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_line (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    engagement_id uuid NOT NULL,
    phase_id uuid,
    work_order_id uuid,
    price_list_item_id uuid,
    description text,
    quantity numeric NOT NULL,
    unit text NOT NULL,
    cost_price numeric,
    revenue_price numeric,
    occurred_on date DEFAULT CURRENT_DATE NOT NULL,
    resource_id uuid,
    source_capture_id uuid,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    client_created_at timestamp with time zone,
    CONSTRAINT work_line_quantity_check CHECK ((quantity > (0)::numeric))
);

ALTER TABLE ONLY public.work_line FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE work_line; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.work_line IS 'Lavorazione: voce di capitolato x quantita'' -> ricavo (e costo). E'' la riga di contabilita'' lavori.';


--
-- Name: job_cost_ledger; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.job_cost_ledger WITH (security_invoker='true') AS
 SELECT te.tenant_id,
    te.engagement_id,
    te.activity_id,
    NULL::uuid AS phase_id,
    'labor'::text AS cost_type,
    NULL::uuid AS price_list_item_id,
    ((te.minutes)::numeric / 60.0) AS quantity,
    'h'::text AS unit,
    (((te.minutes)::numeric / 60.0) * COALESCE(te.cost_rate, (0)::numeric)) AS cost_amount,
        CASE
            WHEN te.billable THEN (((te.minutes)::numeric / 60.0) * COALESCE(te.bill_rate, (0)::numeric))
            ELSE (0)::numeric
        END AS revenue_amount,
    te.occurred_on
   FROM public.time_entry te
UNION ALL
 SELECT mc.tenant_id,
    ( SELECT a.engagement_id
           FROM public.activity a
          WHERE (a.id = mc.activity_id)) AS engagement_id,
    mc.activity_id,
    NULL::uuid AS phase_id,
    'material'::text AS cost_type,
    NULL::uuid AS price_list_item_id,
    mc.quantity,
    mc.unit,
    (mc.quantity * COALESCE(m.default_cost, (0)::numeric)) AS cost_amount,
    (0)::numeric AS revenue_amount,
    mc.occurred_on
   FROM (public.material_consumption mc
     LEFT JOIN public.material m ON ((m.id = mc.material_id)))
UNION ALL
 SELECT eu.tenant_id,
    eu.engagement_id,
    NULL::uuid AS activity_id,
    eu.phase_id,
    'equipment'::text AS cost_type,
    NULL::uuid AS price_list_item_id,
    eu.quantity,
    eu.unit,
    (eu.quantity * COALESCE(eu.unit_cost, (0)::numeric)) AS cost_amount,
    (0)::numeric AS revenue_amount,
    eu.occurred_on
   FROM public.equipment_usage eu
UNION ALL
 SELECT sc.tenant_id,
    sc.engagement_id,
    NULL::uuid AS activity_id,
    sc.phase_id,
    'subcontract'::text AS cost_type,
    NULL::uuid AS price_list_item_id,
    (1)::numeric AS quantity,
    'a corpo'::text AS unit,
    sc.amount AS cost_amount,
    (0)::numeric AS revenue_amount,
    sc.occurred_on
   FROM public.subcontract_line sc
UNION ALL
 SELECT wl.tenant_id,
    wl.engagement_id,
    NULL::uuid AS activity_id,
    wl.phase_id,
    'production'::text AS cost_type,
    wl.price_list_item_id,
    wl.quantity,
    wl.unit,
    (wl.quantity * COALESCE(wl.cost_price, (0)::numeric)) AS cost_amount,
    (wl.quantity * COALESCE(wl.revenue_price, (0)::numeric)) AS revenue_amount,
    wl.occurred_on
   FROM public.work_line wl;


--
-- Name: VIEW job_cost_ledger; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.job_cost_ledger IS 'Libro mastro di commessa: unisce ore/materiali/mezzi/subappalti (costi) e lavorazioni (ricavi). Base della pivot preventivo-consuntivo.';


--
-- Name: lookup_override; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lookup_override (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    lookup_id uuid NOT NULL,
    label jsonb,
    abbreviation text,
    color_token text,
    sequence integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.lookup_override FORCE ROW LEVEL SECURITY;


--
-- Name: lookup_value; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: number_series; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.number_series (
    tenant_id uuid NOT NULL,
    key text NOT NULL,
    format text DEFAULT '{YYYY}-{SEQ:4}'::text NOT NULL,
    reset_period text DEFAULT 'yearly'::text NOT NULL,
    current_period text DEFAULT ''::text NOT NULL,
    last_number bigint DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY public.number_series FORCE ROW LEVEL SECURITY;


--
-- Name: phase; Type: TABLE; Schema: public; Owner: -
--

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
    updated_by uuid,
    wbs_code text
);

ALTER TABLE ONLY public.phase FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN phase.wbs_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.phase.wbs_code IS 'Codice WBS (la fase E'' il nodo WBS). Usato come dimensione nella contabilita'' di produzione.';


--
-- Name: plan; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: price_list; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_list (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    currency text DEFAULT 'EUR'::text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    valid_from date,
    valid_to date,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid
);

ALTER TABLE ONLY public.price_list FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE price_list; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.price_list IS 'Listini di produzione. is_default = listino base/madre del tenant.';


--
-- Name: price_list_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_list_item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    price_list_id uuid NOT NULL,
    code text NOT NULL,
    description text NOT NULL,
    unit text NOT NULL,
    category text,
    cost_price numeric,
    revenue_price numeric,
    active boolean DEFAULT true NOT NULL,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid
);

ALTER TABLE ONLY public.price_list_item FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE price_list_item; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.price_list_item IS 'Voce di capitolato a listino: codice + descrizione + unita'' + prezzo costo/ricavo.';


--
-- Name: price_list_override; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_list_override (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    base_item_id uuid NOT NULL,
    scope_type text NOT NULL,
    company_id uuid,
    engagement_id uuid,
    cost_price numeric,
    revenue_price numeric,
    valid_from date,
    valid_to date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT price_list_override_scope_type_check CHECK ((scope_type = ANY (ARRAY['company'::text, 'engagement'::text]))),
    CONSTRAINT price_override_scope_ck CHECK ((((scope_type = 'company'::text) AND (company_id IS NOT NULL) AND (engagement_id IS NULL)) OR ((scope_type = 'engagement'::text) AND (engagement_id IS NOT NULL) AND (company_id IS NULL))))
);

ALTER TABLE ONLY public.price_list_override FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE price_list_override; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.price_list_override IS 'Ritocco di prezzo di una voce per un gestore (company) o una commessa (engagement). Risoluzione: override piu'' specifico, altrimenti la voce base.';


--
-- Name: rate_card; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_card (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_id uuid,
    engagement_id uuid,
    typology_id uuid,
    valid_from date,
    valid_to date,
    cost_rate numeric,
    bill_rate numeric,
    currency text,
    note text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT rate_card_dates_check CHECK (((valid_to IS NULL) OR (valid_from IS NULL) OR (valid_to >= valid_from)))
);

ALTER TABLE ONLY public.rate_card FORCE ROW LEVEL SECURITY;


--
-- Name: resource; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: resource_availability; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: role; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: role_permission; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permission (
    role_id uuid NOT NULL,
    permission_key text NOT NULL
);

ALTER TABLE ONLY public.role_permission FORCE ROW LEVEL SECURITY;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying(14) NOT NULL
);


--
-- Name: sisuite_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sisuite_migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_balance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_balance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    material_id uuid NOT NULL,
    location_id uuid NOT NULL,
    qty_on_hand numeric DEFAULT 0 NOT NULL,
    avg_cost numeric,
    value_on_hand numeric DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.stock_balance FORCE ROW LEVEL SECURITY;


--
-- Name: stock_movement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    material_id uuid NOT NULL,
    location_id uuid NOT NULL,
    type_id uuid NOT NULL,
    quantity numeric NOT NULL,
    unit text NOT NULL,
    unit_cost numeric,
    unit_price numeric,
    currency text,
    occurred_on date DEFAULT CURRENT_DATE NOT NULL,
    document_ref text,
    stock_document_id uuid,
    engagement_id uuid,
    activity_id uuid,
    transfer_group_id uuid,
    lot_id uuid,
    source_capture_id uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    client_created_at timestamp with time zone,
    work_order_id uuid,
    CONSTRAINT stock_movement_qty_nonzero CHECK ((quantity <> (0)::numeric))
);

ALTER TABLE ONLY public.stock_movement FORCE ROW LEVEL SECURITY;


--
-- Name: stock_balance_recompute; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.stock_balance_recompute WITH (security_invoker='true') AS
 SELECT tenant_id,
    material_id,
    location_id,
    sum(quantity) AS qty_on_hand
   FROM public.stock_movement
  GROUP BY tenant_id, material_id, location_id;


--
-- Name: stock_document; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_document (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    type_id uuid NOT NULL,
    number text,
    doc_date date DEFAULT CURRENT_DATE NOT NULL,
    source_location_id uuid,
    dest_location_id uuid,
    company_id uuid,
    external_ref text,
    status text DEFAULT 'draft'::text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid
);

ALTER TABLE ONLY public.stock_document FORCE ROW LEVEL SECURITY;


--
-- Name: stock_document_line; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_document_line (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    document_id uuid NOT NULL,
    material_id uuid NOT NULL,
    quantity numeric NOT NULL,
    unit text NOT NULL,
    unit_cost numeric,
    unit_price numeric,
    currency text,
    lot_id uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_document_line_quantity_check CHECK ((quantity > (0)::numeric))
);

ALTER TABLE ONLY public.stock_document_line FORCE ROW LEVEL SECURITY;


--
-- Name: stock_location; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_location (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    parent_id uuid,
    name text NOT NULL,
    kind text DEFAULT 'warehouse'::text NOT NULL,
    resource_id uuid,
    address jsonb DEFAULT '{}'::jsonb NOT NULL,
    holds_stock boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    archived_at timestamp with time zone,
    CONSTRAINT stock_location_no_self_parent CHECK (((parent_id IS NULL) OR (parent_id <> id)))
);

ALTER TABLE ONLY public.stock_location FORCE ROW LEVEL SECURITY;


--
-- Name: stock_serial_unit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_serial_unit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    material_id uuid NOT NULL,
    serial text NOT NULL,
    status text DEFAULT 'in_stock'::text NOT NULL,
    location_id uuid,
    holder_resource_id uuid,
    installed_company_id uuid,
    installed_asset_id uuid,
    installed_on date,
    secrets jsonb DEFAULT '{}'::jsonb NOT NULL,
    note text,
    source_movement_id uuid,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    archived_at timestamp with time zone,
    work_order_id uuid,
    work_order_item_id uuid,
    CONSTRAINT stock_serial_unit_status_check CHECK ((status = ANY (ARRAY['in_stock'::text, 'assigned'::text, 'installed'::text, 'faulty'::text, 'returned'::text, 'retired'::text])))
);

ALTER TABLE ONLY public.stock_serial_unit FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE stock_serial_unit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.stock_serial_unit IS 'Unita'' serializzata singola (qty=1). Ciclo: in_stock -> assigned -> installed (parco installato) / faulty / returned / retired.';


--
-- Name: subscription; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: template; Type: TABLE; Schema: public; Owner: -
--

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


--
-- Name: tenant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    vertical text NOT NULL,
    default_locale text DEFAULT 'it-IT'::text NOT NULL,
    timezone text DEFAULT 'Europe/Rome'::text NOT NULL,
    domain_pack jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    working_hours jsonb DEFAULT '{"fri": [["08:00", "13:00"], ["14:00", "18:00"]], "mon": [["08:00", "13:00"], ["14:00", "18:00"]], "sat": [], "sun": [], "thu": [["08:00", "13:00"], ["14:00", "18:00"]], "tue": [["08:00", "13:00"], ["14:00", "18:00"]], "wed": [["08:00", "13:00"], ["14:00", "18:00"]]}'::jsonb NOT NULL,
    default_cost_rate numeric,
    default_bill_rate numeric,
    default_currency text DEFAULT 'EUR'::text
);

ALTER TABLE ONLY public.tenant FORCE ROW LEVEL SECURITY;


--
-- Name: term_override; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.term_override (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    locale text NOT NULL,
    term_key text NOT NULL,
    value_singular text NOT NULL,
    value_plural text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.term_override FORCE ROW LEVEL SECURITY;


--
-- Name: time_tracking_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_tracking_session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_id uuid NOT NULL,
    activity_id uuid,
    engagement_id uuid,
    started_at timestamp with time zone NOT NULL,
    stopped_at timestamp with time zone,
    committed_time_entry_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);

ALTER TABLE ONLY public.time_tracking_session FORCE ROW LEVEL SECURITY;


--
-- Name: user_role; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_role (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL
);

ALTER TABLE ONLY public.user_role FORCE ROW LEVEL SECURITY;


--
-- Name: work_line_measure; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_line_measure (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    work_line_id uuid NOT NULL,
    label text,
    formula text,
    value numeric NOT NULL,
    seq integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.work_line_measure FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE work_line_measure; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.work_line_measure IS 'Libretto misure: righe di misura che, sommate, danno la quantita'' della lavorazione.';


--
-- Name: work_order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_order (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    engagement_id uuid NOT NULL,
    code text NOT NULL,
    operator_company_id uuid,
    operator_order_id text,
    status_id uuid NOT NULL,
    assigned_resource_id uuid,
    activity_id uuid,
    address text,
    geo point,
    scheduled_on date,
    completed_on date,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    archived_at timestamp with time zone,
    client_created_at timestamp with time zone
);

ALTER TABLE ONLY public.work_order FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE work_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.work_order IS 'Ordinativo / ticket di attivazione FTTH. 1 commessa = N ordinativi. PII dell''intestatario in work_order_subject.';


--
-- Name: work_order_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_order_item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    work_order_id uuid NOT NULL,
    material_id uuid NOT NULL,
    planned_qty numeric DEFAULT 1 NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT work_order_item_planned_qty_check CHECK ((planned_qty > (0)::numeric))
);

ALTER TABLE ONLY public.work_order_item FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE work_order_item; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.work_order_item IS 'Apparati/materiali pianificati su un ordinativo (es. 1 ONT, 1 borchia, 1 splitter). I seriali EFFETTIVAMENTE installati sono in stock_serial_unit.';


--
-- Name: work_order_subject; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_order_subject (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    work_order_id uuid NOT NULL,
    full_name text,
    phone text,
    phone_alt text,
    email text,
    fiscal_code text,
    address text,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid
);

ALTER TABLE ONLY public.work_order_subject FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE work_order_subject; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.work_order_subject IS 'Dati personali dell''utente finale (PII). Tabella isolata: mascheramento + permesso ''pii.read'' + retention gestiti a livello applicativo. RLS = solo tenant.';


--
-- Name: work_report; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_report (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    engagement_id uuid NOT NULL,
    activity_id uuid,
    period_start date,
    period_end date,
    audience text DEFAULT 'customer'::text NOT NULL,
    status_id uuid NOT NULL,
    raw_text text,
    ai_text text,
    final_text text,
    signer_name text,
    signature_url text,
    signed_at timestamp with time zone,
    generated_by_ai boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    client_created_at timestamp with time zone
);

ALTER TABLE ONLY public.work_report FORCE ROW LEVEL SECURITY;


--
-- Name: work_report_time_entry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_report_time_entry (
    work_report_id uuid NOT NULL,
    time_entry_id uuid NOT NULL,
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.work_report_time_entry FORCE ROW LEVEL SECURITY;


--
-- Name: absence_balance absence_balance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absence_balance
    ADD CONSTRAINT absence_balance_pkey PRIMARY KEY (id);


--
-- Name: absence_balance absence_balance_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absence_balance
    ADD CONSTRAINT absence_balance_uk UNIQUE (tenant_id, resource_id, type_id, year);


--
-- Name: absence_entry absence_entry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absence_entry
    ADD CONSTRAINT absence_entry_pkey PRIMARY KEY (id);


--
-- Name: activity_dependency activity_dependency_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_dependency
    ADD CONSTRAINT activity_dependency_pkey PRIMARY KEY (id);


--
-- Name: activity_dependency activity_dependency_predecessor_id_successor_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_dependency
    ADD CONSTRAINT activity_dependency_predecessor_id_successor_id_key UNIQUE (predecessor_id, successor_id);


--
-- Name: activity activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_pkey PRIMARY KEY (id);


--
-- Name: activity_resource activity_resource_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_resource
    ADD CONSTRAINT activity_resource_pkey PRIMARY KEY (id);


--
-- Name: app_user app_user_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: app_user app_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_pkey PRIMARY KEY (id);


--
-- Name: asset asset_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset
    ADD CONSTRAINT asset_pkey PRIMARY KEY (id);


--
-- Name: canonical_state canonical_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canonical_state
    ADD CONSTRAINT canonical_state_pkey PRIMARY KEY (category, code);


--
-- Name: capture capture_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capture
    ADD CONSTRAINT capture_pkey PRIMARY KEY (id);


--
-- Name: company_contact company_contact_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_contact
    ADD CONSTRAINT company_contact_pkey PRIMARY KEY (id);


--
-- Name: company company_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company
    ADD CONSTRAINT company_pkey PRIMARY KEY (id);


--
-- Name: company_role company_role_company_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_role
    ADD CONSTRAINT company_role_company_id_role_key UNIQUE (company_id, role);


--
-- Name: company_role company_role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_role
    ADD CONSTRAINT company_role_pkey PRIMARY KEY (id);


--
-- Name: engagement engagement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement
    ADD CONSTRAINT engagement_pkey PRIMARY KEY (id);


--
-- Name: engagement engagement_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement
    ADD CONSTRAINT engagement_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: equipment_usage equipment_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_usage
    ADD CONSTRAINT equipment_usage_pkey PRIMARY KEY (id);


--
-- Name: field_definition field_definition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_definition
    ADD CONSTRAINT field_definition_pkey PRIMARY KEY (id);


--
-- Name: field_definition field_definition_tenant_id_vertical_entity_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_definition
    ADD CONSTRAINT field_definition_tenant_id_vertical_entity_key_key UNIQUE (tenant_id, vertical, entity, key);


--
-- Name: lookup_override lookup_override_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lookup_override
    ADD CONSTRAINT lookup_override_pkey PRIMARY KEY (id);


--
-- Name: lookup_override lookup_override_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lookup_override
    ADD CONSTRAINT lookup_override_uk UNIQUE (tenant_id, lookup_id);


--
-- Name: lookup_value lookup_value_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lookup_value
    ADD CONSTRAINT lookup_value_pkey PRIMARY KEY (id);


--
-- Name: lookup_value lookup_value_tenant_id_category_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lookup_value
    ADD CONSTRAINT lookup_value_tenant_id_category_code_key UNIQUE (tenant_id, category, code);


--
-- Name: material_consumption material_consumption_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_consumption
    ADD CONSTRAINT material_consumption_pkey PRIMARY KEY (id);


--
-- Name: material material_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material
    ADD CONSTRAINT material_pkey PRIMARY KEY (id);


--
-- Name: material material_tenant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material
    ADD CONSTRAINT material_tenant_id_name_key UNIQUE (tenant_id, name);


--
-- Name: activity_resource no_double_booking; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_resource
    ADD CONSTRAINT no_double_booking EXCLUDE USING gist (resource_id WITH =, tstzrange(planned_from, planned_to) WITH &&) WHERE (((planned_from IS NOT NULL) AND (planned_to IS NOT NULL)));


--
-- Name: number_series number_series_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.number_series
    ADD CONSTRAINT number_series_pkey PRIMARY KEY (tenant_id, key);


--
-- Name: phase phase_engagement_id_parent_phase_id_seq_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phase
    ADD CONSTRAINT phase_engagement_id_parent_phase_id_seq_key UNIQUE (engagement_id, parent_phase_id, seq);


--
-- Name: phase phase_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phase
    ADD CONSTRAINT phase_pkey PRIMARY KEY (id);


--
-- Name: plan plan_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan
    ADD CONSTRAINT plan_code_key UNIQUE (code);


--
-- Name: plan plan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan
    ADD CONSTRAINT plan_pkey PRIMARY KEY (id);


--
-- Name: price_list_item price_list_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_list_item
    ADD CONSTRAINT price_list_item_pkey PRIMARY KEY (id);


--
-- Name: price_list_item price_list_item_tenant_id_price_list_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_list_item
    ADD CONSTRAINT price_list_item_tenant_id_price_list_id_code_key UNIQUE (tenant_id, price_list_id, code);


--
-- Name: price_list_override price_list_override_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_list_override
    ADD CONSTRAINT price_list_override_pkey PRIMARY KEY (id);


--
-- Name: price_list price_list_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_list
    ADD CONSTRAINT price_list_pkey PRIMARY KEY (id);


--
-- Name: price_list price_list_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_list
    ADD CONSTRAINT price_list_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: rate_card rate_card_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_card
    ADD CONSTRAINT rate_card_pkey PRIMARY KEY (id);


--
-- Name: resource_availability resource_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_availability
    ADD CONSTRAINT resource_availability_pkey PRIMARY KEY (id);


--
-- Name: resource resource_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource
    ADD CONSTRAINT resource_pkey PRIMARY KEY (id);


--
-- Name: role_permission role_permission_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permission
    ADD CONSTRAINT role_permission_pkey PRIMARY KEY (role_id, permission_key);


--
-- Name: role role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role
    ADD CONSTRAINT role_pkey PRIMARY KEY (id);


--
-- Name: role role_tenant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role
    ADD CONSTRAINT role_tenant_id_name_key UNIQUE (tenant_id, name);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sisuite_migrations sisuite_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sisuite_migrations
    ADD CONSTRAINT sisuite_migrations_pkey PRIMARY KEY (filename);


--
-- Name: stock_balance stock_balance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_balance
    ADD CONSTRAINT stock_balance_pkey PRIMARY KEY (id);


--
-- Name: stock_balance stock_balance_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_balance
    ADD CONSTRAINT stock_balance_uk UNIQUE (tenant_id, material_id, location_id);


--
-- Name: stock_document_line stock_document_line_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_document_line
    ADD CONSTRAINT stock_document_line_pkey PRIMARY KEY (id);


--
-- Name: stock_document stock_document_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_document
    ADD CONSTRAINT stock_document_pkey PRIMARY KEY (id);


--
-- Name: stock_location stock_location_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_location
    ADD CONSTRAINT stock_location_pkey PRIMARY KEY (id);


--
-- Name: stock_movement stock_movement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_pkey PRIMARY KEY (id);


--
-- Name: stock_serial_unit stock_serial_unit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_serial_unit
    ADD CONSTRAINT stock_serial_unit_pkey PRIMARY KEY (id);


--
-- Name: stock_serial_unit stock_serial_unit_tenant_id_material_id_serial_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_serial_unit
    ADD CONSTRAINT stock_serial_unit_tenant_id_material_id_serial_key UNIQUE (tenant_id, material_id, serial);


--
-- Name: subcontract_line subcontract_line_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontract_line
    ADD CONSTRAINT subcontract_line_pkey PRIMARY KEY (id);


--
-- Name: subscription subscription_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription
    ADD CONSTRAINT subscription_pkey PRIMARY KEY (id);


--
-- Name: template template_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template
    ADD CONSTRAINT template_pkey PRIMARY KEY (id);


--
-- Name: tenant tenant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant
    ADD CONSTRAINT tenant_pkey PRIMARY KEY (id);


--
-- Name: term_override term_override_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term_override
    ADD CONSTRAINT term_override_pkey PRIMARY KEY (id);


--
-- Name: term_override term_override_tenant_id_locale_term_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term_override
    ADD CONSTRAINT term_override_tenant_id_locale_term_key_key UNIQUE (tenant_id, locale, term_key);


--
-- Name: time_entry time_entry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entry
    ADD CONSTRAINT time_entry_pkey PRIMARY KEY (id);


--
-- Name: time_tracking_session time_tracking_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_tracking_session
    ADD CONSTRAINT time_tracking_session_pkey PRIMARY KEY (id);


--
-- Name: user_role user_role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_role
    ADD CONSTRAINT user_role_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: work_line_measure work_line_measure_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_line_measure
    ADD CONSTRAINT work_line_measure_pkey PRIMARY KEY (id);


--
-- Name: work_line work_line_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_line
    ADD CONSTRAINT work_line_pkey PRIMARY KEY (id);


--
-- Name: work_order_item work_order_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order_item
    ADD CONSTRAINT work_order_item_pkey PRIMARY KEY (id);


--
-- Name: work_order work_order_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order
    ADD CONSTRAINT work_order_pkey PRIMARY KEY (id);


--
-- Name: work_order_subject work_order_subject_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order_subject
    ADD CONSTRAINT work_order_subject_pkey PRIMARY KEY (id);


--
-- Name: work_order_subject work_order_subject_work_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order_subject
    ADD CONSTRAINT work_order_subject_work_order_id_key UNIQUE (work_order_id);


--
-- Name: work_order work_order_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order
    ADD CONSTRAINT work_order_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: work_order work_order_tenant_id_operator_company_id_operator_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order
    ADD CONSTRAINT work_order_tenant_id_operator_company_id_operator_order_id_key UNIQUE (tenant_id, operator_company_id, operator_order_id);


--
-- Name: work_report work_report_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_report
    ADD CONSTRAINT work_report_pkey PRIMARY KEY (id);


--
-- Name: work_report_time_entry work_report_time_entry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_report_time_entry
    ADD CONSTRAINT work_report_time_entry_pkey PRIMARY KEY (work_report_id, time_entry_id);


--
-- Name: absence_balance_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX absence_balance_tenant_id_idx ON public.absence_balance USING btree (tenant_id);


--
-- Name: absence_entry_resource_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX absence_entry_resource_id_idx ON public.absence_entry USING btree (resource_id);


--
-- Name: absence_entry_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX absence_entry_tenant_id_idx ON public.absence_entry USING btree (tenant_id);


--
-- Name: activity_dependency_predecessor_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_dependency_predecessor_id_idx ON public.activity_dependency USING btree (predecessor_id);


--
-- Name: activity_dependency_successor_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_dependency_successor_id_idx ON public.activity_dependency USING btree (successor_id);


--
-- Name: activity_dependency_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_dependency_tenant_id_idx ON public.activity_dependency USING btree (tenant_id);


--
-- Name: activity_engagement_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_engagement_id_idx ON public.activity USING btree (engagement_id);


--
-- Name: activity_resource_activity_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_resource_activity_id_idx ON public.activity_resource USING btree (activity_id);


--
-- Name: activity_resource_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_resource_tenant_id_idx ON public.activity_resource USING btree (tenant_id);


--
-- Name: activity_scheduled_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_scheduled_start_idx ON public.activity USING btree (scheduled_start);


--
-- Name: activity_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_tenant_id_idx ON public.activity USING btree (tenant_id);


--
-- Name: app_user_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_user_company_id_idx ON public.app_user USING btree (company_id);


--
-- Name: app_user_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_user_tenant_id_idx ON public.app_user USING btree (tenant_id);


--
-- Name: asset_attributes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX asset_attributes_idx ON public.asset USING gin (attributes);


--
-- Name: asset_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX asset_company_id_idx ON public.asset USING btree (company_id);


--
-- Name: asset_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX asset_tenant_id_idx ON public.asset USING btree (tenant_id);


--
-- Name: capture_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX capture_embedding_idx ON public.capture USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: capture_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX capture_tenant_id_idx ON public.capture USING btree (tenant_id);


--
-- Name: company_attributes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_attributes_idx ON public.company USING gin (attributes);


--
-- Name: company_contact_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_contact_company_id_idx ON public.company_contact USING btree (company_id);


--
-- Name: company_contact_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_contact_tenant_id_idx ON public.company_contact USING btree (tenant_id);


--
-- Name: company_role_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_role_company_id_idx ON public.company_role USING btree (company_id);


--
-- Name: company_role_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_role_tenant_id_idx ON public.company_role USING btree (tenant_id);


--
-- Name: company_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_tenant_id_idx ON public.company USING btree (tenant_id);


--
-- Name: engagement_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engagement_company_id_idx ON public.engagement USING btree (company_id);


--
-- Name: engagement_manager_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engagement_manager_id_idx ON public.engagement USING btree (manager_id);


--
-- Name: engagement_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engagement_tenant_id_idx ON public.engagement USING btree (tenant_id);


--
-- Name: equipment_usage_engagement_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX equipment_usage_engagement_id_idx ON public.equipment_usage USING btree (engagement_id);


--
-- Name: equipment_usage_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX equipment_usage_tenant_id_idx ON public.equipment_usage USING btree (tenant_id);


--
-- Name: field_definition_entity_vertical_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX field_definition_entity_vertical_idx ON public.field_definition USING btree (entity, vertical);


--
-- Name: field_definition_system_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX field_definition_system_uniq ON public.field_definition USING btree (vertical, entity, key) WHERE (tenant_id IS NULL);


--
-- Name: field_definition_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX field_definition_tenant_id_idx ON public.field_definition USING btree (tenant_id);


--
-- Name: lookup_override_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lookup_override_lookup_idx ON public.lookup_override USING btree (lookup_id);


--
-- Name: lookup_override_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lookup_override_tenant_idx ON public.lookup_override USING btree (tenant_id);


--
-- Name: lookup_value_system_code_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX lookup_value_system_code_uniq ON public.lookup_value USING btree (category, code) WHERE (tenant_id IS NULL);


--
-- Name: lookup_value_tenant_id_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lookup_value_tenant_id_category_idx ON public.lookup_value USING btree (tenant_id, category);


--
-- Name: material_consumption_activity_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX material_consumption_activity_id_idx ON public.material_consumption USING btree (activity_id);


--
-- Name: material_consumption_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX material_consumption_tenant_id_idx ON public.material_consumption USING btree (tenant_id);


--
-- Name: material_tenant_sku_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX material_tenant_sku_uk ON public.material USING btree (tenant_id, sku) WHERE (sku IS NOT NULL);


--
-- Name: phase_parent_phase_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX phase_parent_phase_id_idx ON public.phase USING btree (parent_phase_id);


--
-- Name: phase_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX phase_tenant_id_idx ON public.phase USING btree (tenant_id);


--
-- Name: price_list_item_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX price_list_item_category_idx ON public.price_list_item USING btree (category);


--
-- Name: price_list_item_price_list_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX price_list_item_price_list_id_idx ON public.price_list_item USING btree (price_list_id);


--
-- Name: price_list_item_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX price_list_item_tenant_id_idx ON public.price_list_item USING btree (tenant_id);


--
-- Name: price_list_override_base_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX price_list_override_base_item_id_idx ON public.price_list_override USING btree (base_item_id);


--
-- Name: price_list_override_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX price_list_override_company_id_idx ON public.price_list_override USING btree (company_id);


--
-- Name: price_list_override_engagement_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX price_list_override_engagement_id_idx ON public.price_list_override USING btree (engagement_id);


--
-- Name: price_list_override_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX price_list_override_tenant_id_idx ON public.price_list_override USING btree (tenant_id);


--
-- Name: price_list_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX price_list_tenant_id_idx ON public.price_list USING btree (tenant_id);


--
-- Name: rate_card_engagement_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rate_card_engagement_idx ON public.rate_card USING btree (engagement_id);


--
-- Name: rate_card_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rate_card_resource_idx ON public.rate_card USING btree (resource_id);


--
-- Name: rate_card_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rate_card_tenant_id_idx ON public.rate_card USING btree (tenant_id);


--
-- Name: resource_availability_resource_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resource_availability_resource_id_idx ON public.resource_availability USING btree (resource_id);


--
-- Name: resource_availability_resource_id_tstzrange_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resource_availability_resource_id_tstzrange_idx ON public.resource_availability USING gist (resource_id, tstzrange(starts_at, ends_at));


--
-- Name: resource_availability_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resource_availability_tenant_id_idx ON public.resource_availability USING btree (tenant_id);


--
-- Name: resource_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resource_tenant_id_idx ON public.resource USING btree (tenant_id);


--
-- Name: role_system_name_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX role_system_name_uniq ON public.role USING btree (name) WHERE (tenant_id IS NULL);


--
-- Name: schema_migrations_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX schema_migrations_version_idx ON public.schema_migrations USING btree (version);


--
-- Name: stock_balance_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_balance_tenant_id_idx ON public.stock_balance USING btree (tenant_id);


--
-- Name: stock_document_line_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_document_line_doc_idx ON public.stock_document_line USING btree (document_id);


--
-- Name: stock_document_line_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_document_line_tenant_idx ON public.stock_document_line USING btree (tenant_id);


--
-- Name: stock_document_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_document_tenant_id_idx ON public.stock_document USING btree (tenant_id);


--
-- Name: stock_location_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_location_parent_id_idx ON public.stock_location USING btree (parent_id);


--
-- Name: stock_location_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_location_tenant_id_idx ON public.stock_location USING btree (tenant_id);


--
-- Name: stock_movement_activity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movement_activity_idx ON public.stock_movement USING btree (activity_id);


--
-- Name: stock_movement_document_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movement_document_idx ON public.stock_movement USING btree (stock_document_id);


--
-- Name: stock_movement_mat_loc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movement_mat_loc_idx ON public.stock_movement USING btree (material_id, location_id);


--
-- Name: stock_movement_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movement_occurred_idx ON public.stock_movement USING btree (occurred_on);


--
-- Name: stock_movement_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movement_tenant_id_idx ON public.stock_movement USING btree (tenant_id);


--
-- Name: stock_movement_transfer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movement_transfer_idx ON public.stock_movement USING btree (transfer_group_id);


--
-- Name: stock_serial_unit_installed_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_serial_unit_installed_company_id_idx ON public.stock_serial_unit USING btree (installed_company_id);


--
-- Name: stock_serial_unit_location_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_serial_unit_location_id_idx ON public.stock_serial_unit USING btree (location_id);


--
-- Name: stock_serial_unit_material_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_serial_unit_material_id_idx ON public.stock_serial_unit USING btree (material_id);


--
-- Name: stock_serial_unit_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_serial_unit_status_idx ON public.stock_serial_unit USING btree (status);


--
-- Name: stock_serial_unit_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_serial_unit_tenant_id_idx ON public.stock_serial_unit USING btree (tenant_id);


--
-- Name: stock_serial_unit_work_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_serial_unit_work_order_id_idx ON public.stock_serial_unit USING btree (work_order_id);


--
-- Name: subcontract_line_engagement_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subcontract_line_engagement_id_idx ON public.subcontract_line USING btree (engagement_id);


--
-- Name: subcontract_line_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subcontract_line_tenant_id_idx ON public.subcontract_line USING btree (tenant_id);


--
-- Name: subscription_current_period_end_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscription_current_period_end_idx ON public.subscription USING btree (current_period_end);


--
-- Name: subscription_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscription_tenant_id_idx ON public.subscription USING btree (tenant_id);


--
-- Name: template_tenant_id_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX template_tenant_id_scope_idx ON public.template USING btree (tenant_id, scope);


--
-- Name: time_entry_approval_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX time_entry_approval_status_idx ON public.time_entry USING btree (approval_status_id);


--
-- Name: time_entry_engagement_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX time_entry_engagement_id_idx ON public.time_entry USING btree (engagement_id);


--
-- Name: time_entry_occurred_on_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX time_entry_occurred_on_idx ON public.time_entry USING btree (occurred_on);


--
-- Name: time_entry_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX time_entry_tenant_id_idx ON public.time_entry USING btree (tenant_id);


--
-- Name: time_entry_typology_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX time_entry_typology_id_idx ON public.time_entry USING btree (typology_id);


--
-- Name: time_tracking_session_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX time_tracking_session_resource_idx ON public.time_tracking_session USING btree (resource_id);


--
-- Name: time_tracking_session_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX time_tracking_session_tenant_id_idx ON public.time_tracking_session USING btree (tenant_id);


--
-- Name: user_role_role_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_role_role_id_idx ON public.user_role USING btree (role_id);


--
-- Name: work_line_engagement_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX work_line_engagement_id_idx ON public.work_line USING btree (engagement_id);


--
-- Name: work_line_measure_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX work_line_measure_tenant_id_idx ON public.work_line_measure USING btree (tenant_id);


--
-- Name: work_line_measure_work_line_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX work_line_measure_work_line_id_idx ON public.work_line_measure USING btree (work_line_id);


--
-- Name: work_line_phase_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX work_line_phase_id_idx ON public.work_line USING btree (phase_id);


--
-- Name: work_line_price_list_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX work_line_price_list_item_id_idx ON public.work_line USING btree (price_list_item_id);


--
-- Name: work_line_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX work_line_tenant_id_idx ON public.work_line USING btree (tenant_id);


--
-- Name: work_order_assigned_resource_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX work_order_assigned_resource_id_idx ON public.work_order USING btree (assigned_resource_id);


--
-- Name: work_order_engagement_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX work_order_engagement_id_idx ON public.work_order USING btree (engagement_id);


--
-- Name: work_order_item_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX work_order_item_tenant_id_idx ON public.work_order_item USING btree (tenant_id);


--
-- Name: work_order_item_work_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX work_order_item_work_order_id_idx ON public.work_order_item USING btree (work_order_id);


--
-- Name: work_order_status_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX work_order_status_id_idx ON public.work_order USING btree (status_id);


--
-- Name: work_order_subject_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX work_order_subject_tenant_id_idx ON public.work_order_subject USING btree (tenant_id);


--
-- Name: work_order_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX work_order_tenant_id_idx ON public.work_order USING btree (tenant_id);


--
-- Name: work_report_engagement_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX work_report_engagement_id_idx ON public.work_report USING btree (engagement_id);


--
-- Name: work_report_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX work_report_tenant_id_idx ON public.work_report USING btree (tenant_id);


--
-- Name: work_report_time_entry_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX work_report_time_entry_tenant_idx ON public.work_report_time_entry USING btree (tenant_id);


--
-- Name: equipment_usage equipment_usage_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER equipment_usage_set_updated_at BEFORE UPDATE ON public.equipment_usage FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: price_list_item price_list_item_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER price_list_item_set_updated_at BEFORE UPDATE ON public.price_list_item FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: price_list_override price_list_override_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER price_list_override_set_updated_at BEFORE UPDATE ON public.price_list_override FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: price_list price_list_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER price_list_set_updated_at BEFORE UPDATE ON public.price_list FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: stock_serial_unit stock_serial_unit_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stock_serial_unit_set_updated_at BEFORE UPDATE ON public.stock_serial_unit FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: subcontract_line subcontract_line_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER subcontract_line_set_updated_at BEFORE UPDATE ON public.subcontract_line FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: absence_balance trg_absence_balance_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_absence_balance_updated BEFORE UPDATE ON public.absence_balance FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: absence_entry trg_absence_entry_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_absence_entry_updated BEFORE UPDATE ON public.absence_entry FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: activity_dependency trg_activity_dependency_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_activity_dependency_updated BEFORE UPDATE ON public.activity_dependency FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: activity_resource trg_activity_resource_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_activity_resource_updated BEFORE UPDATE ON public.activity_resource FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: activity trg_activity_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_activity_updated BEFORE UPDATE ON public.activity FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: app_user trg_app_user_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_user_updated BEFORE UPDATE ON public.app_user FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: asset trg_asset_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_asset_updated BEFORE UPDATE ON public.asset FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: capture trg_capture_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_capture_updated BEFORE UPDATE ON public.capture FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: company_contact trg_company_contact_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_company_contact_updated BEFORE UPDATE ON public.company_contact FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: company_role trg_company_role_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_company_role_updated BEFORE UPDATE ON public.company_role FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: company trg_company_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_company_updated BEFORE UPDATE ON public.company FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: engagement trg_engagement_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_engagement_updated BEFORE UPDATE ON public.engagement FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: lookup_override trg_lookup_override_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lookup_override_updated BEFORE UPDATE ON public.lookup_override FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: lookup_value trg_lookup_value_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lookup_value_updated BEFORE UPDATE ON public.lookup_value FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: material_consumption trg_material_consumption_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_material_consumption_updated BEFORE UPDATE ON public.material_consumption FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: material trg_material_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_material_updated BEFORE UPDATE ON public.material FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: phase trg_phase_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_phase_updated BEFORE UPDATE ON public.phase FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: plan trg_plan_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_plan_updated BEFORE UPDATE ON public.plan FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: rate_card trg_rate_card_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rate_card_updated BEFORE UPDATE ON public.rate_card FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: resource_availability trg_resource_availability_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_resource_availability_updated BEFORE UPDATE ON public.resource_availability FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: resource trg_resource_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_resource_updated BEFORE UPDATE ON public.resource FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: role trg_role_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_role_updated BEFORE UPDATE ON public.role FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: stock_document trg_stock_document_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_stock_document_updated BEFORE UPDATE ON public.stock_document FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: stock_location trg_stock_location_no_cycle; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_stock_location_no_cycle BEFORE INSERT OR UPDATE ON public.stock_location FOR EACH ROW EXECUTE FUNCTION public.stock_location_no_cycle();


--
-- Name: stock_location trg_stock_location_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_stock_location_updated BEFORE UPDATE ON public.stock_location FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: stock_movement trg_stock_movement_apply; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_stock_movement_apply AFTER INSERT ON public.stock_movement FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();


--
-- Name: stock_movement trg_stock_movement_no_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_stock_movement_no_delete BEFORE DELETE ON public.stock_movement FOR EACH ROW EXECUTE FUNCTION public.stock_movement_is_immutable();


--
-- Name: stock_movement trg_stock_movement_no_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_stock_movement_no_update BEFORE UPDATE ON public.stock_movement FOR EACH ROW EXECUTE FUNCTION public.stock_movement_is_immutable();


--
-- Name: subscription trg_subscription_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_subscription_updated BEFORE UPDATE ON public.subscription FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: template trg_template_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_template_updated BEFORE UPDATE ON public.template FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: time_entry trg_time_entry_lock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_time_entry_lock BEFORE UPDATE ON public.time_entry FOR EACH ROW EXECUTE FUNCTION public.block_locked_time_entry();


--
-- Name: time_entry trg_time_entry_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_time_entry_updated BEFORE UPDATE ON public.time_entry FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: time_tracking_session trg_time_tracking_session_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_time_tracking_session_updated BEFORE UPDATE ON public.time_tracking_session FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: work_report trg_work_report_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_work_report_updated BEFORE UPDATE ON public.work_report FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: work_line work_line_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER work_line_set_updated_at BEFORE UPDATE ON public.work_line FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: work_order work_order_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER work_order_set_updated_at BEFORE UPDATE ON public.work_order FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: work_order_subject work_order_subject_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER work_order_subject_set_updated_at BEFORE UPDATE ON public.work_order_subject FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: absence_balance absence_balance_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absence_balance
    ADD CONSTRAINT absence_balance_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resource(id) ON DELETE CASCADE;


--
-- Name: absence_balance absence_balance_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absence_balance
    ADD CONSTRAINT absence_balance_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: absence_balance absence_balance_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absence_balance
    ADD CONSTRAINT absence_balance_type_id_fkey FOREIGN KEY (type_id) REFERENCES public.lookup_value(id);


--
-- Name: absence_entry absence_entry_approval_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absence_entry
    ADD CONSTRAINT absence_entry_approval_status_id_fkey FOREIGN KEY (approval_status_id) REFERENCES public.lookup_value(id);


--
-- Name: absence_entry absence_entry_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absence_entry
    ADD CONSTRAINT absence_entry_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: absence_entry absence_entry_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absence_entry
    ADD CONSTRAINT absence_entry_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resource(id) ON DELETE RESTRICT;


--
-- Name: absence_entry absence_entry_source_capture_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absence_entry
    ADD CONSTRAINT absence_entry_source_capture_id_fkey FOREIGN KEY (source_capture_id) REFERENCES public.capture(id) ON DELETE SET NULL;


--
-- Name: absence_entry absence_entry_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absence_entry
    ADD CONSTRAINT absence_entry_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: absence_entry absence_entry_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absence_entry
    ADD CONSTRAINT absence_entry_type_id_fkey FOREIGN KEY (type_id) REFERENCES public.lookup_value(id);


--
-- Name: absence_entry absence_entry_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absence_entry
    ADD CONSTRAINT absence_entry_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: activity activity_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.asset(id) ON DELETE SET NULL;


--
-- Name: activity activity_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: activity_dependency activity_dependency_predecessor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_dependency
    ADD CONSTRAINT activity_dependency_predecessor_id_fkey FOREIGN KEY (predecessor_id) REFERENCES public.activity(id) ON DELETE CASCADE;


--
-- Name: activity_dependency activity_dependency_successor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_dependency
    ADD CONSTRAINT activity_dependency_successor_id_fkey FOREIGN KEY (successor_id) REFERENCES public.activity(id) ON DELETE CASCADE;


--
-- Name: activity_dependency activity_dependency_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_dependency
    ADD CONSTRAINT activity_dependency_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: activity activity_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagement(id) ON DELETE CASCADE;


--
-- Name: activity activity_phase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_phase_id_fkey FOREIGN KEY (phase_id) REFERENCES public.phase(id) ON DELETE SET NULL;


--
-- Name: activity activity_priority_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_priority_id_fkey FOREIGN KEY (priority_id) REFERENCES public.lookup_value(id);


--
-- Name: activity_resource activity_resource_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_resource
    ADD CONSTRAINT activity_resource_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activity(id) ON DELETE CASCADE;


--
-- Name: activity_resource activity_resource_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_resource
    ADD CONSTRAINT activity_resource_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resource(id) ON DELETE CASCADE;


--
-- Name: activity_resource activity_resource_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_resource
    ADD CONSTRAINT activity_resource_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: activity activity_schedule_mode_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_schedule_mode_id_fkey FOREIGN KEY (schedule_mode_id) REFERENCES public.lookup_value(id);


--
-- Name: activity activity_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.lookup_value(id);


--
-- Name: activity activity_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: activity activity_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity
    ADD CONSTRAINT activity_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: app_user app_user_company_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_company_fk FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE SET NULL;


--
-- Name: app_user app_user_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: asset asset_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset
    ADD CONSTRAINT asset_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE RESTRICT;


--
-- Name: asset asset_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset
    ADD CONSTRAINT asset_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: asset asset_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset
    ADD CONSTRAINT asset_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: asset asset_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset
    ADD CONSTRAINT asset_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: capture capture_applied_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capture
    ADD CONSTRAINT capture_applied_by_fkey FOREIGN KEY (applied_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: capture capture_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capture
    ADD CONSTRAINT capture_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: capture capture_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capture
    ADD CONSTRAINT capture_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: company_contact company_contact_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_contact
    ADD CONSTRAINT company_contact_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;


--
-- Name: company_contact company_contact_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_contact
    ADD CONSTRAINT company_contact_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: company company_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company
    ADD CONSTRAINT company_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: company_role company_role_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_role
    ADD CONSTRAINT company_role_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;


--
-- Name: company_role company_role_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_role
    ADD CONSTRAINT company_role_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: company company_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company
    ADD CONSTRAINT company_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: company company_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company
    ADD CONSTRAINT company_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: engagement engagement_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement
    ADD CONSTRAINT engagement_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.asset(id) ON DELETE SET NULL;


--
-- Name: engagement engagement_billing_mode_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement
    ADD CONSTRAINT engagement_billing_mode_id_fkey FOREIGN KEY (billing_mode_id) REFERENCES public.lookup_value(id);


--
-- Name: engagement engagement_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement
    ADD CONSTRAINT engagement_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE RESTRICT;


--
-- Name: engagement engagement_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement
    ADD CONSTRAINT engagement_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: engagement engagement_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement
    ADD CONSTRAINT engagement_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: engagement engagement_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement
    ADD CONSTRAINT engagement_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.lookup_value(id);


--
-- Name: engagement engagement_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement
    ADD CONSTRAINT engagement_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: engagement engagement_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement
    ADD CONSTRAINT engagement_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: equipment_usage equipment_usage_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_usage
    ADD CONSTRAINT equipment_usage_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagement(id) ON DELETE CASCADE;


--
-- Name: equipment_usage equipment_usage_phase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_usage
    ADD CONSTRAINT equipment_usage_phase_id_fkey FOREIGN KEY (phase_id) REFERENCES public.phase(id) ON DELETE SET NULL;


--
-- Name: equipment_usage equipment_usage_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_usage
    ADD CONSTRAINT equipment_usage_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resource(id) ON DELETE RESTRICT;


--
-- Name: equipment_usage equipment_usage_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_usage
    ADD CONSTRAINT equipment_usage_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: equipment_usage equipment_usage_work_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_usage
    ADD CONSTRAINT equipment_usage_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES public.work_order(id) ON DELETE SET NULL;


--
-- Name: field_definition field_definition_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_definition
    ADD CONSTRAINT field_definition_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: lookup_override lookup_override_lookup_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lookup_override
    ADD CONSTRAINT lookup_override_lookup_id_fkey FOREIGN KEY (lookup_id) REFERENCES public.lookup_value(id) ON DELETE CASCADE;


--
-- Name: lookup_override lookup_override_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lookup_override
    ADD CONSTRAINT lookup_override_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: lookup_value lookup_value_category_canonical_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lookup_value
    ADD CONSTRAINT lookup_value_category_canonical_fkey FOREIGN KEY (category, canonical) REFERENCES public.canonical_state(category, code);


--
-- Name: lookup_value lookup_value_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lookup_value
    ADD CONSTRAINT lookup_value_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: material_consumption material_consumption_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_consumption
    ADD CONSTRAINT material_consumption_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activity(id) ON DELETE SET NULL;


--
-- Name: material_consumption material_consumption_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_consumption
    ADD CONSTRAINT material_consumption_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: material_consumption material_consumption_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_consumption
    ADD CONSTRAINT material_consumption_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.material(id) ON DELETE RESTRICT;


--
-- Name: material_consumption material_consumption_source_capture_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_consumption
    ADD CONSTRAINT material_consumption_source_capture_id_fkey FOREIGN KEY (source_capture_id) REFERENCES public.capture(id) ON DELETE SET NULL;


--
-- Name: material_consumption material_consumption_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_consumption
    ADD CONSTRAINT material_consumption_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: material_consumption material_consumption_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_consumption
    ADD CONSTRAINT material_consumption_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: material_consumption material_consumption_work_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_consumption
    ADD CONSTRAINT material_consumption_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES public.work_order(id) ON DELETE SET NULL;


--
-- Name: material material_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material
    ADD CONSTRAINT material_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: material material_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material
    ADD CONSTRAINT material_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: material material_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material
    ADD CONSTRAINT material_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: number_series number_series_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.number_series
    ADD CONSTRAINT number_series_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: phase phase_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phase
    ADD CONSTRAINT phase_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: phase phase_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phase
    ADD CONSTRAINT phase_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagement(id) ON DELETE CASCADE;


--
-- Name: phase phase_parent_phase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phase
    ADD CONSTRAINT phase_parent_phase_id_fkey FOREIGN KEY (parent_phase_id) REFERENCES public.phase(id) ON DELETE CASCADE;


--
-- Name: phase phase_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phase
    ADD CONSTRAINT phase_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.lookup_value(id);


--
-- Name: phase phase_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phase
    ADD CONSTRAINT phase_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: phase phase_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phase
    ADD CONSTRAINT phase_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: price_list_item price_list_item_price_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_list_item
    ADD CONSTRAINT price_list_item_price_list_id_fkey FOREIGN KEY (price_list_id) REFERENCES public.price_list(id) ON DELETE CASCADE;


--
-- Name: price_list_item price_list_item_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_list_item
    ADD CONSTRAINT price_list_item_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: price_list_override price_list_override_base_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_list_override
    ADD CONSTRAINT price_list_override_base_item_id_fkey FOREIGN KEY (base_item_id) REFERENCES public.price_list_item(id) ON DELETE CASCADE;


--
-- Name: price_list_override price_list_override_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_list_override
    ADD CONSTRAINT price_list_override_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;


--
-- Name: price_list_override price_list_override_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_list_override
    ADD CONSTRAINT price_list_override_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagement(id) ON DELETE CASCADE;


--
-- Name: price_list_override price_list_override_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_list_override
    ADD CONSTRAINT price_list_override_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: price_list price_list_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_list
    ADD CONSTRAINT price_list_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: rate_card rate_card_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_card
    ADD CONSTRAINT rate_card_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: rate_card rate_card_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_card
    ADD CONSTRAINT rate_card_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagement(id) ON DELETE CASCADE;


--
-- Name: rate_card rate_card_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_card
    ADD CONSTRAINT rate_card_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resource(id) ON DELETE CASCADE;


--
-- Name: rate_card rate_card_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_card
    ADD CONSTRAINT rate_card_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: rate_card rate_card_typology_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_card
    ADD CONSTRAINT rate_card_typology_id_fkey FOREIGN KEY (typology_id) REFERENCES public.lookup_value(id);


--
-- Name: rate_card rate_card_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_card
    ADD CONSTRAINT rate_card_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: resource_availability resource_availability_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_availability
    ADD CONSTRAINT resource_availability_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resource(id) ON DELETE CASCADE;


--
-- Name: resource_availability resource_availability_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_availability
    ADD CONSTRAINT resource_availability_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: resource resource_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource
    ADD CONSTRAINT resource_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: resource resource_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource
    ADD CONSTRAINT resource_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: resource resource_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource
    ADD CONSTRAINT resource_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: resource resource_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource
    ADD CONSTRAINT resource_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: role_permission role_permission_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permission
    ADD CONSTRAINT role_permission_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.role(id) ON DELETE CASCADE;


--
-- Name: role role_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role
    ADD CONSTRAINT role_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: stock_balance stock_balance_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_balance
    ADD CONSTRAINT stock_balance_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.stock_location(id) ON DELETE CASCADE;


--
-- Name: stock_balance stock_balance_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_balance
    ADD CONSTRAINT stock_balance_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.material(id) ON DELETE CASCADE;


--
-- Name: stock_balance stock_balance_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_balance
    ADD CONSTRAINT stock_balance_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: stock_document stock_document_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_document
    ADD CONSTRAINT stock_document_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE SET NULL;


--
-- Name: stock_document stock_document_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_document
    ADD CONSTRAINT stock_document_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: stock_document stock_document_dest_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_document
    ADD CONSTRAINT stock_document_dest_location_id_fkey FOREIGN KEY (dest_location_id) REFERENCES public.stock_location(id) ON DELETE RESTRICT;


--
-- Name: stock_document_line stock_document_line_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_document_line
    ADD CONSTRAINT stock_document_line_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.stock_document(id) ON DELETE CASCADE;


--
-- Name: stock_document_line stock_document_line_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_document_line
    ADD CONSTRAINT stock_document_line_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.material(id) ON DELETE RESTRICT;


--
-- Name: stock_document_line stock_document_line_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_document_line
    ADD CONSTRAINT stock_document_line_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: stock_document stock_document_source_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_document
    ADD CONSTRAINT stock_document_source_location_id_fkey FOREIGN KEY (source_location_id) REFERENCES public.stock_location(id) ON DELETE RESTRICT;


--
-- Name: stock_document stock_document_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_document
    ADD CONSTRAINT stock_document_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: stock_document stock_document_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_document
    ADD CONSTRAINT stock_document_type_id_fkey FOREIGN KEY (type_id) REFERENCES public.lookup_value(id);


--
-- Name: stock_document stock_document_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_document
    ADD CONSTRAINT stock_document_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: stock_location stock_location_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_location
    ADD CONSTRAINT stock_location_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: stock_location stock_location_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_location
    ADD CONSTRAINT stock_location_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.stock_location(id) ON DELETE RESTRICT;


--
-- Name: stock_location stock_location_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_location
    ADD CONSTRAINT stock_location_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resource(id) ON DELETE SET NULL;


--
-- Name: stock_location stock_location_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_location
    ADD CONSTRAINT stock_location_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: stock_location stock_location_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_location
    ADD CONSTRAINT stock_location_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: stock_movement stock_movement_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activity(id) ON DELETE SET NULL;


--
-- Name: stock_movement stock_movement_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: stock_movement stock_movement_document_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_document_fkey FOREIGN KEY (stock_document_id) REFERENCES public.stock_document(id) ON DELETE SET NULL;


--
-- Name: stock_movement stock_movement_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagement(id) ON DELETE SET NULL;


--
-- Name: stock_movement stock_movement_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.stock_location(id) ON DELETE RESTRICT;


--
-- Name: stock_movement stock_movement_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.material(id) ON DELETE RESTRICT;


--
-- Name: stock_movement stock_movement_source_capture_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_source_capture_id_fkey FOREIGN KEY (source_capture_id) REFERENCES public.capture(id) ON DELETE SET NULL;


--
-- Name: stock_movement stock_movement_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: stock_movement stock_movement_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_type_id_fkey FOREIGN KEY (type_id) REFERENCES public.lookup_value(id);


--
-- Name: stock_movement stock_movement_work_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES public.work_order(id) ON DELETE SET NULL;


--
-- Name: stock_serial_unit stock_serial_unit_holder_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_serial_unit
    ADD CONSTRAINT stock_serial_unit_holder_resource_id_fkey FOREIGN KEY (holder_resource_id) REFERENCES public.resource(id) ON DELETE SET NULL;


--
-- Name: stock_serial_unit stock_serial_unit_installed_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_serial_unit
    ADD CONSTRAINT stock_serial_unit_installed_asset_id_fkey FOREIGN KEY (installed_asset_id) REFERENCES public.asset(id) ON DELETE SET NULL;


--
-- Name: stock_serial_unit stock_serial_unit_installed_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_serial_unit
    ADD CONSTRAINT stock_serial_unit_installed_company_id_fkey FOREIGN KEY (installed_company_id) REFERENCES public.company(id) ON DELETE SET NULL;


--
-- Name: stock_serial_unit stock_serial_unit_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_serial_unit
    ADD CONSTRAINT stock_serial_unit_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.stock_location(id) ON DELETE SET NULL;


--
-- Name: stock_serial_unit stock_serial_unit_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_serial_unit
    ADD CONSTRAINT stock_serial_unit_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.material(id) ON DELETE RESTRICT;


--
-- Name: stock_serial_unit stock_serial_unit_source_movement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_serial_unit
    ADD CONSTRAINT stock_serial_unit_source_movement_id_fkey FOREIGN KEY (source_movement_id) REFERENCES public.stock_movement(id) ON DELETE SET NULL;


--
-- Name: stock_serial_unit stock_serial_unit_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_serial_unit
    ADD CONSTRAINT stock_serial_unit_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: stock_serial_unit stock_serial_unit_work_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_serial_unit
    ADD CONSTRAINT stock_serial_unit_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES public.work_order(id) ON DELETE SET NULL;


--
-- Name: stock_serial_unit stock_serial_unit_work_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_serial_unit
    ADD CONSTRAINT stock_serial_unit_work_order_item_id_fkey FOREIGN KEY (work_order_item_id) REFERENCES public.work_order_item(id) ON DELETE SET NULL;


--
-- Name: subcontract_line subcontract_line_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontract_line
    ADD CONSTRAINT subcontract_line_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE RESTRICT;


--
-- Name: subcontract_line subcontract_line_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontract_line
    ADD CONSTRAINT subcontract_line_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagement(id) ON DELETE CASCADE;


--
-- Name: subcontract_line subcontract_line_phase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontract_line
    ADD CONSTRAINT subcontract_line_phase_id_fkey FOREIGN KEY (phase_id) REFERENCES public.phase(id) ON DELETE SET NULL;


--
-- Name: subcontract_line subcontract_line_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontract_line
    ADD CONSTRAINT subcontract_line_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: subcontract_line subcontract_line_work_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontract_line
    ADD CONSTRAINT subcontract_line_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES public.work_order(id) ON DELETE SET NULL;


--
-- Name: subscription subscription_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription
    ADD CONSTRAINT subscription_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plan(id);


--
-- Name: subscription subscription_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription
    ADD CONSTRAINT subscription_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: template template_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template
    ADD CONSTRAINT template_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: template template_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template
    ADD CONSTRAINT template_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: template template_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template
    ADD CONSTRAINT template_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: term_override term_override_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term_override
    ADD CONSTRAINT term_override_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: time_entry time_entry_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entry
    ADD CONSTRAINT time_entry_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activity(id) ON DELETE SET NULL;


--
-- Name: time_entry time_entry_approval_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entry
    ADD CONSTRAINT time_entry_approval_status_id_fkey FOREIGN KEY (approval_status_id) REFERENCES public.lookup_value(id);


--
-- Name: time_entry time_entry_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entry
    ADD CONSTRAINT time_entry_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.app_user(id);


--
-- Name: time_entry time_entry_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entry
    ADD CONSTRAINT time_entry_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: time_entry time_entry_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entry
    ADD CONSTRAINT time_entry_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagement(id) ON DELETE SET NULL;


--
-- Name: time_entry time_entry_locked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entry
    ADD CONSTRAINT time_entry_locked_by_fkey FOREIGN KEY (locked_by) REFERENCES public.app_user(id);


--
-- Name: time_entry time_entry_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entry
    ADD CONSTRAINT time_entry_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resource(id) ON DELETE SET NULL;


--
-- Name: time_entry time_entry_source_capture_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entry
    ADD CONSTRAINT time_entry_source_capture_id_fkey FOREIGN KEY (source_capture_id) REFERENCES public.capture(id) ON DELETE SET NULL;


--
-- Name: time_entry time_entry_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entry
    ADD CONSTRAINT time_entry_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.app_user(id);


--
-- Name: time_entry time_entry_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entry
    ADD CONSTRAINT time_entry_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: time_entry time_entry_typology_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entry
    ADD CONSTRAINT time_entry_typology_id_fkey FOREIGN KEY (typology_id) REFERENCES public.lookup_value(id);


--
-- Name: time_entry time_entry_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entry
    ADD CONSTRAINT time_entry_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: time_tracking_session time_tracking_session_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_tracking_session
    ADD CONSTRAINT time_tracking_session_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activity(id) ON DELETE SET NULL;


--
-- Name: time_tracking_session time_tracking_session_committed_time_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_tracking_session
    ADD CONSTRAINT time_tracking_session_committed_time_entry_id_fkey FOREIGN KEY (committed_time_entry_id) REFERENCES public.time_entry(id) ON DELETE SET NULL;


--
-- Name: time_tracking_session time_tracking_session_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_tracking_session
    ADD CONSTRAINT time_tracking_session_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: time_tracking_session time_tracking_session_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_tracking_session
    ADD CONSTRAINT time_tracking_session_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagement(id) ON DELETE SET NULL;


--
-- Name: time_tracking_session time_tracking_session_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_tracking_session
    ADD CONSTRAINT time_tracking_session_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resource(id) ON DELETE CASCADE;


--
-- Name: time_tracking_session time_tracking_session_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_tracking_session
    ADD CONSTRAINT time_tracking_session_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: user_role user_role_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_role
    ADD CONSTRAINT user_role_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.role(id) ON DELETE CASCADE;


--
-- Name: user_role user_role_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_role
    ADD CONSTRAINT user_role_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;


--
-- Name: work_line work_line_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_line
    ADD CONSTRAINT work_line_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagement(id) ON DELETE CASCADE;


--
-- Name: work_line_measure work_line_measure_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_line_measure
    ADD CONSTRAINT work_line_measure_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: work_line_measure work_line_measure_work_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_line_measure
    ADD CONSTRAINT work_line_measure_work_line_id_fkey FOREIGN KEY (work_line_id) REFERENCES public.work_line(id) ON DELETE CASCADE;


--
-- Name: work_line work_line_phase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_line
    ADD CONSTRAINT work_line_phase_id_fkey FOREIGN KEY (phase_id) REFERENCES public.phase(id) ON DELETE SET NULL;


--
-- Name: work_line work_line_price_list_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_line
    ADD CONSTRAINT work_line_price_list_item_id_fkey FOREIGN KEY (price_list_item_id) REFERENCES public.price_list_item(id) ON DELETE SET NULL;


--
-- Name: work_line work_line_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_line
    ADD CONSTRAINT work_line_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resource(id) ON DELETE SET NULL;


--
-- Name: work_line work_line_source_capture_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_line
    ADD CONSTRAINT work_line_source_capture_id_fkey FOREIGN KEY (source_capture_id) REFERENCES public.capture(id) ON DELETE SET NULL;


--
-- Name: work_line work_line_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_line
    ADD CONSTRAINT work_line_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: work_line work_line_work_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_line
    ADD CONSTRAINT work_line_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES public.work_order(id) ON DELETE SET NULL;


--
-- Name: work_order work_order_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order
    ADD CONSTRAINT work_order_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activity(id) ON DELETE SET NULL;


--
-- Name: work_order work_order_assigned_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order
    ADD CONSTRAINT work_order_assigned_resource_id_fkey FOREIGN KEY (assigned_resource_id) REFERENCES public.resource(id) ON DELETE SET NULL;


--
-- Name: work_order work_order_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order
    ADD CONSTRAINT work_order_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagement(id) ON DELETE CASCADE;


--
-- Name: work_order_item work_order_item_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order_item
    ADD CONSTRAINT work_order_item_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.material(id) ON DELETE RESTRICT;


--
-- Name: work_order_item work_order_item_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order_item
    ADD CONSTRAINT work_order_item_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: work_order_item work_order_item_work_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order_item
    ADD CONSTRAINT work_order_item_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES public.work_order(id) ON DELETE CASCADE;


--
-- Name: work_order work_order_operator_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order
    ADD CONSTRAINT work_order_operator_company_id_fkey FOREIGN KEY (operator_company_id) REFERENCES public.company(id) ON DELETE SET NULL;


--
-- Name: work_order work_order_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order
    ADD CONSTRAINT work_order_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.lookup_value(id);


--
-- Name: work_order_subject work_order_subject_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order_subject
    ADD CONSTRAINT work_order_subject_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: work_order_subject work_order_subject_work_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order_subject
    ADD CONSTRAINT work_order_subject_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES public.work_order(id) ON DELETE CASCADE;


--
-- Name: work_order work_order_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order
    ADD CONSTRAINT work_order_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: work_report work_report_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_report
    ADD CONSTRAINT work_report_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activity(id) ON DELETE SET NULL;


--
-- Name: work_report work_report_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_report
    ADD CONSTRAINT work_report_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: work_report work_report_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_report
    ADD CONSTRAINT work_report_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagement(id) ON DELETE CASCADE;


--
-- Name: work_report work_report_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_report
    ADD CONSTRAINT work_report_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.lookup_value(id);


--
-- Name: work_report work_report_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_report
    ADD CONSTRAINT work_report_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: work_report_time_entry work_report_time_entry_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_report_time_entry
    ADD CONSTRAINT work_report_time_entry_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE CASCADE;


--
-- Name: work_report_time_entry work_report_time_entry_time_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_report_time_entry
    ADD CONSTRAINT work_report_time_entry_time_entry_id_fkey FOREIGN KEY (time_entry_id) REFERENCES public.time_entry(id) ON DELETE CASCADE;


--
-- Name: work_report_time_entry work_report_time_entry_work_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_report_time_entry
    ADD CONSTRAINT work_report_time_entry_work_report_id_fkey FOREIGN KEY (work_report_id) REFERENCES public.work_report(id) ON DELETE CASCADE;


--
-- Name: work_report work_report_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_report
    ADD CONSTRAINT work_report_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: absence_balance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.absence_balance ENABLE ROW LEVEL SECURITY;

--
-- Name: absence_balance absence_balance_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY absence_balance_insert ON public.absence_balance FOR INSERT WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: absence_balance absence_balance_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY absence_balance_modify ON public.absence_balance FOR UPDATE USING ((tenant_id = public.app_current_tenant())) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: absence_balance absence_balance_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY absence_balance_select ON public.absence_balance FOR SELECT USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: absence_entry; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.absence_entry ENABLE ROW LEVEL SECURITY;

--
-- Name: absence_entry absence_entry_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY absence_entry_insert ON public.absence_entry FOR INSERT WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: absence_entry absence_entry_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY absence_entry_modify ON public.absence_entry FOR UPDATE USING (((tenant_id = public.app_current_tenant()) AND (public.app_sees_whole_tenant() OR (created_by = public.app_current_user()) OR (EXISTS ( SELECT 1
   FROM public.resource r
  WHERE ((r.id = absence_entry.resource_id) AND (r.user_id = public.app_current_user()))))))) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: absence_entry absence_entry_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY absence_entry_select ON public.absence_entry FOR SELECT USING (((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())) AND (public.app_sees_whole_tenant() OR ((public.app_data_scope() = 'own'::text) AND ((created_by = public.app_current_user()) OR (EXISTS ( SELECT 1
   FROM public.resource r
  WHERE ((r.id = absence_entry.resource_id) AND (r.user_id = public.app_current_user())))))))));


--
-- Name: activity act_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY act_delete ON public.activity FOR DELETE USING (((tenant_id = public.app_current_tenant()) AND public.app_sees_whole_tenant()));


--
-- Name: activity act_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY act_insert ON public.activity FOR INSERT WITH CHECK (((tenant_id = public.app_current_tenant()) AND (public.app_data_scope() <> 'customer'::text)));


--
-- Name: activity act_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY act_select ON public.activity FOR SELECT USING (((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())) AND (public.app_sees_whole_tenant() OR ((public.app_data_scope() = 'own'::text) AND ((created_by = public.app_current_user()) OR (EXISTS ( SELECT 1
   FROM (public.activity_resource ar
     JOIN public.resource r ON ((r.id = ar.resource_id)))
  WHERE ((ar.activity_id = activity.id) AND (r.user_id = public.app_current_user())))))) OR ((public.app_data_scope() = 'customer'::text) AND (EXISTS ( SELECT 1
   FROM public.engagement e
  WHERE ((e.id = activity.engagement_id) AND (e.company_id = public.app_current_company()))))))));


--
-- Name: activity act_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY act_update ON public.activity FOR UPDATE USING (((tenant_id = public.app_current_tenant()) AND (public.app_sees_whole_tenant() OR ((public.app_data_scope() = 'own'::text) AND ((created_by = public.app_current_user()) OR (EXISTS ( SELECT 1
   FROM (public.activity_resource ar
     JOIN public.resource r ON ((r.id = ar.resource_id)))
  WHERE ((ar.activity_id = activity.id) AND (r.user_id = public.app_current_user()))))))))) WITH CHECK (((tenant_id = public.app_current_tenant()) AND (public.app_data_scope() <> 'customer'::text)));


--
-- Name: activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_dependency; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_dependency ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_resource; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_resource ENABLE ROW LEVEL SECURITY;

--
-- Name: app_user; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_user ENABLE ROW LEVEL SECURITY;

--
-- Name: asset; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asset ENABLE ROW LEVEL SECURITY;

--
-- Name: asset asset_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asset_modify ON public.asset USING ((public.app_is_platform_admin() OR ((tenant_id = public.app_current_tenant()) AND (public.app_data_scope() <> 'customer'::text)))) WITH CHECK ((public.app_is_platform_admin() OR ((tenant_id = public.app_current_tenant()) AND (public.app_data_scope() <> 'customer'::text))));


--
-- Name: asset asset_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asset_select ON public.asset FOR SELECT USING (((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())) AND (public.app_sees_whole_tenant() OR (public.app_data_scope() = 'own'::text) OR ((public.app_data_scope() = 'customer'::text) AND (company_id = public.app_current_company())))));


--
-- Name: canonical_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.canonical_state ENABLE ROW LEVEL SECURITY;

--
-- Name: canonical_state canonical_state_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY canonical_state_read ON public.canonical_state FOR SELECT USING (true);


--
-- Name: canonical_state canonical_state_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY canonical_state_write ON public.canonical_state USING (public.app_is_platform_admin()) WITH CHECK (public.app_is_platform_admin());


--
-- Name: capture cap_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cap_insert ON public.capture FOR INSERT WITH CHECK (((tenant_id = public.app_current_tenant()) AND (public.app_sees_whole_tenant() OR (user_id = public.app_current_user()))));


--
-- Name: capture cap_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cap_modify ON public.capture FOR UPDATE USING (((tenant_id = public.app_current_tenant()) AND (public.app_sees_whole_tenant() OR (user_id = public.app_current_user())))) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: capture cap_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cap_select ON public.capture FOR SELECT USING (((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())) AND (public.app_sees_whole_tenant() OR ((public.app_data_scope() = 'own'::text) AND (user_id = public.app_current_user())))));


--
-- Name: capture; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.capture ENABLE ROW LEVEL SECURITY;

--
-- Name: company; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company ENABLE ROW LEVEL SECURITY;

--
-- Name: company_contact; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_contact ENABLE ROW LEVEL SECURITY;

--
-- Name: company company_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_modify ON public.company USING ((public.app_is_platform_admin() OR ((tenant_id = public.app_current_tenant()) AND (public.app_data_scope() <> 'customer'::text)))) WITH CHECK ((public.app_is_platform_admin() OR ((tenant_id = public.app_current_tenant()) AND (public.app_data_scope() <> 'customer'::text))));


--
-- Name: company_role; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_role ENABLE ROW LEVEL SECURITY;

--
-- Name: company company_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_select ON public.company FOR SELECT USING (((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())) AND (public.app_sees_whole_tenant() OR (public.app_data_scope() = 'own'::text) OR ((public.app_data_scope() = 'customer'::text) AND (id = public.app_current_company())))));


--
-- Name: engagement eng_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eng_modify ON public.engagement USING ((public.app_is_platform_admin() OR ((tenant_id = public.app_current_tenant()) AND (public.app_data_scope() <> 'customer'::text)))) WITH CHECK ((public.app_is_platform_admin() OR ((tenant_id = public.app_current_tenant()) AND (public.app_data_scope() <> 'customer'::text))));


--
-- Name: engagement eng_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eng_select ON public.engagement FOR SELECT USING (((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())) AND (public.app_sees_whole_tenant() OR (public.app_data_scope() = 'own'::text) OR ((public.app_data_scope() = 'customer'::text) AND (company_id = public.app_current_company())))));


--
-- Name: engagement; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.engagement ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.equipment_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment_usage equipment_usage_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY equipment_usage_tenant ON public.equipment_usage USING ((tenant_id = public.app_current_tenant())) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: field_definition fd_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fd_modify ON public.field_definition USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: field_definition fd_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fd_select ON public.field_definition FOR SELECT USING ((public.app_is_platform_admin() OR (tenant_id IS NULL) OR (tenant_id = public.app_current_tenant())));


--
-- Name: field_definition; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.field_definition ENABLE ROW LEVEL SECURITY;

--
-- Name: lookup_override; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lookup_override ENABLE ROW LEVEL SECURITY;

--
-- Name: lookup_override lookup_override_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lookup_override_delete ON public.lookup_override FOR DELETE USING ((tenant_id = public.app_current_tenant()));


--
-- Name: lookup_override lookup_override_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lookup_override_insert ON public.lookup_override FOR INSERT WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: lookup_override lookup_override_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lookup_override_modify ON public.lookup_override FOR UPDATE USING ((tenant_id = public.app_current_tenant())) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: lookup_override lookup_override_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lookup_override_select ON public.lookup_override FOR SELECT USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: lookup_value; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lookup_value ENABLE ROW LEVEL SECURITY;

--
-- Name: lookup_value lv_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lv_modify ON public.lookup_value USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: lookup_value lv_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lv_select ON public.lookup_value FOR SELECT USING ((public.app_is_platform_admin() OR (tenant_id IS NULL) OR (tenant_id = public.app_current_tenant())));


--
-- Name: material; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.material ENABLE ROW LEVEL SECURITY;

--
-- Name: material_consumption; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.material_consumption ENABLE ROW LEVEL SECURITY;

--
-- Name: material_consumption mc_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mc_insert ON public.material_consumption FOR INSERT WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: material_consumption mc_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mc_modify ON public.material_consumption FOR UPDATE USING (((tenant_id = public.app_current_tenant()) AND (public.app_sees_whole_tenant() OR (created_by = public.app_current_user())))) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: material_consumption mc_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mc_select ON public.material_consumption FOR SELECT USING (((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())) AND (public.app_sees_whole_tenant() OR ((public.app_data_scope() = 'own'::text) AND (created_by = public.app_current_user())))));


--
-- Name: number_series; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.number_series ENABLE ROW LEVEL SECURITY;

--
-- Name: phase; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.phase ENABLE ROW LEVEL SECURITY;

--
-- Name: phase phase_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY phase_modify ON public.phase USING ((public.app_is_platform_admin() OR ((tenant_id = public.app_current_tenant()) AND (public.app_data_scope() <> 'customer'::text)))) WITH CHECK ((public.app_is_platform_admin() OR ((tenant_id = public.app_current_tenant()) AND (public.app_data_scope() <> 'customer'::text))));


--
-- Name: phase phase_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY phase_select ON public.phase FOR SELECT USING (((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())) AND (public.app_sees_whole_tenant() OR (public.app_data_scope() = 'own'::text) OR ((public.app_data_scope() = 'customer'::text) AND (EXISTS ( SELECT 1
   FROM public.engagement e
  WHERE ((e.id = phase.engagement_id) AND (e.company_id = public.app_current_company()))))))));


--
-- Name: plan; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plan ENABLE ROW LEVEL SECURITY;

--
-- Name: plan plan_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_read ON public.plan FOR SELECT USING (true);


--
-- Name: plan plan_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_write ON public.plan USING (public.app_is_platform_admin()) WITH CHECK (public.app_is_platform_admin());


--
-- Name: price_list; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.price_list ENABLE ROW LEVEL SECURITY;

--
-- Name: price_list_item; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.price_list_item ENABLE ROW LEVEL SECURITY;

--
-- Name: price_list_item price_list_item_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY price_list_item_tenant ON public.price_list_item USING ((tenant_id = public.app_current_tenant())) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: price_list_override; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.price_list_override ENABLE ROW LEVEL SECURITY;

--
-- Name: price_list_override price_list_override_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY price_list_override_tenant ON public.price_list_override USING ((tenant_id = public.app_current_tenant())) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: price_list price_list_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY price_list_tenant ON public.price_list USING ((tenant_id = public.app_current_tenant())) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: rate_card; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_card ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_card rate_card_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rate_card_insert ON public.rate_card FOR INSERT WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: rate_card rate_card_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rate_card_modify ON public.rate_card FOR UPDATE USING ((tenant_id = public.app_current_tenant())) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: rate_card rate_card_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rate_card_select ON public.rate_card FOR SELECT USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: resource; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resource ENABLE ROW LEVEL SECURITY;

--
-- Name: resource_availability; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resource_availability ENABLE ROW LEVEL SECURITY;

--
-- Name: role; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role ENABLE ROW LEVEL SECURITY;

--
-- Name: role role_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY role_modify ON public.role USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: role_permission; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_permission ENABLE ROW LEVEL SECURITY;

--
-- Name: role role_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY role_select ON public.role FOR SELECT USING ((public.app_is_platform_admin() OR (tenant_id IS NULL) OR (tenant_id = public.app_current_tenant())));


--
-- Name: role_permission rp_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rp_delete ON public.role_permission FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.role r
  WHERE ((r.id = role_permission.role_id) AND (public.app_is_platform_admin() OR (r.tenant_id = public.app_current_tenant()))))));


--
-- Name: role_permission rp_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rp_insert ON public.role_permission FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.role r
  WHERE ((r.id = role_permission.role_id) AND (public.app_is_platform_admin() OR (r.tenant_id = public.app_current_tenant()))))));


--
-- Name: role_permission rp_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rp_select ON public.role_permission FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.role r
  WHERE ((r.id = role_permission.role_id) AND (public.app_is_platform_admin() OR (r.tenant_id IS NULL) OR (r.tenant_id = public.app_current_tenant()))))));


--
-- Name: stock_balance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_balance ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_balance stock_balance_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_balance_insert ON public.stock_balance FOR INSERT WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: stock_balance stock_balance_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_balance_modify ON public.stock_balance FOR UPDATE USING ((tenant_id = public.app_current_tenant())) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: stock_balance stock_balance_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_balance_select ON public.stock_balance FOR SELECT USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: stock_document; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_document ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_document stock_document_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_document_insert ON public.stock_document FOR INSERT WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: stock_document_line; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_document_line ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_document_line stock_document_line_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_document_line_delete ON public.stock_document_line FOR DELETE USING ((tenant_id = public.app_current_tenant()));


--
-- Name: stock_document_line stock_document_line_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_document_line_insert ON public.stock_document_line FOR INSERT WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: stock_document_line stock_document_line_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_document_line_modify ON public.stock_document_line FOR UPDATE USING ((tenant_id = public.app_current_tenant())) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: stock_document_line stock_document_line_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_document_line_select ON public.stock_document_line FOR SELECT USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: stock_document stock_document_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_document_modify ON public.stock_document FOR UPDATE USING ((tenant_id = public.app_current_tenant())) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: stock_document stock_document_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_document_select ON public.stock_document FOR SELECT USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: stock_location; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_location ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_location stock_location_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_location_insert ON public.stock_location FOR INSERT WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: stock_location stock_location_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_location_modify ON public.stock_location FOR UPDATE USING ((tenant_id = public.app_current_tenant())) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: stock_location stock_location_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_location_select ON public.stock_location FOR SELECT USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: stock_movement; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_movement ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_movement stock_movement_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_movement_insert ON public.stock_movement FOR INSERT WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: stock_movement stock_movement_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_movement_select ON public.stock_movement FOR SELECT USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: stock_serial_unit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_serial_unit ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_serial_unit stock_serial_unit_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_serial_unit_tenant ON public.stock_serial_unit USING ((tenant_id = public.app_current_tenant())) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: subcontract_line; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subcontract_line ENABLE ROW LEVEL SECURITY;

--
-- Name: subcontract_line subcontract_line_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subcontract_line_tenant ON public.subcontract_line USING ((tenant_id = public.app_current_tenant())) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: subscription; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription ENABLE ROW LEVEL SECURITY;

--
-- Name: time_entry te_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY te_insert ON public.time_entry FOR INSERT WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: time_entry te_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY te_modify ON public.time_entry FOR UPDATE USING (((tenant_id = public.app_current_tenant()) AND (public.app_sees_whole_tenant() OR (created_by = public.app_current_user()) OR (EXISTS ( SELECT 1
   FROM public.resource r
  WHERE ((r.id = time_entry.resource_id) AND (r.user_id = public.app_current_user()))))))) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: time_entry te_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY te_select ON public.time_entry FOR SELECT USING (((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())) AND (public.app_sees_whole_tenant() OR ((public.app_data_scope() = 'own'::text) AND ((created_by = public.app_current_user()) OR (EXISTS ( SELECT 1
   FROM public.resource r
  WHERE ((r.id = time_entry.resource_id) AND (r.user_id = public.app_current_user())))))))));


--
-- Name: template; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.template ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_dependency tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.activity_dependency USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: activity_resource tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.activity_resource USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: app_user tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.app_user USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: company_contact tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.company_contact USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: company_role tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.company_role USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: material tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.material USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: number_series tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.number_series USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: resource tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.resource USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: resource_availability tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.resource_availability USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: subscription tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.subscription USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: template tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.template USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: tenant tenant_rls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_rls ON public.tenant USING ((public.app_is_platform_admin() OR (id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (id = public.app_current_tenant())));


--
-- Name: term_override term_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY term_modify ON public.term_override USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))) WITH CHECK ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: term_override; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.term_override ENABLE ROW LEVEL SECURITY;

--
-- Name: term_override term_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY term_select ON public.term_override FOR SELECT USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- Name: time_entry; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.time_entry ENABLE ROW LEVEL SECURITY;

--
-- Name: time_tracking_session; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.time_tracking_session ENABLE ROW LEVEL SECURITY;

--
-- Name: time_tracking_session tts_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tts_insert ON public.time_tracking_session FOR INSERT WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: time_tracking_session tts_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tts_modify ON public.time_tracking_session FOR UPDATE USING (((tenant_id = public.app_current_tenant()) AND (public.app_sees_whole_tenant() OR (created_by = public.app_current_user()) OR (EXISTS ( SELECT 1
   FROM public.resource r
  WHERE ((r.id = time_tracking_session.resource_id) AND (r.user_id = public.app_current_user()))))))) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: time_tracking_session tts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tts_select ON public.time_tracking_session FOR SELECT USING (((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())) AND (public.app_sees_whole_tenant() OR ((public.app_data_scope() = 'own'::text) AND ((created_by = public.app_current_user()) OR (EXISTS ( SELECT 1
   FROM public.resource r
  WHERE ((r.id = time_tracking_session.resource_id) AND (r.user_id = public.app_current_user())))))))));


--
-- Name: user_role ur_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ur_delete ON public.user_role FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.app_user u
  WHERE ((u.id = user_role.user_id) AND (public.app_is_platform_admin() OR (u.tenant_id = public.app_current_tenant()))))));


--
-- Name: user_role ur_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ur_insert ON public.user_role FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.app_user u
  WHERE ((u.id = user_role.user_id) AND (public.app_is_platform_admin() OR (u.tenant_id = public.app_current_tenant()))))));


--
-- Name: user_role ur_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ur_select ON public.user_role FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.app_user u
  WHERE ((u.id = user_role.user_id) AND (public.app_is_platform_admin() OR (u.tenant_id = public.app_current_tenant()))))));


--
-- Name: user_role; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_role ENABLE ROW LEVEL SECURITY;

--
-- Name: work_line; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.work_line ENABLE ROW LEVEL SECURITY;

--
-- Name: work_line_measure; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.work_line_measure ENABLE ROW LEVEL SECURITY;

--
-- Name: work_line_measure work_line_measure_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_line_measure_tenant ON public.work_line_measure USING ((tenant_id = public.app_current_tenant())) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: work_line work_line_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_line_tenant ON public.work_line USING ((tenant_id = public.app_current_tenant())) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: work_order; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.work_order ENABLE ROW LEVEL SECURITY;

--
-- Name: work_order_item; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.work_order_item ENABLE ROW LEVEL SECURITY;

--
-- Name: work_order_item work_order_item_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_order_item_tenant ON public.work_order_item USING ((tenant_id = public.app_current_tenant())) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: work_order_subject; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.work_order_subject ENABLE ROW LEVEL SECURITY;

--
-- Name: work_order_subject work_order_subject_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_order_subject_tenant ON public.work_order_subject USING ((tenant_id = public.app_current_tenant())) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: work_order work_order_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_order_tenant ON public.work_order USING ((tenant_id = public.app_current_tenant())) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: work_report; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.work_report ENABLE ROW LEVEL SECURITY;

--
-- Name: work_report work_report_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_report_insert ON public.work_report FOR INSERT WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: work_report work_report_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_report_modify ON public.work_report FOR UPDATE USING (((tenant_id = public.app_current_tenant()) AND (public.app_sees_whole_tenant() OR (created_by = public.app_current_user())))) WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: work_report work_report_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_report_select ON public.work_report FOR SELECT USING (((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())) AND (public.app_sees_whole_tenant() OR ((public.app_data_scope() = 'own'::text) AND (created_by = public.app_current_user())))));


--
-- Name: work_report_time_entry; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.work_report_time_entry ENABLE ROW LEVEL SECURITY;

--
-- Name: work_report_time_entry wrte_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wrte_delete ON public.work_report_time_entry FOR DELETE USING ((tenant_id = public.app_current_tenant()));


--
-- Name: work_report_time_entry wrte_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wrte_insert ON public.work_report_time_entry FOR INSERT WITH CHECK ((tenant_id = public.app_current_tenant()));


--
-- Name: work_report_time_entry wrte_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wrte_select ON public.work_report_time_entry FOR SELECT USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant())));


--
-- PostgreSQL database dump complete
--

\unrestrict QxvLLbYBXqWLFVDd871bIdsoqbah86KuWLlZhgGqN5Nj5yAeR584fc3TYI4vRrB

```
