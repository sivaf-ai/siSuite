# STANDARD — Toolbar liste, Export con preset, Colonne (EntityList)

Data: 18/06/2026. Funzioni standard per TUTTE le liste basate su `EntityList`.

## 1) Toolbar
- La **ricerca** è a sinistra e si **allarga** per occupare lo spazio; **tutte le azioni stanno a destra**, con il **"+" (Nuovo) per ultimo** (il più a destra). Ordine a destra: Filtri · Colonne · AI · [azioni custom] · [selezione: contatore · Modifica · Duplica · Esporta · Elimina] · [Importa…] · **Nuovo +**.

## 2) Esporta — funzione standard con preset per-utente
- Il pulsante **Esporta** (attivo con 1+ righe selezionate) apre un **popup** (`ui/FieldPicker` + `ui/ExportDialog`):
  - lista di **tutti i campi esportabili** dell'entità, **tutti selezionati** di default;
  - **riordino trascinando le righe** (drag, icona ⠿);
  - **bottoni in alto**, nell'ordine **Salva · Annulla · OK** (così non finiscono in fondo con molti campi);
  - selettore dei **preset salvati** (se presenti) per riapplicare una scelta;
  - **Salva** → chiede un **nome** e memorizza il preset (campi + ordine) **per utente** nella tabella `export_preset`;
  - **OK (Esporta)** → genera il **.xlsx** con i soli campi scelti, nell'ordine scelto, per le righe selezionate.
- Le **etichette** dei campi sono quelle **visibili in tabella** (label localizzata della colonna), non le costanti/chiavi tecniche.
- Backend: **migrazione 034** `export_preset` (RLS: ognuno vede solo i propri) + route `GET/POST/DELETE /export-presets` (`routes/exportPresets.ts`).

## 3) Colonne — mostra/nascondi e riordina
- Il pulsante **Colonne** apre lo stesso `FieldPicker`: spunta per **mostrare/nascondere** le colonne e **trascina** per **riordinarle**. La scelta è **persistita per-utente** (localStorage, per entità) e applicata subito alla tabella.

## Come si usa in una pagina (riepilogo)
- `EntityList` espone già tutto: basta che le colonne abbiano `value: (row)=>…` per essere **esportabili**, e che la pagina passi `exportName` (identificatore entità per preset/colonne). Modifica/Duplica/Elimina restano come da standard precedente (`useEntityActions`).
- I pulsanti **Filtri** e **Azioni AI** sono presenti ma **disabilitati** (in attesa di specifica funzionale — vedi sotto).

## Da definire (non spec'd da Claude AI / brief)
- **Filtri**: quali campi filtrabili e con quali operatori (uguale/contiene/intervallo/data…), e se il filtro è server-side (consigliato, con paginazione) o client-side. Serve la specifica per implementarlo bene.
- **Azioni AI**: quali azioni sulla selezione/lista (es. categorizza, deduplica, arricchisci, riassumi). Serve la specifica.
