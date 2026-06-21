# ADR-0008 — Modulo Magazzino completo e vendibile standalone

- **Stato:** Accepted
- **Data:** 2026-06-21 · Chat 01.06
- **Correlato:** SPEC v1.1 (Blocchi B, C, F) · migrazioni 042/043/046 · ADR-0002 (seriali) · migrazioni 020-022 (magazzino minimo)

## Contesto
Il magazzino minimo (020-022: material/stock_location/stock_movement/stock_balance/stock_document) era pensato come supporto alle commesse. La strategia chiede un **magazzino completo vendibile da solo** (come Odoo Inventory / Cin7 / Zoho Inventory): articolo ricco, categorie, fornitori multipli, lotti con scadenza, conteggio inventariale, ordini d'acquisto, pick list. Inoltre i `lot_id` esistenti puntavano a una tabella `stock_lot` **mancante** (bug latente).

## Decisione
1. **Articolo (`material`) ricco a COLONNE** (non attributes): code, item_type, barcode, category_id, default_sale_price, tax_rate_id, reorder_point/safety_stock/min/max_qty, lead_time_days, preferred_vendor_id, weight/dimensions, is_returnable, shelf_life_days, primary_image_url, ecc. Motivo: sono campi universali, filtrabili/ordinabili/joinabili, che pilotano logica (marginalità, sotto-scorta). Coda lunga di verticale resta in `attributes`. **Promossi da attributes a colonne** i campi che la migrazione 040 aveva messo in field_definition (clean slate).
2. **`material_category` (gerarchica), `material_image` (MinIO), `material_supplier`** (più fornitori per articolo).
3. **`stock_lot`** (fix del bug): tabella lotti + FK da stock_movement/stock_document_line/stock_serial_unit; scadenze indicizzate per gli alert.
4. **Conteggio inventariale** (`stock_count`+line): al `post` genera movimenti di rettifica (`count_adjust`, delta contato−atteso). **`purchase_order`**(+line): la ricezione genera movimenti di carico e aggiorna lo stato (partial/received). **`pick_list`**(+line): la conferma genera movimenti di scarico. **La giacenza non si scrive mai a mano** — la aggiorna il trigger `apply_stock_movement` esistente.
5. **Maschera = Object Page** (lista magazzini → scheda con tab Giacenze/Movimenti/Seriali/Lotti/Documenti), non master-detail "documento".
6. **Vendibilità**: entitlement `module.warehouse` e `module.warehouse.mobile` (UI nasconde, **backend = barriera** RLS+entitlement+RBAC). Numeratori dedicati (ART/SOG/MAG/DDT/ODA/PRL/INV) da `number_series`; **UUID mai in UI**.

## Conseguenze
**Positive:** modulo completo e vendibile standalone; contabilità di magazzino corretta (tutto passa per stock_movement immutabile + trigger); lotti finalmente coerenti; pronto per barcode/mobile. **Negative/mitigazioni:** superficie ampia (11 tabelle nuove tra B e C); il posting (PO/conteggio/pick) è logica backend testata con smoke end-to-end. Tab "Seriali" per-location e persistenza code/note location restano da completare (vedi DONE_TOTALE §punti aperti).

## Alternative scartate
- **Tenere i campi articolo in attributes:** rifiutato dalla SPEC (servono colonne per filtri/marginalità).
- **Scrivere la giacenza direttamente:** rifiutato — si rettifica via movimento, mai si edita il saldo.
- **Maschera magazzino a documento:** rifiutato — è Object Page con tab (standard entità).
