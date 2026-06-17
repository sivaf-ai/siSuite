# DONE — Blocco A-bis · Field Builder (Impostazioni › Campi personalizzati)

Data: 17/06/2026. Il backend CRUD `field_definition` esisteva già (GET/POST/PATCH/DELETE con protezione righe di sistema via RLS, dedup, `settings:manage`). La pagina `CustomFieldsSettings` esisteva ma parziale. Completato secondo brief Parte 8 A-bis.

## Decisione di permesso
Il brief chiedeva un nuovo permesso `field_definition:manage`. **Usato invece `settings:manage`** (già nel catalogo, grant Owner): evita una migrazione + ri-bootstrap permessi e copre esattamente lo stesso ruolo (admin del tenant). Documentato qui come deviazione consapevole.

## Shared
- `fields.ts`: `createFieldDefinitionSchema` + `placeholder` (i18n) e `active`. `FieldDefinitionDto` + `active?`.

## Backend
- `fields.ts`: `mapRow` espone `active`; nuova `loadAllFieldDefs` (include i campi **disattivati**, per il builder).
- `routes/fieldDefinitions.ts`:
  - GET `?manage=1` (solo con `settings:manage`) → usa `loadAllFieldDefs` (mostra anche gli inattivi). Senza `manage`, resta `loadFieldDefs` (solo attivi, per i form).
  - POST/PATCH ora gestiscono `placeholder` e `active`.

## Frontend
- `CustomFieldsSettings.tsx`:
  - Selettore entità ora include **Ordine di lavoro** (`work_order`) e **Sito** (`site`) oltre a commessa/attività/asset/risorsa/materiale/soggetto.
  - Lista usa `?manage=1` (mostra i campi disattivati con badge "disattivato"). **Righe cliccabili** → editor (v2: niente icone-azione sulle righe).
  - Drawer editor: chiave, **etichetta IT/EN/ES**, tipo, unità, **segnaposto (IT)**, **testo di aiuto (IT)**, gruppo, ordine, obbligatorio, **toggle Attivo**, opzioni (per select/multiselect) e **Anteprima live** (rende il campo con il componente `Field`). **Elimina** nel footer del Drawer.

## Test (curl, owner@fibra.demo)
- `entity=work_order&manage=1` → 5 campi fibra di sistema (DoD ✓).
- POST campo tenant su `company` → creato; appare nel form. PATCH `active:false` → sparisce dal GET form-mode, resta nel GET `manage=1` con `active=false` (toggle senza footgun). DELETE 204.
- Typecheck shared+backend+frontend puliti; backend riavviato.

## DoD
- [x] Apri Campi personalizzati → seleziona "Ordine di lavoro" → vedi i 5 campi fibra (di sistema, read-only).
- [x] Aggiungi un campo tenant → compare nella scheda dell'entità (EntityForm/AttrBoxes leggono `/field-definitions`).
- [ ] (Verifica a video) anteprima live + toggle attivo.
