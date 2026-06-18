# DONE_3 — Liste legacy → standard v2

> Blocco 3 del PIANO. Foglio ore, Assenze, Magazzino erano le ultime liste sul pattern vecchio (`ui/DataTable`). Riscritte su `ui/EntityList` (+ `ui/ObjectPage` per le schede). A valle del Blocco 2, nascono già collegate al glossario dove pertinente.

## Foglio ore (`TimeEntriesPage`)
- Lista → **EntityList**. Colonne: Data, Commessa/fase, Risorsa, Tipologia (StatusPill), Durata **h:mm** (a destra), Tariffa €/h (a destra), Stato + icona lock. Viste: Tutte / Da approvare / Approvate / Bozze. Export = tutti i campi. Selezione standard.
- **Logica approvazioni PRESERVATA**: barra azioni-bulk custom (Invia/Approva/Respingi/Blocca/Sblocca su `POST /time-entries/...`), gate `time_entry:create/approve/delete`, `PromptDialog` per motivi reject/lock, `clearSelectionToken` per azzerare dopo l'azione.
- **Nuovo**: `TimeEntryDetailPage` (ObjectPage). Scheda esistente = sola lettura + elimina (non c'è update singolo lato API); `/new` = form creazione. Titolo `t('terms.time_entry')`.
- **Backend**: aggiunto `GET /time-entries/:id` (`requirePermission('time_entry:read')`). Route frontend `/time-entries/:id` in AppShell.

## Assenze (`AssenzePage`)
- Tab **Richieste** → EntityList (Risorsa, Tipo, Periodo +½, Quantità, Stato). Viste Tutte / In attesa / Approvate. Click riga → scheda. **Drawer di creazione preservato** (`POST /absences`).
- Tab **Saldi** → EntityList **sola lettura** (Risorsa, Tipo, Anno, Maturato, Goduto, Residuo a destra/mono).
- **Nuovo**: `AbsenceDetailPage` (ObjectPage): risorsa, tipo, periodo, ore, mezza giornata, note; azioni Approva (`POST /absences/:id/approve`, idempotente) + Elimina. Logica saldi/approvazione invariata.
- **Backend**: aggiunto `GET /absences/:id`. Route `/absences/:id` in AppShell.
- **Backlog segnalato** (non introdotto per non alterare la logica): la DELETE di un'assenza approvata non ripristina il saldo (`used`). Il ConfirmDialog lo dichiara.

## Magazzino (`MagazzinoPage`)
- **Tutte e 4 le tab** (Giacenze, Movimenti, Documenti, Ubicazioni) convertite da DataTable a **EntityList**, stesse colonne/dati e **tab-bar sibling** invariata.
- Giacenze: filtro ubicazione mantenuto; Giacenza ≤0 in rosso. Movimenti: sola lettura. Export su ogni tab.
- **PRESERVATO (zero rischio)**: pulsante **Conferma** sui draft (`POST /stock/documents/:id/confirm`, gate `stock:manage`) reso come render custom in colonna "Azioni" (con `stopPropagation`); **Drawer creazione documento/ubicazione** invariati; transizioni stato draft→confirmed intatte. Nessuna chiamata backend modificata.

## Verifica
- `tsc --noEmit` **frontend + backend**: pulito.
- Backend riavviato (route nuove): in ascolto :3010, pg-boss up, health 200.
- **Da fare sul PC test**: nessuna lista usa più DataTable; click riga → scheda (Foglio ore/Assenze); approvazioni e conferma documenti funzionanti come prima; export/colonne/selezione standard. Riavviare il backend se `GET /time-entries/:id` o `/absences/:id` danno 404 (già riavviato in questa sessione).

## Aperto
- Documenti magazzino: il piano prevedeva l'archetipo Documento come DetailPage dedicata; qui si è scelto di **preservare** il flusso draft/confirm esistente (Drawer + azione in colonna) per non rischiare le transizioni di stato. Portarlo su DetailPage-archetipo resta un follow-up a basso valore/alto rischio.
- Retrofit i18n delle stringhe generiche di queste tre schermate: incrementale (vedi DONE_2).

*Fine Blocco 3.*
