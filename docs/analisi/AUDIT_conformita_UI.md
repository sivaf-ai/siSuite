# AUDIT conformità UI — siSuite (FASE 0)

**Chat:** 01.06 · **Data:** 27 giugno 2026 · **Governato da:** standard UI v2 + `feedback_entity_standard` + `feedback_entity_selection_popup` + `feedback_objectpage_sticky_header` + `feedback_no_native_popups`.
**Stato:** fotografia pre-bonifica. Nessuna modifica eseguita in questa fase.

## Legenda
PASS = conforme · FAIL = violazione standard · N.A. = non applicabile · PARZIALE/⚠️ = conforme con riserva minore.

## Criteri (colonne)
- **Toolbar** — toolbar ricca: Nuovo·Modifica·Duplica·Elimina·Esporta·Filtro·Ordina·Colonne·Report·slot AI via `EntityList`.
- **Picker** — selezione entità = riuso della lista vera in `Modal` (pick-single/multi), mai `<select>`/lista ad-hoc.
- **ObjectPage/Modal** — scheda `ObjectPage` (header sticky opaco, solo Salva/Annulla, label-nel-bordo, tab in fondo); CRUD in `ui/Modal` centrato, mai Drawer.
- **Duplica** — CREATE precompilato senza chiavi/flag sistema, nessun "(copia)".
- **Elimina(nome)** — conferma in-app col nome del record.
- **NumInput/UnitSelect** — importi/quantità con `NumInput`, UM con `UnitSelect`.
- **Reattività** — `useReloadOnEnter` + bus `api/cache.ts`, nessun relogin.
- **No popup nativi** — niente `window.confirm/alert/prompt`.

---

## Gruppo A — Anagrafiche / Liste

| Schermata | Toolbar | Picker | ObjPage/Modal | Duplica | Elimina(nome) | NumInput/UnitSelect | Reattività | NoPopupNativi | Note |
|---|---|---|---|---|---|---|---|---|---|
| ClientiPage | PASS | PASS | PASS | PASS | PASS | N.A. | ⚠️ | PASS | No `useReloadOnEnter`. |
| ClienteDetailPage | N.A. | ⚠️ | PASS | PASS | PASS | N.A. | PASS | PASS | Sub-CRUD contatti in Modal. |
| MaterialiPage | ⚠️ | PASS | PASS | PASS | PASS | PASS | ⚠️ | PASS | Filtri/Colonne/AI `disabled:true` placeholder. No reload-on-enter. |
| MaterialeDetailPage | N.A. | ⚠️ | PASS | PASS | N.A. | ⚠️ | PASS | PASS | UM via `<select>` da `/units` invece di `UnitSelect` (righe 198-203). |
| RisorsePage | ⚠️ | N.A. | N.A. | PASS | PASS | PASS | ⚠️ | PASS | Toolbar placeholder. No reload-on-enter. |
| RisorsaDetailPage | N.A. | N.A. | PASS | PASS | N.A. | **FAIL** | PASS | PASS | Costo orario `<input type=number>` grezzo (riga 233). |
| AssetPage | ⚠️ | N.A. | N.A. | PASS | PASS | N.A. | ⚠️ | PASS | Toolbar placeholder. |
| AssetDetailPage | N.A. | **FAIL** | PASS | PASS | PASS | N.A. | PASS | PASS | Cliente/Sito via `<select>` (112,115). |
| AttivitaPage | ⚠️ | N.A. | N.A. | PASS | PASS | N.A. | ⚠️ | PASS | Toolbar placeholder. |
| AttivitaDetailPage | **FAIL** | **FAIL** | **FAIL** | N.A. | N.A. | **FAIL** | ⚠️ | PASS | **Pagina legacy Ionic** (IonList/IonSelect/IonInput). Da rifare su ObjectPage. |
| EngagementsPage | ⚠️ | N.A. | N.A. | PASS | PASS | N.A. | ⚠️ | PASS | Sort/filter reali cablati; Colonne/AI placeholder. |
| CommessaDetailPage | N.A. | **FAIL** | **FAIL** | PASS | PASS | **FAIL** | PASS | PASS | Sub-CRUD Fase/Attività in `IonModal` fullscreen; tab custom `.tabs`; durata `IonInput`. |
| LavorazioniPage | ⚠️ | **FAIL** | N.A. | N.A. | PASS | N.A. | ⚠️ | PASS | Commessa via `<select>` (86). No Duplica. |
| LavorazioneDetailPage | N.A. | ⚠️ | PASS | N.A. | N.A. | PASS | PASS | PASS | NumInput su misure; voce/fase via `<select>` (FK). |
| ListinoPage | ⚠️ | N.A. | N.A. | PASS | PASS | N.A. | ⚠️ | PASS | Toolbar placeholder. |
| ListinoItemDetailPage | N.A. | ⚠️ | PASS(atteso) | N.A. | N.A. | atteso NumInput | PASS | PASS | Da verifica mirata in Fase 3. |
| MagazzinoPage | PASS | PASS | PASS | PASS | PASS | PARZIALE | PASS | PASS | MovimentiTab: qtà/costo `<input type=number>` grezzi (298-299). |
| CategoriePage | ⚠️(albero) | N.A. | PASS | N.A. | PASS | N.A. | PASS | PASS | Vista albero deliberata. |
| UnitsPage | PASS | N.A. | PASS | PASS | PASS | N.A. | PASS | PASS | **Modello di riferimento.** |
| TaxRatesPage (IVA) | PASS | N.A. | PASS | PASS | PASS | PASS | PASS | PASS | **Modello di riferimento.** |
| TimeEntriesPage | ⚠️ | N.A. | N.A. | N.A. | PASS | N.A. | ⚠️ | PASS | Azioni bulk + PromptDialog. No reload-on-enter. |
| TimeEntryDetailPage | N.A. | ⚠️ | PASS | N.A. | ⚠️ | ⚠️ | PASS | PASS | Elimina senza nome (182). FK via `<select>`. |
| AssenzePage | ⚠️ | **FAIL** | PASS | N.A. | N.A. | **FAIL** | ⚠️ | PASS | Risorsa/Tipo via `<select>` (161,166); ore `<input number>` (172). |
| AbsenceDetailPage | N.A. | N.A. | PASS | N.A. | ⚠️ | N.A. | PASS | PASS | Elimina senza nome (92). |

