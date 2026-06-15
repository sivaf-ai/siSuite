# Sessione autonoma 2026-06-15 — SPEC_BUILD (Moduli 4→8) — LOG DECISIONI

> Sessione **non presidiata** (l'utente riposa). Sviluppo dalla spec
> `docs/analisi/2026-06-14_siSuite_SPEC_BUILD_Claude_Code.md`.
> Qui annoto **ogni scelta e ogni dubbio** risolto in autonomia, così domani
> al risveglio si può capire cosa è stato deciso e cosa eventualmente rivedere
> dopo i test. Regola: additivo/reversibile, una migrazione per preoccupazione,
> RLS+trigger+indici+seed, niente operazioni distruttive.

## Decisione di prodotto già presa dall'utente (prima di andare a riposare)
- **Tariffe di vendita (§4.2) = Listino dedicato `rate_card` CON fallback al Minimo.**
  Se non esiste una riga di listino valida → catena Minimo: `override commessa →
  tariffa risorsa → default tenant`. Il valore si **fotografa** nella riga
  `time_entry` (cost_rate/bill_rate/currency) alla registrazione.

## Convenzioni adottate in questa sessione
- **`down` delle migrazioni**: il runner [migrate.ts] è forward-only e le 001–010
  non hanno down. Per rispettare §0 senza toccare il runner: ogni nuova migrazione
  `0NN_*.sql` ha un gemello `db/migrations/down/0NN_*.down.sql` (reversibile,
  NON auto-eseguito; va lanciato a mano con la connessione admin se serve rollback).
- **Numerazione migrazioni**: si parte da `011`.
- **Stati/liste**: sempre `canonical_state` + `lookup_value`, mai nuovi ENUM.
- **GRANT**: il bootstrap rifà i GRANT su `sisuite_app` dopo ogni `migrate`, quindi
  le tabelle nuove ereditano i privilegi; basta ENABLE+FORCE+policy nella migrazione.

---

## Diario per step (aggiornato man mano)

### 4.1 — Tipo di ore come lista + natura (migrazione 011)
- Seed canonici `time_typology`: work/absence/material/performance/cost.
- Seed lookup di sistema (tenant_id NULL): Ordinarie(ORD,default)/Straordinario(STR)/
  Viaggio(VIA)/Assenza(ASS)/Materiale(MAT). performance/cost restano canonici
  senza etichetta di sistema (evoluzione futura).
- `time_entry.typology_id uuid → lookup_value(id)` + indice.
- **DUBBIO/SCELTA — backfill**: le righe demo esistenti hanno `typology` testuale
  di dominio (analisi/sviluppo/installazione/giunzione/costruzione/manutenzione),
  nessuna mappa 1:1 ai canonici di sistema. **Scelta**: backfill di TUTTE le righe
  con `typology_id IS NULL` → lookup di sistema `ordinary` (natura "work"), perché
  sono tutte ore di lavoro ordinario. Il vecchio `typology` testo resta intatto
  (deprecato, non rimosso). Rivedibile: se in futuro servono nature diverse sui
  dati storici, si rifà un backfill mirato.
- La **maschera per natura** (canonical della typology → campi visibili via
  `field_definition`) è UI: implementata nei passi successivi, non nella migrazione.

### 4.2 — Tariffe (migrazione 012)
- `time_entry`: +`cost_rate`,`bill_rate`,`currency`,`billable`(default true).
- **MINIMO/fallback**: `resource.bill_rate` e `engagement.bill_rate_override` come
  `field_definition` di sistema (group economics); `resource.hourly_cost` (costo)
  già da 008. Default tenant: nuove colonne `tenant.default_cost_rate/
  default_bill_rate/default_currency('EUR')`.
- **LISTINO**: tabella `rate_card` (resource_id?/engagement_id?/typology_id?
  + valid_from/valid_to + cost_rate/bill_rate/currency). RLS tenant-scoped.
- Risoluzione (backend `resolveRates`, prossimo step): riga listino **più
  specifica e valida alla data** → altrimenti catena Minimo. Snapshot in riga.

### 4.3 — Approvazione + blocco (migrazione 013)
- Stati `time_entry_status` (draft/submitted/approved/rejected) + colonne workflow
  e lock su `time_entry`. Trigger `block_locked_time_entry`: riga bloccata
  immodificabile salvo sblocco controllato (is_locked=false & lock_reason NULL).
- **SCELTA**: nuova riga = bozza come **default applicativo** (non DB default sul
  FK, per non forzare un lookup id in DDL). L'endpoint POST imposterà draft.

### 4.4 — Assenze (migrazione 014)
- 12 tipi `absence_type` con etichette IT/EN/ES-AR. `absence_entry` (RLS own §3.2,
  ownership via resource o created_by), `absence_balance` (RLS tenant §3.1).
- `absence_entry.approval_status_id` **riusa** category `time_entry_status`.
- **SCELTA**: `vacation` = `is_default true` (comodità form). Maturazione `accrued`
  = carico/rettifica manuale (regola CCNL automatica → backlog, come da spec).

### 4.5 — Cronometro (migrazione 015)
- `time_entry.start_at/end_at` + `time_tracking_session` (RLS own §3.2).
  Alla conferma timer → si crea una time_entry con minutes = differenza.

### 4.6 — Contesto (migrazione 016)
- CHECK `engagement_id IS NOT NULL OR activity_id IS NOT NULL`, NOT VALID+VALIDATE.
  Verificato a vuoto: 0 righe in violazione. Guard idempotente su pg_constraint.

### §5 — Rapportino AI (migrazione 017)
- `billing_mode` (hourly/fixed) su engagement; `work_report` (RLS own created_by §3.2)
  + `work_report_time_entry` (RLS tenant §3.1). Stati work_report_status.
- **SCELTA**: status_id NOT NULL ma senza DB default (lo imposta l'app a 'raw').
  Audience default 'customer'. Generazione AI = step backend (riusa narrator).

### §6 — Agenda (migrazione 018)
- `schedule_mode` (floating/fixed) + `pinned_day` su activity. Logica nel motore
  esistente; `planningAnchor()` da isolare nel backend (step successivo). NESSUNA
  modifica a `flow/scheduler.ts` (gated).

### §7 — Budget (migrazione 019)
- `engagement.budget_amount/budget_minutes/budget_currency` (colonne, spec §7.1).
- **DUBBIO/SCELTA — doppione budget**: 008 aveva già `field_definition
  engagement.budget` → scrive in `attributes.budget` (usato dalla marginalità
  dashboard). Per non rompere nulla: il rollup §7.2 leggerà
  `COALESCE(budget_amount, (attributes->>'budget')::numeric)`. Il form continua a
  scrivere attributes.budget (nessuna modifica UI necessaria). **Da rivedere**:
  in un follow-up, far scrivere il form sulla colonna e ritirare il field_definition.

---

## PARTE 2 — Backend (route/logica). Tutto verificato e2e + typecheck + 27/27 vitest.

### Permessi (catalogo RBAC)
- Aggiunti: `time_entry:approve`, risorsa `absence` (create/read/update/delete/approve),
  `work_report` (CRUD), `stock` (read/move/manage). Grant a Planner/Tecnico/
  Contabile/Sola lettura; Owner='*'. **role_permission 131→165.** Per applicarli
  ho rieseguito `migrate` (il bootstrap riscrive role_permission dal catalogo).

### 4.1/4.2/4.3 ore (rates.ts + routes/timeEntries.ts)
- `resolveRates`: listino `rate_card` (riga più specifica e valida alla data) →
  fallback Minimo. Snapshot cost_rate/bill_rate/currency nella riga.
- POST time-entry: typology_id, tariffe, stato 'draft'.
- Workflow in blocco: `/time-entries/{submit,approve,reject,lock,unlock}`.
  DELETE non tocca righe is_locked. **SCELTA**: submit gate `time_entry:create`
  (il tecnico invia le sue); approve/reject/lock/unlock gate `time_entry:approve`.

### 4.4 assenze + 4.5 timer (routes/absences.ts, timeTracking.ts)
- Assenze: approve idempotente (non raddoppia `used`). **Unità saldo**: ore se
  valorizzate, altrimenti giorni calendario inclusivi (half_day −0,5). Precisione
  CCNL/working-days → backlog.
- Timer: commit crea la riga ore dal misurato; **guard 400** se la sessione non
  ha commessa/attività (vincolo §4.6). re-commit → 409.

### §5 rapportino (routes/workReports.ts)
- raw→ai_proposed→confirmed→signed. **No leak costi al cliente**: il payload
  all'LLM esclude i costi per audience customer (e le ore per 'fixed'). L'AI non
  scrive lo stato finale; senza chiave degrada a testo deterministico.
  Con chiave attiva: verificato che il rapportino cliente mostra ore senza costi,
  l'interno mostra i costi.

### §7 budget (routes/budget.ts)
- `GET /engagements/:id/budget`: fatto costo/ricavo dai dati fotografati +
  movimenti 'out'; previsto = budget (COALESCE attributes.budget) o stima
  ore×tariffa default tenant; margine/rimane/allarme>0,85; breakdown per fase.
- **SEMPLIFICAZIONE**: rollup ad albero di fasi annidate non ricorsivo (oggi
  per-fase diretta); materiali a livello commessa. Rifinibile.

### §6 agenda (routes/activities.ts)
- Esposti `scheduleModeId`/`pinnedDay` (additivi). **DIFFERITO/GATED**:
  l'integrazione nel motore (onorare fixed/pinned in `scheduleResources`,
  isolare `planningAnchor(resource, now)`) tocca `flow/scheduler.ts` che è
  **gated** (rete di test) → richiede sessione presidiata + conferma titolare.

### ⚠️ SCOPERTA RILEVANTE (RLS + platform admin) — da sapere per i test
- `owner@sisuite.local` è **platform admin** nel tenant **Si.Va.F.** Le SELECT
  con `app_is_platform_admin()` gli fanno **vedere TUTTI i tenant** (incluse le 3
  demo fiber/software/pools). Ma le policy **UPDATE** richiedono
  `tenant_id = app_current_tenant()` → un platform admin **non può modificare**
  i dati di un altro tenant (0 righe, corretto e sicuro).
- **Conseguenza pratica per i test**: `/engagements` come Owner ritorna anche
  commesse di tenant demo; se ci scrivi sopra (es. PATCH attività) ottieni 0
  righe. **Testare nel tenant del dato** (es. login `owner@pools.demo`).
- Alcuni miei smoke hanno creato dati nel tenant Sivaf che puntano a FK di tenant
  demo (innocuo, ricaricabile via demo:load): non è sporco "vero".

### ⚙️ NOTE RUNTIME / DEPLOY
- **`shared` non ha step di build**: `@sisuite/shared` esporta direttamente
  `./src/index.ts`; il container backend la vede aggiornata (mount), quindi le
  modifiche agli schemi sono live dopo `docker compose restart backend`.
- **PUSH BLOCCATO**: l'harness ha negato `git push origin main` (push diretto su
  default branch non auto-autorizzato). **Tutti i commit sono LOCALI**. → **Sivaf:
  esegui `git push origin main`** (12 commit di questa sessione) quando rivedi.

