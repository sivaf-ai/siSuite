# DONE — Blocco B · Ordinativi FTTH (maschera "metro") + prerequisiti DB

> Data: 16/06/2026 · Chat POWERCOM v1.0 01.03 · Riferimento: `BRIEF_Claude_Code_POWERCOM_v1_0_01.03.md`
> **CHECKPOINT del brief (§0): mi fermo qui e mostro a Ricardo prima di replicare il pattern sulle altre maschere.**

## 1. Cosa ho fatto

### Prerequisito DB (brief §2) — completo e verificato
- Applicate le migrazioni **024→028** (+ **029** nuova, vedi sotto) via il servizio one-shot `migrate` (migrazioni + bootstrap/grants). `sisuite_migrations` ora a 29 righe.
- **Incongruenza trovata e risolta** (vedi §4.1): il runner `migrate.ts` andava in PK-violation con le migrazioni 024+ che si auto-tracciano.
- **RLS verificata** su `work_order` con due tenant: tenant A vede solo la sua riga, tenant B solo la sua, tenant inesistente 0 righe. Dati di test creati e poi ripuliti.
- **Schema rigenerato**: `docs/analisi/2026-06-16_schema_db_completo.md` (`pg_dump --schema-only`), con tutte le nuove tabelle e la vista `job_cost_ledger`.

### Migrazione 029 (nuova, additiva) — `029_work_order_fields.sql`
Righe `field_definition` di **sistema** (`tenant_id NULL`, `vertical='fiber'`) per l'entità **`work_order`**: `connection_type` (select FTTH/FTTB/FTTC), `socket_id`, `attenuation_db` (dB), `ont_serial`, `work_order_ref`. Così gli attributi fibra dell'ordinativo sono guidati da `field_definition` e **non** hardcodati nella UI (brief §3.2, §6.1). I campi fibra esistenti in 006 erano legati ad `asset`/`engagement`, non a `work_order`.

### Backend
- `packages/shared/src/permissions.ts`: nuove risorse RBAC **`work_order`** (create/read/update/delete/assign/import), **`serial`** (read/manage/secret_read), **`pii`** (read). Grant ai ruoli di sistema: Owner (tutto via `*`); Planner (work_order pieno + serial:read/manage); Tecnico (work_order:read/update + serial:read); Contabile/Sola lettura (read). `pii:read` e `serial:secret_read` **solo Owner** di default (sensibili). Bootstrap ha riscritto `role_permission` (165→189 grant).
- `packages/shared/src/menu.ts`: voce **Ordinativi (FTTH)** (`/work-orders`, gruppo Lavoro/Campo, permesso `work_order:read`, desktop+mobile).
- `packages/shared/src/entities.ts`: schemi Zod + DTO `WorkOrder*` (create/update/assign/import, subject PII, item, serial).
- `packages/backend/src/routes/workOrders.ts` (registrata in `index.ts`):
  - `GET /work-orders` — lista con **viste** (Tutti/Da assegnare/In lavorazione/Completati/KO), ricerca (ID pratica, indirizzo, gestore, seriale), conteggi viste, paginazione. Intestatario **mascherato** salvo `pii:read`.
  - `GET /work-orders/:id` — dettaglio con intestatario (mascherato/in chiaro per permesso), apparati pianificati, seriali installati.
  - `POST/PATCH/DELETE` — crea (code da `number_series` key `work_order`, stato default canonico `assigned`, attributi validati da `field_definition`) / modifica (upsert intestatario) / soft-delete.
  - `PUT /work-orders/:id/items` — sostituisce gli apparati pianificati.
  - `POST /work-orders/assign` — assegnazione bulk a squadra.
  - `POST /work-orders/import` — import righe già mappate; **rileva i doppioni** sull'UNIQUE `(tenant, operator_company, operator_order_id)`.

### Frontend (mock 44 = target vincolante)
- `components/MaskedField.tsx` (**MaskedField/PiiGate**): valore mascherato; con permesso parte nascosto e si rivela con "Mostra"; senza permesso lucchetto inerte. Il valore in chiaro **non arriva mai** al client senza `pii:read` (gating server-side).
- `pages/OrdinativiPage.tsx` — **Lista** mock 44: righe a 2 livelli, viste, toolbar a sole icone con tooltip, intestatario mascherato in lista, nessuna icona-azione sulle righe, click riga → scheda.
- `pages/OrdinativoDetailPage.tsx` — **Scheda** (Object Page) mock 44: header sticky con Salva/Annulla, `code` pill + StatusPill, capture-bar AI (placeholder Blocco F), box **Pratica / Intestatario(PII) / Indirizzo / Dati tecnici fibra (da field_definition) / Apparati pianificati**, tab correlate (Seriali/Materiali/Foto/Storico). Crea+vedi+modifica in un'unica pagina (`/work-orders/new` e `/work-orders/:id`).
- `pages/ordinativi.css` — stili mock 44 scoped sotto `.wo`, solo design-token v5.
- Rotte in `AppShell.tsx`, icona menu (`Cable`) in `icons.ts`.

## 2. Come l'ho verificato (test funzionale reale)
- **DB**: migrazioni applicate (log OK), RLS a due tenant (isolamento confermato), schema dump rigenerato.
- **Backend** (login `owner@fibra.demo` / `Demo123!` su tenant *Fibra Demo*):
  - `POST /work-orders` → crea `2026-0001`, stato `assigned`, attributi (`connection_type=FTTH`) validati.
  - `GET /work-orders` → viste e conteggi corretti.
  - **PII gating provato su due ruoli**: Owner (con `pii:read`) vede `Mario Rossi` / `3331234567`; Tecnico `marco@fibra.demo` (senza `pii:read`) vede `M•••• R••••` / `••• ••• •• 67` (`unmasked=false`).
  - `POST /work-orders/import` → 2 righe: 1 creata, 1 **doppione** segnalato.
