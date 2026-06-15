# siSuite — PASSAGGIO DI CONSEGNE per la nuova sessione (leggere per primo)

> **Data:** 15/06/2026 (sera). Questa sessione è satura: qui c'è tutto per ripartire da pulito.
> **Repo:** GitHub `sivaf-ai/siSuite`, branch `main`, **HEAD `8e0e9c8`** — tutto **pushato** (origin allineato),
> typecheck verde su shared+backend+frontend, **27/27 vitest**, migrazioni **001…023** applicate.

---

## 0. PRIMA COSA DA FARE nella nuova sessione (nell'ordine)
1. **Leggere questo documento.**
2. **Leggere `docs/mockup/FRONTEND_SPEC.md`** (NUOVO, lo ha messo il titolare) + i **mockup 28-39** in `docs/mockup/`:
   sono la **specifica letterale** delle maschere nuove (Foglio ore, Magazzino, Rapportini/Budget, Assenze,
   Cronometro, ecc.). I vecchi mockup 01-26 sono stati spostati in `docs/mockup/_legacy_v1/`.
3. Leggere il **log decisioni** della sessione precedente: `docs/decisioni/2026-06-15_scelte_sessione_autonoma_SPEC_BUILD.md`
   (motivazioni di tutte le scelte backend + scoperte RLS).
4. Solo dopo, pianificare ed eseguire (vedi §3 "Da dove si riparte").

> ⚠️ **Working tree:** al momento del passaggio ci sono modifiche NON committate del titolare in `docs/mockup/`
> (nuovi mockup 28-39, `FRONTEND_SPEC.md`, `base.css` aggiornato, vecchi mockup spostati in `_legacy_v1/`) e
> `docs/analisi/2026-06-15_kickoff_Claude_Code_frontend.md`. **Sono lavoro del titolare**: non committarli a meno
> che non lo chieda. Tutto il codice (backend+frontend) è invece committato e pushato.

---

## 1. COME AVVIARE L'AMBIENTE (gira tutto in Docker su questo PC)
```
cd c:\Users\Ricardo\Sivaf\siSuite
docker compose up -d
```
- Porte: FE **5173**, BE **3010**, GoTrue **9999**, db **5433**, MinIO **9100/9101**.
- Login owner di sistema: `owner@sisuite.local / Owner123!` (è **platform admin** → vedi §5 gotcha).
- **Demo (3 verticali)**: `owner@fibra.demo`, `owner@software.demo`, `owner@pools.demo` — tutti `Demo123!`.
  **Per testare le SCRITTURE usare l'owner del tenant del dato** (es. pools), NON l'owner di sistema (vedi §5).
- Vista tecnico (telefono su PC): `http://localhost:5173/m`.
- Ricaricare un demo: `docker compose run --rm --no-deps backend pnpm --filter @sisuite/backend demo:wipe|load <fiber|software|pools>`.

### Comandi di verifica (usarli SEMPRE prima di commit)
- Typecheck: `docker compose run --rm --no-deps <backend|frontend> sh -c "cd /app/packages/<shared|backend|frontend> && npx tsc --noEmit"`
- Test: `docker compose run --rm --no-deps backend sh -c "cd /app/packages/backend && npx vitest run"` (27 verdi)
- Migrazioni: `docker compose run --rm migrate` (idempotente; il bootstrap rifà i GRANT su `sisuite_app`)
- Smoke: `http://127.0.0.1:3010/health` (200) · Vite `http://127.0.0.1:5173/` (200)

---

## 2. COSA È STATO FATTO IN QUESTA SESSIONE (backend + frontend completi)

### Backend — Moduli 4-8 (SPEC_BUILD) — migrazioni 011-022 + route (tutto verificato e2e)
- **Modulo Ore §4**: typology su lista (011), tariffe fotografate + **listino `rate_card`** con fallback minimo
  (012, `rates.ts:resolveRates`), approvazione+blocco in blocco (013, endpoint submit/approve/reject/lock/unlock),
  assenze+saldi (014), cronometro (015), vincolo contesto (016).
- **Rapportino §5** (017): `work_report` raw→ai_proposed→confirmed→signed; AI no-leak costi al cliente.
- **Agenda §6** (018): esposti `schedule_mode`/`pinned_day` su activity. **L'integrazione nel motore è GATED/DA FARE.**
- **Budget §7** (019): `GET /engagements/:id/budget` (previsto/fatto/margine/allarme, breakdown per fase).
- **Magazzino minimo 6A §8** (020-022): ubicazioni ad albero, movimenti immutabili + media mobile, documenti
  carico/trasferimento/rettifica con conferma→movimenti numerati (CAR/DDT/RET).
- **Permessi**: aggiunti `time_entry:approve`, `absence`, `work_report`, `stock` (role_permission 131→165).

### Frontend — 6 schermate desktop + widget mobile (tutte cablate al backend e2e)
- **Foglio ore** `/time-entries` · **Magazzino** `/stock` · **Rapportini** `/work-reports` ·
  **Cronometro** `/timer` · **Assenze** `/absences` · **Budget** = tab nel dettaglio commessa.