---

## Gruppo B — Documenti / Ordini lavoro / Settings / Speciali

| Schermata | Toolbar/Archetipo | Picker | UM/NumInput | Modal(noDrawer) | Cancellaz.bozza | NoPopupNativi | Reattività | Note |
|---|---|---|---|---|---|---|---|---|
| DdtDetailPage | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **Esemplare archetipo documento.** Solo `<select>` = Tipo doc (enum). |
| PurchaseOrderDetailPage | PASS | PASS | PASS | PASS | PASS | PASS | PASS | `<select>` magazzino dest nel Modal "Ricevi" (246) → FAIL minore. |
| PickListDetailPage | PASS | PARZIALE | PASS | PASS | PASS | PASS | PASS | Risorsa/Commessa/WO via `<select>` (157,161,165). |
| DdtPage (lista) | PARZIALE | N.A. | N.A. | N.A. | PASS | PASS | PASS | Toolbar senza Filtro/Ordina/Colonne. |
| PurchaseOrdersPage | PARZIALE | N.A. | N.A. | N.A. | PASS | PASS | PASS | idem. |
| PickListsPage | PARZIALE | N.A. | N.A. | N.A. | PASS | PASS | PASS | idem. |
| OrdinativiPage | PASS | N.A. | N.A. | PASS | N.A. | PASS | PASS | **Toolbar ricca di riferimento.** `<select>` nei modali assign/import. |
| OrdinativoDetailPage | PASS | **FAIL** | **FAIL** | PASS | N.A. | PASS | PASS | Articolo apparati `<select>` (252); qtà `<input number>` (256). Testata tutta `<select>`. |
| RapportiniPage | PASS | N.A. | N.A. | N.A. | PASS | PASS | **FAIL** | Manca `useReloadOnEnter`. |
| RapportinoDetailPage | PASS (DocumentArchetype) | N.A. | N.A. | PASS | PASS | PASS | PASS | Firma via PromptDialog. Conforme. |
| CapturePage | N.A. | N.A. | N.A. | PASS | N.A. | PASS | PASS | Stack Ionic mobile-first (accettabile). |
| CronometroPage | N.A. | N.A. | N.A. | PASS | N.A. | PASS | PASS | 4 `<select>` (card-form speciale). |
| DashboardPage | N.A. | N.A. | N.A. | PASS | N.A. | PASS | N.A. | Conforme. |
| PivotPage | N.A. | N.A. | N.A. | PASS | N.A. | PASS | N.A. | Conforme. |
| TodayPage | N.A. | N.A. | N.A. | PASS | N.A. | PASS | N.A. | Conforme. |
| PianificazionePage | N.A. | N.A. | N.A. | PASS | N.A. | PASS | N.A. | Conforme. |
| GeneralSettings | N.A. | N.A. | N.A. | PASS | N.A. | PASS | N.A. | `<select>` lingua (settings). |
| LabelsSettings | PASS | N.A. | N.A. | PASS | PASS | PASS | — | Modal centrato. |
| NumbersSettings | PASS | N.A. | N.A. | PASS | PASS | PASS | — | Conforme. |
| CustomFieldsSettings | PASS | N.A. | N.A. | PASS | PASS | PASS | — | Conforme. |
| TerminologySettings | N.A. | N.A. | N.A. | PASS | N.A. | PASS | — | Form glossario. |
| TemplatesSettings | PARZIALE | **FAIL minore** | N.A. | PASS | PASS | PASS | — | Company via `<select>` (100). |
| RolesPage | PASS | N.A. | N.A. | N.A. | PASS | PASS | — | EntityList v2. |
| RoleDetailPage | PASS | N.A. | N.A. | PASS | N.A. | PASS | — | `<select>` dataScope (enum). |
| UsersPage | PASS | N.A. | N.A. | N.A. | PASS | PASS | — | EntityList v2. |
| UserDetailPage | PASS | **FAIL minore** | N.A. | PASS | N.A. | PASS | — | Risorsa collegata via `<select>` (161). |
| BillingPage | N.A. | N.A. | N.A. | PASS | N.A. | PASS | — | Read-only. |
| SuperAdminPage | N.A. | N.A. | N.A. | PASS | N.A. | PASS | — | Conforme. |
| PlaceholderPage | **FAIL (montata)** | N.A. | N.A. | N.A. | N.A. | N.A. | N.A. | Montata su `/agenda` (`AppShell.tsx:128`) — entità mancante. |

