# siSuite — Spec Frontend VINCOLANTE (addendum al brief)

> Da consegnare a Claude Code **insieme** al brief, per **rifare il frontend**. Il backend/infra già fatto si tiene. Questo documento ha **precedenza** sulle parti UI del brief: dove sono in conflitto, vale questo.

---

## 0. Principio non negoziabile

**Le maschere (`docs/mockup/01..26_*.html` + `base.css`) sono il TARGET, non un'ispirazione.** Una schermata è "fatta" solo se:
1. **combacia visivamente** con la maschera corrispondente (layout, spaziature, tipografia, componenti),
2. **contiene tutti i campi** previsti (vedi §4 + `field_definition`),
3. ha **CRUD completo** dove si applica (lista con ricerca/ordinamento/paginazione, crea, modifica, elimina con conferma),
4. è costruita con i **componenti del design system** — **mai** con i componenti Ionic di default a vista.

Se manca anche solo uno di questi, la schermata **non è done**. Niente CRUD "minimo che gira": vogliamo un'app **completa e curata**.

---

## 1. Design system = vincolante (no Ionic grezzo)

`base.css` definisce i **design token** (colori, ombre, raggi, tipografia: Bricolage Grotesque display + Inter testo + JetBrains Mono per codici). Regole di look, da rispettare ovunque:

- **Niente componenti Ionic con stile di default.** Mappa i token su variabili CSS e costruisci componenti propri; Ionic resta solo per shell/navigazione/gesture, non per l'aspetto.
- **Icone: `lucide-react`** (già disponibile, moderno, coerente). Mai emoji, mai icone a caso. Ogni azione ha la sua icona (mappa in §6).
- **Card** con bordo `--line`, raggio `--r-lg`, ombra `--shadow-1`; **codici** sempre in mono; **stati/priorità** come *pill* generate da `lookup_value` (colore da `color_token`, label per-locale, abbreviazione).
- **Marchio**: `<em>si</em>Suite` (la "si" in `--flow`); mark a gradiente `--flow-grad`.
- Densità desktop comoda, mobile a tutto schermo; hover states, focus visibili, transizioni brevi (120–150ms).

---

## 2. Libreria di componenti (costruirla PRIMA delle schermate)

