# Gestione SOFT-DELETE — archiviazione, vista archiviati, ripristino, eliminazione definitiva, audit (v1)

**Data:** 28/06/2026 · **Chat:** 01.06 · **Migrazioni:** 055 (`archived_by` + `audit_log`).
**Scopo:** documentare in dettaglio come è gestito il soft-delete in siSuite — modello dati, integrità referenziale, le quattro funzioni standard di toolbar (Mostra archiviati · Ripristina · Elimina definitivamente · Storico), il menu overflow, e l'elenco delle entità incluse/escluse con motivazione. Queste funzioni sono **standard della toolbar**.

---

## 1. Principio

**Cancellare = archiviare** (soft-delete): il record non viene rimosso, ma marcato `archived_at`/`archived_by`. Sparisce dalle viste normali ma resta recuperabile e tracciato. L'eliminazione **fisica** (purge) è un'azione separata, esplicita, riservata e protetta dall'integrità referenziale.

Vantaggi: niente perdite per errore (ripristinabile), storico/conformità (chi ha fatto cosa), integrità preservata (i riferimenti storici restano validi).

---

## 2. Modello dati

- **`archived_at timestamptz`** su ogni tabella archiviabile (NULL = attivo). 13 tabelle.
- **`archived_by uuid`** (migr 055): l'utente che ha archiviato (join `app_user`).
- **`audit_log`** (migr 055): registro generale delle azioni.
  | Colonna | Significato |
  |---|---|
  | tenant_id | tenant (RLS) |
  | entity | tabella logica (es. `material`) |
  | entity_id | id del record |
  | action | `archive` · `restore` · `purge` · (estendibile: create/update/delete) |
  | label | nome leggibile del record al momento dell'azione |
  | user_id | chi ha agito |
  | at | quando |
  | detail | jsonb opzionale |
  RLS tenant + GRANT SELECT/INSERT a `sisuite_app`. Indici su `(tenant,entity,entity_id)` e `(tenant, at DESC)`.

---

## 3. Integrità referenziale (il punto chiave)

Il soft-delete deve rispettare le stesse garanzie della cancellazione fisica:

1. **Archiviazione bloccata se il record è REFERENZIATO** (regola Carta DB-5). La FK `ON DELETE RESTRICT` non scatta sull'`UPDATE archived_at` → serve un **controllo d'uso applicativo** (`context/usageGuard.ts`): prima di archiviare un'anagrafica si contano i riferimenti; se >0 → **409** col nome del record e le entità che lo usano (es. «Impossibile eliminare «ONT SKY_OF»: è utilizzato in 3 movimenti, 1 righe documento, 8 unità seriali, 1 giacenze»). Attivo su material/company/resource/site/asset (le anagrafiche con `*_REFS`).
2. **Vista archiviati** = risolve il "lato oscuro" del soft-delete: poiché un record archiviato è invisibile, prima non si capiva *perché* una UM/anagrafica risultasse "in uso" (era usata da un record archiviato). Ora la vista archiviati + lo storico rendono tutto ispezionabile.
3. **Eliminazione definitiva (purge)** = hard-delete, consentita **solo su record già archiviato**, protetta dalle **FK `ON DELETE RESTRICT`**: se il record è ancora referenziato, Postgres solleva `23503` → l'handler globale risponde **409** leggibile. Quindi non si possono creare riferimenti penzolanti.
4. **Unicità archived-aware** (regola DB-4): gli UNIQUE "chiave naturale" sono parziali `WHERE archived_at IS NULL` → un record archiviato **non blocca** la ricreazione della stessa chiave; un duplicato *attivo* resta bloccato.

---

## 4. Le quattro funzioni standard (backend)

Per ogni entità abilitata, endpoint uniformi (esempio `material`):
- **Archiviare**: `DELETE /<plural>/:id` → controllo d'uso (se anagrafica) → `archived_at=now(), archived_by=userId` + `logAudit('archive')`.
- **Vista archiviati**: `GET /<plural>?archived=1` → ritorna **solo** gli archiviati (`archived_at IS NOT NULL`); altrimenti solo gli attivi. Il DTO espone `archivedAt` e `archivedByName`.
- **Ripristinare**: `POST /<plural>/:id/restore` (permesso `:update`) → `archived_at=NULL, archived_by=NULL` + `logAudit('restore')`.
- **Eliminare definitivamente**: `DELETE /<plural>/:id/purge` (permesso `:delete`/`:manage`) → 409 se non archiviato; altrimenti hard-delete (FK RESTRICT → 409 se referenziato) + `logAudit('purge')`.
- **Storico**: `GET /audit?entity=<singolare>&entityId=<id>` → timeline azioni con nome utente.

Helper: `context/audit.ts` (`logAudit`), `context/usageGuard.ts` (`findUsage`/`usageMessage`).

---

## 5. UI standard di toolbar + menu OVERFLOW (⋮)

Le funzioni soft-delete sono **funzioni standard della toolbar liste** (componente `ui/EntityList`), ma — essendo usate meno delle azioni principali — vivono in un **menu overflow (⋮)** per non allungare la toolbar (stesso metodo usato per il collasso in mobile, raggruppando per tipologia e lasciando in vista le 2-3 azioni più usate).

