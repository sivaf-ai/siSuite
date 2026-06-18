# DONE_0 — Verifica stato A→H + stato reale dei Blocchi 1→6

> **Checkpoint del PIANO `2026-06-18_PIANO_prossimi_lavori` (Blocco 0).** Accertamento, nessuna modifica al codice in questo blocco.
> Metodo: verifica a livello **codice + DB** (5 agenti di esplorazione paralleli sul monorepo) — *non* walkthrough con screenshot del browser, perché l'ambiente Claude Code di questa sessione non ha tooling di screenshot (no Playwright/Puppeteer). Gli screenshot di confronto coi mock restano a carico del PC test di Sivaf; qui i verdetti sono basati sul codice sorgente reale (file:riga).
> **Data:** 18/06/2026. Migrazioni applicate: **001→035** + `007_term_override` (già presente). Prossima libera: **036**.

---

## Risultato chiave

**La PIANO è stata scritta su un'istantanea di stato ormai superata in più punti.** Molta infrastruttura che la PIANO dà "da fare" **esiste già**. Il Blocco 0 serve esattamente a questo: riallineare il piano alla realtà, così i blocchi 1→6 lavorano solo sui **gap veri** e non rifanno cose fatte.

Esempio macroscopico: la PIANO propone la migrazione `036_term_override` → **esiste già come `007_term_override.sql`, applicata, con RLS per-tenant e backend GET/PUT**. La numerazione migrazioni del piano va quindi corretta.

---

## Tabella di stato CORRETTA (per blocco)

| Blocco | PIANO assumeva | Stato REALE | Gap residuo (cosa fare davvero) |
|---|---|---|---|
| **0 — Verifica** | da fare | ✅ **FATTO** (questo doc) | — |
| **1 — Design system** | da fare | 🟢 **~85% FATTO** | Scala tipografica token completa (`--fs-h1:22`…`--fs-eyebrow:10.5`), `--ctrl-h`+3 densità (default Comoda), `.btn` gerarchia. Gap: testo `.btn` 13.5 > body 13 ("pulsanti grandi"); manca `.btn-secondary`; ~30-40% `.tsx` con font-size inline (perlopiù mobile/dashboard legittimi). |
| **2 — i18n + Glossario** | da fare | 🟡 **PARZIALE (~55%)** | Infra FATTA: catalogo 3 lingue allineate, `term_override` (mig 007, RLS), backend `GET/PUT /settings/terminology` (perm `settings:manage`), `TerminologySettings`. **GAP CRITICO**: `terms.*` usato ~0 in UI → **propagazione non funziona** (il bug del DoD: rinomino *Commessa→Progetto* e NON si propaga). Retrofit ~500 stringhe IT hardcoded (liste/schede/tooltip/dialoghi). `TERM_KEYS` = 18, mancano party/operator/supplier/partner/site/masterdata (+ work_order/work_line). No anteprima live, no "ripristina default" per termine, no raggruppamento. |
| **3 — Liste legacy → v2** | da fare | 🔴 **DA FARE (0%)** | Foglio ore, Assenze, Magazzino tutte su `DataTable`. Endpoint backend già completi. Magazzino = 4 tab sibling + Documento archetipo (non rompere transizioni stato). Serve `GET /time-entries/:id` e `/absences/:id` per le DetailPage. |
| **4 — Export dinamico** | da fare | 🟡 **PARZIALE** | Framework FATTO (`ExportDialog`, `FieldPicker`, `/field-definitions`, preset per-utente). Gap: `exportFields` cablato a mano in ~12 pagine; i `field_definition` custom NON entrano in automatico nell'export. Refactor mirato in `EntityList`. |
| **5 — Filtri/Sort/Viste** | da fare | 🟡 **PARZIALE** | `buildFilter` 85% (operatori ok, bind sicuri; **manca `between`/date-range**). QBE 40%: c'è `AiFilterPanel` (NL+voce+builder manuale campo·op·valore E/O), **manca** la modalità scheda type-aware (datepicker/enum-select/numero). Multi-sort 0%. `saved_view` 0% (mig 037 da fare). **Zero test su `buildFilter`**. GIN su `attributes` sì, **trigram no**. Conteggi viste ignorano il filtro attivo. |
| **6 — Dedup AI Soggetti** | da fare | 🔴 **DA FARE (0%)** | Pattern `CaptureBarAI` (propone→review→apply deterministico) riusabile. Archiviazione soft (`archived_at` su company) ok. Quota AI per tenant ok. **FK verso company verificate: 9** — la PIANO ne elenca 8, **manca `subcontract_line.company_id`**. |

---

## Correzioni da portare nei blocchi successivi

1. **Migrazioni**: `term_override` esiste già (007). Le **nuove** migrazioni di questo piano sono solo: `036_*` per eventuali termini/colonne aggiuntive del Blocco 2, e `036_saved_view.sql` per il Blocco 5 (non "037": la 036 è la prossima libera). Aggiornare i numeri nel piano.
2. **Blocco 6 — FK**: l'apply deve ri-puntare **9** colonne, non 8. Aggiungere `subcontract_line.company_id` (ON DELETE RESTRICT) all'elenco di `engagement, asset, work_order.principal_company_id, price_list_override, stock_serial_unit, company_role, company_contact, app_user`.
3. **Blocco 2 è il vero cuore**: non è "fondamenta da posare" ma "**retrofit da completare + propagazione da far funzionare**". Il valore-demo (rename che si propaga) dipende interamente dal retrofit UI, non dal DB.
4. **Blocco 1 va solo rifinito** (token btn + spazzata font-size), non riprogettato.
5. **Blocco 5 — PII**: il filtro server-side non gate-a la PII per permesso; va chiuso quando si tocca `buildFilter`.

---

## FK verso `company` — elenco verificato (per Blocco 6)

```
app_user.company_id                     ON DELETE SET NULL    001_schema_core.sql
asset.company_id                        ON DELETE RESTRICT    001_schema_core.sql
company_role.company_id                 ON DELETE CASCADE     001_schema_core.sql
company_contact.company_id              ON DELETE CASCADE     001_schema_core.sql
engagement.company_id                   ON DELETE RESTRICT    001_schema_core.sql
work_order.principal_company_id         ON DELETE SET NULL    025/032_work_orders
price_list_override.company_id          ON DELETE CASCADE     026_price_list.sql
stock_serial_unit.installed_company_id  ON DELETE SET NULL    024_serial_inventory.sql
subcontract_line.company_id             ON DELETE RESTRICT    027_production_accounting.sql  ← NON nel piano
```

---

## Ordine di esecuzione rivisto (per questa e prossime sessioni)

- **Subito completabili in autonomia** (piccoli, indipendenti): **Blocco 1** (rifinitura token), **Blocco 4** (export dinamico). → chiusi in questa sessione.
- **Cuore, pesante** (multi-sessione): **Blocco 2** (retrofit i18n + propagazione) → poi **Blocco 3** (liste legacy nascono già tradotte) → **Blocco 5** (filtri/sort/viste) → **Blocco 6** (dedup AI).

> Nota screenshot: i DoD chiedono screenshot di confronto coi mock. Questa sessione li produce a livello di codice/diff; la validazione visiva finale la fa Sivaf sul PC test (http://localhost:5173, owner@fibra.demo / Demo123!). Dove possibile indico cosa guardare.

*Fine Blocco 0.*
