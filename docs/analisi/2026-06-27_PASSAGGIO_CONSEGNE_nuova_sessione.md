# Passaggio di consegne siSuite — chat 01.06 (al 27/06/2026)

> Documento per la **prossima sessione Claude Code** e per **Claude AI**. Riassume tutto il lavoro della chat 01.06 (dal 21/06 al 27/06/2026), come è stato fatto, e cosa resta rispetto ai programmi concordati con Claude AI. In fondo: il **testo da incollare nella nuova sessione**.

Repo: **GitHub `sivaf-ai/siSuite`**, branch `main`. Tutto pushato. HEAD a fine sessione: `625c527` (e successivi commit di questo handoff).

---

## 0. Come avviare / verificare

```
cd c:\Users\Ricardo\Sivaf\siSuite
docker compose up -d            # db(5433) auth/GoTrue(9999) backend(3010) frontend(5173) minio(9100/9101)
docker compose run --rm migrate # applica migrazioni 001→051 + bootstrap (idempotente)
```
- Login owner: **owner@sisuite.local / Owner123!** (è platform admin: vede tutti i tenant ma scrive solo sul proprio = Si.Va.F., id `aaf24163-0613-4026-aa25-7ddbe17e9ec7`).
- Gotcha **tsx watch su Windows**: dopo modifiche backend `docker compose restart backend`.
- Typecheck: `docker exec sisuite_backend sh -c "cd /app/packages/backend && npx tsc -p tsconfig.json --noEmit"` (idem shared); FE: `docker exec sisuite_frontend sh -c "cd /app/packages/frontend && npx tsc --noEmit"`. Test BE: `docker exec sisuite_backend sh -c "cd /app/packages/backend && npx vitest run"` → **79/79 verdi**.
- Smoke API (PS): login GoTrue `POST :9999/token?grant_type=password`. NB: `Invoke-RestMethod -Method Patch` in PS 5.1 non invia il body → usa `curl.exe --data @file`.

---

## 1. Stato per "programma" concordato con Claude AI

### SPEC A→F — Anagrafiche/Fiscale/Magazzino/Risorse/Asset (v1.1) ✅ FATTO
Migrazioni **041→046**. DB+backend completi e verificati; frontend dei criteri di accettazione. Dettaglio: `docs/analisi/DONE_TOTALE.md` (+ DONE_A..F), ADR-0007/0008.
- Fiscale multi-paese SENZA emissione: `field_definition.country`, `tax_rate` (IT/AR), `company` (code/country/tax_id/email/…/legal_address/operational_address/fiscal_attributes), indirizzi jsonb (AddressField), `tenant.default_country`.
- Magazzino completo: `stock_lot`, `stock_count`(+post), `purchase_order`(+receive), `pick_list`(+confirm), `material` ricco (colonne), categorie/immagini/fornitori.
- Risorse: code/color/avatar/email/phone + skill/resource_skill/resource_certification.
- Asset: anchor (company OR site OR work_order_subject).

### SPEC G→K — Identità&Accessi/GoTrue/Immagini/Rifiniture ✅ FATTO
Migrazioni **047→049**. `docs/analisi/DONE_TOTALE_2.md` (+ DONE_G..K), ADR-0009.
- Utenti: ciclo vita (status/code UTE-/last_login), link risorsa, permessi effettivi, invito.
- GoTrue: authN GoTrue / authZ RBAC+RLS; **provisioning-by-email** al primo login (no logout/login); nessuna credenziale in app_user.
- Immagini articolo su MinIO (bucket `material-images`, upload/presigned pubblico, set-primary/reorder/delete).
- Rifiniture: seriali per-magazzino, stock_location code/note, contatti mobile/dept/note, `wipe:testdata`.

### Documenti master-detail (DDT / Ordini d'acquisto / Pick list) ✅ FATTO
Schede testata+righe stile Ordini di Lavoro (NON tab laterali); righe via picker articoli; azioni Ricevi/Conferma; backend GET:id/PATCH/DELETE(bozza). `docs/analisi/DONE_documenti_master_detail.md`.

