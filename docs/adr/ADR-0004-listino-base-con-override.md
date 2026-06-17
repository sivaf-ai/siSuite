# ADR-0004 — Listino base con ritocchi (override prezzo per gestore/commessa)

- Stato: **Accepted** (15/06/2026, chat 01.03)
- Scelta utente: **listino-base-con-ritocchi**.
- Moduli toccati: Listino/Produzione, Anagrafiche (gestori), Commesse

## Contesto
Nel mondo fibra ogni gestore (Sirti, Open Fiber, FiberCop…) ha il proprio tariffario sulle stesse voci di capitolato. Serve un prezzo base ma con possibilità di ritocco per cliente/commessa.

## Decisione
- `price_list` (listino madre + eventuali listini) + `price_list_item` (voce di capitolato con **cost_price** e **revenue_price**) + `price_list_override` (ritocco di una voce per `company` o `engagement`).
- Risoluzione del prezzo: **override più specifico** (commessa, poi gestore) → altrimenti la **voce base**.
- È lo stesso pattern "sistema + override" già usato per `lookup_value`/`lookup_override`.

## Opzioni considerate
- **A — un listino unico aziendale**: semplice ma non gestisce tariffe diverse per gestore. Scartata.
- **B — base + ritocchi** (scelta): aderente alla realtà contrattuale fibra; riusa un pattern noto, niente codice nuovo da inventare.

## Conseguenze
- (+) Tariffe per gestore/commessa senza duplicare il catalogo.
- (+) Coerenza con il pattern override esistente → curva di apprendimento nulla per il team.
- (−) La risoluzione del prezzo "più specifico" va implementata una volta (funzione/SQL) e riusata ovunque (lavorazioni, preventivi).
