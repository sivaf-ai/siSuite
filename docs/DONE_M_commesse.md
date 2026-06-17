# DONE — Blocco M · Commesse (engagement) → EntityList + ObjectPage v2

Data: 17/06/2026.

## Backend
- `routes/engagements.ts`: lista ora restituisce `views` = `{ all, build, maintenance }` (rispettano `q`).

## Frontend
- `pages/EngagementsPage.tsx`: riscritta da `CrudList` a `EntityList`. Viste per tipo (Tutte/Realizzazione/Manutenzione), righe a 2 livelli (Codice/tipo, Titolo/cliente, Stato pill, Inizio, Creata), toolbar a icone con **Nuovo "+" per ultimo**. Click riga → `/engagements/:id`.
- `pages/CommessaDetailPage.tsx`: ora su `ObjectPage` (`<Page bleed>`, header sticky con solo Salva/Annulla). Nuovo box **Anagrafica commessa** editabile (titolo, tipo, cliente, stato, inizio/fine) con Salva → POST (`/engagements/new`) o PATCH. Gestisce la **creazione** (`/engagements/new`: solo Anagrafica finché non si salva). Sotto restano invariate le viste ricche già esistenti: **Struttura** (Albero WBS/Gantt/Lista, mock 24/07), Risorse, Ore & materiali, Catture, Budget + card Racconto AI + "Salva come modello".

## Test
- `GET /engagements` → `views={all:3,build:2,maintenance:1}`. Typecheck shared+backend+frontend puliti.

## Note
- L'albero fasi/WBS (mock 24) era già implementato (`xtree`): riusato dentro il tab Struttura della nuova ObjectPage.
- Le fasi/attività si gestiscono ancora via modale (sub-CRUD nella scheda), coerente con l'archetipo.

## Checklist visiva
- [ ] Viste con conteggi; riga → scheda; header Salva/Annulla a filo.
- [ ] `/engagements/new`: crea con cliente+tipo+titolo, poi compaiono i tab.
- [ ] Modifica stato/date dall'Anagrafica → Salva.
