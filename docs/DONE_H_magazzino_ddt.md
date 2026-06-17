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

## Seed scarichi su ordine (aggiunto 17/06)
- `demo/runner.ts`: per ogni materiale `consumed` di un work_order ora viene inserito anche un **`stock_movement` 'out'** (segno negativo) con `work_order_id`, sull'ubicazione predefinita. Così il tab "Materiali scaricati" mostra dati in demo. Verificato dopo wipe+load: 5 scarichi su ordini (es. Cavo drop −28m, Connettore SOC −2pz). Demo ricaricata.
