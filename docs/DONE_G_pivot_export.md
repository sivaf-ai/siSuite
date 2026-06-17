# DONE — Blocco G · Pivot preventivo–consuntivo + export (mock 47)

Data: 17/06/2026.

## Backend
- **Nuovo `routes/finance.ts`** + registrato in `index.ts`. `GET /finance/pivot?engagementId=` (report:read):
  - aggrega la vista **`job_cost_ledger`** per **Commessa › Fase/WBS › Voce (cost_type)** con sottototali e margine per nodo;
  - **KPI** ricavi/costi/margine/% totali;
  - etichette/colori delle voci da `lookup_value('cost_type')` (labor/material/equipment/subcontract/production).

## Frontend
- **Nuova `pages/PivotPage.tsx`** (route `/finance/pivot`): striscia KPI (riusa `TotalsStrip`), **albero espandibile** Commessa→Fase→Voce con `Money` a destra e **barre margine** (verde/rosso, % sul ricavo), chip colorati per tipo voce. **Esporta Excel** = CSV UTF-8 (BOM, `;`-separato, apribile in Excel). **"Esporta per CPM"** = pulsante add-on disabilitato (placeholder, da brief).
- Voce nav `Preventivo–consuntivo` ora attiva (tolto `soon`); rotta in AppShell.

## Test (curl, owner@fibra.demo)
- `GET /finance/pivot` → KPI **costi 7064 / ricavi 7942,5 / margine 878,5 / 11,1%**; albero per commessa con fasi WBS A.1/A.2/A.3 e voci (production/subcontract/equipment/labor/material). Commessa 2026-0001 margine **819** (coerente col seed). Typecheck shared+backend+frontend puliti; backend riavviato.

## Note
- La manodopera valorizza i ricavi dove `time_entry.bill_rate` è impostato; le voci "production" derivano dalle lavorazioni (`work_line`).
- Export reale `.xlsx`: non c'è una lib xlsx nel progetto → usato CSV Excel-compatibile (nessuna nuova dipendenza). Se serve XLSX nativo, aggiungere `exceljs`.