### Standard UI trasversali ✅ FATTO (regole tassative memorizzate)
- **Selezione entità in popup centrato** = riuso della LISTA VERA in modalità pick (Materiali, Fornitori, Magazzini) con "+ Nuovo" e modifica inline. Componenti: `ui/Modal`, `EntityList` pick mode, `MaterialPickerDialog`/`CompanyPickerDialog`/`LocationPickerDialog`, `ui/PickerField`. Maschere CRUD **sempre in Modal centrato** (mai Drawer laterale; wrappare in `.dsx` per i campi `.bgrid/.bf/.bl/.bi`).
- **Duplica** standard: apre il CRUD "nuovo" precompilato SENZA campi chiave e SENZA "(copia)"; una riga alla volta (`useEntityActions` + `location.state.prefill`). Su tutte le anagrafiche.
- **Elimina** mostra il nome dell'elemento nel popup.
- **NumInput** (formato it-IT migliaia/decimali) sugli importi; **UnitSelect** (UM da catalogo) nelle righe documento.
- Memorie: `feedback_entity_selection_popup.md`, `feedback_entity_standard.md`.

### Anagrafiche di supporto ✅ FATTO
- **Unità di misura** (migr. 050): tabella + CRUD + 18 UM di sistema + override tenant; usata nei form articolo e righe documento (UnitSelect).
- **Categorie articolo ad ALBERO** (migr. 051 aggiunge `icon`): gestione tree + CRUD + IconPicker (lucide) + colore; usata nel form articolo (categoryId).
- **Aliquote IVA**: CRUD completo.

### Regole canoniche DB ✅ FATTO (27/06) — `feedback_db_integrity_canonical.md`
1. **Mai cancellare record referenziati**: handler globale FK Postgres 23503 → 409 con entità; per soft-delete e riferimenti testuali (UM, categorie) controllo d'uso esplicito.
2. **Mai chiavi duplicate**: handler globale 23505 → 409; + check applicativo (UM codice anche vs righe di sistema).
3. **Auto-refresh cross-entità** (no logout/login): bus `api/cache.ts` — `apiFetch`/`apiUpload` invalidano la risorsa, `useApi` si ricarica; `useReloadOnEnter` per le liste (cache pagine Ionic).

---

## 2. Migrazioni (stato)
Applicate **001→051**. **Prossima libera: 052.** Novità chat 01.06:
- 041 fiscal_localization · 042 material_complete · 043 warehouse_complete · 044 resources_skills · 045 entity_refinements · 046 warehouse_entitlements_series · 047 user_lifecycle · 048 material_images · 049 identity_provisioning · 050 unit_of_measure · 051 material_category_icon.
Schema rigenerato: `docs/analisi/2026-06-27_schema_db_completo.md`.

## 3. Componenti/infrastruttura FE introdotti (riusabili)
`ui/Modal` (popup centrato), `ui/PickerField`, `ui/NumInput`, `ui/UnitSelect`, `ui/IconPicker`+`ui/categoryIcons`, `MaterialPickerDialog`/`CompanyPickerDialog`/`LocationPickerDialog`, `useEntityActions` (delete/duplicate standard), `api/cache.ts` (invalidazione) + `useReloadOnEnter`. Backend: route `taxRates`, `materialCatalog`, `warehouse`, `resourceExtras`, `unitsOfMeasure`; handler errori globale (zod leggibile + 23503/23505) in `index.ts`; `app_link_identity_by_email` (049); storage MinIO generico + presign pubblico; `src/demo/wipeTestData.ts`.

---

## 4. COSA MANCA (cantiere, da concordare con Claude AI)

**Rifiniture dirette di quanto fatto:**
- **Integrità su soft-delete delle altre anagrafiche** (company/material/site/asset): oggi vengono ARCHIVIATE (record mantenuto, non sparisce); se si vuole bloccare l'archiviazione quando referenziate (come UM/categorie), va aggiunto il check d'uso a quelle delete.
- **NumInput/UnitSelect** sugli altri importi/UM non ancora coperti: righe "apparati" dell'Ordine di lavoro, budget commessa, tariffe, time entry, fatturazione.
- **Reset password** dall'admin utenti; **invito via email reale** (serve SMTP in staging — oggi in dev si chiude con self-signup + provisioning-by-email).
- **Reorder immagini** articolo via drag&drop (endpoint pronto, manca UI).
- **`MINIO_PUBLIC_ENDPOINT`** da configurare in prod (in dev = localhost:9100).
- **Warning Ionic `aria-hidden`** (focus su bottone in pagina nascosta): cosmetico, eventuale `blur()` pre-navigazione.
- **Schema/ADR**: aggiornare gli ADR e tenere allineato il dump schema dopo nuove migrazioni.

