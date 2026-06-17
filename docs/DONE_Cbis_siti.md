# DONE — Blocco C-bis · Anagrafica Siti/Località (entità `site`)

> Data: 16/06/2026 · Chat POWERCOM v2.2 · Riferimento: `BRIEF_MASTER…v2_2` Parte 8 (Blocco C-bis) + ADR-0005.

## 1. Migrazione 031 (additiva, applicata)
`031_site.sql`: tabella **`site`** gerarchica (self-reference `parent_id`, CASCADE) legata al soggetto (`company_id`), con `kind` (plant/building/floor/room/cabinet/pop/…), `address`, `geo`, `attributes`, audit, RLS tenant (FORCE), CHECK anti-self-parent. Aggiunta **`asset.site_id`** (nullable, ON DELETE SET NULL) → l'asset potrà vivere su un nodo preciso. Non rompe nulla; la fibra residenziale resta sull'indirizzo dell'ordinativo.

## 2. Backend
- **`routes/sites.ts` (nuovo):** `GET /sites?company_id=` (albero del soggetto, lista piatta con `parentId`), `POST/PATCH/DELETE /sites`. RLS isola per tenant.
- **RBAC**: nuova risorsa **`site`** (create/read/update/delete) — Owner (via *), Planner (CRUD), Tecnico/Contabile/Sola lettura (read). `role_permission` 191→202.
- Shared: `SiteDto` + `createSiteSchema`/`updateSiteSchema` + `SITE_KINDS`.
- Loader demo + `WIPE_STEPS` estesi per `site`.

## 3. Frontend
- **`ui/SiteTree.tsx` (nuovo):** albero espandibile (riusa il pattern fasi/WBS) dentro la scheda **Soggetto** (`ClienteDetailPage`): ogni nodo = sito con tipo a tag + indirizzo; espandi/collassa; **aggiungi sito radice / sotto-sito** (inline: nome + tipo) e **elimina** (gated `site:create`/RBAC). Mostrato solo per soggetti esistenti.

## 4. Dati demo
Aggiunti a `fiber.json` 7 siti su **Beta Logistica**: 2 radici (*Sede di Sesto San Giovanni* — plant; *Sito di disaster recovery — Milano* — plant) + gerarchia **Edificio A → Piano 1 → CED/Sala rack → Rack R1 (POP fibra)** ed Edificio B. Mostra il modello "soggetto strutturato" (Fiat/Denaris/condomìni).

## 5. Verifiche (test reali)
- Typecheck pulito (shared+backend+frontend); SiteTree compila (Vite 200).
- wipe+load fiber via UI **200**; `GET /sites?company_id=Beta` → **7 siti**, gerarchia corretta (2 radici).
- CRUD: `POST /sites` 201, `DELETE /sites/:id` 204.
- RLS tenant-scoped (stesso pattern delle altre entità).

### Come provare
owner@fibra.demo → **Anagrafiche → Soggetti** → apri **Beta Logistica Srl** → card **Siti / Località**: espandi *Sede di Sesto San Giovanni* → Edificio A → Piano 1 → CED → Rack R1. Prova "Aggiungi sotto-sito" / "Aggiungi sito radice".

## 6. Deviazioni / cosa resta
- **Selettore "Sito" nella scheda Asset**: l'asset ha `site_id` (DB pronto) ma la scheda Asset non ha ancora il picker (la UI Asset è un'altra maschera) → quando si rifà la scheda Asset.
- `kind` da lista fissa (8 valori); il brief lo prevede estendibile via lookup → eventuale lookup `site_kind` in futuro.

## 7. File toccati
- DB: `031_site.sql`.
- Backend: `routes/sites.ts` (nuovo), `index.ts`, `demo/runner.ts` (+lib.ts), `permissions.ts` (risorsa site).
- Shared: `entities.ts` (Site DTO/schemi), `permissions.ts`.
- Frontend: `ui/SiteTree.tsx` (nuovo), `pages/ClienteDetailPage.tsx`.
- Dati: `db/demo-packs/fiber.json` (siti Beta).
