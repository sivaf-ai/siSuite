# ADR-0001 — Modello dati per le entità ad albero

- **Stato:** Accettato · **Data:** 28/06/2026 · **Chat:** 01.05
- **Destinazione repo:** `docs/adr/ADR-0001-modello-dati-albero.md` (immutabile dopo Accettato)
- **Numero provvisorio:** allineare alla sequenza ADR reale del repo prima del merge.

## Contesto
siSuite ha già tre alberi (`material_category`, `site`, `stock_location`) implementati con lista di adiacenza (`parent_id` self-FK). Due dossier paralleli (sisuite-modern, siERP) avevano aggiunto path materializzati come cache e meccanismi di spostamento. Serve un modello unico, semplice e robusto, valido anche per WBS commessa e piano dei conti, consumabile da un generatore di codice.

Verifica dei pattern dei leader (giu 2026): consenso nel partire dalla **lista di adiacenza** (semplice, ottima per aggiornamenti frequenti) e aggiungere un **percorso materializzato solo come cache derivata** quando le letture lo richiedono; il re-parenting su path materializzato è costoso.

## Decisione
1. **Verità = lista di adiacenza**: `parent_id` (self-FK, `ON DELETE RESTRICT`) + `sequence integer` per l'ordine tra fratelli (convenzione siSuite già in uso).
2. **Nessuna colonna path sorgente.** Percorso/breadcrumb derivati a runtime con CTE ricorsiva. Una colonna `path` di **cache** è ammessa solo per volumi elevati e, se introdotta, va ricalcolata **in transazione** a ogni spostamento.
3. **Anti-ciclo a livello DB** con trigger `WITH RECURSIVE` (generalizzazione del reale `stock_location_no_cycle`) su `BEFORE INSERT OR UPDATE OF parent_id`, su **tutti** gli alberi.
4. **Integrità**: gerarchia `RESTRICT` (mai CASCADE); soft-delete `archived_at/by`; unicità nome **per livello**, archived-aware; RLS `FORCE` con `app_current_tenant()`/`app_is_platform_admin()`.
5. **Allineamento**: migrazione **058** aggiunge a `material_category` (`sequence`, `description`, `image_url`, `is_system`, trigger anti-ciclo) e corregge `site` (`ON DELETE CASCADE` → `RESTRICT`).

## Conseguenze
- **+** Semplicità, scritture/spostamenti economici, una sola query piatta per il client, nessun rischio di path disallineati.
- **+** Coerente con lo schema esistente e con le regole canoniche.
- **−** Letture di sottoalberi profondi richiedono una CTE ricorsiva (accettabile per cataloghi fino a migliaia di nodi). Se in futuro servisse, si valuta la cache `path` (rivedibile).

## Alternative scartate
- **Materialized path / ltree come sorgente**: re-parenting costoso, rischio di disallineamento, complessità non giustificata ai volumi attuali.
- **Closure table / nested set**: potenti per letture massive ma onerosi in scrittura e in manutenzione; rinviati a un eventuale ADR futuro solo per alberi enormi.

*Vedi: STANDARD_entita_albero_v1_0_01_05 §1, §3.*
