# DONE — Blocco B-ter · Generalizzazione "Ordine di lavoro" (ADR-0006, brief v2.4)

> Data: 17/06/2026 · Riferimento: `BRIEF_MASTER…v2_4` Parte 6.11 + Parte 8 (B-ter) + ADR-0006.

## 1. Migrazione 032 (applicata)
`032_work_order_generalize.sql`:
- **Rename colonne**: `operator_company_id` → **`principal_company_id`** (committente esterno generico), `operator_order_id` → **`principal_order_ref`**. Rinominati anche FK (`work_order_principal_company_id_fkey`) e UNIQUE (`work_order_principal_ref_uk`).
- **Nuova colonna `type_id`** → `lookup_value('work_order_type')` + indice.
- **Seed tipi di sistema** (tenant NULL, rinominabili per tenant): **Attivazione** (default), Manutenzione, Guasto.
- Commento tabella generalizzato (non più "FTTH").

## 2. Codice aggiornato (Blocco B già fatto)
- **Shared** `entities.ts`: `principalCompanyId/principalOrderRef/typeId` in create/update + DTO (`principalCompanyName`, `typeId`, `typeLabel`).
- **Backend** `routes/workOrders.ts`: query/insert/update sui nuovi nomi; `type_id` con default canonico `activation`; **import dedup** ora su `(tenant, principal_company_id, principal_order_ref)`; LIST_SELECT espone `type_label`.
- **Frontend**: `OrdinativiPage` (colonna **Committente / Rif. esterno · tipo**, titolo **"Ordini di lavoro"**), `OrdinativoDetailPage` (box Pratica con **Committente**, **Rif. esterno**, nuovo **Tipo** select; titolo = tipo o "Ordine di lavoro").
- **Menu/i18n**: voce **"Ordini di lavoro"** (it/en/es), **tolto il badge "(FTTH)"**; `menu.ts` mobile allineato.
- **Loader demo**: work_order su `principal_*` + `type_id` (default activation).

## 3. Verifiche (test reali)
- Schema: `work_order` ha `principal_company_id`, `principal_order_ref`, `type_id`.
- Lista: committente "Sirti S.p.A.", rif. esterno, **tipo "Attivazione"**.
- Import dedup su `(tenant, principal_company_id, principal_order_ref)` (per committente).
- Typecheck pulito (shared+backend+frontend); demo ricaricata pulita.

### Come provare
owner@fibra.demo → menu **Lavoro → Ordini di lavoro** (niente più "FTTH"). Apri un ordine → box Pratica con **Committente / Rif. esterno / Tipo**.

## 4. Resta del v2.4 (prossimi blocchi, prima di F)
- **Blocco M** (CRITICO): migrare TUTTE le liste/CRUD esistenti allo standard v2 (`EntityList`/`ObjectPage`). Inventario: Soggetti, Commesse (ALTA) → checkpoint → Asset, Risorse, Attività, Utenti, Catture (MEDIA) → Stati, Numerazioni, Piano (BASSA). Il brief impone un **checkpoint dopo Soggetti+Commesse**.
- **Blocco A-bis**: Field Builder (CRUD `field_definition` + UI Impostazioni), permesso `field_definition:manage`.

## 5. File toccati
- DB: `032_work_order_generalize.sql`.
- Shared: `entities.ts`, `nav.ts`, `menu.ts`.
- Backend: `routes/workOrders.ts`, `demo/runner.ts`.
- Frontend: `pages/OrdinativiPage.tsx`, `pages/OrdinativoDetailPage.tsx`, `i18n/*`.
