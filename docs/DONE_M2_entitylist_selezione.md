# DONE — EntityList v3: testata su una riga + selezione + toolbar standard (allineamento al mockup "Aziende")

Data: 18/06/2026. Richiesta di Ricardo: avvicinare le liste al mockup disegnato con Claude AI — eliminare la riga-titolo doppia, mettere le viste a destra del titolo, e aggiungere le funzioni standard (modifica/duplica/elimina/esporta) con checkbox di selezione e regole d'abilitazione.

## Motore (una volta sola → si propaga a tutte le liste)
- **`ui/EntityList.tsx`**:
  - **Testata su UNA riga** (`lhrow`): titolo+sottotitolo a sinistra, **viste a destra**. Niente più riga-titolo duplicata.
  - **Checkbox per riga + checkbox di testata** (seleziona tutti / indeterminato). Riga cliccata sul corpo → apre la scheda; click sulla checkbox → seleziona (non naviga).
  - **Azioni standard dipendenti dalla selezione**: 0 sel → solo Nuovo; **1 sel → Modifica · Duplica · Esporta · Elimina**; **>1 sel → Esporta · Elimina** (modifica/duplica disabilitati). Badge contatore selezione.
  - **Modifica** = apre la riga (default `onRowClick`). **Esporta** = Excel (.xlsx) dalle colonne con `value` (helper `lib/xlsx`). **Elimina/Duplica** via handler della pagina, con conferma per l'elimina.
  - Nuovi prop: `selectable`, `onEdit`, `onDuplicate`, `onDelete`, `onExport`/`exportName`, `onSelectionChange`, `clearSelectionToken`. `ListColumn.value?` per l'export. Le modalità pop-up `pick-single/pick-multi` restano invariate.
- **`ui/useEntityActions.ts`** (nuovo): hook che dà `onDelete`/`onDuplicate` standard (DELETE per riga + reload; POST di copia) → wiring minimo per pagina.
- **`components/Page.tsx`**: `title` ora opzionale → le liste non passano il titolo (niente IonHeader) così **non si ripete il titolo** su una riga in più.
- **`theme/datapages.css`**: `.lhrow`, colonna `.chk` (checkbox accent brand), `.tib.danger` (elimina rosso), `.selcount` (badge), viste a destra.

## Pagine aggiornate (titolo singolo + checkbox + toolbar standard)
- **Anagrafiche**: Soggetti/Clienti/Fornitori/Gestori (`ClientiPage`), **Risorse**, **Materiali**, **Asset**, **Listino voci**.
- **Entità**: **Ordini di lavoro** (azioni bulk custom Assegna/Importa CSV ora sulla selezione standard), **Commesse**, **Attività**, **Utenti**, **Ruoli**, **Rapportini**, **Lavorazioni**.
- Tutte: Modifica (apre scheda), Elimina (1+), Esporta xlsx (1+); Duplica dove sensato (Soggetti/Risorse/Materiali/Asset/Listino/Commesse/Attività/Ruoli). Tutto gated da permessi.

## Backend
- `routes/prices.ts`: aggiunto **`DELETE /price-list-items/:id`** (hard delete; se referenziata da lavorazioni → disattiva). Mancava.

## Test
- Typecheck shared+backend+frontend puliti. `DELETE /price-list-items/:id` → 204 (voce rimossa). Frontend serve (200). Backend riavviato.

## Note / da decidere
- **Duplica** omesso dove l'identità è univoca/complessa (Ordini di lavoro: rif. esterno univoco; Rapportini/Utenti). Si può aggiungere se serve.
- **Saved views** ("Salva" vista del mockup) non implementato (le viste sono predefinite per entità).
- Restano su griglia VECCHIA (DataTable, non ancora EntityList): **Foglio ore**, **Assenze**, **Magazzino** (giacenze/movimenti/documenti/ubicazioni). Se vuoi le porto allo stesso standard.
