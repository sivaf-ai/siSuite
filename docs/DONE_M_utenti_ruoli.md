# DONE — Blocco M · Utenti e Ruoli → EntityList + ObjectPage v2

Data: 17/06/2026.

## Backend
- `routes/users.ts`: + `GET /users/:id` (loadOne).
- `routes/roles.ts`: + `GET /roles/:id` (loadOne).

## Frontend
- `pages/admin/UsersPage.tsx`: da `CrudList` → `EntityList`. Colonne Nome/email, Ruoli a chip, Stato pill, Creato. Click riga → `/admin/users/:id`.
- **Nuova `pages/admin/UserDetailPage.tsx`** (ObjectPage): Anagrafica (nome, email+password solo in creazione → provisioning GoTrue, telefono, lingua, attivo) + box Ruoli a chip-toggle dal catalogo `/roles`. Crea/modifica.
- `pages/admin/RolesPage.tsx`: da `CrudList` → `EntityList`. Colonne Ruolo/descrizione, Visibilità chip, n. Permessi, Tipo (Sistema/Personalizzato) pill. Click riga → `/admin/roles/:id`.
- **Nuova `pages/admin/RoleDetailPage.tsx`** (ObjectPage): box Ruolo (nome/visibilità/descrizione) + **matrice permessi** raggruppata per risorsa da `PERMISSION_CATALOG` (click sul nome risorsa = toggle tutte le azioni; chip azione = toggle singolo). I **ruoli di sistema** sono in sola lettura (Salva nascosto, campi disabilitati).
- Rotte `/admin/users/:id` e `/admin/roles/:id` + import in AppShell.

## Test
- `GET /users/:id` (con ruoli), `GET /roles/:id` (permessi + isSystem) ok. Typecheck backend+frontend puliti.

## Checklist visiva
- [ ] Liste senza icone-azione; riga → scheda.
- [ ] Nuovo utente: provisiona identità; ruoli a chip.
- [ ] Ruolo di sistema: sola lettura; ruolo custom: matrice permessi editabile, Salva.
