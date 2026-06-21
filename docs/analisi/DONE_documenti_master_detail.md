# DONE — Documenti master-detail: Ordini d'acquisto, Pick list, DDT (chat 01.06)

**Data:** 21/06/2026 · Richiesta: gestire PO/Pick/DDT come **documenti master-detail** (testata+righe nella stessa pagina) sullo stile **Ordini di Lavoro** (NON a tab laterali), riusando la **lista Materiali in modalità selezione** per le righe. Nessuna migrazione.

## Cosa è stato fatto

### Backend (stock.ts + shared)
- **GET `/stock/documents/:id`** (testata + righe + typeCanonical/nomi magazzino/fornitore) e **PATCH `/stock/documents/:id`** (modifica bozza: testata + sostituzione righe, solo `status='draft'`). Mancavano (PO e Pick avevano già GET:id/PATCH/azioni dalla sessione precedente).
- Shared: `StockDocumentLineDto`, `StockDocumentDto` esteso (lines?, typeCanonical, sourceLocationName, destLocationName, companyName), `updateStockDocumentSchema`.

### Frontend
- **`ui/MaterialPickerDialog.tsx`** (NUOVO, keystone riutilizzabile): la STESSA lista Materiali (`EntityList` in `mode='pick-single'|'pick-multi'`) dentro un Drawer; ricerca/paginazione; ritorna i `MaterialDto` completi. Standard "una lista, ovunque".
- **`PurchaseOrderDetailPage`** (`/purchase-orders/:id|new`): ObjectPage header sticky; testata (fornitore/destinazione/date/valuta/note/stato) + righe (articolo via picker, qtà ordinata, unità, prezzo, ricevuta) + azione **"Ricevi merce"** (Drawer per-riga → POST `/receive`).
- **`PickListDetailPage`** (`/pick-lists/:id|new`): testata (origine/assegnata a/commessa/ordine di lavoro/note/stato) + righe (articolo via picker, qtà richiesta) + azione **"Conferma prelievo"** → POST `/confirm`.
- **`DdtDetailPage`** (`/stock/documents/:id|new`): testata con campi condizionali per tipo (Carico/Trasferimento/Rettifica) + righe (articolo via picker, quantità, costo) + azione **"Conferma"** → POST `/confirm`; a confermato mostra il numero (DDT/CAR-…) e diventa read-only.
- **Liste** (SpecListsPages): PurchaseOrdersPage e PickListsPage ora con row-click→scheda + "Nuovo +"; nuova **DdtPage** (`/stock/documents`). Numeri da `number_series`, mai UUID a video.
- **Routing**: rotte di dettaglio/new registrate in AppShell (perm `stock:read`; azioni interne `stock:manage`).

## Standard rispettati
Master-detail nella stessa pagina (come Ordini di Lavoro), NON RelatedTabs laterali per le righe; header sticky Salva/Annulla; righe SOLO via picker Materiali (no select); StatusPill per gli stati; niente popup nativi (Drawer/Toast).

## Verifiche
- Typecheck **shared + backend + frontend puliti**; **79/79 test backend verdi**.
- Smoke DDT: create (CAR-2026-0002) → GET:id (righe+nomi) → PATCH bozza (note+qtà) → confirm. PO receive / Pick confirm già verificati nella sessione precedente.

## Note
- Permessi: lettura `stock:read`, salvataggio/azioni `stock:manage`.
- `DocumentiPage` (vecchio drawer in MagazzinoPage) non più referenziato (sostituito dalla scheda DDT master-detail).
- Aperti minori: lotto sulle righe pick (campo lotId predisposto nello schema, UI da affinare); selezione fornitore/magazzino resta `<select>` (come "committente" in Ordini di Lavoro) — il picker è per gli articoli, come richiesto.
