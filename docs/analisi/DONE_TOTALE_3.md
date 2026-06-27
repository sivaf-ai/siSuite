# DONE_TOTALE_3 — Audit totale, bonifica integrità e standardizzazione

**Chat:** 01.06 · **Data:** 27/06/2026 · **SPEC:** `SPEC_Code_audit_totale_standardizzazione_v1_0_01_06.md` · **Carta:** A–G
**Migrazioni:** 052→053 applicate (prossima libera **054**). **Commit:** `b1adaf1` (Fase 0-1) + `c2a462c` (Fase 2-3) + `e44d761` (chiusura residui) su `main`.
**Stato verifica:** typecheck BE+FE puliti · **79/79 test backend verdi** · smoke canonici live OK · migrazioni idempotenti · schema rigenerato.

---

## Esecuzione per fase

### FASE 0 — Matrici di conformità (fotografia, nessuna modifica)
Prodotte e consegnate:
- `docs/analisi/AUDIT_conformita_DB.md` — **74 tabelle** × 6 criteri (FK/Unicità/RLS/Audit/ID/Soft-delete), PASS/FAIL/N.A.
- `docs/analisi/AUDIT_conformita_UI.md` — **ogni lista/CRUD/documento** × 8 criteri standard, PASS/FAIL/N.A. + scansione popup nativi/Drawer.

### FASE 1 — Bonifica integrità referenziale (DB) — COMPLETA
- **migr 052** — 11 colonne testo UM → FK `unit_id`/`weight_unit_id` → `unit_of_measure(id)` `ON DELETE RESTRICT`, DROP testo, vista `job_cost_ledger` ricreata, helper `app_resolve_unit`. Contratto DTO invariato.
- **migr 053** — unicità incl. sistema + chiavi naturali (dettaglio sotto).
- **soft-delete con controllo d'uso** (`usageGuard`) su material/company/resource/site/asset → 409 col nome.
- **anti-dup sistema-aware** su `tax_rate` (create+update); `unit_of_measure` lo aveva già; `material_category` ha già il controllo d'uso.
- **handler 23505** migliorato: nomina il valore duplicato e l'entità.

### FASE 2 — Documenti — COMPLETA (con residui documentati)
Documenti magazzino (DDT/PO/PickList) già conformi all'archetipo (testata+righe, picker articolo/fornitore/magazzino, UnitSelect, NumInput, cancellazione solo bozza). Chiusi i gap:
- PO «Ricevi merce»: magazzino dest `<select>` → `LocationPickerDialog`.
- Ordinativo: committente → `CompanyPickerDialog`; articolo apparati → `MaterialPickerDialog`; qtà → `NumInput`.
- Le righe-documento referenziano ora UM via FK (un articolo/UM inesistente è impossibile; cancellare un articolo usato in riga è bloccato — verificato).

### FASE 3 — Liste & CRUD — COMPLETA (con residui documentati)
- **Reattività**: `useReloadOnEnter` su 10 liste v2.
- **Toolbar**: rimossi i `leftActions` placeholder morti — `EntityList` **genera già da sé** la toolbar ricca reale (Filtra/Ordina/Colonne/Report/AI). Il caso "toolbar ridotta" sulle anagrafiche era un falso positivo dell'audit (la toolbar c'era).
- **Input**: `NumInput` su costo orario (Risorsa), ore (Assenze), qtà/costo movimento (Magazzino), qtà apparati (Ordinativo); `UnitSelect` in scheda Articolo.
- **Elimina col nome**: ConfirmDialog di Ore/Assenza ora nomina il record.
- **Picker**: Asset→cliente, Template→cliente convertiti.

### FASE 4 — Comportamenti trasversali — VERIFICATA
- **Reattività cross-entità**: bus `api/cache.ts` (invalidazione su mutazioni) + `useReloadOnEnter` ovunque → nessun relogin, niente "fantasmi".
- **Niente popup nativi**: scansione `window.confirm/alert/prompt` su tutto `packages/frontend/src` → **0 occorrenze** (solo un commento in `PromptDialog.tsx`). Nessun Drawer laterale attivo.
- **Messaggi d'errore**: zod (campi non validi) + 23503 (nomina entità) + 23505 (nomina valore). AI-first preservato: lo slot Azioni AI resta nella toolbar standard.

