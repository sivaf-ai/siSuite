# DONE_H — Utenti (migrazione V047_user_lifecycle.sql)

**Stato di partenza:** già presenti `routes/users.ts` (CRUD + provisioning GoTrue) e `pages/admin/UsersPage`/`UserDetailPage`.

**V047:** `app_user` + `status` (invited|active|disabled), `invited_at`, `last_login_at`, `code`; unique parziale su `auth_user_id`; number_series `app_user` (UTE-) per i tenant esistenti (+ bootstrap).

**Aggiunto:** ciclo di vita (status), **codice UTE-** da number_series, **collegamento risorsa** (`resource.user_id` 1:1, set/unset via PATCH resourceId), **permessi effettivi** `GET /users/:id/effective` (permessi derivati dai ruoli + data_scope più ampio), **invito** `POST /users/invite` (status invited, niente password). Disattivazione → status disabled + active false. FE: scheda con codice/badge stato/box risorsa/permessi effettivi/toggle invita-vs-password; lista con codice/stato/risorsa. **H.4**: scheda Risorsa mostra utente collegato + ruoli (sola lettura).

**Assunzioni:** nessuna credenziale in app_user (resta su GoTrue); ruoli/permessi non duplicati su resource/app_user.

**AC H:** SUPERATO (utente manuale + ruolo + risorsa → resource.user_id legato; permessi effettivi coerenti).
