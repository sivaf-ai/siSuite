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

## Nota / evoluzione
- Il filtro è **client-side** sulle righe caricate (pagina corrente). Per dataset grandi conviene poi portarlo **server-side** (tradurre le condizioni in query): l'`op`/`field` sono già strutturati per farlo. I **Filtri manuali** (pulsante imbuto) restano disabilitati per scelta, da definire in seguito.
