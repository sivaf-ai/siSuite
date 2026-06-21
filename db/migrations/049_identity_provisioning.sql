-- =====================================================================
--  049_identity_provisioning.sql  — SPEC Identità&Accessi v1.0, BLOCCO I
--  Provisioning-by-email al primo login: lega l'identità GoTrue (auth_user_id)
--  a un app_user creato dall'admin (flusso INVITO), portandolo ad 'active'.
--  SECURITY DEFINER perché gira PRIMA che esista un contesto RLS (stiamo
--  ancora stabilendo CHI è l'utente). Idempotente, nessuna creazione implicita.
--
--  NB: la SPEC indicava "nessuna migrazione" per il Blocco I, ma il link sicuro
--  by-email richiede una funzione SECURITY DEFINER (l'UPDATE deve bypassare la
--  RLS prima del contesto). Scelta più coerente con "authZ tutta nostra".
--  Applicare DOPO 048. PostgreSQL 16.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.app_link_identity_by_email(p_auth_user_id text, p_email text)
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_auth_user_id IS NULL OR p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RETURN NULL;
  END IF;
  -- match deterministico: un solo app_user attivo, con quella email, NON ancora legato
  SELECT id INTO v_id FROM public.app_user
   WHERE lower(email) = lower(p_email) AND auth_user_id IS NULL AND active
   LIMIT 1;
  IF v_id IS NULL THEN
    RETURN NULL;   -- nessuna auto-registrazione aperta: l'admin deve aver creato l'utente
  END IF;
  UPDATE public.app_user
     SET auth_user_id = p_auth_user_id, status = 'active', last_login_at = now()
   WHERE id = v_id;
  RETURN v_id;
END $$;

ALTER FUNCTION public.app_link_identity_by_email(text, text) OWNER TO sisuite_admin;
GRANT EXECUTE ON FUNCTION public.app_link_identity_by_email(text, text) TO sisuite_app;

INSERT INTO public.sisuite_migrations (filename) VALUES ('049_identity_provisioning.sql')
  ON CONFLICT DO NOTHING;
