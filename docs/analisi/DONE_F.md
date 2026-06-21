# DONE_F — Vendibilità standalone + number_series + chiusura (V046_warehouse_entitlements_series.sql)

**Creato:** entitlement `module.warehouse` + `module.warehouse.mobile` su tutti i plan (UI nasconde per entitlement+RBAC, backend = barriera reale RLS+permessi); number_series per material/company/stock_location/stock_document/purchase_order/pick_list/stock_count (per i tenant esistenti + aggiunte al bootstrap per i futuri); field_definition indirizzo (entity='address') country-driven IT (street/civic/cap/comune/provincia) e AR (calle/numero/piso/depto/localidad/partido/provincia/cpa).

**Scostamenti:** V046. Permessi nuove entità mappati su risorse esistenti (material/stock/resource/settings) per non ri-seedare role_permission: read = material:read/stock:read/resource:read; write magazzino = stock:manage; tax_rate write = settings:manage.

**AC F:** SUPERATO (codici generati nei smoke; 3 plan con entitlement; serie verificate). ADR prodotti: `docs/decisioni/ADR-0007_*` e `ADR-0008_*`. Schema rigenerato.
