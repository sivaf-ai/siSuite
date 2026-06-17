# DONE — Blocco M · Asset → EntityList + ObjectPage v2

Data: 17/06/2026.

## Shared
- `entities.ts`: `AssetDto` + `siteId`/`siteName`; `createAssetSchema.siteId` (uuid nullable opzionale).

## Backend
- `routes/assets.ts`: SELECT con join `site` (site_id/site_name); INSERT/UPDATE gestiscono `site_id` (update: valorizza se passato, azzera se `null` esplicito, mantiene se assente).

## Frontend
- `pages/AssetPage.tsx`: riscritta da `CrudList` a `EntityList`. Righe a 2 livelli (Asset/tipo, Cliente/sito, Installato). Click riga → `/assets/:id`.
- **Nuova `pages/AssetDetailPage.tsx`** (ObjectPage `<Page bleed>`): Anagrafica (etichetta/tipo/cliente/**selettore Sito** popolato dai siti del cliente/installazione) + box da `field_definition` (entity asset) via `AttrBoxes`. Archivia in fondo. Rotta `/assets/:id` aggiunta in AppShell.

## Test
- `GET /assets` ok (siteName presente nel DTO). Typecheck shared+backend+frontend puliti.

## Checklist visiva
- [ ] Lista → scheda; selettore Sito attivo solo dopo scelta cliente; salva con sito.
