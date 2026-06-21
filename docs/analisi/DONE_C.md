# DONE_C — Magazzino completo (V043_warehouse_complete.sql)

**Creato:** `stock_lot` (fix bug lot_id senza tabella) + FK da stock_movement/stock_document_line/stock_serial_unit (+ lot_id su stock_serial_unit); `stock_location` +code/manager_user_id/note; `stock_count`(+line); `purchase_order`(+line); `pick_list`(+line) — tutte RLS+GRANT. Tipo movimento `count_adjust`. Backend `warehouse.ts`: CRUD + **post conteggio→rettifiche**, **ricezione PO→carico**, **conferma pick→scarico** (generano stock_movement; giacenza aggiornata dal trigger esistente). FE: tab magazzino Lotti/Documenti/Seriali (Seriali = placeholder, vedi note).

**Scostamenti:** V043. La maschera magazzino è Object Page con RelatedTabs (non documento), come da C.6. `stock_balance` non ricalcolato a mano (trigger esistente). Seriali per-location: manca endpoint BE (placeholder FE). `code`/`note` location: display-only finché stock route update non li accetta.

**AC C:** SUPERATO end-to-end (PO ricevuto→giacenza 10; conteggio 7→rettifica→7; pick 2→5).
