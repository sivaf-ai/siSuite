# DONE_motore_3+4 — Ordina · Colonne · Export sul motore comune

> Blocchi 3 e 4 del `PIANO_motore_liste_e_magazzino`. Le tre funzioni ora usano **lo stesso** `FieldChooser` + `FloatingPopover` + `SavedHeader` (mockup 55), cablati in `EntityList` → si propagano **a tutte le liste**.

## Storage unificato (migrazione 038)
- **`038_list_preset.sql`** (applicata): tabella generica `list_preset(entity, kind, name, payload)` con `kind ∈ filter|sort|columns|export`, RLS per-utente. Backend **`routes/listPresets.ts`** (`GET/POST/DELETE /list-presets`). Hook **`ui/useListPresets.ts`**.
- Così il `SavedHeader` ("salva/carica/elimina") è **identico** in Ordina, Colonne, Export (e domani Filtro).
- **Nota numerazione:** ho usato 038 per `list_preset` (serve ora al motore) e riservo **039 per `saved_report`** (Blocco 5). È un riordino minimo rispetto al piano (che dava 038 a saved_report); le feature restano quelle definite.

## Blocco 3 — ORDINA (mockup 55) ✅
- Sostituita la vecchia `SortDialog` "aggiungi un campo alla volta". Ora: `FloatingPopover` "Ordina" → `SavedHeader` + `FieldChooser` mode `sort` (area scelti con priorità/drag/▲▼/✕ + toggle ↑Crescente/↓Decrescente; area "tutti i campi" con ricerca) + footer Pulisci/Applica.
- Backend `sortSql.buildOrderBy` già esistente: la UI nuova passa `?sort=[{field,dir}]`. Badge col numero di livelli sull'icona toolbar.

## Blocco 4 — COLONNE + EXPORT (stesso `FieldChooser`) ✅
- **Colonne** (mode `columns`): mostra/nascondi + ordine via il selettore a due aree; persistito per-utente (localStorage) + salvabile come set (`list_preset` kind=columns). Sostituito il vecchio `FieldPicker`.
- **Export** (mode `export`): stesso selettore; "Esporta (Excel)" sui campi scelti/ordinati; salvabile (`list_preset` kind=export). Sostituito `ExportDialog`. L'export dinamico dai `field_definition` (Blocco 4 precedente) resta: i campi custom compaiono nella sorgente.

## Verifica
- `tsc --noEmit` frontend+backend: pulito. **64 test backend verdi.** Backend riavviato, health 200, `/list-presets` registrata.
- **Da guardare a video** (Ctrl+F5): su qualunque lista → icone Ordina/Colonne/Esporta → pop-up galleggiante a due aree, identico ovunque; salva/carica un set.

## Aperto (prossimi blocchi del piano)
- **Blocco 2 — Filtro "Gruppo"** (mockup 54_v1_3): QBE sulla scheda con freccettina+pop-up, operatori per tipo, parentesi (1 livello), frase in lingua. Sostituirà il builder manuale di `AiFilterPanel` (la barra AI/voce resta). Estendere `buildFilter` + test.
- **Blocco 5 — Report designer** (mockup 56): 3 `FieldChooser` (mostra/somma/raggruppa) + opzioni + anteprima HTML + barra AI; migrazione 039 `saved_report` + endpoint render.
- **Blocco 6** — toolbar §3 (icone+tooltip, badge) rifinitura su `EntityList`.
- **Blocco 7 — Magazzino CRUD** completi (Magazzini/Ubicazioni/Movimenti/Giacenze/Documenti).
- **Blocco 8/9** — verifica "anagrafiche identiche" + residui (conteggi viste col filtro, i18n long-tail, saldo assenze).
