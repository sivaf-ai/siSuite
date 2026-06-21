# DONE_K — Punch-list rifiniture (nessuna migrazione)

1. **Seriali per-magazzino:** `GET /stock/locations/:id/serials` (serial/articolo/stato/ordinativo/installato/has_secret) + tab "Seriali" della scheda magazzino cablato in FE (sostituito il placeholder).
2. **stock_location code/note (+manager_user_id):** `routes/stock.ts` (create+update) li persiste (colonne già a DB da V043); FE editabile.
3. **company_contact mobile/department/note:** esposti in `createContactSchema`/`updateContactSchema`/ContactDto, route contatti (`companies.ts`) e form/lista contatti FE.
4. **Wipe demo:** `pnpm --filter @sisuite/backend wipe:testdata [tenantId]` (`src/demo/wipeTestData.ts`): svuota i dati operativi/anagrafici di prova di un tenant in ordine FK-safe, disabilitando temporaneamente il trigger di immutabilità su stock_movement; **preserva la struttura** (tenant, piani/abbonamenti, ruoli, permessi, utenti, lookup, numeratori, field_definition, tax_rate).

**AC K:** SUPERATO (location code/note salvati/riletti; seriali per-magazzino; contatto mobile/dept; wipe disponibile e non distruttivo dello schema).
