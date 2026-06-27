# AUDIT conformità DB — siSuite (FASE 0)

**Chat:** 01.06 · **Data:** 27 giugno 2026 · **Governato da:** Carta A–G + SPEC audit totale
**Schema di riferimento:** `docs/analisi/2026-06-27_schema_db_completo.md` (74 tabelle materializzate; la 75ª `engagement_template` è stata droppata in migr. 010 → riconciliata su `template`).
**Stato:** fotografia pre-bonifica. Nessuna modifica eseguita in questa fase.

## Legenda
PASS = conforme · FAIL = violazione di un criterio della Carta · N.A. = criterio non applicabile · PARZIALE = conforme con riserva minore documentata.

## Criteri (colonne)
1. **FK** — ogni riferimento a catalogo/anagrafica è FK uuid (non testo); FK su anagrafiche con `ON DELETE RESTRICT`.
2. **Unicità** — UNIQUE a DB su ogni chiave naturale, incluse le righe di sistema (`tenant_id IS NULL`).
3. **RLS** — ENABLE + FORCE + policy tenant + GRANT a `sisuite_app`.
4. **Audit** — `created_at/updated_at/created_by/updated_by` (+ `archived_at` dove serve soft-delete).
5. **ID** — codice mostrato a video generato da `number_series`.
6. **Soft-delete** — se archiviabile, esiste controllo d'uso che impedisce di archiviare un record referenziato.

---

## Gruppo A — Anagrafiche / Core / Fiscale / Risorse / Asset

| Tabella | FK | Unicità | RLS | Audit | ID | Soft-delete | Note |
|---|---|---|---|---|---|---|---|
| tenant | N.A. | PASS | PASS | PARZIALE | N.A. | N.A. | Root entity; solo `created_at`. |
| app_user | PASS | **FAIL** | PASS | PASS | N.A. | N.A. | `code` text senza UNIQUE per-tenant. `active` flag (no archived_at). |
| role | PASS | PASS | PASS | PARZIALE | N.A. | N.A. | unique `(tenant,name)` + parziale `WHERE tenant_id IS NULL`: sistema coperto. |
| role_permission | PASS | PASS | PASS | N.A. | N.A. | N.A. | Ponte. |
| user_role | PASS | PASS | PASS | N.A. | N.A. | N.A. | Ponte. |
| company | PASS | PASS | PASS | PASS | PASS | **FAIL** | Archivia senza controllo d'uso (`companies.ts:228`). |
| company_contact | PASS | PARZIALE | PASS | PARZIALE | N.A. | N.A. | Lista figlia, no unique naturale. |
| company_role | PASS | PASS | PASS | PARZIALE | N.A. | N.A. | `role` text = enum applicativo (non catalogo). |
| engagement | PASS (company RESTRICT) | PASS | PASS | PASS | PASS | **FAIL** | Archivia senza controllo d'uso. `budget_currency`/`priority` text liberi. |
| phase | PASS | PASS | PASS | PARZIALE | N.A. | N.A. | Manca `created_at`. |
| activity | PASS | PARZIALE | PASS | PASS | N.A. | N.A. | Nessun codice naturale (by design). |
| activity_dependency | PASS | PASS | PASS | PARZIALE | N.A. | N.A. | — |
| activity_resource | PASS | PASS (EXCLUDE no_double_booking) | PASS | PARZIALE | N.A. | N.A. | — |
| resource | PASS | **FAIL** | PASS | PASS | N.A. | **FAIL** | `code` text senza UNIQUE. Archivia senza controllo d'uso (`resources.ts:173`). |
| resource_availability | PASS | PARZIALE | PASS | PASS | N.A. | N.A. | `kind` text = enum. |
| resource_skill | PASS | PASS | PASS | PARZIALE | N.A. | N.A. | — |
| resource_certification | PASS | PARZIALE | PASS | PASS | N.A. | N.A. | Lista figlia. |
| skill | PASS | PASS | PASS | PASS | N.A. | N.A. | `category` text libero (tassonomia interna — vedi decisione FK). |
| asset | PASS (company RESTRICT) | PARZIALE | PASS | PASS | N.A. | **FAIL** | Archivia (`archived_at`) senza controllo d'uso. `kind/status/manufacturer` text. |
| site | PASS | PARZIALE | PASS | PASS | N.A. | **FAIL** | `kind` text. Archivia senza controllo d'uso (`sites.ts`). |
| material | **FAIL** | PASS | PASS | **FAIL** | PASS | **FAIL** | `unit`/`weight_unit` text → FK `unit_of_measure`. Manca `created_at`. Archivia senza controllo d'uso (`materials.ts:229`). |
| material_category | PASS | **FAIL** | PASS | PASS | N.A. | da bonificare | Nessun UNIQUE `(tenant,parent,name)` → categorie duplicabili. Ha `archived_at`. |
| material_image | PASS | PASS (one_primary) | PASS | PARZIALE | N.A. | N.A. | Immutabile. |
| material_supplier | PASS | PASS | PASS | PASS | N.A. | N.A. | `currency` text. |
| material_consumption | PASS (material RESTRICT) | N.A. | PASS | PASS | N.A. | N.A. | `unit` text → FK `unit_of_measure`. |
| unit_of_measure | PASS | **FAIL** | PASS | PASS | N.A. | N.A. | unique `(tenant,code)` ma **manca** parziale `WHERE tenant_id IS NULL` → righe sistema duplicabili. Catalogo non referenziato via FK. |
| tax_rate | PASS | **FAIL** | PASS | PASS | N.A. | N.A. | unique `(tenant,country,code)` ma **manca** parziale `WHERE tenant_id IS NULL`. |
| number_series | PASS | PASS (PK tenant,key) | PASS | N.A. | N.A. | N.A. | Servizio. |
| canonical_state | N.A. | PASS (PK) | PASS (sistema globale) | N.A. | N.A. | N.A. | No tenant_id (corretto). `category` text = tassonomia interna. |
| lookup_value | PASS | PASS | PASS | PARZIALE | N.A. | N.A. | unique + parziale sistema: coperto. `category` text = tassonomia interna. |
| lookup_override | PASS | PASS | PASS | PASS | N.A. | N.A. | — |
| term_override | PASS | PASS | PASS | PASS | N.A. | N.A. | — |
| field_definition | PASS | PASS | PASS | PARZIALE | N.A. | N.A. | unique + parziale sistema: coperto. `unit`/`category` text = metadati interni. |
| template | PASS | **FAIL** | PASS | PASS | N.A. | da bonificare | Nessun UNIQUE `(tenant,vertical,name)` → template duplicabili. Ha `archived_at`. |
| plan | N.A. (globale) | PASS | PASS (sistema globale) | PARZIALE | N.A. | N.A. | Catalogo piani. |
| subscription | PASS | PARZIALE | PASS | PASS | N.A. | N.A. | `provider` text. |
| capture | PASS | N.A. | PASS | PASS | N.A. | N.A. | `channel`/`media_type` text (estendibili, by design). |

