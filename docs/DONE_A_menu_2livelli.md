# DONE — Blocco A "vero" (parte 1/2) · Navigazione a 2 livelli + modello Party (Soggetto)

> Data: 16/06/2026 · Chat POWERCOM v2.2 · Riferimento: `BRIEF_MASTER_Claude_Code_POWERCOM_v2_2_01.03.md` (Parti 4, 6, 8) + `ADR-0005`.
> **Checkpoint:** mi fermo e mostro a Ricardo. Parte 2/2 (estrazione componenti) parte subito prima del Blocco C.

## 1. Incongruenze trovate e risolte (tutte banali, in linea con le decisioni/ADR)
1. **`companyRoleEnum` non aveva `operator` (Gestore).** Lo schema `company_role.role` è `text` libero, ma lo Zod condiviso ammetteva solo `customer/supplier/partner`. Il modello Party (Parte 4 + ADR-0005) richiede **Gestore** → aggiunto `'operator'` (additivo). *Esempio:* ora un soggetto può avere ruolo "Gestore" e comparire nella vista Gestori.
2. **Parte 8 cita "Aziende" nel menu, ma Parte 4 + Decisione 9 + ADR-0005 dicono "Anagrafiche/Soggetto".** Seguita la decisione autorevole: hub **Anagrafiche**, scheda **Soggetto**, viste **Clienti/Fornitori/Gestori**.
3. **Permesso `pii:read:contact` (Decisione 6.2)** ha un formato a 3 segmenti (funziona come stringa). È accoppiato al `data_scope` del Tecnico (Decisione 6.3) che il brief assegna al **Blocco C** → lo implemento lì insieme al data_scope (telefono in chiaro al Tecnico, nome/CF mascherati). **Annotato, non urgente.**

