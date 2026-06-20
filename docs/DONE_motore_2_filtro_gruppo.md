# DONE_motore_2 — Filtro "Gruppo" (QBE sulla scheda)

> Blocco 2 del `PIANO_motore_liste_e_magazzino`. Replica del mockup **`54_web_filtro_qbe_v1_3`**: la scheda dell'entità in modalità filtro, a tutta larghezza, con freccettina ▾ per campo + pop-up galleggiante. Backend già fatto e testato (commit `38daba3`); qui il frontend + wiring.

## Frontend (`ui/FilterGroupPanel.tsx`)
- **Scheda in modalità filtro**: sezioni (`obox`) + campi (`bf/bl/bi`) identici alla scheda; l'unica aggiunta è la **freccettina ▾** (`caret`) a destra di ogni campo (piena se il campo ha un filtro attivo).
- **Scrivi e basta** nei campi testo → operatore di default `contiene`. **Clic sulla ▾** → `FloatingPopover` ancorato con: **Operatore** (pills per tipo) · **Valore** type-aware (testo / numero / **enum a chip** / **date** con date-picker / **da–a** con due input) · **Lega alle altre condizioni** (E/O segmentato, **NON**, **apri (**, **chiudi )**).
- **Frase in lingua** sticky in cima ("Soggetti dove ( Ragione sociale contiene … E … ) O NON …") con chip rimovibili, parentesi e join.
- **Parentesi: un solo livello** (come deciso). **SavedHeader** (salva/carica/elimina, `list_preset` kind=filter). Footer sticky: conteggio + Pulisci + Applica.
- Operatori per tipo: testo (contiene/è uguale/inizia/finisce/da–a/è vuoto), numero (=/>/</tra/è vuoto), enum (è uno di/non è), data (oggi/mese/anno/dopo/prima/intervallo/nell'anno). Mappati 1:1 sugli operatori backend.

## Sorgente campi (scelta tecnica già segnalata)
`EntityList` compone i campi del Gruppo = **`filterFields` (campi base, dalla pagina)** + **`field_definition` del tenant** (mappati: dataType→tipo, options→valori enum, groupKey→sezione). Così funziona con i campi custom senza codice. I valori enum sono **display↔raw** (mostra l'etichetta, filtra il valore raw).

## Wiring
- `EntityList`: nuova prop `filterFields`; azione toolbar **"Gruppo"** (icona `list-filter`, badge col numero di condizioni) che apre il pannello; applica **server-side** via `onFilterChange` (sostituisce, come filtro primario, il builder manuale). Il filtro AI/voce (`AiFilterPanel`, icona ✨) resta.
- **Soggetti** (`ClientiPage`) wired con i 13 campi base (Anagrafica/Dati fiscali/Indirizzo/Note) sulle chiavi reali `FILTER_FIELDS` del backend.

## Verifica
- `tsc --noEmit` frontend: pulito. Backend `buildFilter` già esteso + **32 test verdi** (incl. injection sui nuovi operatori). Le condizioni del Gruppo (con value2/values/join/neg/open/close) sono già nel formato che `buildFilter` consuma.
- **Da guardare a video** (Ctrl+F5, Soggetti → icona Gruppo): scheda filtro a tutta larghezza, ▾ per campo, pop-up, frase in lingua, Applica → lista filtrata server-side.

## Aperto
- **Estendere `filterFields`** alle altre liste (Articoli/Ordini/Risorse/Asset/…): metadati per-entità sulle rispettive `FILTER_FIELDS` (il motore è pronto, serve solo il prop per pagina) — parte del "anagrafiche identiche" (Blocco 8).
- **Rimuovere il builder manuale** da `AiFilterPanel` (ora ridondante col Gruppo), tenendo solo NL/voce — rifinitura.
- **Conteggi viste col filtro attivo** (residuo §2.1 / 5.3).
