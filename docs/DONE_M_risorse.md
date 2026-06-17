# DONE — Blocco M · Risorse → EntityList + ObjectPage v2

Data: 17/06/2026.

## Backend
- `routes/resources.ts`: lista con filtro `?kind=` + `views` per tipo `{ all, person, vehicle, equipment }`.

## Frontend
- `pages/RisorsePage.tsx`: riscritta da `CrudList` a `EntityList`. Viste per tipo (Persone/Mezzi/Attrezzature), colonne Nome/tipo, Costo orario (€/h), Stato pill. Click riga → `/resources/:id`.
- `pages/RisorsaDetailPage.tsx`: ora su `ObjectPage` (`<Page bleed>`). Nuovo box **Anagrafica risorsa** editabile (tipo[new]/nome/costo orario/attiva) con Salva → POST (`/resources/new`) o PATCH. I pannelli ricchi esistenti (orario settimanale per-risorsa, indisponibilità, assegnazioni, ore) restano dentro le tab `RelatedTabs` (Disponibilità/Assegnazioni/Ore). Gestisce la creazione.

## Test
- `GET /resources` → `views={all:8,person:4,vehicle:1,equipment:3}`. Typecheck backend+frontend puliti.

## Checklist visiva
- [ ] Viste per tipo; riga → scheda; header Salva/Annulla a filo.
- [ ] `/resources/new`: crea risorsa; poi compaiono le tab.
- [ ] Orario per-risorsa e indisponibilità invariati.