> **`notification`**: nessuna tabella nello schema (esiste solo `routes/notifications.ts`, feed derivato). N.A.

---

## Gruppo B — Magazzino / Documenti / Lavoro / Listino / Ore / Liste

| Tabella | FK | Unicità | RLS | Audit | ID | Soft-delete | Note |
|---|---|---|---|---|---|---|---|
| stock_location | PASS | PASS | PASS | PASS | N.A. | PARZIALE | `archived_at` senza controllo d'uso esplicito (FK parent RESTRICT protegge l'albero). |
| stock_balance | PASS | PASS | PASS | N.A. | N.A. | N.A. | Derivata. |
| stock_movement | PASS (material/location RESTRICT) | N.A. | PASS | PARZIALE | N.A. | PASS (append-only) | `unit` **text** → FK. Ledger immutabile. |
| stock_document | PASS (RESTRICT) | **FAIL** | PASS | PASS | PASS | PASS | Nessun UNIQUE `(tenant,number)`. Delete solo draft (`stock.ts:338`). |
| stock_document_line | PASS (material RESTRICT) | N.A. | PASS | PARZIALE | N.A. | PASS | `unit` **text** → FK. |
| stock_count | PASS | **FAIL** | PASS | PASS | PASS | PASS | Nessun UNIQUE `number`. Post bloccato `status='posted'`. |
| stock_count_line | PASS | N.A. | PASS | PARZIALE | N.A. | PASS | `unit` **text** → FK. |
| stock_lot | PASS | PASS | PASS | PASS | N.A. | N.A. | Delete libero ma FK proteggono via 23503. |
| stock_serial_unit | PASS (material RESTRICT) | PASS | PASS | PASS | N.A. | PASS | — |
| serial_secret_reveal_log | PASS | N.A. | PASS | PARZIALE | N.A. | N.A. | Audit append-only. |
| pick_list | PASS | **FAIL** | PASS | PASS | PASS | PASS | Nessun UNIQUE `number`. Delete solo draft (`warehouse.ts:531`). |
| pick_list_line | PASS | N.A. | PASS | N.A. | N.A. | PASS | `unit` **text** → FK. |
| purchase_order | PASS | **FAIL** | PASS | PASS | PASS | PASS | Nessun UNIQUE `number`. Delete solo draft (`warehouse.ts:403`). |
| purchase_order_line | PASS | N.A. | PASS | N.A. | N.A. | PASS | `unit` **text** → FK. |
| equipment_usage | PASS (resource RESTRICT) | N.A. | PASS | PASS | N.A. | N.A. | `unit` **text** default `'h'` → FK. |
| work_order | PASS | PASS | PASS | PASS | PASS | PASS | — |
| work_order_item | PASS (material RESTRICT) | N.A. | PASS | PARZIALE | N.A. | N.A. | Nessun UNIQUE `(wo,material)` → righe duplicate. |
| work_order_subject | PASS | PASS (1:1) | PASS | PASS | N.A. | N.A. | PII: RLS solo tenant (mascheramento applicativo). |
| work_line | PASS | N.A. | PASS | PASS | N.A. | N.A. | `unit` **text** → FK. |
| work_line_measure | PASS | N.A. | PASS | PARZIALE | N.A. | N.A. | — |
| work_report | PASS | N.A. | PASS | PASS | N.A. | PARZIALE | Nessuna guardia stato sul delete a DB (firma non blocca a schema). |
| work_report_time_entry | PASS | PASS (PK) | PASS | N.A. | N.A. | N.A. | Ponte. |
| time_entry | PASS | N.A. | PASS | PASS | N.A. | PASS | Delete guardato `is_locked=false`. `typology` text legacy convive con `typology_id` FK. |
| time_tracking_session | PASS | N.A. | PASS | PARZIALE | N.A. | N.A. | Effimera. |
| absence_entry | PASS (resource RESTRICT) | PARZIALE | PASS | PASS | N.A. | N.A. | Nessun anti-sovrapposizione periodi. |
| absence_balance | PASS | PASS | PASS | PARZIALE | N.A. | N.A. | Derivata. |
| price_list | PASS | PASS | PASS | PASS | N.A. | N.A. | `active` flag. |
| price_list_item | PASS | PASS | PASS | PASS | N.A. | N.A. | `unit` **text** → FK. `category` text (vedi decisione FK). |
| price_list_override | PASS | **FAIL** | PASS | PASS | N.A. | N.A. | Nessun UNIQUE su chiave override → duplicati. |
| rate_card | PASS | **FAIL** | PASS | PASS | N.A. | N.A. | Nessun UNIQUE su chiave tariffa → duplicati. |
| subcontract_line | PASS (company RESTRICT) | N.A. | PASS | PASS | N.A. | N.A. | — |
| saved_view | PASS | PASS | PASS | PASS | N.A. | N.A. | — |
| saved_report | PASS | PASS | PASS | PASS | N.A. | PASS | — |
| export_preset | PASS | PASS | PASS | PASS | N.A. | N.A. | — |
| filter_preset | PASS | PASS | PASS | PASS | N.A. | N.A. | — |
| list_preset | PASS | PASS | PASS | PASS | N.A. | N.A. | — |