- **Widget Cronometro** nella home "Oggi" del tecnico (`/m`).

### Rifiniture UI (post-revisione titolare)
- Dashboard a **griglia 2 colonne** (grafici affiancati), font globali ridotti (h1 27→21, KPI 32→24, detail 24→20).
- **Ore in formato `hh:mm`** ovunque (`lib/time.hhmm`), formato indicato nell'header.
- Numerazioni: prima colonna con descrizione leggibile. Campi personalizzati: griglia colonne pulita.
- **Notifiche rifatte** come popover ancorato via portal (prima si tagliavano: la sidebar Ionic ha un transform).
- **Palette colori raddoppiata** (16→32) con varianti chiaro/scuro automatiche.
- **Sidebar area utente** riorganizzata su due righe (identità + azioni).

### Personalizzazione voci di SISTEMA (lookup_override) — migrazione 023
- Ogni tenant può **rinominare/ricolorare/risiglare/riordinare** le etichette di **sistema** (tutte le categorie:
  stati, priorità, tipologie ore, tipi assenza, modalità vendita, stati rapportino/ore, tipi movimento/documento
  magazzino) **senza eliminarle**. Pattern `lookup_override` (come `term_override`): la riga di sistema non si
  tocca, l'override per-tenant la sovrascrive in lettura (`COALESCE`), il display è coerente ovunque, le FK non
  rischiano nulla. "Ripristina" elimina l'override. Endpoint `PUT/DELETE /lookups/:id/override`. UI in
  *Impostazioni › Stati & etichette* (badge "personalizzato", azione Ripristina; selettore categoria a tendina).

> Elenco commit della sessione: `git log 1a0927f..8e0e9c8` (24 commit). Dettaglio in
> `docs/decisioni/2026-06-15_scelte_sessione_autonoma_SPEC_BUILD.md`.

---

## 3. DA DOVE SI RIPARTE (priorità per la prossima sessione)

1. **★ ALLINEARE LE MASCHERE NUOVE AI MOCKUP 28-39 + `FRONTEND_SPEC.md`** (il titolare li ha appena preparati).
   Le 6 schermate frontend sono state disegnate "a sentimento" sul design system PRIMA che i mockup esistessero:
   ora vanno rifinite/riallineate alla **specifica letterale** (densità, colonne, layout, colori da token).
   Confrontare ogni pagina col `<body>` del mockup corrispondente e allineare `design-system.css` classe-per-classe.
   - 28 = Foglio ore (nuova densità) · 29 = Magazzino · 30 = Rapportini/Budget · 31 = Assenze · 32 = Cronometro ·
     33 = scheda cliente · 34 = pianificazione · 35 = dashboard · 36 = commesse · 37 = mobile tecnico ·
     38 = catture/asset · 39 = stati/login. (Verificare i nomi effettivi al momento.)
2. **§6 Agenda — integrazione nel motore (GATED).** Far onorare `fixed`/`pinned_day` da `scheduleResources` e
   isolare `planningAnchor(resource, now)`. **Tocca `flow/scheduler.ts`** (rete di 27 test): chiedere conferma al
   titolare prima di modificarlo; lavorare in moduli separati come già fatto (`weekView.ts`, `dependencyPlan.ts`).
3. **Rifiniture funzionali**: motivazioni blocco/rifiuto/firma da `window.prompt` → dialog dedicati; Foglio ore
   colonna costo + filtri commessa/risorsa + totale ore selezionate; Budget: form commessa che scrive sulla
   **colonna** `budget_amount` (oggi su `attributes.budget`, riconciliare il doppione); rollup ricorsivo su **fasi
   annidate** (oggi per-fase diretta).
4. **(opzionale, su richiesta) Override anche per i Campi personalizzati di sistema** (field_definition: solo
   *nome* e *unità*, niente colore/sigla): stesso pattern `lookup_override`. Chiedere se serve.

### NON costruire ora (come da specifica): Magazzino avanzato 6B e Manutenzione — prima un documento di design dedicato.

---

## 4. REGOLE DI LAVORO VINCOLANTI
- **`flow/scheduler.ts` è GATED**: non modificarlo senza conferma; la rete di test deve restare verde (27).
- **Fedeltà visiva**: i mockup HTML sono specifica LETTERALE; colori solo da token/palette, mai hex cablati.
- **Config over code**: preferire `lookup_value`/`lookup_override`/`term_override`/`field_definition`/`template`
  a nuove colonne/tabelle.
- **Verifica sempre** (typecheck FE+BE+shared + vitest + smoke) **prima** di ogni commit; **commit + push** per unità.
- **Additivo/reversibile**: ogni migrazione `0NN_*.sql` con gemello `db/migrations/down/0NN_*.down.sql`.

---

## 5. GOTCHA IMPORTANTI (fanno perdere tempo)
- **RLS + platform admin**: `owner@sisuite.local` VEDE tutti i tenant (SELECT) ma NON può UPDATE dati di altri
  tenant (corretto). `/engagements` come Owner ritorna anche commesse demo: se ci scrivi sopra → 0 righe.
  **Testare le scritture con l'owner del tenant del dato** (es. `owner@pools.demo`).
