# DONE_4 — Export dinamico dai `field_definition`

> Blocco 4 del PIANO. Promessa metadata-driven (principio #2): i campi che il tenant aggiunge col Field Builder devono finire nell'export **senza codice per pagina**.

## Stato di partenza (verificato in Blocco 0)
- Framework export già completo: `ExportDialog` + `FieldPicker` (drag/riordino/preset per-utente, tabella `export_preset` mig 034), `lib/xlsx`, endpoint `GET /field-definitions?entity=X`.
- **Gap**: `exportFields` cablato a mano in ~12 pagine; i `field_definition` custom del tenant NON entravano in automatico nell'export.

## Modifica (mirata, in `ui/EntityList.tsx`)
Aggiunta prop opzionale **`entity?: string`** (la chiave entità dei `field_definition`). Quando presente, `EntityList`:
1. carica `GET /field-definitions?entity=<entity>` (hook `useApi`);
2. costruisce i campi export custom dai field def **attivi**, ordinati per `sequence`, **escludendo** le chiavi che la pagina ha già mappato a mano (no duplicati);
3. legge il valore da `row.attributes[key]` con la nuova helper `attrExportValue()`:
   - `select` → etichetta dell'opzione nella **lingua corrente** (`currentLocale()` + `fieldLabel`);
   - `multiselect` → etichette unite da `, `;
   - `boolean` → `Sì/No`; numeri/date → valore come memorizzato;
4. unisce `base (hardcoded) + custom` in `exportSource`, quindi i custom compaiono sia nell'`ExportDialog`/`FieldPicker` sia nel `.xlsx`.

La **label è localizzata**: cambiando lingua, l'intestazione di colonna del campo custom cambia (collegamento col Blocco 2).

## Pagine collegate (prop `entity`)
`company` (Soggetti), `material` (Articoli), `asset` (Asset), `work_order` (Ordini di lavoro), `engagement` (Commesse), `resource` (Risorse). Le altre liste si abilitano aggiungendo solo `entity="…"`.

Verificato che gli endpoint lista restituiscono `attributes` nelle righe (`companies.ts`, `workOrders.ts`, ecc.) → i valori custom non escono vuoti.

## Verifica
- `tsc --noEmit` frontend: pulito.
- **Test DoD da fare sul PC test**: Impostazioni › Campi personalizzati → aggiungi campo (es. "Note POP", testo) su **work_order** → apri Ordini di lavoro → seleziona righe → Esporta: il campo **compare** nel `FieldPicker` e nella colonna del `.xlsx`, con label nella lingua attiva. Lo stesso per gli altri 5 entity.

## Aperto
- Le pagine senza `field_definition` custom (utenti/ruoli/listino/lavorazioni) non hanno bisogno della prop; si aggiunge solo se in futuro avranno campi custom.
- Formattazione `money`/`date` nell'export resta "grezza" (valore memorizzato), coerente con un export dati; la formattazione ricca è per la UI, non per il foglio.

*Fine Blocco 4.*
