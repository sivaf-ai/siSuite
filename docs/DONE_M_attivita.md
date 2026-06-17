# DONE — Blocco M · Attività → EntityList v2 (vista globale)

Data: 17/06/2026.

## Shared
- `entities.ts`: `ActivityDto` + `engagementCode`/`engagementTitle` opzionali (contesto commessa nelle liste globali).

## Backend
- `routes/activities.ts`: SELECT con join `engagement` (code/title). Lista `/activities` estesa: `q`, `status` (canonico), `limit/offset/total`, `views` `{ all, planned, in_progress, done }`. **Compatibilità**: con `engagementId`/`phaseId` (uso interno scheda commessa) resta il comportamento legacy `{ items }` senza paginazione.

## Frontend
- **Nuova `pages/AttivitaPage.tsx`** (EntityList): viste per stato, colonne Attività/commessa, Durata stim. (h:mm), Pianificata, Stato pill. Click riga → `/activities/:id` (la `AttivitaDetailPage` esistente). Le attività si creano dentro la commessa (albero/WBS), coerente con il modello.
- Rotta `/activities` in AppShell + voce menu **Attività** in `nav.ts` (gruppo Commesse › Gestione).
- **Fix collaterale**: `ClientiPage` ora inizializza la vista dal parametro `?role=` (il menu Anagrafiche usa `/companies?role=customer|supplier|operator`), così i link Clienti/Fornitori/Gestori aprono la vista giusta.

## Test
- `GET /activities` → `views={all:7,planned:3,in_progress:2,done:2}`, engagementCode presente. `?engagementId=` → solo `items` (compat scheda). Typecheck shared+backend+frontend puliti.
