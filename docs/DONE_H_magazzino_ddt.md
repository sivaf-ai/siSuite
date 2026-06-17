# DONE — Blocco H · Magazzino / DDT

Data: 17/06/2026.

## Stato preesistente (verificato, già conforme)
- `pages/MagazzinoPage.tsx` (`/stock`) ha già le 4 schede: **Giacenze** (stock_balance), **Movimenti** (registro immutabile), **Documenti** (DDT **Carico/Trasferimento/Rettifica** con bozza→conferma→numerazione→movimenti), **Ubicazioni** (albero magazzini).
- Backend `routes/stock.ts`: locations/balance/movements/documents(+confirm) completi (RLS+RBAC). Trigger `apply_stock_movement` genera le giacenze.

## Completato ora (tab placeholder → reali)
### Backend
- `routes/stock.ts` `GET /stock/movements`: aggiunto filtro **`workOrderId`** + esposti `work_order_id`/`document_ref` nel DTO.
- `shared/entities.ts`: `StockMovementDto` + `workOrderId?`/`documentRef?`.

### Frontend
- **Scheda Articolo** (`MaterialeDetailPage`): i tab erano "In arrivo (Blocco H)". Ora reali:
  - **Giacenze per ubicazione** (`/stock/balance?materialId=`): qtà/costo medio/valore.
  - **Movimenti** (`/stock/movements?materialId=`): data/tipo(pill)/ubicazione/qtà(segno)/costo/rif. documento.
  - **Documenti**: derivati dai movimenti con `documentRef`/work order.
  - I tab compaiono ora anche per articoli a magazzino (non solo a seriale); il tab "Unità seriali" resta solo per gli articoli a seriale.
- **Scheda Ordine di lavoro** (`OrdinativoDetailPage`): tab **Materiali scaricati** ora reale (`/stock/movements?workOrderId=`): data/articolo/tipo/qtà/costo.

## Test (curl, owner@fibra.demo)
- `/stock/balance?materialId=` → 1 riga; `/stock/movements?materialId=` → 2 movimenti (uno con `documentRef=DDT-2026-0014`). `/stock/movements?workOrderId=` → filtro funziona (0 nel seed: la demo non ha scarichi legati a ordini). Typecheck shared+backend+frontend puliti; backend riavviato.

## Note / debiti
- Il **seed** non contiene `stock_movement.work_order_id` valorizzati → il tab "Materiali scaricati" dell'ordine è vuoto in demo (il wiring è completo). Per popolarlo: aggiungere al loader scarichi (`typeCode out`) con `work_order_id`, oppure registrarne uno da UI quando si introdurrà l'azione "scarica su ordine".
