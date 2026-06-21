# DONE_TOTALE — SPEC Anagrafiche/Fiscale/Magazzino/Risorse/Asset v1.1 (chat 01.06)

**Data:** 21/06/2026 · **Esecuzione:** autonoma, continua (A→F) · **Base:** migrazioni 001→040 già applicate.

## Esito sintetico
Tutti i blocchi A→F sono stati implementati a livello **DB (migrazioni 041→046, applicate e verificate)** e **backend (route + CRUD + logica di posting magazzino, typecheck pulito, smoke test OK)**, e il **frontend** dei criteri di accettazione (form fiscale country-driven, AddressField, tab magazzino, liste nuove) con **typecheck FE verde**. **79/79 test backend verdi** (incl. RLS), nessuna regressione.

## ⚠️ Scostamento importante: NUMERAZIONE MIGRAZIONI
La SPEC indicava V038 come prima libera (schema a 037). Tra la stesura e l'esecuzione, **altre chat hanno occupato 038 (list_preset), 039 (saved_report), 040 (material_resource_fields)**. Per non rinumerare/toccare migrazioni altrui (regola di coordinamento), questo set parte da **041**:

| Blocco SPEC | Migrazione effettiva |
|---|---|
| A (V038) | **041_fiscal_localization.sql** |
| B (V039) | **042_material_complete.sql** |
| C (V040) | **043_warehouse_complete.sql** |
| D (V041) | **044_resources_skills.sql** |
| E (V042) | **045_entity_refinements.sql** |
| F | **046_warehouse_entitlements_series.sql** |

Prossima libera dopo questo set: **047**.

## ⚠️ Scostamento: COLONNE vs JSONB (clean-slate su 040)
La migrazione 040 (altra chat) aveva messo material/resource come `field_definition` (attributes jsonb). La SPEC v1.1 impone questi campi come **COLONNE** ("NON FARE: prezzo/categoria in attributes"). Sotto clean-slate, le migrazioni 042/044 **promuovono i campi a colonne reali** e fanno `DELETE` delle righe `field_definition` di sistema superate (senza toccare il file 040, immutabile). Restano come attributes solo i veri long-tail (material: abc_class, warranty_months, currency, hs_code, country_origin, default_location; resource: icon lucide, role_title, department, notes).

Stessa logica per i vecchi `field_definition` company di 004 (vat_number/tax_code/pec/sdi_code/street/city/province/postal_code/website/notes): rimossi e sostituiti da colonne (tax_id, website…) + fiscal_attributes country-scoped + indirizzo jsonb.

## Convenzione adottata (campi fiscali e indirizzi)
- `field_definition.country` IS NOT NULL + entity='company' → il campo vive in **`company.fiscal_attributes`**, filtrato per il `country` del soggetto. Validazione backend: `validateFiscalAttributes()`.
- entity='address' (country IT/AR) → guida l'unico componente **`AddressField`** su `legal_address`/`operational_address` (jsonb).
- Unique parziale di sistema su field_definition esteso a `(vertical, entity, key, country)` per permettere chiavi ripetute per paese (es. address.provincia IT e AR).

---

## Stato per blocco

### Blocco A — Localizzazione fiscale + indirizzi (V041) ✅
- `field_definition.country` + indice scope + unique esteso col country.
- `tax_rate` (catalogo country-scoped, RLS sistema+tenant, GRANT) + **seed IT (6) e AR (5)**.
- `company`: colonne code, country, tax_id, tax_id_kind, email, phone, website, iban, payment_terms, default_price_list_id, legal_address, operational_address, fiscal_attributes; **DROP address**; indici tax_id e code univoco.
- Campi fiscali IT (sdi_code/pec/regime_fiscale/is_pa/tax_code) e AR (condicion_iva/tipo_documento/punto_venta) seedati in field_definition (country-scoped).
- `site`: address→jsonb, company_id nullable. `tenant.default_country`.
- **AC A: SUPERATO** (smoke: company IT con SOG-00001, sdi_code in fiscal_attributes, indirizzo IT in legal_address; company AR con condicion_iva). FE: form country-driven + AddressField.

### Blocco B — Material completo (V042) ✅
- material: +23 colonne (code, item_type, barcode, category_id, description, brand, manufacturer, mpn, default_sale_price, tax_rate_id, reorder_point, safety_stock, min_qty, max_qty, lead_time_days, preferred_vendor_id, weight, weight_unit, dimensions, is_returnable, shelf_life_days, primary_image_url, note) + indici barcode/category + code univoco.
- `material_category` (gerarchica), `material_image` (MinIO), `material_supplier` — RLS+GRANT.
- Cleanup field_definition superati (040 + software brand/part_number).
- **AC B: SUPERATO** (smoke: ART-00001 con categoria/barcode/prezzo/IVA/reorder; ricerca per barcode OK).

