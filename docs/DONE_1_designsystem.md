# DONE_1 — Design system (rifinitura "vernice")

> Blocco 1 del PIANO. Esito Blocco 0: il design system era già **~85% in piedi** (scala tipografica a token, `--ctrl-h` + 3 densità, gerarchia `.btn`). Questo blocco chiude i gap residui. **Solo token/classi globali, nessuna logica.**

## Stato di partenza (verificato)
- `theme/variables.css`: scala font completa e conforme al piano — `--fs-h1:22 · --fs-h2:16 · --fs-card:15 · --fs-body:13 · --fs-th:11.5 · --fs-eyebrow:10.5`. ✅ già a posto.
- `--ctrl-h`/`--input-h`/`--row-pad` con 3 densità (`compact 32` / `comfortable 36` default / `spacious 40`), commutate da `<html data-density>`; `DensityToggle`/`DensityContext` persistono in localStorage. ✅ già a posto.
- `.btn` gerarchia `primary/ghost/danger`. Problema reale: testo `.btn` a **13.5px** > body 13 → percezione "pulsanti grandi / testo grande dentro". Mancava un livello intermedio `.btn-secondary`.

## Modifiche fatte (`theme/design-system.css`)
- `.btn` font-size `13.5px → var(--fs-body)` (13): **il testo del bottone non è più grande del body** (standard 2).
- `.btn-sm` font-size `13px → 12.5px`.
- Icone lucide dentro i bottoni vincolate a **16px** (`.btn svg`) e **15px** (`.btn-sm svg`): non più grandi del testo.
- Aggiunto **`.btn-secondary`** (sfondo `--brand-wash`, testo `--brand-ink`): gerarchia primario · secondario · ghost · danger.

## Cosa NON ho toccato (e perché)
- Le ~30-40 occorrenze di `font-size` inline nei `.tsx` sono quasi tutte in **dashboard/mobile/widget** (assi grafici, timer, agenda mobile) dove la misura è legata al layout specifico, non al testo dati. Cambiarle ora è rischio senza valore: lasciate come sono. Se Sivaf vuole, si normalizzano caso per caso.
- Colori/dimensioni: nessun hardcode nuovo introdotto.

## Verifica
- `tsc --noEmit` frontend: pulito.
- CSS hot-reload via Vite (nessun restart).
- **Da guardare sul PC test** (http://localhost:5173): pulsanti su Lista/Scheda/dialoghi — testo allineato al body, icone proporzionate; il segmented Compatta/Comoda/Spaziosa cambia densità.

## Aperto
- `.btn-secondary` è disponibile ma non ancora applicato dove avrebbe senso (es. azioni "salva bozza" vs "conferma"): adozione progressiva nei blocchi successivi.

*Fine Blocco 1.*