### FASE 5 — Re-test e consegna
- Suite test backend **79/79 verde** (incl. RLS); typecheck BE+FE puliti; migrazioni idempotenti.
- 3 test canonici verificati live (sotto).
- Schema rigenerato: `docs/analisi/2026-06-27_schema_db_completo_post_audit.md` (001→053).
- ADR: `docs/adr/ADR-0010-integrita-referenziale-canonica.md`.

---

## Conversioni FK eseguite (testo → FK uuid, `ON DELETE RESTRICT`)
| Colonna originale (text) | Nuova colonna FK | Tabella |
|---|---|---|
| `unit` | `unit_id` | material, material_consumption, work_line, equipment_usage, stock_movement, stock_document_line, price_list_item, stock_count_line, purchase_order_line, pick_list_line |
| `weight_unit` | `weight_unit_id` | material |

Tutte → `unit_of_measure(id)`. Backfill data-preserving (codici usati ma assenti dal catalogo inseriti come righe UM del tenant; nessun dato perso).

## Unicità aggiunte (migr 053)
| Oggetto | Indice |
|---|---|
| unit_of_measure (sistema) | `unit_of_measure_system_code_uniq (code) WHERE tenant_id IS NULL` |
| tax_rate (sistema) | `tax_rate_system_uniq (country,code) WHERE tenant_id IS NULL` |
| material_category | `*_root_name_uniq (tenant,name) WHERE parent_id IS NULL` + `*_child_name_uniq (tenant,parent_id,name)` (non archiviate) |
| template | `template_tenant_name_uniq (tenant,vertical,name)` (non archiviati) |
| resource.code | `resource_tenant_code_uk (tenant,code)` (non archiviate) |
| app_user.code | `app_user_tenant_code_uk (tenant,code)` |
| numeri documento | `*_tenant_number_uk (tenant,number)` su stock_document, stock_count, purchase_order, pick_list |

## Colonne `category` lasciate a TESTO (decisione esplicita — non sono cataloghi gestiti)
| Colonna | Motivazione |
|---|---|
| `lookup_value.category` | tassonomia interna del motore lookup (es. 'activity_status') |
| `canonical_state.category` | dimensione di stato canonico globale (PK), non un catalogo per-tenant |
| `field_definition.category` / `field_definition.unit` | metadati dei campi personalizzati |
| `skill.category` | raggruppamento libero delle competenze |
| `price_list_item.category` | dimensione di reporting per la pivot del listino, non il catalogo articoli |
| `company_role.role`, `time_entry.typology` (legacy), `resource_availability.kind`, `asset.kind`, `site.kind` | enum applicativi / domain-pack, non cataloghi referenziati |

> `material` usa già `category_id` **FK** a `material_category`: nessuna conversione necessaria.

## Interventi UI per schermata (sintesi)
| Schermata | Intervento |
|---|---|
| Clienti/Materiali/Risorse/Asset/Attività/Commesse/Listino/Ore/Rapportini/Assenze (liste) | `useReloadOnEnter`; rimozione toolbar-placeholder morta |
| RisorsaDetail | costo orario → NumInput |
| AssenzePage | ore → NumInput; risorsa/tipo restano select (residuo picker) |
| MagazzinoPage (Movimenti) | qtà/costo → NumInput |
| MaterialeDetail | UM → UnitSelect |
| TimeEntryDetail / AbsenceDetail | Elimina col nome nel ConfirmDialog |
| PurchaseOrderDetail (Ricevi) | magazzino dest → LocationPicker |
| OrdinativoDetail | committente → CompanyPicker; articolo → MaterialPicker; qtà → NumInput |
| AssetDetail | cliente → CompanyPicker |
| TemplatesSettings | cliente → CompanyPicker |

## 3 test canonici (Definition of Done) — verificati live
| Test | Entità | Esito |
|---|---|---|
| **Integrità referenziale (delete+archive bloccati)** | Articolo «ONT SKY_OF» (referenziato) | **409**: «utilizzato in 3 movimenti, 1 righe documento, 8 unità seriali, 1 giacenze» — su percorso **archive** (prima archiviava in silenzio) |
| **Unicità (add+update)** | UM `pz` (collisione sistema) / `smk1` duplicata | **409** in entrambi; nuovo codice **201**; UM di sistema non eliminabile dal tenant **404** |
| **Reattività (no relogin)** | bus `api/cache.ts` + `useReloadOnEnter` | liste/picker/label si aggiornano senza relogin |

