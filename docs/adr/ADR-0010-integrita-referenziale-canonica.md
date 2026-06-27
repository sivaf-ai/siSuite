# ADR-0010 — Integrità referenziale canonica: FK obbligatorie + RESTRICT + reattività

**Stato:** Accettato · **Data:** 27/06/2026 · **Chat:** 01.06 (audit totale)
**Contesto governante:** Carta delle regole canoniche siSuite (A–G) + `feedback_db_integrity_canonical`.

## Contesto
Il sistema, cresciuto "a pezzettini per la demo", presentava riferimenti a cataloghi memorizzati come **testo libero** (le 11 colonne `unit`), unicità che **non copriva le righe di sistema**, e un soft-delete (`archived_at`) che **archiviava in silenzio** record ancora referenziati. Questi tre difetti violano le condizioni di base di un gestionale serio: non si referenzia ciò che non esiste, non entrano chiavi duplicate, non si nasconde un master ancora in uso.

## Decisione
1. **Ogni riferimento a un catalogo è una FOREIGN KEY uuid**, mai testo. Le 11 colonne `unit`/`weight_unit` diventano `unit_id`/`weight_unit_id` → `unit_of_measure(id)` con **`ON DELETE RESTRICT`** (migr. 052). Il catalogo non è più aggirabile.
2. **Contratto DTO stabile**: il backend deriva il *codice* via join in lettura (`unit_of_measure.code AS unit`) e risolve *codice→id* in scrittura (`app_resolve_unit(tenant, code)`). Il frontend (`UnitSelect` che salva il codice) resta invariato. Questo disaccoppia la rappresentazione interna (FK) dall'API (codice leggibile).
3. **Unicità che include il sistema** (migr. 053): indici parziali `WHERE tenant_id IS NULL` su `unit_of_measure`/`tax_rate` (le righe di sistema non sono più duplicabili) + il **controllo applicativo tenant-vs-sistema** su INSERT e UPDATE (un tenant non può creare un codice che collide con uno di sistema). Aggiunte le chiavi naturali mancanti (categorie, template, codici risorsa/utente, numeri documento).
4. **Soft-delete con controllo d'uso**: poiché la FK RESTRICT non scatta sull'`UPDATE archived_at`, prima di archiviare un'anagrafica (`material/company/resource/site/asset`) si conta l'uso (`usageGuard`) e, se referenziata, si blocca con **409 che NOMINA il record e le entità referenzianti** (es. «Impossibile eliminare «ONT SKY_OF»: è utilizzato in 3 movimenti, 1 righe documento, 8 unità seriali, 1 giacenze»).
5. **Messaggi d'errore professionali**: l'handler globale traduce `23503` (FK) e `23505` (unique) in messaggi leggibili e localizzati che nominano l'entità/il valore.
6. **Reattività cross-entità** (già in `api/cache.ts`): ogni mutazione invalida la risorsa e le liste/picker/label dipendenti si ricaricano; `useReloadOnEnter` su tutte le liste evita i dati stantii rientrando nella schermata. Nessun relogin.

## Conseguenze
- **Positive**: impossibile referenziare una UM inesistente; impossibile cancellare/archiviare una UM o un'anagrafica in uso; impossibile duplicare un codice (anche vs sistema); errori chiari; UI sempre aggiornata.
- **Costo**: ogni nuova colonna che cita un catalogo deve nascere FK (mai testo). Ogni nuova anagrafica archiviabile deve registrare i propri riferimenti in `usageGuard`. Ogni nuovo catalogo con righe di sistema deve avere l'indice parziale `WHERE tenant_id IS NULL` + il check applicativo.
- **`category` resta testo dove è tassonomia/metadato** (`lookup_value`, `canonical_state`, `field_definition`, `skill`, `price_list_item.category` per la pivot): non è un catalogo gestito, quindi **non si forza la FK** (decisione esplicita). `material` usa già `category_id` FK a `material_category`.

## Alternative scartate
- *Mantenere `unit` testo con FK testuale `(tenant_id, code)`*: impossibile per lo split sistema/tenant (le righe di sistema hanno `tenant_id NULL`); avrebbe richiesto FK composita non soddisfacibile.
- *Tenere il testo denormalizzato accanto alla FK*: contraddice CLEAN SLATE e lascia due fonti di verità.