---

## Popup nativi (`window.confirm/alert/prompt`) — scansione intero `packages/frontend/src`
**Nessun popup nativo residuo.** Unica occorrenza = commento doc in `ui/PromptDialog.tsx:3`. Standard pienamente rispettato.

## Drawer laterali residui
**Nessun Drawer attivo.** Unico hit = commento in `AbsenceDetailPage.tsx:5`. (Il componente `ui/Drawer.tsx` esiste ma non è più usato per CRUD.)

---

## FAIL principali (per priorità → input Fasi 2/3/4)

**P1 — Entità via `<select>` grezzo invece di picker (lista-vera-in-popup)**
1. **OrdinativoDetailPage** — articolo apparati `<select>` (252) + qtà `<input number>` (256); testata committente/tipo/stato/commessa/squadra tutta `<select>`. Da allineare all'archetipo Ddt.
2. **PickListDetailPage:157,161,165** — risorsa/commessa/WO.
3. **AssetDetailPage:112,115** — Cliente/Sito.
4. **AssenzePage:161,166** — Risorsa/Tipo.
5. **CommessaDetailPage:264-272** — Tipo/Cliente/Stato.
6. **PurchaseOrderDetailPage:246** — magazzino dest nel Modal Ricevi.
7. **LavorazioniPage:86** — Commessa.
8. **TemplatesSettings:100**, **UserDetailPage:161** — Company/Risorsa.

**P2 — NumInput/UnitSelect mancanti su importi/quantità/UM**
9. **RisorsaDetailPage:233** — costo orario.
10. **AssenzePage:172** — ore.
11. **MagazzinoPage:298-299** — qtà/costo unitario MovimentiTab.
12. **OrdinativoDetailPage:256** — qtà apparati.
13. **MaterialeDetailPage:198-203** — UM con `<select>` invece di `UnitSelect`.

**P3 — Pagine fuori standard (da rifare su ObjectPage/Modal)**
14. **AttivitaDetailPage** — interamente legacy Ionic.
15. **CommessaDetailPage** — sub-CRUD Fase/Attività in `IonModal` fullscreen; tab `.tabs` invece di `RelatedTabs`.

**P4 — Toolbar ridotta / placeholder**
16. **DdtPage/PurchaseOrdersPage/PickListsPage** — EntityList senza Filtro/Ordina/Colonne (vs OrdinativiPage completa).
17. **MaterialiPage/RisorsePage/AssetPage/AttivitaPage/ListinoPage** — azioni toolbar `disabled:true` placeholder (cablare come ClientiPage/EngagementsPage).

**P5 — Reattività (`useReloadOnEnter` assente)**
18. ClientiPage, MaterialiPage, RisorsePage, AssetPage, AttivitaPage, EngagementsPage, ListinoPage, LavorazioniPage, TimeEntriesPage, AssenzePage, **RapportiniPage**.

**P6 — Elimina senza nome**
19. **TimeEntryDetailPage:182**, **AbsenceDetailPage:92** — ConfirmDialog con testo generico.

**P7 — Entità mancante**
20. **PlaceholderPage** su `/agenda`.

### Esemplari di riferimento (già conformi al 100%)
`UnitsPage`, `TaxRatesPage`, `DdtDetailPage`, `PurchaseOrderDetailPage`, `RapportinoDetailPage`, `MagazzinoPage` (struttura lista+tab), `RolesPage`/`UsersPage`.