Tutte le schermate si compongono da questi. Costruiscili una volta, riusali ovunque (è ciò che rende l'app coerente e "TOP"):

| Componente | Cosa fa | Riferimento mock |
|---|---|---|
| **AppShell** | sidebar desktop scura + topbar con barra comando/ricerca (⌘K) | 03,05,06… |
| **MobileShell** | tab bar in basso + FAB centrale (cattura) | 01,21… |
| **DataTable** | colonne, **ordinamento**, hover-row con **azioni** (icone), **paginazione**, stato vuoto, skeleton di caricamento, selezione multipla | 06,11,12,13,14,25 |
| **Toolbar** | barra azioni con **icone**: ricerca, filtro, ordina, **Nuovo**, esporta, azioni bulk | 25 |
| **SearchBar** | input ricerca con icona, **debounce 300ms**, clear | 23,25 |
| **EntityForm** | **generato da `field_definition`** (vedi §3): colonne tipizzate + campi attributi raggruppati e ordinati, validazione | 26 |
| **Drawer / SlideOver** | pannello laterale per crea/modifica dalle liste | 26 |
| **Modal + ConfirmDialog** | conferme distruttive (elimina) | — |
| **StatusPill / PriorityPill** | da `lookup_value` (color_token + label locale + sigla) | ovunque |
| **TreeView** | gerarchia espandibile/collassabile (commesse: fasi → sotto-fasi → attività) | 24 |
| **DetailLayout** | testata (codice, titolo, stato) + griglia chiave/valore + tab | 07,10,19,20 |
| **Timeline** | storico/libretto dell'asset | 10 |
| **Toast** | esiti azioni (salvato, eliminato, errore) | — |
| **EmptyState** | vuoto con icona + CTA "Nuovo" | — |

---

## 3. EntityForm guidato da `field_definition` (chiude il buco dei campi)

Il form di ogni entità è **generato**, non scritto a mano:

1. I **campi tipizzati** (colonne reali: `title`, `status_id`, date, FK…) usano widget dedicati (testo, select da `lookup_value`, date picker, select FK con ricerca).
2. I **campi dentro `attributes jsonb`** (P.IVA, codice fiscale, PEC, SDI, dati tecnici per-verticale…) si leggono da **`field_definition`** filtrando per `(entity, vertical, tenant)`:
   - render per `data_type` (text/textarea/number/integer/money/date/boolean/email/phone/url/select/multiselect),
   - **etichetta** dalla `label` nella lingua dell'utente, raggruppati per `group_key`, ordinati per `sequence`,
   - **validazione** da `field_definition.validation` (+ `required`); il backend genera lo **zod** dalle stesse righe (una sola fonte di verità FE+BE).
3. Salvataggio: i campi attributi finiscono in `entity.attributes`; mai persi, mai opachi.

> Esempio concreto — **Cliente**: oltre a nome/tipo (colonne), il form mostra il gruppo *Dati fiscali* (P.IVA, Codice fiscale, PEC, Codice SDI), *Anagrafica* (indirizzo, città, provincia, CAP, sito), *Note*. Tutti da `field_definition`. È esattamente ciò che mancava.

---

## 4. CRUD COMPLETO su tutte le entità

Per **ogni** entità: **Lista · Crea · Dettaglio · Modifica · Elimina**. Sempre dietro RBAC (`permissions.ts`) + RLS.

**Lista** (DataTable + Toolbar):
- **Ricerca** server-side, debounce, su nome/codice e campi chiave (anche `attributes` via jsonb dove serve).
- **Filtri** (chip/segmented: per stato, tipo, responsabile…) e **ordinamento** per colonna.
- **Paginazione** (o scroll infinito su mobile).
- Riga: hover → **azioni a icona** (Apri, Modifica, Duplica, Elimina). Selezione multipla → azioni bulk.
- **EmptyState** e **skeleton** di caricamento.

**Crea / Modifica**: EntityForm (§3) in **Drawer** dalle liste o in **pagina** dal dettaglio; pre-compilato in modifica; validazione; **toast** d'esito; aggiornamento ottimistico.

**Elimina**: **soft-delete** (`archived_at`) con **ConfirmDialog**; permesso `entity:delete`; le cancellazioni che intaccano storia fatturabile sono già bloccate dal DB (`RESTRICT`) → mostra messaggio chiaro, non un crash.

Entità coperte: **company** (+ `company_role`, `company_contact`), **asset**, **engagement**, **phase**, **activity**, **resource**, **material**, **time_entry**, **material_consumption**, **app_user** (+ `user_role`), **role**, **lookup_value**, **number_series**, **plan/subscription**.

### Inventario campi (estratto — il resto segue lo stesso criterio)

| Entità | Campi colonna (tipizzati) | Campi da `attributes` (via `field_definition`) |
|---|---|---|
| **company** | display_name, type, geo, ruoli (`company_role`), contatti (`company_contact`) | vat_number, tax_code, pec, sdi_code, street, city, province, postal_code, website, notes |
| **engagement** | code (da `number_series`), title, type, company_id, asset_id, manager_id, status, started_on, ended_on | budget, contract_ref, sla |
| **activity** | title, kind, status, priority, estimated_minutes, scheduled_start, earliest_start, due_by, checklist, dipendenze | billable, external_ref |
| **resource** | kind, label, user_id, active | hourly_cost, skills, plate (se veicolo) |
| **material** | name, unit | brand, part_number (vert. software) |
| **asset** | kind, label, company_id, geo, installed_at | per-verticale: software(version, environment, repo_url) / pools(volume_m3, heating) / solar(kwp, panels, inverter) |
| **app_user** | full_name, email, phone, locale, ruoli, ambito (data_scope), active | — |

> Regola generale: ogni `attributes jsonb` dello schema **deve** avere le sue righe in `field_definition`; se un campo non c'è lì, non esiste per l'utente. Niente blob opachi.

---

## 5. Struttura del progetto = ALBERO (rami e sotto-rami)

La gerarchia commessa va vista come **albero espandibile** (mock **24**), non come lista piatta:

```
Engagement (commessa)
└─ Phase (ramo / work-package)          ← annidabile via parent_phase_id
   └─ Sub-phase (sotto-ramo)
      └─ Activity (foglia schedulabile)  ← l'unica che porta ore/risorse/materiali
```

- **Espandi/collassa** con chevron; indentazione + connettori verticali tra i nodi.
- Ogni nodo: **StatusPill**, rollup (es. "3/8 attività", ore stimate/consuntivate), **azioni inline** (➕ aggiungi fase / aggiungi attività, ✏️ modifica, 🗑️ elimina) che compaiono in hover.
- Sulle **attività** (foglie): durata stimata, badge **dipendenze** ("dopo X"), priorità.
- Riordino tra fratelli (campo `seq`) con drag — accettabile in v2; in v1 almeno frecce su/giù.
- `TreeView` è un componente riusabile (serve anche altrove, es. categorie).

---

## 6. Icone (lucide-react) — mappa azioni

| Azione | Icona | | Azione | Icona |
|---|---|---|---|---|
| Ricerca | `Search` | | Modifica | `Pencil` |
| Nuovo / Aggiungi | `Plus` | | Elimina | `Trash2` |
| Filtro | `SlidersHorizontal` | | Duplica | `Copy` |
| Ordina | `ArrowUpDown` | | Altro (menu) | `MoreHorizontal` |
| Esporta | `Download` | | Apri / vai | `ChevronRight` |
| Espandi/collassa | `ChevronDown`/`ChevronRight` | | Conferma | `Check` |
| Cattura (voce) | `Mic` | | Avviso/scadenza | `AlertTriangle` |
| Commesse | `Briefcase` | | Clienti | `Building2` |
| Risorse | `Users` | | Materiali | `Package` |
| Asset | `Box` | | Catture | `Layers` |
| Pianificazione/Agenda | `Calendar` | | Impostazioni | `Settings` |

Toolbar di lista standard (da sinistra): **SearchBar** · **Filtro** · **Ordina** · *(spinge a destra)* · **Esporta** · **Nuovo** (primario). Vedi mock **25**.

---

## 7. Definition of Done — UI (gate per ogni schermata)

Una schermata passa solo se: ✓ combacia con la maschera · ✓ tutti i campi (inventario + `field_definition`) presenti **ed editabili** · ✓ CRUD completo (ricerca, ordina, pagina, crea, modifica, elimina con conferma) dove applicabile · ✓ solo componenti del design system (no Ionic grezzo) + icone lucide · ✓ permessi RBAC applicati (azioni nascoste/disabilitate senza permesso, **e** bloccate lato API) · ✓ stati **vuoto / caricamento / errore** gestiti · ✓ responsive (desktop e mobile).

---

## 8. Sequenza di lavoro (rifacimento frontend)

1. **Componenti** §2 da `base.css` (AppShell, MobileShell, DataTable, Toolbar, EntityForm, Drawer, ConfirmDialog, StatusPill, TreeView, DetailLayout, Timeline, Toast, EmptyState).
2. **`field_definition`** cablato: backend espone le definizioni per entità+verticale; `EntityForm` le consuma; lo zod di validazione è generato dalle stesse righe.
3. **Verticale di riferimento — Cliente**: lista (ricerca/ordina/pagina) → crea/modifica (form con i campi fiscali da `field_definition`) → dettaglio → elimina. Quando questa è "TOP", **replica lo stesso livello** su tutte le altre entità.
4. **Albero commessa** (mock 24) e le schermate ricche (Pianificazione, Dashboard, Catture inbox, Asset/libretto).

> In breve: prima i componenti, poi i campi guidati da `field_definition`, poi una entità portata a livello "eccellente" come metro, poi tutte le altre allo stesso metro. Le maschere dicono *come deve apparire*; `field_definition` dice *quali campi*; questo documento dice *quando è finita*.
