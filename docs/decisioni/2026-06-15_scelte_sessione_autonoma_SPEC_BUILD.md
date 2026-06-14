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