- **Toolbar principale** (vista normale): Modifica · Duplica · Elimina (archivia) · Nuovo +.
- **⋮ Overflow** (vista normale): Esporta · Storico · **Mostra archiviati**.
- **Vista archiviati**: toolbar principale = **Ripristina** · **Elimina definitivamente**; ⋮ overflow = Storico · Esporta · **Torna agli attivi**.
- Ogni voce dell'overflow ha **icona + etichetta** (sempre leggibile, anche su mobile). Le righe archiviate mostrano il badge **"Archiviato (da X)"**.
- **Stato vista persistito** (`useStickyState`, sessionStorage): entrando nel CRUD di un archiviato e tornando indietro si **rientra nella stessa vista** (archiviati resta archiviati).
- Conferme: Ripristina = diretta; Elimina (archivia) = «Vuoi eliminare «X»?»; Elimina definitivamente = «Eliminazione DEFINITIVA e irreversibile di «X».» (conferma unica). Mai popup nativi.

Componenti: `ui/EntityList` (toolbar+overflow+azioni), `ui/AuditDialog` (storico), `ui/ConfirmDialog`.

---

## 6. Entità INCLUSE (soft-delete completo in UI)

Anagrafiche/entità con lista `EntityList` e `archived_at`:

| Entità | Lista | Endpoint base |
|---|---|---|
| Articoli (material) | MaterialiPage | `/materials` |
| Soggetti (company) | ClientiPage | `/companies` |
| Risorse (resource) | RisorsePage | `/resources` |
| Asset (asset) | AssetPage | `/assets` |
| Siti (site) | *(backend pronto; lista UI via albero — vedi §7)* | `/sites` |
| Commesse (engagement) | EngagementsPage | `/engagements` |
| Ordini di lavoro (work_order) | OrdinativiPage | `/work-orders` |
| Magazzini/Ubicazioni (stock_location) | MagazzinoPage | `/stock/locations` |
| Unità di misura (unit_of_measure) | UnitsPage | `/units` (righe sistema non archiviabili) |
| Aliquote IVA (tax_rate) | TaxRatesPage | `/tax-rates` (righe sistema non archiviabili) |
| Competenze (skill) | SkillsPage | `/skills` (ora anagrafica completa con CRUD) |

Tutte: archivia(+controllo d'uso dove anagrafica) · vista archiviati · ripristina · purge · storico · audit. Le azioni soft-delete sono nel **menu ⋮** della toolbar (le 2-3 principali restano a vista). Il toggle "Mostra archiviati" è **effimero** (`useArchivedView`): si azzera rientrando nella maschera.

---

## 7. Entità ESCLUSE (e perché)

| Entità | Stato | Perché esclusa (per ora) |
|---|---|---|
| **Categorie articolo** (`material_category`) | ha `archived_at`, backend archivia con controllo d'uso | UI ad **albero** (non `EntityList`, niente toolbar standard): la vista archiviati/ripristino in un albero è una funzione del **futuro standard "entità ad albero"** (vedi `GESTIONE_ALBERO_categorie_v1.md`, §7). Da definire insieme. |
| **Documenti**: Ordini d'acquisto (`purchase_order`), Pick list, Documenti di magazzino (`stock_document`) | `purchase_order` ha `archived_at` | I documenti hanno un **ciclo di vita per STATO** (bozza → confermato → ricevuto/postato), non per archiviazione: le **bozze** si cancellano (hard, solo draft), i **confermati** non si cancellano ma si **stornano con rettifica** (hanno generato movimenti). Un "archivia/ripristina" qui creerebbe ambiguità con lo stato. → gestione separata per stato, non soft-delete. |
| **Unità seriali** (`stock_serial_unit`) | ha `archived_at` | Hanno un **ciclo di vita per STATO** fisico (in_stock/installed/dismesso…) e vivono **dentro le tab dell'Articolo**, non come lista a sé con toolbar. L'archiviazione di un seriale è legata al suo stato, non a un soft-delete generico. |
| **Modelli di commessa** (`template`) | ha `archived_at` | Gestiti in **Impostazioni › Modelli** (pannello, non `EntityList`). Entità di configurazione interna, bassissima frequenza di "vista archiviati". Eventuale fast-follow se richiesto. |
| **Report salvati** (`saved_report`) | ha `archived_at` | **Preset interni** dell'utente (definizioni di report), non un'anagrafica di dominio. Si cancellano direttamente dal gestore preset; una vista archiviati sarebbe sovradimensionata. |

> In sintesi: il soft-delete completo è per le **anagrafiche con lista standard**. Documenti e unità seriali usano un **ciclo per stato** (non archiviazione). Categorie ad albero e pannelli di configurazione restano fuori finché non definiamo lo standard albero/impostazioni.

---

## 8. File coinvolti
- DB: `db/migrations/055_archive_audit.sql` (archived_by + audit_log).
- Backend: `context/audit.ts`, `context/usageGuard.ts`; route `materials/companies/resources/sites/assets/engagements/workOrders/stock` (archive+restore+purge+?archived), `routes/audit.ts` (storico).
- Shared: `entities.ts`/`types.ts` (`archivedAt`/`archivedByName` sui DTO; `AuditEntryDto`).
- Frontend: `ui/EntityList.tsx` (toolbar+overflow+azioni archiviati), `ui/AuditDialog.tsx` (storico), `api/hooks.ts` (`useStickyState`); pagine Materiali/Soggetti/Risorse/Asset/Commesse/Ordini/Magazzini.
- Standard: `docs/STANDARD_siSuite.md` regole DB-4/DB-5/DB-5-bis + (UI) overflow.
