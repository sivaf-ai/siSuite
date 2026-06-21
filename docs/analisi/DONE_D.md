# DONE_D — Risorse: anagrafica + competenze + certificazioni (V044_resources_skills.sql)

**Creato:** colonne `resource` (code, color, avatar_url, email, phone); tabelle `skill`, `resource_skill` (level 1..3), `resource_certification` (valid_until→alert) — RLS+GRANT. Backend `resourceExtras.ts`: catalogo competenze + collegamento per risorsa + certificazioni con `daysToExpiry`.

**Scostamenti:** V044. CLEAN SLATE: rimossi i field_definition resource di 040 (code/color/email/phone → colonne) e 004 (skills demo → catalogo skill). `icon` (lucide), role_title, department, notes restano attributes (long-tail, distinti da avatar_url). Ruoli RBAC NON duplicati su resource (restano su app_user/user_role).

**AC D:** SUPERATO (risorsa con sigla/colore/email; competenza liv 3; certificazione PES/PAV con daysToExpiry).
