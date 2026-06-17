# DONE — Blocco M · Soggetti (company) → EntityList + ObjectPage v2

Data: 17/06/2026. Migrato il CRUD Soggetti dallo standard vecchio (DataTable + MasterDetail + FormPage/EntityForm) ai componenti v2 `EntityList` + `ObjectPage`.

## Backend
- `routes/companies.ts`: la lista ora restituisce anche `views` = conteggi per ruolo `{ all, customer, supplier, operator, partner }` (indipendenti dalla vista corrente, rispettano la ricerca `q`). Filtro `?role=` invariato.

## Frontend
- `pages/ClientiPage.tsx`: riscritta su `EntityList`. Viste = filtri salvati per ruolo (Tutti/Clienti/Fornitori/Gestori/Partner) con conteggi. Toolbar a sole icone (Filtri/Colonne/AI disabilitati placeholder; Importa/Esporta placeholder; **Nuovo "+" per ultimo**). Righe a 2 livelli (Nome/tipo, Ruoli a chip, P.IVA/CF, Città/prov, Creato). Niente master-detail, niente icone-azione sulle righe: click riga → `/companies/:id`.
- `pages/ClienteDetailPage.tsx`: riscritta su `ObjectPage` (`<Page bleed>`, header sticky con solo Salva/Annulla). Box Anagrafica (ragione sociale/tipo/ruoli a chip-toggle) + box da `field_definition` (Dati fiscali, Indirizzo, Note) tramite il nuovo `ui/AttrFields`. Tab correlate in fondo: **Contatti** (sub-CRUD via Drawer) e **Località e siti** (`SiteTree`). Archivia soggetto in fondo (fuori dall'header).
- **Nuovo `ui/AttrFields.tsx`** (riusabile per asset/engagement/resource): `AttrBoxes` rende una `ObjectBox` per `group_key` dai `field_definition`; `AttrField` rende il singolo campo per `data_type` nello stile `.bf/.bl/.bi`.

## Test
- `GET /companies` → `views={all:7,customer:3,supplier:2,operator:2,partner:0}`; `?role=operator` → 2 (Open Fiber, Sirti). Typecheck shared+backend+frontend puliti.

## Checklist visiva (da confermare a video, no browser headless qui)
- [ ] Viste con conteggi cliccabili; ricerca filtra.
- [ ] Riga → scheda; header Salva/Annulla a filo (nessun gap).
- [ ] Contatti add/edit/delete; SiteTree nel tab.