- **`@sisuite/shared` NON ha build**: esporta `./src/index.ts`; i container montano `shared/src` → le modifiche
  agli schemi sono live dopo `docker compose restart backend`.
- **tsx watch inaffidabile su Windows**: dopo edit a `packages/backend/src` → `docker compose restart backend`
  (~6s). Per dipendenze npm nuove → `docker compose build <svc>` poi `up -d`.
- **Frontend**: Vite (5173) monta `frontend/src` + `shared/src` → HMR live.
- **Formato ore**: usare `lib/time.hhmm(minuti)` per le durate (hh:mm), non "Xh Ym".
- **Palette colori**: 32 chiavi in `theme/palette.ts` (`PALETTE`); ogni colore ha token chiaro+scuro in
  `theme/variables.css` (`:root` e `:root[data-theme=dark]`). L'utente sceglie 1 colore, il dark è automatico.
- **lookup_override**: per personalizzare una voce di sistema NON si modifica la riga condivisa; si fa
  `PUT /lookups/:id/override`. Il display si risolve con overlay COALESCE in `GET /lookups`.
- **Notifiche**: il pannello è un popover via `createPortal(document.body)` (la sidebar Ionic ha un transform che
  rompe `position:fixed` dei componenti interni — vale per qualunque overlay aperto dalla sidebar).
- **Push su `main`**: ora FUNZIONA (`git push origin main`). In passato l'harness lo bloccava: se ricapita,
  chiedere al titolare di pushare a mano.

---

## 6. MAPPA FILE DI RIFERIMENTO
- **Spec maschere nuove**: `docs/mockup/FRONTEND_SPEC.md` + `docs/mockup/28..39_*.html` (+ `base.css`).
- **Backend nuovo**: `routes/{timeEntries,absences,timeTracking,workReports,budget,stock,lookups}.ts`,
  `rates.ts`, `lookupResolve.ts`, `status.ts`. Migrazioni `db/migrations/011..023`.
- **Frontend nuovo**: `pages/{TimeEntriesPage,MagazzinoPage,RapportiniPage,AssenzePage,CronometroPage}.tsx`,
  `components/{BudgetPanel,TimerWidget}.tsx`, `lib/time.ts`, `ui/NotificationsBell.tsx`,
  `theme/{palette.ts,variables.css,design-system.css}`, `pages/admin/{LabelsSettings,NumbersSettings,CustomFieldsSettings}.tsx`.
- **Motore (gated)**: `flow/{scheduler,weekView,dependencyPlan}.ts` + `routes/schedule.ts` + `test/*.test.ts`.
- **Decisioni/stato**: `docs/decisioni/2026-06-15_scelte_sessione_autonoma_SPEC_BUILD.md` ·
  schema DB `docs/analisi/2026-06-13_schema_db_completo.md` (da aggiornare con 011-023) ·
  memoria ripartenza `~/.claude/projects/.../memory/project_handoff.md`.

---

## 7. ★ COSA DIRE NELLA PROSSIMA SESSIONE (testo da incollare)

> Ciao. Continuiamo lo sviluppo di **siSuite** (repo `sivaf-ai/siSuite`, branch `main`, HEAD `8e0e9c8`, tutto pushato).
> **Prima di scrivere codice**, leggi in quest'ordine:
> 1. `docs/analisi/2026-06-15_PASSAGGIO_CONSEGNE_nuova_sessione.md` (lo stato completo),
> 2. `docs/mockup/FRONTEND_SPEC.md` + i mockup `docs/mockup/28..39_*.html` (specifica letterale delle maschere nuove),
> 3. `docs/decisioni/2026-06-15_scelte_sessione_autonoma_SPEC_BUILD.md` (decisioni e gotcha).
>
> Il backend e il frontend dei Moduli 4-8 sono **già fatti e verificati e2e**; ora il lavoro principale è
> **allineare le maschere nuove (Foglio ore, Magazzino, Rapportini, Budget, Assenze, Cronometro) ai mockup
> 28-39**, usando i mockup come specifica letterale (densità, colonne, layout, colori da token).
>
> Avvia l'ambiente (`docker compose up -d`), poi **partiamo dalla schermata _____** (dimmi tu quale, oppure scegli
> tu l'ordine). Per testare le scritture usa `owner@pools.demo / Demo123!` (NON l'owner di sistema, è platform admin
> e non può scrivere cross-tenant). Verifica sempre (typecheck FE+BE+shared + vitest 27 + Vite/health 200) e fai
> commit + push per ogni unità. Procedi in autonomia, decidi tu sui dettagli e documenta le scelte; fermati solo
> per decisioni di prodotto vere o se tocca `flow/scheduler.ts` (è GATED).
>
> **Nota:** confermami appena letto, segnala eventuali dubbi sui mockup, e dammi l'ordine con cui pensi di
> allineare le 6 schermate. Poi procedi.

---

*Buon lavoro. Punto di ripartenza pulito: leggere FRONTEND_SPEC + mockup 28-39, allineare le maschere, verificare e committare per unità.*
