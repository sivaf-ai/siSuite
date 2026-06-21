-- =====================================================================
--  047_user_lifecycle.sql  — SPEC Identità&Accessi v1.0, BLOCCO H.1
--  Ciclo di vita dell'utente applicativo (app_user): stato invited/active/
--  disabled, tracce invito/ultimo accesso, codice leggibile, unicità del
--  giunto di identità esterna (auth_user_id).
--  Applicare DOPO 046. PostgreSQL 16.
-- =====================================================================

ALTER TABLE public.app_user
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',   -- 'invited' | 'active' | 'disabled'
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS code text;

-- unicità del giunto di identità esterna (nullable: NULL per gli invitati non ancora loggati)
CREATE UNIQUE INDEX IF NOT EXISTS app_user_auth_user_id_uidx
  ON public.app_user (auth_user_id) WHERE auth_user_id IS NOT NULL;

-- number_series per il codice utente leggibile (UTE-…), per i tenant esistenti
INSERT INTO public.number_series (tenant_id, key, format, reset_period)
SELECT t.id, 'app_user', 'UTE-{SEQ:4}', 'never' FROM public.tenant t
ON CONFLICT (tenant_id, key) DO NOTHING;

INSERT INTO public.sisuite_migrations (filename) VALUES ('047_user_lifecycle.sql')
  ON CONFLICT DO NOTHING;