## STATO FINALE & COSA RESTA
- **FATTO e verificato**: migrazioni 011–022; backend Moduli Ore (4.1–4.6),
  Rapportino (5), Budget (7), Magazzino (8); esposizione Agenda (6).
- **DA FARE (domani / sessione presidiata)**:
  1. **FRONTEND di tutti i moduli** (non iniziato): timesheet+approvazione, assenze,
     cronometro, rapportino (editor+firma), magazzino (giacenze/movimenti/documenti/
     bolla), budget bar, badge agenda fixed/pinned. Seguire i mockup come specifica
     letterale.
  2. **§6 planner integration** (GATED): onorare fixed/pinned in scheduleResources.
  3. Budget: budget su form commessa scrive su colonna; rollup fasi annidate.
  4. `git push origin main`.

---

## PARTE 3 — Frontend (15/06, sessione presidiata con l'utente). Tutto typecheck FE verde + Vite 200.

Non esistono mockup dedicati ai moduli nuovi → schermate nuove **coerenti col
design system** esistente (Page/DataTable/Drawer/StatusPill/seg/btn/useApi/mutate/
useLookups/useToast). Tutte cablate a endpoint **già verificati e2e**.

- **Foglio ore** (`/time-entries`, menu *Lavoro*, gate `time_entry:read`):
  filtro stato (Tutte/Bozze/Inviate/Approvate/Respinte), multi-selezione, azioni
  in blocco invia/approva/respingi/blocca/sblocca (gate create vs approve), pill
  stato+tipologia, 🔒 sulle bloccate.
