# ADR-0009 — Identità & Accessi: authN su GoTrue, authZ su RBAC+RLS (provisioning-by-email)

- **Stato:** Accepted
- **Data:** 2026-06-21 · Chat 01.06
- **Correlato:** SPEC_Code_identita_accessi_immagini_v1_0_01_06 (Blocchi G/H/I) · migrazione 047, 049 · `permissions.ts` · `auth/verifier.ts` · `app_resolve_context` (003) · ADR-0005/0006.

## Contesto
Il modello dati di identità/autorizzazione esisteva già (`app_user`, `role`, `role_permission`, `user_role` con `data_scope`, giunto `app_user.auth_user_id`), così come GoTrue (servizio `auth`, verifier dual-mode, provisioning Owner) e i moduli admin Utenti/Ruoli. Mancavano: il **ciclo di vita** dell'utente, il **collegamento utente↔risorsa**, i **permessi effettivi** in UI, e soprattutto il **provisioning al primo login** per il flusso di invito. Serviva chiudere senza rompere il login di sviluppo.

## Decisione
1. **Separazione netta authN/authZ.** GoTrue dice solo *chi sei* (verifica JWT, estrae `sub`+email). L'autorizzazione è **tutta nostra**: `auth_user_id → app_user → user_role → role_permission` (set permessi) + `data_scope` → RLS Postgres + guard `can()` + entitlement. Nessuna logica di authZ in GoTrue, **nessuna credenziale in `app_user`**.
2. **Verifica token dual-mode** (già presente): JWKS asimmetrico (target, offline-capable) o HS256 simmetrico (dev), scelto da config — nessun cambiamento al resto del sistema.
3. **Ciclo di vita utente** (V047): `status` invited|active|disabled, `invited_at`, `last_login_at`, `code` (UTE- da number_series), unique su `auth_user_id`.
4. **Due flussi di creazione**: MANUALE (admin crea l'identità GoTrue con password, app_user 'active') e INVITO (app_user 'invited' senza password; l'identità si lega al primo login).
5. **Provisioning-by-email al primo login** (V049, `app_link_identity_by_email` SECURITY DEFINER): se un JWT valido non ha ancora un `app_user` legato, si cerca un `app_user` **attivo, con quella email, non ancora legato** e lo si attiva legando `auth_user_id`. **Nessuna auto-registrazione aperta**: se non esiste, accesso negato. Funzione SECURITY DEFINER perché il link avviene **prima** di avere un contesto RLS.
6. **Utente ≠ Risorsa.** `app_user` = identità di login con permessi; `resource` = entità operativa (può non loggare). Ponte opzionale `resource.user_id` (1:1). Il modulo Utenti gestisce gli app_user; la scheda Risorsa **mostra** (sola lettura) i ruoli dell'utente collegato.

## Conseguenze
**Positive:** un solo punto di verità per i permessi (versionato in `permissions.ts`), portabile e offline-capable; invito senza SMTP chiudibile in dev (self-signup + provisioning-by-email); login dev intatto. **Negative/mitigazioni:** invito via email reale richiede SMTP in staging (documentato); reset-password dall'admin resta follow-up (serve admin API GoTrue/SMTP). La funzione SECURITY DEFINER è una superficie privilegiata: è minimale, deterministica e non crea utenti.

## Alternative scartate
- **authZ nel token (claims di ruolo):** rifiutato — accoppia l'app a GoTrue e duplica la verità dei permessi.
- **Auto-registrazione aperta al primo login:** rifiutato — l'admin deve aver creato l'utente (no accessi non previsti).
- **Provisioning-by-email via pool admin nel backend:** scartato a favore di una funzione SECURITY DEFINER (più contenuta e auditabile della connessione privilegiata generica).
