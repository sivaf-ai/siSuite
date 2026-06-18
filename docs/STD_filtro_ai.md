# STANDARD — Filtro AI-first delle liste (linguaggio naturale + voce + set salvati)

Data: 18/06/2026. Nuovo standard per TUTTE le liste `EntityList`. Si attiva dal pulsante **AI (✨)** della toolbar.

## Esperienza utente
1. L'utente apre **Filtro intelligente** (pulsante ✨) e **scrive O DETTA A VOCE** in linguaggio naturale: es. «clienti di Bergamo senza P.IVA».
2. L'AI **interpreta** il testo e lo traduce in **condizioni** sui campi della lista (chip mostrati, rimovibili).
3. **Applica** → la lista si filtra subito. Compare un chip «Filtro: … · N risultati ✕».
4. **Salva** → l'utente dà un nome al filtro; viene memorizzato **per-utente**. La prossima volta lo **ricarica** dal pannello (o lo elimina).

## Tecnica
- **Backend** `routes/listFilter.ts`:
  - `POST /ai/list-filter` `{entity, query, fields:[{key,label}]}` → `{description, conditions:[{field,op,value}]}`. Usa l'LLM (Anthropic, chiave server-side); **fallback deterministico** (cerca il testo su tutti i campi) se manca `ANTHROPIC_API_KEY`. Operatori: contains/equals/not_equals/empty/not_empty/gt/gte/lt/lte/is_true/is_false. Nessun PII nei log.
  - `GET/POST/DELETE /filter-presets` → set di filtri salvati per-utente (**migrazione 035** `filter_preset`, RLS: ognuno vede solo i propri).
- **Frontend**:
  - `ui/AiFilterPanel.tsx`: input testo + **microfono** (riusa `useVoiceCapture`) + Interpreta + chip condizioni + set salvati (carica/elimina) + Pulisci/Salva/Applica.
  - `lib/listFilter.ts`: `matchConditions(...)` valuta le condizioni **client-side** sui valori delle colonne (gli stessi `value` dell'export → etichette/valori localizzati). Campo speciale `__any` = cerca su tutti i campi.
  - `ui/EntityList.tsx`: il pulsante ✨ apre il pannello; il filtro si applica a `viewRows`; chip «Filtro attivo» con conteggio e ✕.

## Test (reale, ANTHROPIC_API_KEY presente)
- `POST /ai/list-filter` «clienti di Milano senza piva» → `[{city contains Milano},{vat empty}]` (l'AI ha mappato correttamente "senza piva" → vat vuoto). `filter-presets` save/list/delete OK. Typecheck shared+backend+frontend puliti.

## Builder manuale (oltre all'AI) — aggiunto 18/06
Il pannello (pulsante ✨) ora ha DUE livelli:
1. **AI** in alto (NL + voce) — invariato.
2. **Builder manuale**: righe **campo · operatore · valore** su TUTTI i campi dell'entità; operatori: contiene/uguale/diverso/>/≥/</≤/è vuoto/valorizzato/sì/no; **logica E (tutte) / O (almeno una)**; «Aggiungi condizione». L'AI **precompila** le stesse righe, che l'utente può rifinire a mano.
Il set salvato (`filter_preset.payload`) contiene `query`, `conditions`, `mode`. `lib/listFilter.matchConditions(..., mode)` valuta in AND/OR.

## Server-side (18/06) — filtra TUTTI i dati, non solo la pagina
Il filtro è ora applicato **lato server** sulle liste paginate. Architettura:
- **Backend** `filterSql.ts` `buildFilter(rawJson, FIELD_MAP, ANY_TEXT, params)` → frammento SQL WHERE sicuro (cast numerici/booleani protetti, ILIKE per testo, AND/OR). Ogni endpoint lista accetta `?filter=<json>` e definisce la sua `FIELD_MAP` (key del client → espressione SQL) e i campi testuali per `__any`.
- Endpoint wired: companies, resources, materials, assets, engagements, activities(globale), work-orders, users, roles, price-list-items, work-lines. Il filtro incide su `total` + righe (le viste/chip restano conteggi indipendenti).
- **Frontend**: `EntityList` con prop `onFilterChange` entra in **modalità server** (niente filtro client); la pagina mette `&filter=` nella query. Senza `onFilterChange` resta client-side (es. Rapportini che carica tutto).
- **Chiavi coerenti**: le key di `exportFields` (client) = le key della `FIELD_MAP` (server).
- **Limiti noti**: campi calcolati (giacenza, conteggi, label tipo) e PII (intestatario) non sono mappati server-side; alcuni campi enum filtrano sul valore RAW della colonna (es. `type=build`, non "Realizzazione"). L'AI di norma produce già i valori giusti.

## Test (reale)
- companies: nome contiene «Fiber» → 1; OR (Sirti|Open) → 2; vat vuoto → 7. engagements type=build → 2. listino code contiene «B-» → 8. Builder E/O + voce + preset OK.
