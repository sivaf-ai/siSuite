# DONE_motore_1 — Motore comune (FieldChooser · SavedHeader · FloatingPopover)

> Blocco 1 del `PIANO_motore_liste_e_magazzino`. I tre mattoni condivisi del motore "liste & azioni", replicati 1:1 dal mockup **`55_web_ordina_v1_0_01_04.html`** (struttura del pop-up + selettore a due aree + striscia salvataggi), usando i design token dell'app.

## Componenti creati
- **`ui/FloatingPopover.tsx`** (§1.3) — backdrop tenue + finestra modale centrata in alto (`.eng-backdrop`/`.eng-pop`), testata con icona+titolo+X, slot `saver`/`footer`, chiusura su click esterno / X / **Esc**. Non sposta né ridisegna la lista sottostante. Variante `wide` (per Report).
- **`ui/SavedHeader.tsx`** (§1.2) — striscia "salva / carica / elimina" identica (`.eng-saver`): `<select>` dei salvati + Elimina + Salva (con `PromptDialog` per il nome). Presentazionale: lo storage lo passa chi la usa.
- **`ui/FieldChooser.tsx`** (§1.1) — IL selettore di campi a due aree:
  - **scelti** (alto): righe con numero priorità, **drag&drop** + **▲▼**, **✕**, e — solo `mode='sort'` — toggle **↑Crescente/↓Decrescente**;
  - **tutti i campi** (basso): **ricerca** + elenco **raggruppato per sezione**, clic = aggiungi (campo già scelto = disabilitato).
  - Modalità: `sort` · `columns` · `export` · `report-show` · `report-sum` (solo numerici) · `report-group`. Props: `fields` (`{key,label,group?,numeric?}`), `mode`, `value` (`{key,dir?}[]`), `onChange`.
- **`theme/engine.css`** — classi del motore (scoped `eng-*`) portate dal mockup 55 sui token `variables.css`.

## Scelta tecnica (segnalata)
Il piano §1.4 indica "campi da `field_definition`". Ma le **colonne base** (es. Ragione sociale, Tipo, Data creazione) **non** sono in `field_definition` (sono colonne reali, non attributi). Quindi il `FieldChooser` riceve la **lista completa** = colonne base + `field_definition` del tenant, composta da `EntityList` (come già avviene per l'export). È l'unico modo per avere *tutti* i campi; non cambia il prodotto, è correttezza.

## Verifica
- `tsc --noEmit` frontend: pulito.
- Componenti isolati, non ancora cablati (zero impatto finché non usati) → wiring nei blocchi 2/3/4/5.

## Prossimo
Blocco 3 (Ordina) e 4 (Colonne/Export) cablano il motore in `EntityList` (si propaga a tutte le liste); Blocco 2 (Filtro Gruppo, mockup 54_v1_3), Blocco 5 (Report, mockup 56), Blocco 7 (Magazzino CRUD).
