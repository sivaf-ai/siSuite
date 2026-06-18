# DONE_2 — i18n tre lingue + Glossario per-tenant (propagazione)

> Blocco 2 del PIANO. Stato Blocco 0: infrastruttura già in piedi (catalogo 3 lingue, `term_override` mig 007, backend GET/PUT, `TerminologySettings`), ma **`terms.*` usato ~0 in UI → la propagazione non funzionava** (il bug del DoD). Questo blocco fa funzionare la propagazione e fa il retrofit delle schermate flagship.

## Cosa ho fatto

### 1. Meccanismo di propagazione (il cuore)
Le label **di dominio** ora referenziano le chiavi `terms.*` via **nesting i18next `$t(...)`**, quindi un override del tenant si propaga ovunque al re-render.
- Cataloghi `it-IT/en/es-AR`: le voci di menu di dominio puntano ai termini — es. `nav.engagements: "$t(terms.engagement_plural)"`, `nav.companies: "$t(terms.party_plural)"`, `work-orders`, `materials`, `resources`, `assets`, `work-lines`, `captures`, `companies-customers/suppliers/operators`, e `navsec.commesse`.
- Aggiunti i termini **`work_order`/`work_line`** (sing+plur) e `masterdata_plural` in tutte e 3 le lingue.
- `i18n/index.ts` → `refreshTerminology()` riscritta: (1) **ripristina i default bundled** per tutti i `terms.*` prima di applicare gli override (così la rimozione di un override torna al default senza reload), (2) applica gli override del tenant, (3) **emette `languageChanged`** per forzare il re-render dei `$t()` annidati.

**Prova runtime** (i18next reale, no browser):
```
PRIMA  nav.engagements = Commesse
[override terms.engagement_plural = "Progetti"]
DOPO   nav.engagements = Progetti
DOPO   navsec.commesse = Progetti
CTRL   nav.work-orders = Ordini di lavoro   (invariato → nessun effetto collaterale)
```

### 2. Glossario sovrascrivibile esteso
- `shared/admin.ts`: `TERM_KEYS` da 18 → **28** (aggiunti `party, customer, supplier, operator, partner, masterdata, work_order, work_line, site`). Nuovo `TERM_GROUPS` (Anagrafiche / Lavoro / Risorse e catalogo / Operativo e AI) per la UI.

### 3. UI Glossario (Impostazioni › Terminologia) rifatta
`TerminologySettings.tsx`: termini **raggruppati**; **pulsante ↺ "Ripristina default"** per singolo termine (attivo solo se overridden); **anteprima LIVE** (riquadro Menu/Titolo lista/Scheda che cambia mentre digiti, prima ancora di salvare). Salvataggio invariato (PUT con singolare vuoto = DELETE override lato backend).

### 4. Retrofit titoli lista + label scheda (flagship)
Collegate a `t('terms.*')` le schermate di dominio principali (lista + scheda):
- **Soggetti** (`party`), **Commesse** (`engagement`), **Ordini di lavoro** (`work_order`), **Articoli** (`material`), **Risorse** (`resource`), **Asset** (`asset`), **Attività** (`activity`), **Lavorazioni** (`work_line`).
- Cambiati: titoli lista, viste-ruolo dei Soggetti (Clienti/Fornitori/Gestori/Partner), back-label e parola-tipo nelle schede, `noun` passato a `useEntityActions` (messaggi conferma). **Non toccati**: dati, codici, valori cella, azioni generiche (Salva/Annulla), label di campo (vengono già dai `field_definition` i18n).

## Verifica
- `tsc --noEmit` **shared + frontend**: pulito.
- 3 cataloghi JSON validi.
- Propagazione provata a runtime (sopra).
- **Da fare sul PC test** (3 lingue + rename): cambia lingua utente → menu/liste/schede cambiano; Impostazioni › Terminologia (IT) rinomina *Commessa→Progetto* (sing+plur) → menu, titolo lista Commesse e header scheda mostrano "Progetto/Progetti"; en/es-AR restano default; ↺ ripristina.

## Aperto (retrofit residuo — non blocca il DoD core)
Restano stringhe IT hardcoded in: **header colonne**, **tooltip toolbar** (in `EntityList`: "Modifica/Duplica/Esporta/Elimina"), **label di box/sezione** non-dominio, **messaggi/dialoghi**, e schermate minori (rapportino, pivot, DDT, magazzino — quest'ultimo arriva col Blocco 3). Sono ~centinaia di stringhe generiche: vanno spostate sotto chiavi `common.*`/`actions.*` progressivamente. Il **valore-demo** (rename di dominio che si propaga su menu/liste/schede) è però già soddisfatto.

*Fine Blocco 2 (parte propagazione + flagship). Retrofit generico residuo: incrementale.*