**Programmi più grandi ancora da fare (da `BACKLOG_futuro.md` / SPEC L.3):**
- **Sottosistema notifiche** → alert scorta minima (`reorder_point`), scadenza lotti (`stock_lot.expiry_date`), scadenza certificazioni (`resource_certification.valid_until`): i dati ci sono, manca il motore.
- **Narrazione AI** (raccontare in linguaggio naturale i dati).
- **Export anagrafiche fiscali** verso gestionale esterno (mapping di handoff).
- **Stampa/generazione etichette barcode** (magazzino).
- **App mobile** (tecnico + magazzino mobile + scansione + pick list in campo) — progettata a parte; oggi solo schema/back-end/web.
- **Motore sync offline** (PowerSync vs ElectricSQL) — prerequisito del magazzino mobile.
- **Solver di pianificazione** (Timefold vs OR-Tools) — post-MVP.
- **Demo data pack** (fibra/piscine/software) con loader/unloader per-tenant.
- **Portale cliente** (accesso esterno read-only).

---

## 5. Memorie persistenti chiave (leggere all'avvio)
`MEMORY.md` (indice) →: `project_handoff` (ripartenza), `project_spec_0106_fiscale_magazzino` (dettaglio A-K + numerazione migrazioni + gotcha), `feedback_entity_standard`, `feedback_entity_selection_popup`, `feedback_db_integrity_canonical`, `feedback_objectpage_sticky_header`, `feedback_no_native_popups`, `feedback_sql_naming`, `feedback_docker_deps_mount`.

---

## 6. TESTO DA INCOLLARE NELLA NUOVA SESSIONE

> Progetto **siSuite** in `c:\Users\Ricardo\Sivaf\siSuite` (monorepo pnpm: Postgres+pgvector / Fastify+TS via tsx / Ionic+React+Vite / GoTrue / MinIO, tutto in Docker). Repo GitHub `sivaf-ai/siSuite`, branch `main`, tutto pushato.
>
> PRIMA DI TUTTO leggi: `docs/analisi/2026-06-27_PASSAGGIO_CONSEGNE_nuova_sessione.md` (passaggio di consegne completo) e le memorie del progetto (MEMORY.md), in particolare gli standard tassativi: **feedback_entity_standard**, **feedback_entity_selection_popup**, **feedback_db_integrity_canonical**.
>
> Stato: SPEC A→F e G→K implementate; documenti master-detail (DDT/Ordini d'acquisto/Pick list); anagrafiche Unità di misura e Categorie (albero); standard UI (CRUD in Modal centrato, selezione entità in popup riusando la lista vera, Duplica che precompila, Elimina con nome, NumInput, UnitSelect); regole canoniche DB (no delete se referenziato, no chiavi duplicate, auto-refresh cross-entità via api/cache.ts). Migrazioni applicate **001→051, prossima libera 052**. 79/79 test backend verdi. Login owner@sisuite.local / Owner123!.
>
> Avvio: `docker compose up -d` poi `docker compose run --rm migrate`. Dopo modifiche backend: `docker compose restart backend` (tsx watch Windows).
>
> Regole operative: autonomia totale (non chiedere conferme, vedi CLAUDE.md globale); rispettare SEMPRE gli standard tassativi in memoria; commit+push a fine lavoro; nessuna fatturazione (SdI/XML/ARCA/AFIP fuori scope).
>
> Cosa voglio fare adesso: **[QUI SIVAF SCRIVE IL PROSSIMO OBIETTIVO]** — es. estendere l'integrità referenziale al soft-delete di company/material/site/asset; oppure NumInput/UnitSelect sulle altre schede; oppure il sottosistema notifiche (alert scorta/scadenze); oppure reset password admin + SMTP inviti; ecc. (vedi §4 "Cosa manca").