- **Frontend**: `tsc --noEmit` pulito (shared + backend + frontend); tutti i moduli nuovi compilati da Vite (HTTP 200, nessun errore di transform). La verifica **visiva** click-through è il checkpoint per Ricardo.

### Come provare sul PC (browser, larghezza telefono o desktop)
1. App: `http://localhost:5173` → login **owner@fibra.demo / Demo123!** (tenant Fibra Demo, già con 2 ordinativi demo).
2. Menu **Lavoro → Ordinativi (FTTH)** → lista con viste; clic su una riga → scheda completa.
3. Per provare il mascheramento PII: login **marco@fibra.demo / Demo123!** (Tecnico) → intestatario mascherato, bottone "Mostra" bloccato.

## 3. Risposte alle domande §12 del brief (decise in autonomia, come da regola progetto)
1. **Rapportino testata**: la tabella **`work_report` esiste già** (migrazione 017). **Riuso quella** (niente nuova tabella). → Blocco F.
2. **Import CSV ordinativi**: nessun tracciato Sirti fornito → **mapping configurabile lato client**; il backend riceve righe già mappate (`POST /work-orders/import`) e gestisce i doppioni. L'editor di mapping CSV nella toolbar è il prossimo step del Blocco B-bis.
3. **GoTrue**: wiring auth **già fatto** (container `sisuite_auth`, `AuthContext`, provisioning utenti demo). Niente blocco a parte.
4. **Cifratura `secrets` seriale**: **applicativa** (chiave lato backend). Per il checkpoint **non** memorizzo segreti via API (niente plaintext): mostro solo il flag `hasSecret`; cifratura+reveal gated da `serial:secret_read` → Blocco C.
5. **Export CPM**: nessun formato fornito → parto con **Excel "consuntivo per WBS/voce" generico** → Blocco G.

## 4. Deviazioni dal brief (con motivo)
### 4.1 Fix al runner migrazioni (non era previsto)
Le migrazioni 024–028 fanno `INSERT INTO sisuite_migrations ... ON CONFLICT DO NOTHING`, ma `migrate.ts` faceva un secondo INSERT **senza** ON CONFLICT → PK violation al primo run. Aggiunto `ON CONFLICT (filename) DO NOTHING` in `packages/backend/src/migrate.ts`. (Le migrazioni 024–028 sono immutabili: ho toccato solo il runner.)

### 4.2 Scope "Blocco A" — riuso vs ricostruzione
Il frontend esistente (design system v5) **già implementa** gran parte degli archetipi del Blocco A: `AppShell`, `EntityForm` da `field_definition` + Zod, `StatusPill`, `Num/Money/Dur` (= MoneyCell/NumberCell/DurationCell), `MasterDetail`/`FormPage`/`DataTable`. Ho quindi **riusato** questi e costruito solo il genuinamente nuovo (**MaskedField/PiiGate** + la maschera Ordinativi fedele al mock 44). **Rinviati ai rispettivi blocchi** (non servono al checkpoint metro):
- **AppShellNav2** completo a 2 livelli (rail L1 + sub-panel L2 + omnibox ⌘K + sibling tab bar): la mappa menu del mock 43 è pronta; la shell attuale resta a 1 livello raggruppato.
- **EntityList** con `mode pick-single/pick-multi` (selezione pop-up).
- **ObjectPage/ObjectBox/RelatedTabs** come componenti formali estratti (ora la scheda Ordinativi li implementa "inline" con le classi mock 44).
- **PivotTable** (Blocco G) e **`resolvePrice`** (Blocco D).

### 4.3 Toolbar lista: alcune icone sono placeholder
Filtri/Colonne/Azioni-AI/Esporta/Assegna/Importa sono presenti (fedeltà visiva) ma **disabilitate** (tooltip "presto"): le loro logiche appartengono a Blocco B-bis (mapping CSV, azioni bulk) e Blocco F (AI). Nuovo ordinativo e la lista/scheda sono **pienamente funzionanti**.

## 5. Cosa resta aperto (prossimi passi, in ordine)
- **Blocco B-bis**: editor mapping CSV in toolbar; azioni bulk (Assegna/Esporta); selezione multipla righe.
- **Blocco C**: ciclo di vita seriale (`in_stock→assigned→installed`) + parco installato + cifratura segreti + reveal gated; mock 45.
- **Blocco A "vero"**: AppShellNav2 2-livelli (mock 43), EntityList pick-mode.
- Poi D (Listino + `resolvePrice`), E (Lavorazioni+libretto), F (Rapportino + CaptureBarAI), G (Pivot+export), H (allineamenti magazzino + seed pack fibra §8).

## 6. File toccati (sintesi)
- DB: `db/migrations/029_work_order_fields.sql`; `packages/backend/src/migrate.ts` (fix).
- Shared: `permissions.ts`, `menu.ts`, `entities.ts`.
- Backend: `routes/workOrders.ts` (nuovo), `index.ts` (registrazione).
- Frontend: `components/MaskedField.tsx`, `pages/OrdinativiPage.tsx`, `pages/OrdinativoDetailPage.tsx`, `pages/ordinativi.css`, `ui/icons.ts`, `shell/AppShell.tsx`.
- Docs: `docs/analisi/2026-06-16_schema_db_completo.md`, questo report.
