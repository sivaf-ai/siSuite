# DONE_5 — Filtri + Ordinamento + Viste salvate (parziale)

> Blocco 5 del PIANO. Stato Blocco 0: `buildFilter` 85%, QBE 40% (c'è `AiFilterPanel`), multi-sort 0%, `saved_view` 0%, **zero test su buildFilter**, no trigram. Questo blocco chiude la parte **igiene critica** + il **data layer delle Viste salvate** + l'UI opt-in. QBE type-aware e multi-sort restano (vedi Aperto).

## Fatto

### Igiene critica (il debito che bloccava la demo)
- **Operatore `between`** in `filterSql.ts`: `value=[from,to]` o `{from,to}`; numerico se entrambi i bound sono numeri, altrimenti confronto testuale (vale per date ISO `YYYY-MM-DD`, che ordinano cronologicamente → copre anche il "per anno" mandando `[anno-01-01, anno-12-31]`). Bound mancante = condizione ignorata.
- **Test automatici su `buildFilter`** (`test/filterSql.test.ts`, **19 test, tutti verdi**): tutti gli operatori (contains/equals/not_equals/empty/gt-lte/is_true-false/**between**), logica AND/OR, `__any`, e soprattutto **sicurezza anti-injection**: i valori finiscono SOLO nei parametri bind `$N`, mai concatenati nello SQL (verificato con payload `'; DROP TABLE …` e `1 OR 1=1`); campo fuori FIELD_MAP ignorato (no whitelist bypass); JSON malformato → stringa vuota senza eccezioni.

### Viste salvate (5.3) — data layer + UI opt-in
- **Migrazione `036_saved_view.sql`** (additiva, **applicata**): `saved_view(tenant_id, user_id, entity, name, payload jsonb, is_shared)`, UNIQUE (tenant,user,entity,name), indice, RLS (leggo le mie + condivise `is_shared`; scrivo solo le mie). `payload = { filter, sort, columns, exportRef }`.
- **Backend `savedViews.ts`** (registrato): `GET/POST/DELETE /saved-views` per-utente, validazione zod del payload.
- **UI `EntityList`** opt-in via prop **`savedViewKey`** (assente = comportamento invariato, zero rischio per le liste esistenti): chip "Viste salvate" distinti (brand-wash) accanto alle viste di sistema; "**+ Salva vista**" → `PromptDialog` per il nome, impacchetta **filtro + colonne** correnti e POSTa; click su una vista la **ricarica** (applica filtro + colonne); ✕ elimina (solo le proprie). Wired su **Soggetti** (`company`) e **Ordini di lavoro** (`work_order`).

## Verifica
- `tsc --noEmit` backend+frontend: pulito. `vitest test/filterSql.test.ts`: **19/19**.
- Migrazione 036 applicata (`saved_view` esiste), backend riavviato, health 200.
- **Da fare sul PC test**: su Soggetti, applica un filtro AI/manuale + nascondi qualche colonna → "+ Salva vista" ("Clienti di Bergamo") → cambia vista → riclicca la vista salvata: filtro e colonne tornano. ✕ elimina.

## Completamento (sessione 2)

### 5.2 Multi-sort — FATTO
- Helper backend **`sortSql.ts` `buildOrderBy`** (multi-campo, whitelisted via SORTABLE, direzione vincolata asc/desc, retro-compatibile col singolo `sortBy/sortDir`). **Test `sortSql.test.ts`: 9 verdi** (priorità, fuori-whitelist ignorato, anti-injection).
- Wired su **6 endpoint**: companies, work-orders, materials, engagements, resources, assets (param `?sort=[{field,dir}]`).
- UI **`SortDialog`** in `EntityList` (mascherina "Ordina" multi-campo con priorità + asc/desc, aggiungi/rimuovi, azzera) via props `sortFields`/`onSortChange`. Wired: Soggetti, Commesse, Ordini di lavoro, Articoli.

### 5.1 `between` end-to-end — FATTO
- Operatore **"tra (da–a)"** nel builder manuale (`AiFilterPanel`): due input *da/a*; client-side `lib/listFilter.ts` valuta `between` (numerico o testuale per date ISO); backend già pronto. Funziona sia client che server.

### Igiene — FATTO
- **Indici GIN trigram** (migrazione **037**, applicata): `pg_trgm` + indici su display_name/city/vat (company), name/sku (material), code/address (work_order), code/title (engagement) → ILIKE veloce.
- **PII nel filtro**: verificato che **nessun campo PII** (intestatario in `work_order_subject`, mascherato) è presente nelle `FILTER_FIELDS` di alcun endpoint → il filtro non può aggirare il mascheramento (è una whitelist). Nessuna modifica necessaria.

## Aperto (rifiniture minori)
- **QBE type-aware completo**: input per tipo (data→date-picker, enum→select dei valori reali) e **chip operatore** visibile per campo (oggi l'operatore è una select; `between` ha già i due input). Serve passare i tipi dei campi (da `field_definition`) al pannello filtro.
- **Conteggi viste (chip) che rispettino il filtro attivo**: oggi riflettono la ricerca `q` ma non il filtro AI/manuale.

*Fine Blocco 5: 5.1/5.2/5.3 + igiene fatti. Residue solo rifiniture (type-aware inputs, conteggi-col-filtro).*
