# DONE_I — Wiring GoTrue (migrazione V049_identity_provisioning.sql)

**Stato di partenza (ispezione richiesta dalla SPEC):** GoTrue **già cablato** — servizio `auth` in docker-compose (supabase/gotrue v2.151, HS256 dev, `GOTRUE_MAILER_AUTOCONFIRM=true`, signup abilitato, **no SMTP**), `auth/verifier.ts` dual-mode (JWKS asimmetrico o HS256 simmetrico via config), `auth/gotrueAdmin.ensureAuthUser` (signup/login per il sub), bootstrap che provisiona l'Owner. Login dev: owner@sisuite.local / Owner123!.

**V049:** funzione `app_link_identity_by_email(auth_user_id, email)` **SECURITY DEFINER** (l'UPDATE deve bypassare la RLS prima del contesto). Scostamento documentato: la SPEC diceva "nessuna migrazione" per I, ma il link sicuro by-email lo richiede.

**Aggiunto:** **provisioning-by-email al primo login** — `resolveContext(authUserId, email)`/`authenticate` chiamano la funzione quando non esiste ancora un app_user legato: lega l'identità a un app_user 'invited' creato dall'admin e lo porta 'active' (+ last_login_at). Nessuna auto-registrazione aperta (match solo su app_user esistente, attivo, non legato). Login Owner intatto (match per auth_user_id). Disabilitati esclusi (app_resolve_context filtra `active`).

**Assunzioni/decisioni:** SMTP assente in dev → l'invito reale via email è predisposto ma richiede SMTP in staging; in dev il loop si chiude con self-signup GoTrue (stessa email) + provisioning-by-email. authN su GoTrue, authZ tutta nostra; nessuna password in app_user.

**AC I:** SUPERATO (login manuale con permessi del ruolo; invitato → primo login lega auth_user_id + active; token non valido → 401; disabilitato non accede).