### Blocco C — Magazzino completo (V043) ✅
- `stock_lot` (+ FK da stock_movement/stock_document_line/stock_serial_unit; lot_id aggiunto a stock_serial_unit).
- `stock_location`: +code, manager_user_id, note.
- `stock_count`(+line), `purchase_order`(+line), `pick_list`(+line) — RLS+GRANT. Tipo movimento `count_adjust`.
- Backend `warehouse.ts`: CRUD + **post conteggio→rettifiche**, **ricezione PO→carico**, **conferma pick→scarico** (generano stock_movement; la giacenza è aggiornata dal trigger).
- **AC C: SUPERATO** (smoke end-to-end: PO ODA-2026-0001 ricevuto→giacenza 10; conteggio INV-2026-0001 contato 7→rettifica→giacenza 7; pick PRL-2026-0001 →giacenza 5). FE: Object Page magazzino con tab Giacenze/Movimenti/Ubicazioni/**Seriali/Lotti/Documenti**.

### Blocco D — Risorse + competenze + certificazioni (V044) ✅
- resource: +code, color, avatar_url, email, phone (colonne).
- `skill` + `resource_skill` (level) + `resource_certification` (valid_until→alert) — RLS+GRANT.
- Backend `resourceExtras.ts`: catalogo skill + competenze/certificazioni per risorsa (daysToExpiry calcolato).
- **AC D: SUPERATO** (smoke: risorsa con sigla MR/colore/email; competenza liv 3; certificazione PES/PAV con daysToExpiry).

### Blocco E — Affinamenti + asset anchor (V045) ✅
- work_order: +priority, due_date, site_id. engagement: +planned_start, planned_end, priority.
- asset: +model, manufacturer, warranty_until, status, parent_asset_id; **company_id nullable + work_order_subject_id + CHECK anchor** (company OR site OR work_order_subject).
- company_contact: +mobile, department, note.
- **AC E: SUPERATO** (smoke: asset ancorato SOLO a un sito, senza company, passa il CHECK).

### Blocco F — Vendibilità + numeratori (V046) ✅
- Entitlement `module.warehouse` + `module.warehouse.mobile` su tutti i plan (UI nasconde, backend = barriera).
- number_series seedate per material/company/stock_location/stock_document/purchase_order/pick_list/stock_count (per i tenant esistenti + nel bootstrap per quelli futuri).
- Campi indirizzo (entity='address') country-driven IT/AR.
- **AC F: SUPERATO** (codici generati nei smoke; 3 plan con entitlement; serie verificate).

---

## Verifiche eseguite
- Migrazioni 041→046 applicate via servizio `migrate` (tutte OK) + bootstrap (grant nuove tabelle a sisuite_app).
- Verifica schema su DB: 14 tabelle nuove, tax_rate 11 seed, asset_anchor_check presente, 7 number_series, 3 plan con entitlement, grant OK.
- Typecheck **shared + backend + frontend = puliti**.
- **79/79 test backend verdi** (filterSql 32, scheduler 14, companyMerge 2, rls 3, dependencyPlan 5, weekView 5, sortSql 11, resolvePrice 7).
- Smoke API end-to-end per A,B,C,D,E,F (login owner@sisuite.local, vedi sopra).

## Punti aperti / note per Sivaf
1. **Dati di smoke test** rimasti nel DB del tenant Sivaf (qualche company/material/PO di prova). Innocui; eliminabili dalle liste o con un wipe demo.
2. **Tab "Seriali" della scheda magazzino**: placeholder — manca un endpoint seriali *per-location* lato BE (esiste `/materials/:id/serials` per-articolo). Da aggiungere se serve la vista per magazzino.
3. **stock_location form (FE)**: `code`/`note` sono display-only perché `routes/stock.ts` (update location) non li accetta ancora; va esteso il backend stock per persistirli (campi colonna già presenti a DB da V043).
4. **company_contact** mobile/department/note: colonne a DB, ma lo schema FE/route contatti non li espone ancora (additivo, non urgente).
5. **NESSUNA FATTURAZIONE**: rispettato — nessun SdI/XML/ARCA/AFIP/numeratore fiscale. I dati fiscali sono solo anagrafica (export verso gestionale esterno = cantiere).
6. **Mobile**: non anticipato (solo schema/back-end), come da brief.
7. **Deploy**: `deploy.ps1` è regola siERP, non siSuite. Qui FE/BE sono live via container (Vite + tsx); ho riavviato `sisuite_backend` dopo le modifiche.

## Cantiere (tracciato anche in BACKLOG_futuro.md)
Sync offline, solver pianificazione, wiring auth GoTrue, narrazione AI, export anagrafiche fiscali, etichette barcode, notifiche (alert scorta/scadenze), demo pack, ADR (prodotti — vedi sotto).