- **Magazzino** (`/stock`, menu *Anagrafiche*, gate `stock:read`): schede
  Giacenze / Movimenti / Documenti (carico/trasferimento/rettifica con "Salva e
  conferma" → numero) / Ubicazioni. Form documento con editor righe.
- **Rapportini** (`/work-reports`, *Lavoro*, gate `work_report:read`): lista +
  cassetto crea → Genera (AI) → editor testo finale → Conferma → Firma.
- **Budget**: nuovo **tab "Budget"** nel dettaglio commessa (`BudgetPanel`):
  previsto/costo/ricavo/margine/rimane + barra costo/previsto con allarme >85% +
  breakdown per fase con toggle Costo/Ricavo/Margine.
- **Assenze** (`/absences`, *Lavoro*, gate `absence:read`): schede Richieste
  (crea/approva/elimina) e Saldi (maturato/goduto/residuo).
- **Cronometro** (`/timer`, *Lavoro*): avvio su commessa/attività, tempo live,
  "Ferma e registra" → crea la riga ore. + **widget mobile** in TodayMobile
  (vista tecnico `/m`): timer live + avvio rapido sull'attività di oggi.

### Note / scelte FE
- Voci di menu nuove tutte `shells:['desktop']` + icone lucide in `ui/icons.ts`.
- **Verifica**: typecheck dei 3 package + Vite 200 + 27/27 vitest. **Il render
  visivo NON è stato verificato con screenshot** (niente browser headless in
  ambiente): controllare a video e segnalare aggiustamenti di stile.
- Reason di blocco/rifiuto via `window.prompt` (V1) — sostituibili con dialog.
- **Restano (FE)**: rifiniture estetiche post-review; eventuale timesheet mobile
  completo; portare le azioni reason su dialog dedicati. **§6 planner** resta GATED.
