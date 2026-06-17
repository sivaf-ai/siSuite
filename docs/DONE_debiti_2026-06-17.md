# DONE — Debiti tecnici chiusi (17/06/2026, post brief v2.4)

Quattro debiti documentati nei DONE precedenti, affrontati su richiesta di Ricardo.

## 1) Schema DB doc rigenerato
- Nuovo `docs/analisi/2026-06-17_schema_db_completo.md` = `pg_dump --schema-only -n public` dopo le migrazioni **001→033**. Sostituisce il doc del 16/06 (disallineato dopo 032).

## 2) Sicurezza seriali — data_scope in RLS + audit reveal
- **Migrazione 033** `033_serial_security.sql` (applicata, prossima libera: **034**):
  - RLS `stock_serial_unit` riscritta per-comando (pattern `time_entry`): policy **`ssu_select`** impone `data_scope='own'` (il Tecnico vede SOLO le unità del suo furgone `holder_resource_id` o sugli ordini a lui assegnati); `ssu_insert/update/delete` tenant-scoped + platform admin. Prima lo scope era solo nella query.
  - Nuova tabella **`serial_secret_reveal_log`** (id, tenant_id, serial_unit_id, user_id, revealed_at) con RLS tenant: audit di **chi/quale/quando** ha sbloccato la password apparato. Il valore in chiaro NON è mai loggato.
- Backend `routes/serials.ts`: l'endpoint `/serials/:id/secret/reveal` scrive una riga d'audit dopo la decifratura (prima del return).
- **Test**: owner reveal → 200 + 1 riga d'audit; owner vede 3 seriali, marco (data_scope own) 0 (scope applicato); 4 policy presenti su stock_serial_unit (select/insert/update/delete).

## 3) Tab Listino — Lavorazioni che la usano + Storico prezzi
- Backend `routes/prices.ts`: nuovo `GET /price-list-items/:id/usage` → `work_line` che referenziano la voce (commessa, qtà, prezzi fotografati, data).
- Frontend `ListinoItemDetailPage`: i due tab placeholder ora reali — **Lavorazioni che la usano** (tabella work_line) e **Storico prezzi** (snapshot distinti data/costo/ricavo/margine dai prezzi fotografati). Conteggi nei tab.
- **Test**: `/price-list-items/:id/usage` → 1 lavorazione (commessa 2026-0001, costo 11 / ricavo 36).

## 4) Export .xlsx nativo (exceljs)
- Aggiunta dipendenza **`exceljs`** al frontend. Nuovo helper `lib/xlsx.ts` (`downloadXlsx(filename, sheets)` con intestazioni in grassetto).
- `PivotPage`: export Pivot ora produce **.xlsx nativo** (foglio Preventivo-consuntivo) al posto del CSV.
- `OrdinativiPage`: "Esporta selezionati" ora produce **.xlsx**.
- **Test**: typecheck frontend pulito; Vite ha ottimizzato exceljs senza errori; pagina serve (200).

## Stato
- Typecheck shared+backend+frontend puliti; backend riavviato; demo fibra ricaricata (anche per gli scarichi su ordine del Blocco H). Prossima migrazione libera: **034**.