Verifica schema effettuata: `material` non ha colonne `category/min_stock/item_type` (→ migrazione 030 confermata nel Blocco C); `asset.company_id` è **NOT NULL** (→ conferma Decisione 6.6: niente riga asset all'installazione); nessuna `asset.site_id` (→ migrazione 031 nel Blocco C-bis).

## 2. Cosa ho fatto (parte 1/2 del Blocco A)

### 2.1 Modello menu a 2 livelli (mock 43) — `packages/shared/src/nav.ts`
Nuova struttura dati **Sezione (rail L1) → Gruppo (con caption) → Voce**, raggruppata in **Lavoro · Dati · Sistema**. Sezioni: Cruscotto, Commesse, Campo (con **Ordinativi FTTH**, tag *fibra*), Magazzino, Finanza & Budget, **Anagrafiche**, Impostazioni, Amministrazione. Ogni voce dichiara il permesso richiesto; `visibleNav(permessi)` filtra sezioni/gruppi/voci; `siblingTabs()` calcola le voci "sorelle"; `allNavItems()` alimenta la ricerca. Le voci non ancora pronte sono **PRESTO** (visibili ma disabilitate). `menu.ts` resta per la tab bar mobile.

### 2.2 AppShellNav2 — `packages/frontend/src/shell/AppShell.tsx` (+ `theme/nav2.css`)
Shell desktop a 2 livelli, fedele al mock 43:
- **Rail L1** scuro, **collassabile a sole icone** e **persistente per utente** (localStorage).
- **Sub-panel L2** a flyout: gruppi con caption, voci con icona; chiude dopo la scelta o con ✕.
- **Topbar** con **omnibox ⌘K** (ricerca voci di menu + slot AI placeholder per il Blocco F; mostra i **Recenti** quando vuoto), campanella notifiche, tema, logout.
- **Sibling tab bar** in cima alla pagina (es. in *Campo*: Ordinativi · Agenda · Rapportini · …).
- **Preferiti** (★ per-utente) + **Recenti** (per-utente). 
- **Mobile invariato:** sotto 768px resta la tab bar in basso (shell L1/L2 nascosta via CSS).

### 2.3 Route guard RBAC
Ogni rotta ha un permesso minimo: senza permesso, l'URL **reindirizza** alla home (non è raggiungibile a mano). La barriera vera resta API+RLS; questo è il filtro UI richiesto dal DoD.

### 2.4 Modello Party (Soggetto) — Decisione 9 + ADR-0005
- **i18n** in 3 lingue (it/en/es-AR) per: hub *Anagrafiche/Master data/Maestros*, scheda *Soggetto/Party/Tercero*, ruoli *Cliente/Fornitore/Partner/Gestore* e *Sito*, più tutte le voci di menu e le stringhe della shell.
- La lista soggetti (`/companies`) ora si intitola **"Soggetti"** e accetta **`?role=`**: `/companies?role=customer|supplier|operator` = viste **Clienti/Fornitori/Gestori** (filtro server-side via `company_role`). Etichette "Azienda" → "Organizzazione"; "Nuovo cliente" → "Nuovo soggetto".
- Backend: `GET /companies?role=…` filtra per ruolo (nuovo). `companyRoleEnum` include `operator`.

## 3. Come l'ho verificato
- **Typecheck pulito** su shared + backend + frontend (`tsc --noEmit`).
- **Compile dev** OK: AppShell + nav2.css trasformati da Vite senza errori; backend riavviato e in ascolto; nessun errore runtime nei log.
- **Smoke test API**: `GET /companies?role=customer` → 3, `?role=operator` → 0 (nessun gestore ancora: atteso). Login owner@fibra.demo OK.
- **Visivo**: da fare al checkpoint (vedi §5). ⚠️ Gli **screenshot** richiesti dalla Parte 0 non li ho potuti generare in autonomia (manca un browser headless nel mio ambiente): li allego appena disponibile lo strumento, oppure li catturi tu seguendo il §5.

## 4. Deviazioni / scelte (con motivo)
- **Blocco A in 2 parti.** Parte 1 (questo report) = navigazione 2 livelli + Party + guard + i18n (la parte **visibile e demo-critica**). Parte 2 = **estrazione componenti** `ObjectPage/ObjectBox/RelatedTabs` + `EntityList` (pick modes) e ri-puntamento di Ordinativi. **Perché dopo:** è un refactor "interno" non verificabile visivamente da me ora, e rischierebbe di regredire la maschera Ordinativi (Blocco B) che devi ancora validare. Lo faccio **subito prima del Blocco C**, dove i componenti estratti vengono *provati* costruendoci sopra la lista/scheda di C (e Ordinativi viene re-innestato in parallelo). Fino ad allora Ordinativi resta funzionante "inline".
- **Selettore densità**: il brief (Parte 4) lo vuole **solo** in Impostazioni; oggi compare ancora in qualche toolbar di lista (pre-esistente). Lo accentro in Impostazioni nella parte 2/Blocco B-bis. *Annotato.*
- Le voci di menu non ancora implementate (Movimenti, Inventario, Documenti magazzino, Budget, Preventivo-consuntivo) sono marcate **PRESTO** per fedeltà al mock senza link morti.

## 5. Come provare (browser desktop) — checklist DoD Blocco A
1. `http://localhost:5173` → login **owner@fibra.demo / Demo123!**.
2. **Rail L1**: clic sulla freccia in alto a sx → si **collassa a icone** e resta così anche dopo refresh.
3. **Sub-panel L2**: clic su **Campo** → si apre il pannello con i gruppi (Operatività: Ordinativi FTTH *fibra*, Agenda, Rapportini; Tempi & presenze; Cattura). Max **2 click** per arrivare ovunque.
4. **Sibling tab bar**: dentro Campo, in cima alla pagina, le tab sorelle (Ordinativi · Agenda · Rapportini …).
5. **Omnibox**: premi **⌘K / Ctrl+K** → cerca "ordinativi" → invio → ci arrivi. Vuoto = mostra i **Recenti**.
6. **Preferiti**: passa il mouse su una voce nel sub-panel → clic sulla **★** → compare la sezione **Preferiti** in cima al rail.
7. **Anagrafiche → Soggetti**; nelle "Viste per ruolo": **Clienti / Fornitori / Gestori** (titolo e filtro cambiano).
8. **Route guard**: con un utente senza un permesso, l'URL diretto della relativa pagina **rimanda alla home**.

## 6. File toccati
- Shared: `nav.ts` (nuovo), `index.ts` (export), `entities.ts` (`operator` nell'enum).
- Frontend: `shell/AppShell.tsx` (riscritto, 2 livelli + omnibox + guard), `theme/nav2.css` (nuovo), `ui/icons.ts` (resolver `iconByName`), `pages/ClientiPage.tsx` (Soggetti + viste ruolo), `i18n/{it-IT,en,es-AR}.json` (nav + Party).
- Backend: `routes/companies.ts` (filtro `?role=`).

## 7. Parte 2/2 — Estrazione componenti (COMPLETATA, 16/06 sera)

Estratti i componenti riusabili e **ri-puntata** la maschera Ordinativi su di essi (niente più markup inline). Block A ora è **completo**.

- **CSS neutro**: `pages/ordinativi.css` (scope `.wo`) → `theme/datapages.css` (scope **`.dsx`**), riusabile da qualunque entità. Vecchio file rimosso.
- **`ui/EntityList.tsx`** — archetipo LISTA: titolo, viste, toolbar a icone (left/right actions), righe a 1/2 livelli, paginazione, stati vuoto/loading/errore, **`mode: manage | pick-single | pick-multi`** (selezione = numero, per il riuso in pop-up nel Blocco C).
- **`ui/ObjectPage.tsx`** — archetipo SCHEDA: **`ObjectPage`** (header sticky + Salva/Annulla + code pill + StatusPill), **`ObjectBox`** (titolo nel bordo + azione AI opzionale), **`RelatedTabs`** (tab correlate in fondo).
- **Ri-puntati**: `OrdinativiPage` → `EntityList`; `OrdinativoDetailPage` → `ObjectPage/ObjectBox/RelatedTabs`. Stesse classi/markup → **parità visiva** attesa.
- **Verifica**: typecheck pulito (shared+backend+frontend); tutti i moduli compilati da Vite (200), nessun errore runtime.

> ⚠️ **Da confermare al checkpoint:** che la maschera **Ordinativi** (lista + scheda) appaia **identica** a prima del refactor (l'ho ri-puntata senza poter fare screenshot). È il gate prima di costruirci sopra il Blocco C.

**Resta (piccolo)**: accentrare il selettore densità in Impostazioni (oggi ancora in qualche toolbar) — lo faccio nel Blocco B-bis.

## 8. Prossimo passo → Blocco C
Articoli & seriali (mock 45) costruito **sui componenti estratti**: migrazione **030** (material fields), ciclo di vita seriale (`in_stock→assigned→installed…`), `data_scope` Tecnico (suo furgone) + **`pii:read:contact`** (telefono in chiaro / nome+CF mascherati), segreti seriali cifrati + reveal gated, parco installato letto dai seriali.
