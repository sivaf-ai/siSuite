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

## Aperto (Blocco 5 residuo — prossima sessione)
- **5.1 QBE type-aware**: oggi il builder manuale (`AiFilterPanel`) è campo·operatore·valore con input generico. Manca la modalità "scheda" con input per tipo (data→date-picker, enum→select dei valori reali, numero→numerico) e il **chip operatore** (Uguale·Contiene·Da–a) per campo. L'operatore `between` backend è pronto: serve esporlo nel pannello + un date-picker. Anche il client-side `lib/listFilter.ts` va esteso con `between` per la modalità client.
- **5.2 Multi-sort**: oggi solo single-sort (header → `sortBy/sortDir` via URL). Manca la mascherina "Ordina" multi-campo con priorità e l'`ORDER BY` multiplo lato backend. Quando arriva, il `payload.sort` della Vista (già previsto nello schema) va popolato.
- **Igiene residua**: indici **GIN trigram** (`gin_trgm_ops`) su `attributes->>'x'` usati nei filtri ILIKE (perf); **gating PII** nel filtro server-side (alcuni attributi filtrabili senza permesso); **conteggi viste** che rispettino il filtro attivo.

*Fine Blocco 5 (igiene + viste salvate). QBE type-aware e multi-sort: residuo documentato.*