---

## FAIL principali (sintesi cross-gruppo → input Fase 1)

### F1 — Colonne `unit` TEXT invece di FK a `unit_of_measure` (criterio 1, sistematico)
Il catalogo `unit_of_measure` (migr. 050) **non è referenziato via FK da nessuna riga**. Colonne text da convertire (worklist verificato, 11):
`material.unit`, `material.weight_unit`, `material_consumption.unit`, `pick_list_line.unit`, `price_list_item.unit`, `purchase_order_line.unit`, `stock_count_line.unit`, `stock_document_line.unit`, `stock_movement.unit`, `work_line.unit`, `equipment_usage.unit`.

### F2 — Unicità che non copre le righe di sistema (criterio 2)
`unit_of_measure` e `tax_rate`: unique `(tenant_id, …code)` con `tenant_id` nullable e **senza** indice `… WHERE tenant_id IS NULL` (a differenza di `lookup_value`/`field_definition`). Righe di sistema duplicabili; serve anche check applicativo tenant-vs-sistema su INSERT e UPDATE.

### F3 — Chiavi naturali mancanti (criterio 2)
`material_category` `(tenant,parent_id,name)`; `template` `(tenant,vertical,name)`; `resource.code` e `app_user.code` `(tenant,code)`; `work_order_item` `(wo,material)`; `rate_card`/`price_list_override` chiave temporale; numero documento `(tenant,number)` su `stock_document`/`stock_count`/`purchase_order`/`pick_list`.

### F4 — Soft-delete senza controllo d'uso (criterio 6)
`company`, `material`, `resource`, `site`, `asset`, `engagement`, `template`, `stock_location` archiviano (`UPDATE archived_at=now()`) senza verificare le referenze. L'handler `23503` intercetta solo le hard-delete; un `UPDATE archived_at` su record referenziato passa sempre. Serve check `EXISTS` applicativo prima di archiviare.

### F5 — `category` TEXT (criterio 1, caso-per-caso — vedi Fase 1.1)
`price_list_item.category` / `material`-correlate → da valutare FK a `material_category`. `lookup_value.category`, `canonical_state.category`, `field_definition.category/unit`, `skill.category` → tassonomie/metadati interni: **lasciare testo**, documentando.

### Note positive (già conformi)
- **RLS**: tutte le 74 tabelle hanno ENABLE+FORCE+policy tenant+GRANT a `sisuite_app`; tabelle globali (`canonical_state`, `plan`) usano `read=true / write=platform_admin`.
- **FK RESTRICT su anagrafiche-chiave** già presenti per hard-delete: `material_id`, `resource_id`, `company_id`, `source/dest_location`, `stock_location.parent`.
- **Handler globali** `23503`/`23505` presenti (`index.ts:113/123`).
- **stock_movement** è un ledger append-only corretto.
