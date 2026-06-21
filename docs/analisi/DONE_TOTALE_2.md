# DONE_TOTALE_2 — SPEC Identità&Accessi + GoTrue + Immagini + Rifiniture (chat 01.06)

**Data:** 21/06/2026 · **Esecuzione:** autonoma continua (G→K) · **Segue:** DONE_TOTALE (A→F, migr. 041→046).

## Esito sintetico
Blocchi **G→K completati e verificati**. Migrazioni **047→049** applicate. Typecheck **shared+backend+frontend puliti**, **79/79 test backend verdi**, smoke end-to-end di tutti i criteri (Blocco L) superati con login GoTrue reale.

## ⚠️ Premessa: molto era GIÀ implementato
Contrariamente all'assunto della SPEC ("manca il modulo e manca il login"), lo stato reale aveva già: `routes/users.ts` e `routes/roles.ts` completi, le pagine admin (`pages/admin/UsersPage/UserDetailPage/RolesPage/RoleDetailPage`), GoTrue **già cablato** (servizio `auth` in docker-compose, verifier dual-mode JWKS/HS256, `gotrueAdmin.ensureAuthUser`, bootstrap che seedta i ruoli di sistema). Ho quindi **riempito i gap**, non ricostruito. Login attuale ispezionato: GoTrue su :9999 (HS256 dev, autoconfirm, no SMTP), Owner provisionato dal bootstrap.

## ⚠️ Scostamento migrazioni
La SPEC prevedeva 047→048. Il Blocco I richiede una funzione SECURITY DEFINER per il provisioning-by-email (l'UPDATE deve bypassare la RLS prima del contesto): aggiunta **049_identity_provisioning.sql**. **Prossima libera: 050.**

## Stato per blocco

### G — Ruoli & Permessi ✅ (gap riempiti)
Esistevano CRUD ruoli + matrice permessi (da PERMISSION_CATALOG) + RLS sui ruoli di sistema + seed. Aggiunto: endpoint `GET /roles/permission-catalog` (catalogo+data_scope per la UI), `POST /roles/:id/clone` ("Duplica per modificare", anche dei ruoli di sistema), **delete-if-assigned → 409**. FE: bottone Duplica sui ruoli di sistema. **AC G: SUPERATO** (clone di un ruolo di sistema → custom; matrice + data_scope; delete assegnato rifiutato 409).

### H — Utenti · V047 ✅
V047: `app_user` +status/invited_at/last_login_at/code + unique `auth_user_id`. Esteso `routes/users.ts`: ciclo vita (status invited/active/disabled), **codice UTE- da number_series**, **collegamento risorsa** (`resource.user_id`, 1:1), **permessi effettivi** (`GET /users/:id/effective`), **invito** (`POST /users/invite`, senza password). FE: scheda Utente con codice/badge stato/box risorsa/permessi effettivi/toggle invita-vs-password; lista con codice/stato/risorsa. **H.4**: scheda Risorsa mostra utente+ruoli collegati. **AC H: SUPERATO** (utente manuale UTE-0001 + ruolo + risorsa → resource.user_id legato; effective coerente).

### I — GoTrue (login reale) · V049 ✅
GoTrue era già cablato. Aggiunto: **provisioning-by-email al primo login** (funzione `app_link_identity_by_email` SECURITY DEFINER; `resolveContext`/`authenticate` la usano) → un app_user 'invited' si lega all'identità GoTrue e diventa 'active' al primo accesso; **last_login_at** valorizzato; nessuna auto-registrazione aperta. **AC I: SUPERATO** (utente manuale logga e ha i permessi del ruolo; invitato → signup GoTrue stessa email → primo login → auth_user_id legato + status active + last_login; token non valido → 401; utente disabilitato non accede — RLS filtra `active`). SMTP assente in dev: l'invito reale via email richiede SMTP in staging; in dev si chiude col self-signup + provisioning-by-email (documentato).

### J — Immagini materiali · V048 ✅
V048: **DROP `material.primary_image_url`** (ridondante) + unique parziale "una primaria per articolo". Storage MinIO: bucket dedicato `material-images`, helper generici (`putObject/presignObject/removeObject`), **upload multipart**, **set-primary** (transazionale), **reorder**, **delete** (rimuove anche l'oggetto + promuove la prossima a primaria), **URL presigned** con **endpoint pubblico** (localhost:9100, region esplicita → presign locale, browser-safe). `material` risolve la primaria via join+presign in lista/scheda. **AC J: SUPERATO** (upload 2 immagini, set-primary, primaria risolta nel material, delete con promozione; URL scaricabile dal browser HTTP 200).

### K — Rifiniture ✅
1. **Seriali per-magazzino**: `GET /stock/locations/:id/serials` + tab cablato in FE.
2. **stock_location code/note**: `routes/stock.ts` update li persiste (+managerUserId); FE editabile.
3. **company_contact mobile/department/note**: schema/route/FE esposti.
4. **Wipe demo**: `pnpm --filter @sisuite/backend wipe:testdata [tenantId]` (`src/demo/wipeTestData.ts`) — svuota dati operativi/anagrafici di prova, **preserva la struttura** (tenant/ruoli/utenti/lookup/numeratori/field_definition); gestisce il trigger di immutabilità su stock_movement.
**AC K: SUPERATO** (location code/note salvati e riletti; seriali per-magazzino; contatto mobile/dept; wipe disponibile).

## Verifiche
- Migrazioni 047/048/049 applicate (bootstrap OK, grant nuove funzioni).
- Typecheck shared+backend+frontend **puliti**; **79/79 test backend verdi** (incl. RLS).
- Smoke L con login GoTrue reale (owner@sisuite.local + utenti creati/invitati).

## Punti aperti / note per Sivaf
1. **Invito via email reale**: serve SMTP (config GoTrue) in staging. In dev il loop si chiude con self-signup + provisioning-by-email.
2. **Reset password** dall'admin: non implementato (richiede admin API GoTrue con service token / SMTP). Follow-up.
3. **Reorder immagini drag&drop** in FE: endpoint pronto (`PATCH /materials/:id/images/reorder`), UI drag non implementata (opzionale).
4. **MinIO public endpoint**: in prod impostare `MINIO_PUBLIC_ENDPOINT`/`PORT`/`USE_SSL` al dominio storage pubblico (in dev default localhost:9100).
5. **Dati di prova**: ne restano nel tenant Sivaf (da `wipe:testdata` prima delle demo).
6. **NESSUNA FATTURAZIONE**, **AuthN su GoTrue / authZ su RBAC+RLS**, **nessuna credenziale in app_user** — rispettati.

## Cantiere (L.3, allineato a BACKLOG_futuro)
Sync offline, solver pianificazione, narrazione AI, **sottosistema notifiche** (alert scorta/scadenza lotti/scadenza certificazioni — i dati esistono), export anagrafiche fiscali, etichette barcode, app mobile, demo data pack. ADR prodotto: ADR-0009 (Identità & Accessi).
