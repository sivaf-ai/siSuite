# DONE — Blocco B-bis · Rifinitura Ordini di lavoro

Data: 17/06/2026. Backend `/work-orders/import` e `/work-orders/assign` esistevano già; mancava la UI.

## Frontend (`pages/OrdinativiPage.tsx`)
- **Selezione multipla righe**: azione "Seleziona" in toolbar → `EntityList mode='pick-multi'` (selezione = checkbox + conteggio; nessuna icona-azione sulle righe). "Esci dalla selezione" la chiude.
- **Azioni bulk** (attive solo con selezione):
  - **Assegna a squadra** → Drawer con selettore tecnico (`/resources?kind=person`) → `POST /work-orders/assign {ids, assignedResourceId}` (vuoto = rimuove l'assegnazione).
  - **Esporta selezionati** → CSV (UTF-8 BOM) dei soli ordini scelti.
- **Import CSV con editor di mapping**: Drawer → scelta commessa + file CSV → parser CSV (virgolette + separatore `,`/`;`) → **auto-mapping** per nome colonna + override manuale colonna→campo (Rif. esterno*/Indirizzo/Data/Intestatario nome/telefono) → **anteprima** prime 5 righe → `POST /work-orders/import` (dedup su committente+rif. esterno lato API).

## Densità (accentramento in Impostazioni)
- Il selettore densità (`DensityToggle`) è ora usato **solo** in `admin/GeneralSettings`. Le liste v2 (EntityList) non lo espongono più: durante il Blocco M è stato rimosso da `ClientiPage` (l'unica lista vecchia che lo aveva). Requisito soddisfatto.

## Test (curl, owner@fibra.demo)
- `POST /work-orders/import` (1 riga con intestatario) → `{created:1, duplicates:[], total:1}`. `POST /work-orders/assign` → 200. Riga di test rimossa. Typecheck frontend pulito.

## Note
- L'export "globale" (non selezione) resta placeholder; l'export selezionati copre il caso d'uso bulk.
