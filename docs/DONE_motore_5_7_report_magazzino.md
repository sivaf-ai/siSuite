# DONE_motore_5 + 7 — Report designer + Magazzino CRUD (+ Blocco 6 toolbar/cleanup)

## Blocco 5 — Report designer (mockup 56) ✅
- **Migrazione `039_saved_report.sql`** (applicata): `saved_report(entity, name, payload, is_shared)`, RLS proprie+condivise.
- **Backend `routes/savedReports.ts`**: `GET/POST/DELETE /saved-reports`.
- **`ui/ReportDesigner.tsx`** (replica 1:1 mockup 56): pannello sinistro con **chip "Campi da mostrare"**, **chip "Totali (somma)"** (solo numerici, verdi), **segmenti "Raggruppa per"**, **switch Opzioni** (linee griglia · nascondi valori ripetuti · subtotali per gruppo · totale generale · dividi in pagine) + **layout Elenco/Scheda**; **barra AI** in alto (euristica client-side: riconosce i campi citati e "per X" → raggruppa); **anteprima HTML live** a destra (intestazione + tabella con header di gruppo, subtotali, totale generale; oppure schede) — HTML vero, **bello**; **Stampa / PDF** (apre il documento in finestra e lancia il print del browser). **SavedHeader** (salva/carica/elimina su `saved_report`).
- **Wiring**: azione toolbar **"Report"** (`file-bar-chart-2`) in `EntityList` → su **tutte le liste**. I campi numerici sono dedotti da `columns.num` + `filterFields` (type number) + `field_definition` (number/money/integer).
- *Nota*: il render è client-side (anteprima + print→PDF). Un render server-side dedicato (`/reports/render`) resta opzionale (l'output attuale copre stampa e PDF via browser).

## Blocco 7 — Magazzino CRUD ✅
**Backend** (commit precedente): `POST /stock/movements/:id/reverse` (rettifica = movimento compensativo, rispetta l'immutabilità) + `DELETE /stock/locations/:id` (soft `archived_at`) + GET locations filtra archiviati.
**Frontend** (`MagazzinoPage.tsx`):
- **Movimenti**: **"Nuovo movimento"** (form manuale: tipo carico/scarico/rettifica · articolo · ubicazione · qtà · costo · commessa · data · note → `POST /stock/movements`) + **"Rettifica/Storna"** per riga (ConfirmDialog → reverse) + chip **"registro immutabile"**. *Ogni entità ha la sua strada MANUALE, non solo l'AI.*
- **Ubicazioni**: **crea / modifica (PATCH) / elimina-soft (DELETE)**; click riga → scheda di modifica; il parent esclude sé stesso (no-ciclo).
- **Giacenze**: sola lettura + **drill-down** (click riga → tab Movimenti filtrato per articolo+ubicazione, con chip e clear).
- **Documenti**: invariati (carico/trasferimento/rettifica → conferma genera i movimenti numerati). L'archetipo-Documento DetailPage resta come rifinitura (il drawer attuale è funzionale e non rompe gli stati).

## Blocco 6 — toolbar + cleanup ✅
- Toolbar `EntityList` con tutte le icone del motore: **Gruppo · Ordina · Colonne · Report · Esporta · AI** + azioni selezione + Nuovo. Badge numerici su Gruppo/Ordina quando attivi.
- **`AiFilterPanel`**: rimosso il **builder manuale** (ora è il **Filtro Gruppo**); resta il filtro a **linguaggio naturale + voce** + le condizioni interpretate in sola lettura + i preset. Punta al pulsante "Gruppo" per il filtro manuale.

## Verifica
- `tsc --noEmit` FE+BE pulito; **77 test backend verdi**; backend riavviato; route nuove 401; migrazioni applicate **001→039**.

## Residui (rifiniture §9)
- Conteggi delle viste (chip) che rispettino il filtro attivo.
- Archetipo Documento come DetailPage dedicata (oggi drawer).
- Assenza approvata: DELETE che ripristina il saldo `used`.
- Long-tail i18n per-pagina (header colonne / label box) — con revisione terminologia.
- Render Report server-side / PDF nativo (oggi via print del browser).
