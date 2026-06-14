-- =====================================================================
--  014 — MODULO ORE §4.4: assenze e saldi.
--  absence_type via canonical_state + lookup_value (12 tipi CCNL-friendly).
--  absence_entry: richiesta/registrazione assenza (RLS "own" §3.2).
--  absence_balance: maturato/goduto per risorsa+tipo+anno (RLS tenant §3.1).
--  Additivo + idempotente.
-- =====================================================================

INSERT INTO canonical_state (category, code, sequence) VALUES
 ('absence_type','vacation',1),('absence_type','sick',2),('absence_type','leave_paid',3),
 ('absence_type','leave_unpaid',4),('absence_type','rol',5),('absence_type','ex_festivita',6),
 ('absence_type','law104',7),('absence_type','maternity',8),('absence_type','paternity',9),
 ('absence_type','bereavement',10),('absence_type','marriage',11),('absence_type','study',12)
ON CONFLICT DO NOTHING;

INSERT INTO lookup_value (tenant_id,category,canonical,code,label,abbreviation,color_token,sequence,is_default) VALUES
 (NULL,'absence_type','vacation','vacation','{"it-IT":"Ferie","en":"Vacation","es-AR":"Vacaciones"}','FER','info',1,true),
 (NULL,'absence_type','sick','sick','{"it-IT":"Malattia","en":"Sick leave","es-AR":"Enfermedad"}','MAL','danger',2,false),
 (NULL,'absence_type','leave_paid','leave_paid','{"it-IT":"Permesso retribuito","en":"Paid leave","es-AR":"Permiso pago"}','PR','neutral',3,false),
 (NULL,'absence_type','leave_unpaid','leave_unpaid','{"it-IT":"Permesso non retribuito","en":"Unpaid leave","es-AR":"Permiso sin goce"}','PNR','neutral',4,false),
 (NULL,'absence_type','rol','rol','{"it-IT":"ROL","en":"Time off (ROL)","es-AR":"ROL"}','ROL','neutral',5,false),
 (NULL,'absence_type','ex_festivita','ex_festivita','{"it-IT":"Ex-festività","en":"Ex-holiday","es-AR":"Ex-feriado"}','EXF','neutral',6,false),
 (NULL,'absence_type','law104','law104','{"it-IT":"Legge 104","en":"Law 104","es-AR":"Ley 104"}','L104','info',7,false),
 (NULL,'absence_type','maternity','maternity','{"it-IT":"Maternità","en":"Maternity","es-AR":"Maternidad"}','MAT','info',8,false),
 (NULL,'absence_type','paternity','paternity','{"it-IT":"Paternità","en":"Paternity","es-AR":"Paternidad"}','PAT','info',9,false),
 (NULL,'absence_type','bereavement','bereavement','{"it-IT":"Lutto","en":"Bereavement","es-AR":"Duelo"}','LUT','neutral',10,false),
 (NULL,'absence_type','marriage','marriage','{"it-IT":"Matrimonio","en":"Marriage","es-AR":"Matrimonio"}','MATR','info',11,false),
 (NULL,'absence_type','study','study','{"it-IT":"Studio","en":"Study","es-AR":"Estudio"}','STU','neutral',12,false)
ON CONFLICT DO NOTHING;

-- ── absence_entry ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.absence_entry (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.resource(id) ON DELETE RESTRICT,
  type_id uuid NOT NULL REFERENCES public.lookup_value(id),          -- category 'absence_type'
  starts_on date NOT NULL,
  ends_on   date NOT NULL,
  hours numeric,                       -- assenze a ore (permessi); NULL = giornate intere
  half_day boolean DEFAULT false NOT NULL,
  note text,
  attachment_url text,                 -- certificato/protocollo (storage, non DB)
  approval_status_id uuid REFERENCES public.lookup_value(id),        -- riusa category 'time_entry_status'
  source_capture_id uuid REFERENCES public.capture(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  client_created_at timestamptz,
  CONSTRAINT absence_entry_pkey PRIMARY KEY (id),
  CONSTRAINT absence_entry_dates_check CHECK (ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS absence_entry_tenant_id_idx ON public.absence_entry(tenant_id);
CREATE INDEX IF NOT EXISTS absence_entry_resource_id_idx ON public.absence_entry(resource_id);

DROP TRIGGER IF EXISTS trg_absence_entry_updated ON public.absence_entry;
CREATE TRIGGER trg_absence_entry_updated BEFORE UPDATE ON public.absence_entry
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.absence_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.absence_entry FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS absence_entry_insert ON public.absence_entry;
DROP POLICY IF EXISTS absence_entry_modify ON public.absence_entry;
DROP POLICY IF EXISTS absence_entry_select ON public.absence_entry;
CREATE POLICY absence_entry_insert ON public.absence_entry FOR INSERT
  WITH CHECK (tenant_id = public.app_current_tenant());
CREATE POLICY absence_entry_modify ON public.absence_entry FOR UPDATE
  USING ((tenant_id = public.app_current_tenant())
         AND (public.app_sees_whole_tenant()
              OR (created_by = public.app_current_user())
              OR EXISTS (SELECT 1 FROM public.resource r
                         WHERE r.id = absence_entry.resource_id AND r.user_id = public.app_current_user())))
  WITH CHECK (tenant_id = public.app_current_tenant());
CREATE POLICY absence_entry_select ON public.absence_entry FOR SELECT
  USING ((public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()))
         AND (public.app_sees_whole_tenant()
              OR ((public.app_data_scope() = 'own')
                  AND ((created_by = public.app_current_user())
                       OR EXISTS (SELECT 1 FROM public.resource r
                                  WHERE r.id = absence_entry.resource_id AND r.user_id = public.app_current_user())))));

-- ── absence_balance ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.absence_balance (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.resource(id) ON DELETE CASCADE,
  type_id uuid NOT NULL REFERENCES public.lookup_value(id),          -- category 'absence_type'
  year integer NOT NULL,
  accrued numeric DEFAULT 0 NOT NULL,   -- maturate
  used    numeric DEFAULT 0 NOT NULL,   -- godute (residuo = accrued - used, calcolato)
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT absence_balance_pkey PRIMARY KEY (id),
  CONSTRAINT absence_balance_uk UNIQUE (tenant_id, resource_id, type_id, year)
);
CREATE INDEX IF NOT EXISTS absence_balance_tenant_id_idx ON public.absence_balance(tenant_id);

DROP TRIGGER IF EXISTS trg_absence_balance_updated ON public.absence_balance;
CREATE TRIGGER trg_absence_balance_updated BEFORE UPDATE ON public.absence_balance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.absence_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.absence_balance FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS absence_balance_select ON public.absence_balance;
DROP POLICY IF EXISTS absence_balance_insert ON public.absence_balance;
DROP POLICY IF EXISTS absence_balance_modify ON public.absence_balance;
CREATE POLICY absence_balance_select ON public.absence_balance FOR SELECT
  USING (public.app_is_platform_admin() OR (tenant_id = public.app_current_tenant()));
CREATE POLICY absence_balance_insert ON public.absence_balance FOR INSERT
  WITH CHECK (tenant_id = public.app_current_tenant());
CREATE POLICY absence_balance_modify ON public.absence_balance FOR UPDATE
  USING (tenant_id = public.app_current_tenant())
  WITH CHECK (tenant_id = public.app_current_tenant());
