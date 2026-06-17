# DONE — Blocco F · Rapportino (archetipo Documento) + CaptureBarAI

Data: 17/06/2026.

## Parte 1 — Rapportino come DOCUMENTO (mock 48) — NUOVO
### Backend
- `routes/workReports.ts`: nuovo **`GET /work-reports/:id/document`**. Restituisce:
  - `engagement` (code/title/company),
  - **5 sezioni-righe** con sottototali e tipo dedotto: **Manodopera** (`time_entry`: costo=ore×cost_rate, ricavo=ore×bill_rate se billable), **Attrezzature** (`equipment_usage`: solo costo), **Materiali** (`material_consumption`→join activity/work_order per risalire alla commessa: solo costo su default_cost), **Subappalti** (`subcontract_line`: solo costo=amount), **Lavorazioni** (`work_line`: costo=q×cost_price, ricavo=q×revenue_price),
  - **Foto** (`capture` con media_url),
  - **totals** costi/ricavi/margine/%.
  - Filtro per `period_start/period_end` del rapportino se valorizzati.

### Frontend
- **Nuovo `ui/DocumentArchetype.tsx`** riusabile (anche per Blocco H): `DocSectionTable` (sezione-righe + sottototale) e `TotalsStrip` (Ricavi/Costi/Margine/Margine%).
- **Nuova `pages/RapportinoDetailPage.tsx`** (ObjectPage `<Page bleed>`): testata + card **Racconto AI** (genera→modifica→conferma→firma; l'AI non scrive lo stato finale) + **striscia totali** + le 5 sezioni-righe + Foto. Crea via `/work-reports/new`. Nota in UI: i costi/margini sono back-office; nel documento al cliente (audience «Cliente») non compaiono (regola già imposta lato API per il testo).
- `pages/RapportiniPage.tsx`: da `DataTable`+Drawer → `EntityList`; click riga → `/work-reports/:id`. Rotta aggiunta in AppShell.

## Parte 2 — CaptureBarAI end-to-end — GIÀ ESISTENTE (verificato)
La pipeline era già completa e conforme al brief:
- `routes/captures.ts` (+ `voice`) → `ai/extractor.ts` (LLM, chiave server-side) → `ai/validator.ts` → **diff di operazioni candidate** mostrato in `CapturePage` (mai scrive nel DB) → review accetta/modifica/rifiuta → **`ai/applier.ts` apply deterministico** (INSERT con `source_capture_id`, `created_by`, transizione stato capture applied/proposed, `applied_by`). Degrada senza `ANTHROPIC_API_KEY`.
- In Blocco M lo **storico catture** è già passato a `EntityList`. Il composer resta il cuore qui.

## Test (curl, owner@fibra.demo)
- `GET /work-reports/:id/document` (rapportino Sirti 2026-0001) → 5 sezioni popolate, totals **costi 6977,6 / ricavi 7705 / margine 727,4 / 9,4%**. Typecheck backend+frontend puliti; backend riavviato.

## Note / debiti
- Materiali valorizzati a `material.default_cost` (non costo medio mobile): sufficiente per la demo; affinabile.
- Foto: legge tutte le `capture` con media nel periodo (non ancora legate al singolo rapportino) — quando esisterà il legame report↔capture, filtrare per quello.
- Quota AI per-tenant: gestita dall'infra AI esistente.
