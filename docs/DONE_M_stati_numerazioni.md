# DONE — Blocco M · Stati ed etichette + Numerazioni (v2, BASSA)

Data: 17/06/2026. Pannelli di Impostazioni: sono matrici di configurazione, non entità di business → mantengono il layout a pannello ma rispettano la regola v2 "niente icone-azione sulle righe".

## Frontend
- `pages/admin/LabelsSettings.tsx`: rimosse le icone-azione per riga (Modifica/Elimina/Ripristina). La **riga è ora cliccabile** → apre il Drawer editor. Le azioni **Elimina** (voci custom) e **Ripristina default** (voci di sistema personalizzate) sono nel footer del Drawer.
- `pages/admin/NumbersSettings.tsx`: rimosse le icone-azione per riga. **Riga cliccabile** → Drawer editor; **Elimina** nel footer del Drawer.

## Test
- Typecheck frontend pulito. Endpoint `/lookups` e `/number-series` invariati.

## Nota
- Restano pannelli (non EntityList/ObjectPage piene) perché sono config per-categoria con anteprima: l'archetipo lista/scheda sarebbe peggiore come UX. Conformità v2 raggiunta sul punto critico (no row-actions, riga→editor).
