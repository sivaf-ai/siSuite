# siSuite — HANDOFF per nuova chat: rifacimento di tutte le maschere sugli standard v2

> **Scopo della nuova chat.** Claude rifà/crea **tutti i mockup HTML** delle maschere siSuite conformi agli standard definiti, da consegnare a **Claude Code** perché allinei il frontend. Lingua di lavoro: **italiano**. Stile richiesto: onesto e diretto, ogni scelta motivata e **confrontata coi leader di mercato**, niente piaggeria. Obiettivo dichiarato: la migliore app possibile per acquisire clienti.

---

## 1. Cosa copiare nella Knowledge (checklist)

**A. Standard & design system — OBBLIGATORI**
| File | Cos'è |
|---|---|
| `base.css` | Design system v5 — **unica fonte di verità del look** (token, 3 densità, scala font, `.num/.money/.dur/.time`, componenti). |
| `2026-06-15_STANDARD_UI_liste_e_maschere_v2.md` | **Standard VINCOLANTE** liste/CRUD/documenti (i 3 archetipi). |
| `02_navigation_menu.md` | **Standard Si.Va.F.** navigazione/menu (2 livelli). *In Google Drive (owner ai@sivaf.it). Esportare il `.md` o il `.pdf` e caricarlo.* |
| `FRONTEND_SPEC.md` | Spec frontend (componenti, EntityForm da `field_definition`, indice maschere, DoD). **Aggiornato oggi** (punta a v2 + menu + 41/42/43). |
| `2026-06-15_kickoff_Claude_Code_frontend.md` | Prompt di kickoff per Claude Code. **Aggiornato oggi.** |

**B. Riferimenti visivi (mockup canonici) — OBBLIGATORI**
| File | Archetipo che dimostra |
|---|---|
| `41_web_aziende_standard.html` | **Lista** (righe 1/2 livelli) + **selezione in pop-up** (stessa lista) + **Scheda Object Page**. |
| `42_web_ddt_carico.html` | **Documento** master-detail (testata + righe + conferma immutabile + totali contabili). |
| `43_web_menu_due_livelli.html` | **Menu a 2 livelli** (Rail + Sub-panel) collassabile + mappa completa delle voci. |

**C. Contesto / contenuto — CONSIGLIATI**
| File | A cosa serve |
|---|---|
| `40_web_ordinativi-ftth.html` | Esempio modulo verticale (Ordinativi FTTH) da allineare. |
| `28..39_*.html` | Contenuto e funzioni dei moduli (foglio ore, magazzino, rapportini, budget, assenze, cronometro, pianificazione, dashboard, commesse, mobile, catture, asset, stati). **Stile superato**: da rifare su 41/42/43. |
| `schema_core.sql`, `field_definition.sql`, `permissions.ts`, `rls_policies.sql` | Campi reali, RBAC, RLS per popolare le maschere con dati veri. |
| `README_progetto.md`, `BACKLOG_futuro.md`, `MVP_progetto.md` | Contesto prodotto e cose rimandate. |
| **questo file** (`2026-06-15_HANDOFF_nuova_chat_maschere.md`) | Punto di ripartenza. |

> Minimo indispensabile per ripartire: **A + B + questo handoff**. Il resto migliora la fedeltà dei dati.

---

## 2. Contesto progetto (per ripartire a freddo)

- **siSuite** = SaaS AI-first / mobile-first per la gestione di commesse e attività sul campo. Verticali: fibra/FTTH (cliente POWERCOM), software house (la nostra), piscine, fotovoltaico. Vocabolario per-verticale = configurazione, non architettura.
- **Modello dominio generalizzato**: `engagement → phase → activity → resource/time/material`. Solo il vocabolario cambia tra verticali.
- **Tesi architetturale**: *"L'AI propone, il deterministico dispone."* L'LLM propone azioni/bozze; un layer deterministico valida e committa. Pipeline cattura: voce/foto → trascrizione → contesto → estrazione strutturata → validazione → commit.
- **Stato**: backend + infrastruttura **già fatti** (schema PostgreSQL + pgvector + JSONB + RLS multi-tenant; moduli Ore/Magazzino/Rapportini/Budget/Assenze/Cronometro; auth Supabase/GoTrue decisa). Il **design system v5** (`base.css`) è la fonte di verità del look. Oggi abbiamo definito gli **standard UI** (liste/maschere v2, documento, menu 2 livelli) e prodotto i 3 mockup di riferimento (41/42/43).
- **Stack frontend**: Ionic + Capacitor + React (Ionic solo per shell/gesture; aspetto dai componenti propri sui token di `base.css`); icone `lucide-react`; Docker per SaaS/on-prem.

