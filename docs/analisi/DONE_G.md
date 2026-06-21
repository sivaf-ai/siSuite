# DONE_G — Ruoli & Permessi (nessuna migrazione)

**Stato di partenza:** già presenti `routes/roles.ts` (CRUD custom + RLS sui ruoli di sistema), `pages/admin/RolesPage`/`RoleDetailPage` (matrice permessi da PERMISSION_CATALOG), seed ruoli di sistema nel bootstrap.

**Aggiunto (gap):** endpoint `GET /roles/permission-catalog` (risorse+azioni+data_scope per la UI); `POST /roles/:id/clone` (duplica un ruolo — anche di sistema — in custom modificabile); **delete-if-assigned** (409 se il ruolo è assegnato a utenti). FE: bottone "Duplica per modificare" sui ruoli di sistema.

**Assunzioni:** la matrice FE legge PERMISSION_CATALOG da `@sisuite/shared` (fonte unica FE+BE) — equivalente a "leggere dal catalogo backend", non hard-coding.

**AC G:** SUPERATO.
