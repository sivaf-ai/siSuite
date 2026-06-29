# ADR-0003 — Palette colori "C — Ponte" (design tokens)

- **Stato:** Accettato · **Data:** 28/06/2026 · **Chat:** 01.05
- **Destinazione repo:** `docs/adr/ADR-0003-palette-C.md` + `packages/frontend/src/styles/tokens.css`
- **Numero provvisorio:** allineare alla sequenza ADR reale.

## Contesto
Tre proposte (A "Prodotto" viola, B "SIVAF" bordeaux pieno+ambra, C "Ponte" bordeaux+ciano). Obiettivo: identità di prodotto premium 2026 + aderenza al brand Si.Va.F., con una semantica chiara "azione vs AI". Vista applicata a tre maschere intere (WBS, scheda, albero) e approvata.

## Decisione
Adottare la **Palette C "Ponte"** come standard. Token vincolanti:

```css
:root{
  /* Primario / azioni (brand SIVAF) */
  --brand:#801E1D; --brand-press:#B91620; --brand-wash:#F6E9E9; --brand-ink:#5E1615;
  /* Accento / AI / dati */
  --flow:#1FC8C2; --flow-ink:#0E7F7A; --flow-wash:#DEF7F5;
  /* Stati */
  --success:#13A06B; --success-wash:#E0F4EC;
  --warning:#D9912A; --warning-wash:#FBF0DA;
  --danger:#E8552D;  --danger-wash:#FCEAE2;   /* corallo: NON bordeaux, per non confondersi col primario */
  --info:#3B82F6;    --info-wash:#E6EFFE;
  /* Neutri */
  --ink:#1B1D24; --ink-soft:#5C616E; --ink-faint:#8A8F9B;
  --paper:#F3F5F8; --card:#FFFFFF; --line:#E5E8EE; --line-2:#EEF0F4;
  /* Tipografia */
  --font-display:"Bricolage Grotesque",system-ui,sans-serif;
  --font-body:"DM Sans",system-ui,sans-serif;
  --font-mono:"DM Mono",ui-monospace,monospace;
}
```

**Semantica d'uso (vincolante):** il **bordeaux** è il colore dell'**azione** (pulsanti primari, selezione, brand); il **ciano** è il colore dell'**AI e dei dati** ("l'AI propone in ciano, lo strato deterministico conferma in bordeaux"). Il **danger** è **corallo** `#E8552D`, mai una tinta di rosso vicina al bordeaux.

## Conseguenze
- **+** Identità coerente e distintiva; mappatura cromatica chiara azione/AI.
- **+** Allineata a `base.css v5` (sostituisce i token colore precedenti).
- **−** Va propagata ovunque i vecchi token colore fossero hardcoded → un passaggio di pulizia (clean-slate).

## Alternative scartate
- **A (viola/ciano):** ottima come prodotto autonomo ma slegata dal brand SIVAF.
- **B (bordeaux+ambra):** forte ma meno "tech"; l'ambra compete col warning.

*Da recepire in `tokens.css`/`base.css v5`. Le 3 densità (Compatta/Comoda/Spaziosa) restano invariate.*