---

## 3. Gli standard da rispettare (sintesi operativa, autoconclusiva)

### 3.1 Liste & Maschere v2 (rif. 41 e 42)
- **Una sola lista + un solo CRUD per entità**, riusati ovunque: gestione **e** selezione (la lista in pop-up con radio è la *stessa* lista; la scheda per "crea al volo" è la *stessa* scheda).
- **3 archetipi e basta**: **Lista** (List Report) · **Scheda entità** (Object Page, correlati in **tab in fondo**) · **Documento** (master-detail = testata + righe, *solo* per DDT/Fatture/documenti).
- **Lista**: titolo+viste su una riga; toolbar su una riga, pulsanti a **sole icone + tooltip** (ricerca che cresce; Filtri/Colonne/Azioni AI; separatore; azioni-dati a **destra** con **+** ultimo); **selezione = solo un numero**; **niente icone-funzione sulle righe**. **Righe a 2 livelli** per entità ricche (principale sopra, dato collegato sotto in corsivo: azienda+indirizzo, P.IVA+nazione/tipo, telefono+email) con **intestazioni a 2 livelli**; **1 riga** per documenti, griglie numeriche (incolonnamento/confronto) o entità con pochi attributi. Il 2° livello porta sempre un dato **utile**, mai ridondante.
- **Scheda (Object Page)**: una pagina crea+vedi+modifica; **intestazione sticky e opaca** (niente gap: lo spazio è padding **opaco**, non margine — il contenuto non deve mai "passare" sotto la barra) con **solo Salva/Annulla** (niente Duplica/Elimina nella scheda, niente dati del record ripetuti in testata); **label del campo E titolo del box fissi nel bordo** (statici, non floating; anche le date nel bordo); griglia densa, campi affiancati; **validazione obbligatori = bordo rosso + messaggio DENTRO il campo** (mai sotto); **tabelle correlate come strip di tab in fondo**; azioni AI contestuali (es. "Compila da P.IVA" nel bordo del box fiscale); tooltip su tutte le icone.
- **Documento**: testata (campi con label nel bordo) + **righe a una riga** (numeri incolonnati) + numerazione automatica + **stato con conferma immutabile** (la conferma genera gli effetti e blocca il documento) + **totali in formato contabile**. Azioni in testata per i documenti: Annulla / Salva bozza / **Conferma**.
- **Densità** (Compatta/Comoda/Spaziosa): selettore **solo in Impostazioni**, mai per-maschera. Default Comoda.
- **Naming**: entità = **Aziende** (`company`) con ruoli Cliente/Fornitore/Partner; "Clienti"/"Fornitori" = viste filtrate della stessa lista.

