# ADR-0002 — Componente generico `EntityTree` e regole UX

- **Stato:** Accettato · **Data:** 28/06/2026 · **Chat:** 01.05
- **Destinazione repo:** `docs/adr/ADR-0002-componente-entitytree.md` (immutabile dopo Accettato)
- **Numero provvisorio:** allineare alla sequenza ADR reale.

## Contesto
Categorie e Siti avevano reimplementato ciascuno la propria logica d'albero (build/render/CRUD). Serve un componente unico, riusabile per ogni tabella self-FK, coerente con lo standard delle entità non ad albero (lista → scheda), e riusabile anche come **selettore** da altre maschere.

## Decisione
1. **Un solo componente `EntityTree`**, parametrizzato per config (`entity`, `endpoint`, `permissions`, `maxDepth`, `columns`, `mode`). Vietate viste custom.
2. **Clic sulla riga → apre la scheda CRUD** (come le entità non ad albero). Chevron = espansione; checkbox = selezione; "Modifica" anche nel menu ⋯. **Niente rinomina inline.**
3. **Una sola riga di inserimento rapido**, in cima alla lista (poi si sposta). **Vietate** le righe quick-add sotto ogni ramo (rumore visivo su alberi grandi/filtrati).
4. **Spostamento doppio**: drag&drop a 3 zone (sopra/centro/sotto) sul desktop **+** "Sposta in…" (selettore, primario su mobile), entrambi con esclusione del sottoalbero (anti-ciclo).
5. **Ricerca** con evidenziazione testo, auto-espansione antenati, potatura, x per pulire.
6. **Scheda**: barra azioni in alto fissa; label nel bordo; anteprima icona/colore accanto al nome (cartella se solo colore); icona da libreria ricercabile (con **traduzione lingua→EN**) o immagine (MinIO); colore con popup HSL/HEX interno; chip AI.
7. **Modalità `pick`** (selettore da altra entità): stesso componente, checkbox→radio, `onPick(node)` restituisce il codice; consente di creare il ramo al volo e selezionarlo senza uscire dalla scheda ospite.

## Conseguenze
- **+** Zero duplicazione, UX coerente ovunque, manutenzione unica.
- **+** Il selettore "ricco" elimina i `<select>` indentati e velocizza l'inserimento.
- **−** Il componente diventa centrale e va versionato con cura (un bug impatta tutti gli alberi) → coperto dai test DoD dello standard.

## Alternative scartate
- **Viste dedicate per entità** (status quo): duplicazione, divergenze, costo di manutenzione.
- **Drag-only / picker-only**: il primo è fragile su mobile, il secondo lento per i power-user sul desktop → si tengono entrambi.

*Vedi: STANDARD_entita_albero_v1_0_01_05 §6, §6.10. Riferimento visivo: `standard_entita_albero_v1_4_01_05.html`.*
