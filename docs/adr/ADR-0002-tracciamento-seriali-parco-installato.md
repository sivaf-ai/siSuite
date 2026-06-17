# ADR-0002 — Tracciamento a seriali degli apparati e parco installato

- Stato: **Accepted** (15/06/2026, chat 01.03)
- Moduli toccati: Magazzino, Ordinativi, Asset (parco installato)

## Contesto
Gli apparati FTTH (ONT, HUB6, borchia, splitter) sono pezzi unici con garanzia e a volte password. POWERCOM deve tracciare il **seriale effettivamente installato**. Lo schema aveva predisposto i **lotti** (`material.tracked_by_lot`, `*.lot_id`) ma senza tabella; la fibra però chiede **seriali**, non lotti.

## Decisione
1. Aggiungere `material.tracked_by_serial` e la tabella `stock_serial_unit` (un record per pezzo: seriale, stato, ubicazione/detentore, segreti cifrati a livello app).
2. Ciclo di vita: `in_stock → assigned → installed → faulty/returned/retired`.
3. Quando installato, il pezzo entra nel **parco installato** del cliente, collegabile ad `asset` (customer asset).
4. I **lotti** restano hook (colonne già presenti) per i consumabili a batch, non urgenti.

## Opzioni considerate
- **A — modellare i lotti ora** per riusare le colonne esistenti: non risponde al bisogno (la fibra è per-unità). Scartata.
- **B — serializzazione ora, lotti come hook** (scelta): allineata alla prassi (NetSuite/Dynamics/Salesforce: seriale per item ad alto valore/garanzia/assistenza; lotto per deperibili/regolamentati).

## Conseguenze
- (+) Tracciabilità per-unità, base per garanzia/assistenza e per il parco installato.
- (+) Differenziatore: magazzino cloud a seriali con cattura vocale.
- (−) I "secrets" (password apparato) richiedono cifratura applicativa e un permesso dedicato (`serial.secret.read`); a DB non vanno mai in chiaro.