### 3.2 Navigazione / Menu — standard Si.Va.F. `02_navigation_menu` (rif. 43)
- **2 livelli puri** (modello SAP Fiori, scalabile a 200+ voci): **Rail (L1)** = sezioni principali, **collassabile a icone**; **Sub-panel (L2)** = voci della sezione attiva, raggruppate con caption. **Niente 3° livello** (gli aspetti di un'entità complessa stanno **dentro** la pagina via tab/aspect-pillbar). **Max 2 click** per qualunque voce.
- **Una route canonica per entità**; dagli altri moduli si arriva con **Collegamenti** (↪) alla stessa route (mai pagine duplicate).
- **Regola del 10%**: entità usata da ≥2 moduli in >10% dei flussi → vive nell'hub **Anagrafiche** (trasversale); altrimenti nel suo modulo. (Aziende, Articoli, Risorse, Materiali → hub.)
- **Preferiti** (pin ★ per-utente) con sezione virtuale "★ Preferiti" in cima al rail; **Recenti** raccomandati.
- **Omnibox ⌘K** = una sola superficie: Quick Search (naviga) + AI Command Bar (agisci). Indicizza tutte le voci.
- Il menu **nasconde** per licenza + RBAC, ma **non è la barriera di sicurezza** (quella è il backend).
- **Sibling tab bar** in cima alla pagina per saltare tra entità "sorelle" senza riaprire il sub-panel.

### 3.3 base.css (gli standard di look, già implementati)
Densità via `data-density`; scala font (H1 22 / sezione 16 / card 15 / corpo 13 / intestazione tabella 11.5 sentence-case / eyebrow 10.5); numeri a destra incolonnati con cifre tabellari; unità non monetarie nell'intestazione; valuta in formato contabile; durata `Ore (h:mm)` vs orario `Orario` 24h; icone lucide, mai emoji; colori sempre via token.

---

## 4. Inventario maschere da produrre/rifare (il lavoro della nuova chat)

Legenda stato: ✅ fatto · 🔁 esiste ma da allineare · 🆕 da creare.

**Shell & navigazione**
- 🔁 **App shell con menu 2 livelli** (rif. 43) = cornice di TUTTE le maschere. Omnibox ⌘K nella topbar.

**Entità → Lista + Scheda Object Page (rif. 41)**
- ✅ **Aziende** (= 41).
- 🆕 **Articoli** · 🆕 **Risorse** · 🆕 **Materiali** · 🆕 **Utenti** · 🆕 **Asset & libretto** (lista+scheda; il "libretto" usa una tab con Timeline).

**Configurazione / lookup (rif. 41, con varianti)**
- 🔁 **Stati & etichette** (`lookup_value`, esiste 39) · 🔁 **Numerazioni** (`number_series`, esiste 16 legacy) · 🆕 **Verticali & campi** (`field_definition`) · 🆕 **Ruoli & permessi** (RBAC) · 🔁 **Impostazioni generali** (densità, lingua; esiste 18 legacy).

**Documenti → master-detail (rif. 42)**
- ✅ **DDT di carico** (= 42).
- 🆕 **Scarico** · 🆕 **Trasferimento** · 🆕 **Rettifiche** · 🔁 **Ordinativi FTTH** (esiste 40, allineare a scheda/documento) · ⏳ **Fattura** (PRESTO).

**Moduli operativi (liste→41, documenti→42, schede→41)**
- 🔁 **Foglio ore** (28) · 🔁 **Magazzino** giacenze/movimenti/inventario (29; la lista giacenze è griglia numerica a 1 riga) · 🔁 **Rapportini** (30) · 🔁 **Budget** (30) · 🔁 **Assenze** (31) · 🔁 **Cronometro** (32).

**Schermate ricche**
- 🔁 **Cruscotto/Dashboard** (35) · 🔁 **Commesse** lista + **albero** (36; la lista segue 41, l'albero è un aspetto in-page) · 🔁 **Pianificazione/Agenda** (34) · 🔁 **Catture inbox AI** (38; triage ad alto volume → pannello di anteprima ammesso) · 🔁 **Asset/libretto** Timeline (38).

**Mobile tecnico**
- 🔁 **Oggi · Cattura vocale · Agenda** (37).

---

## 5. Ordine di lavoro consigliato (nella nuova chat)

1. **Shell/menu** (43) confermato come cornice condivisa.
2. **Entità "metro": Articoli** — lista (2 livelli) + selezione pop-up + Scheda Object Page, su 41. **Fermarsi e mostrare.** Poi replicare a Risorse, Materiali, Utenti, Asset.
3. **Configurazione/lookup**: Stati & etichette, Numerazioni, Verticali & campi, Ruoli & permessi, Impostazioni.
4. **Documento "metro": Scarico** su 42 → poi Trasferimento, Rettifiche; allineare Ordinativi (40).
5. **Moduli 28–32** allineati agli standard.
6. **Schermate ricche** (Cruscotto, Commesse+albero, Pianificazione, Catture, Asset) e **Mobile** (37).

> A ogni passo: una sola maschera "metro" perfetta, poi replica. Mostrarmi i passaggi chiave.

---

## 6. Procedura per Claude Code (come modificare TUTTE le maschere)

1. **Leggere prima gli standard**, in quest'ordine: `STANDARD_UI_liste_e_maschere_v2.md` → `02_navigation_menu.md` → `base.css` → `FRONTEND_SPEC.md`. I mockup 41/42/43 sono i riferimenti visivi.
2. **Costruire UNA volta i componenti condivisi**, poi riusarli ovunque:
   - **AppShellNav2** — Rail (collassabile) + Sub-panel + Omnibox ⌘K + sibling tab bar.
   - **EntityList** — prop `mode` = `manage | pick-single | pick-multi`; righe **1 o 2 livelli** secondo l'entità; toolbar a icone con tooltip; selezione = numero; nessuna icona-funzione sulle righe. Stessa lista in pop-up per la selezione.
   - **ObjectPage** — header sticky **opaco** con solo Salva/Annulla; label/titoli **nel bordo**; validazione **dentro** il campo; correlate come **tab in fondo**; azioni AI contestuali.
   - **DocumentMasterDetail** — testata + righe a una riga; numerazione; **conferma immutabile**; totali contabili.
3. **Una lista + un CRUD per entità**: dove un'altra maschera deve cercare/associare un'entità, richiama **la stessa** lista (selezione) e **la stessa** scheda (crea al volo). Mai duplicare.
4. **Rimuovere i pattern superati**: drawer/master-detail come default (ora Lista→Scheda), toggle densità per-maschera, dati del record ripetuti nell'header della scheda, messaggi d'errore **sotto** il campo, **gap trasparente** sotto la barra sticky (usare padding opaco + bordo, margine = 0).
5. **DoD per ogni maschera** (vedi §10 dello standard liste/maschere e §10 dello standard menu). RBAC su UI **e** API; stati vuoto/caricamento/errore; responsive desktop+mobile.
6. **Commit piccoli e descrittivi.** Dopo la prima entità "metro" (Articoli) **fermarsi e mostrare** prima di replicare.

---

## 7. Prompt di apertura per la nuova chat (copia-incolla)

> Riprendiamo siSuite. In Knowledge trovi: `base.css` (v5), `STANDARD_UI_liste_e_maschere_v2.md`, `02_navigation_menu.md` (Si.Va.F.), `FRONTEND_SPEC.md`, il kickoff per Code, e i mockup di riferimento `41_web_aziende_standard.html` (Lista+Scheda), `42_web_ddt_carico.html` (Documento), `43_web_menu_due_livelli.html` (Menu 2 livelli). Lavoriamo in italiano; voglio scelte motivate, confrontate coi leader, senza piaggeria.
>
> Obiettivo: rifare/creare **tutti i mockup HTML** delle maschere siSuite conformi a quegli standard, da consegnare a Claude Code. Segui l'**ordine di lavoro** del documento di handoff: parti dall'entità "metro" **Articoli** (lista a 2 livelli + selezione in pop-up con la stessa lista + Scheda Object Page con label/titoli nel bordo, solo Salva/Annulla, validazione dentro il campo, correlate come tab in fondo), avvolta nello **shell con menu a 2 livelli** della 43. Quando Articoli è eccellente, **fermati e mostramelo**, poi replichiamo alle altre entità. Ricordati: una sola lista + un solo CRUD per entità, riusati ovunque; intestazione sticky **opaca** senza gap.

---

## 8. Promemoria / pending (dal lavoro di oggi)

- **Gap toolbar**: risolto in 41 e 42 (header sticky con padding **opaco** + bordo, `margin:0`). Applicare ovunque.
- **Menu**: rail scuro + sub-panel chiaro (coerente con 41/42). *Da confermare con Sivaf se preferisce il rail chiaro come nel suo ERP.* Non ancora messi nel mock: **Recenti**, voci **`modal`**, **`hideOnMobile`** (previsti dallo standard).
- **Documento**: da confermare con Sivaf — 3 azioni in testata (Annulla/Salva bozza/Conferma) vs solo in fondo; IVA assente nel DDT (solo valore di carico) — se i documenti devono gestire imponibile/IVA/totale, aggiungere il blocco totali standard.
- **FRONTEND_SPEC.md** e **kickoff**: aggiornati oggi (puntano a v2 + menu Si.Va.F. + 41/42/43).
- **Memoria progetto**: contiene già lo standard liste/maschere v2 e le regole base.css; **da aggiungere** un edit per il **menu 2 livelli Si.Va.F.** (rail+subpanel, 10%, omnibox, una route per entità) come standard vincolante.
- **Backend (separato dal FE)**: riconciliazione `company.address`/`budget_amount` (colonne legacy vs `attributes` jsonb) ancora aperta; 14 commit backend locali da `git push`; integrazione motore Agenda (planner) gated; decisioni post-MVP da verificare prima di bloccare: sync offline (PowerSync vs ElectricSQL) e solver (Timefold vs OR-Tools).

---

*Handoff siSuite — 2026-06-15. Carica A+B+questo file in Knowledge e riparti dal §7.*