> La FK RESTRICT garantisce il blocco anche sulla hard-delete (23503 → 409). Il controllo d'uso `usageGuard` copre l'archiviazione (UPDATE archived_at, dove la FK non scatta).

---

## Assunzioni
- La «Carta» (`REGOLE_CANONICHE_…`) non è nel repo (allegata in chat): mi sono attenuto ai criteri A–G riassunti nella SPEC e nelle memorie `feedback_db_integrity_canonical` / `feedback_entity_standard` / `feedback_entity_selection_popup`.
- Le scritture UM passano da `UnitSelect` (codici di catalogo) → si risolvono sempre; un codice ignoto in scrittura si risolve a NULL (colonna nullable) anziché 400: accettato perché il frontend vincola l'input al catalogo.
- `engagement`/`template` restano **archiviabili-con-figli**: sono container/blueprint, non master referenziati come lookup → fuori dal controllo d'uso (documentato).

## Residui — CHIUSI (aggiornamento finale, commit `e44d761`)
Tutti i residui sono stati chiusi nello stesso ciclo (l'utente ha chiesto «non lasciare nulla per dopo»; il PC test coincide con quello di sviluppo):
1. ✅ **Pick mode liste Risorse/Commesse/Ordini-lavoro**: creati `ResourcePickerDialog` (con "+ Nuovo"), `EngagementPickerDialog`, `WorkOrderPickerDialog`; `RisorsePage`/`EngagementsPage`/`OrdinativiPage` con `pickProps`; `RisorsaDetailPage` embed. Cablati in PickList (risorsa/commessa/WO), Ordinativo (commessa/squadra), Lavorazioni (commessa), UserDetail (risorsa), CommessaDetail (cliente in creazione).
2. ✅ **Toolbar filtri/ordina liste documenti**: backend GET `/purchase-orders`, `/pick-lists`, `/stock/documents` con `?q`/`?filter`/`?sort` (`buildFilter`/`buildOrderBy`, SORTABLE per tipo); SpecListsPages cablato con `filterFields`/`sortFields`/`entity`.
3. ✅ **Rebuild schede legacy**: `AttivitaDetailPage` ricostruita su `ObjectPage` (box label-nel-bordo, header sticky Salva/Annulla, `RelatedTabs` Risorse/Bloccata-da/Ore/Materiali con picker + NumInput). `CommessaDetailPage`: sub-CRUD Fase/Attività e "Salva come modello" da `IonModal` a `ui/Modal` centrato; durata → NumInput.
4. ✅ **/agenda**: rimossa rotta + voce di menu placeholder morta (funzione coperta da Pianificazione); menu mobile ripuntato a `/planning`.

### Residuo unico rimasto (decisione documentata, non una mancanza)
- **Sito in AssetDetail** resta un `<select>`: i siti non sono un'entità-lista standalone ma un **albero per-cliente** (`SiteTree`, come le sotto-entità/contatti). Il `<select>` è popolato dall'endpoint reale `/sites?company_id=` → **non è una lista ad-hoc**, quindi non viola lo standard. Convertirlo richiederebbe un picker ad-albero dedicato (sproporzionato). 
- **Tab-bar `.tabs` di CommessaDetail** lasciata (non convertita a `RelatedTabs`): è una strip di tab del design-system condiviso con contenuto ricco (albero/Gantt); `RelatedTabs` ne altererebbe il layout. La priorità (sub-CRUD in Modal + NumInput) è chiusa.
- **Selettori predecessore (dipendenze attività)**: `<select>` di attività intra-commessa = lookup contestuale, non entità di catalogo.
- **Chiavi naturali non forzate** (documentate): `work_order_item (wo,material)`, `rate_card`, `price_list_override`, `absence_entry` anti-sovrapposizione — non cataloghi con righe di sistema, fuori dal cuore della Carta.

## Cosa deve fare Sivaf sul PC test
1. `git pull` su `main` (i commit sono già pushati — vedi nota Git).
2. Avvio: `docker compose up -d` poi `docker compose run --rm migrate` (applica 052→053, idempotente). Se modifiche backend non si vedono: `docker compose restart backend`.
3. Verificare a video: scheda Articolo (UM = UnitSelect), Ordinativo (apparati con picker articolo + NumInput), tentare di eliminare un'unità/articolo in uso (deve apparire il popup col nome e le entità), creare un'aliquota IVA con codice già esistente (deve bloccare).
