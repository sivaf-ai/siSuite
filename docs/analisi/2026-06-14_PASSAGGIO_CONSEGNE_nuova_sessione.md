# siSuite — PASSAGGIO DI CONSEGNE per la nuova sessione (leggere per primo)

> **Data:** 14/06/2026 (sera). Documento di **ripartenza** per la prossima sessione di sviluppo.
> La sessione precedente è satura: qui c'è tutto il necessario per ripartire **da pulito** con i nuovi lavori.
> **Repo:** GitHub `sivaf-ai/siSuite`, branch `main`, HEAD **`bfa5ce6`** — tutto pushato, working tree pulito, **27/27 test verdi**, migrazioni **001…010** applicate.

---

## 0. Prima cosa da fare nella nuova sessione
1. **Leggere il nuovo documento delle attività** che il titolare fornirà (sarà la “**parte 9**”). Convenzione: salvarlo in `docs/decisioni/2026-06-XX_<tema>_per_claude_code.md`.
2. **Leggere lo stato dettagliato**: `docs/analisi/2026-06-14_stato_sviluppo_COMPLETO_per_claude_ai.md` (IL documento corrente; quello senza “COMPLETO” è storico/superato).
3. **Schema DB**: `docs/analisi/2026-06-13_schema_db_completo.md` (aggiornato 14/06: `term_override`, migr. 007–010).
4. Solo dopo, pianificare ed eseguire i nuovi lavori.

> 👉 **Spazio per il nuovo documento (parte 9):** _<incollare qui il titolo/percorso del documento delle nuove attività appena disponibile, es. `docs/decisioni/2026-06-15_..._per_claude_code.md`>_

---

## 1. Come avviare l'ambiente (gira tutto in Docker su questo PC)
```
cd c:\Users\Ricardo\Sivaf\siSuite
docker compose up -d
```
- Porte: FE **5173**, BE **3010**, GoTrue **9999**, db **5433**, MinIO **9100/9101**.
- Login owner di sistema: `owner@sisuite.local / Owner123!`.
- **Demo (3 verticali)**: `owner@fibra.demo`, `owner@software.demo`, `owner@pools.demo` — tutti `Demo123!`.
- Vista tecnico (telefono su PC): `http://localhost:5173/m`.
- Ricaricare un demo: `docker compose run --rm --no-deps backend pnpm --filter @sisuite/backend demo:wipe|load <fiber|software|pools>`.

### Gotcha che fanno perdere tempo (importanti)
- **Backend**: dopo edit a `packages/backend/src` → `docker compose restart backend` (tsx watch su Windows inaffidabile; ~5s prima che risponda).
- **Nuova dipendenza npm** → `docker compose build <svc>` **poi** `up -d <svc>` (non basta restart). `pnpm-lock.yaml` non rigenerato sull'host (Dockerfile usa `--no-frozen-lockfile`).
- **Migrazioni**: aggiungere `db/migrations/0NN_*.sql`, poi `docker compose run --rm migrate` (idempotente; il bootstrap fa i GRANT su `sisuite_app`).
- **Verifica SEMPRE**: typecheck FE+BE + `vitest` + smoke API. Comandi:
  - BE typecheck: `docker compose run --rm --no-deps backend sh -c "cd /app/packages/backend && npx tsc --noEmit"`
  - FE typecheck: `docker compose run --rm --no-deps frontend sh -c "cd /app/packages/frontend && npx tsc --noEmit"`
  - Test: `docker compose run --rm --no-deps backend sh -c "cd /app/packages/backend && npx vitest run"`
  - Smoke API: usare `http://127.0.0.1:<porta>` (non `localhost`, evita problemi IPv6 ::1) e attendere che `/health` risponda 200 dopo un restart.

---

## 2. Regole di lavoro vincolanti (NON dimenticare)
- **`flow/scheduler.ts` è GATED**: non modificarlo senza conferma del titolare; la rete di test deve restare verde (oggi 14 test). Le estensioni recenti (scoping settimanale, dipendenze) sono in moduli SEPARATI (`weekView.ts`, `dependencyPlan.ts`) che NON toccano lo scheduler.
- **Fedeltà visiva**: il mockup HTML è specifica letterale (`docs/mockup/NN_*.html` + `base.css`); colori solo da token/palette (`theme/palette.ts`), mai hex cablati.
- **Config over code**: per personalizzazioni preferire i meccanismi esistenti (`lookup_value`, `term_override`, `field_definition`, `template`) invece di nuove colonne/tabelle.
- **Commit + push** a fine di ogni unità e di ogni sessione. Aggiornare la **memoria** (`~/.claude/projects/.../memory/`).
- **Prima di aggiungere tabelle/campi**: interrogare lo schema esistente (lezione della sessione: c'erano già `template` e i seed `budget`/`hourly_cost`).

---

## 3. Da dove si riparte — lavori aperti (in attesa della parte 9)
Se la parte 9 non sovrascrive le priorità, l'ordine suggerito è:
1. **Solver ottimizzante** (Timefold/OR-Tools) per la qualità della riprogrammazione — il forward-pass greedy + propagazione dipendenze c'è già; questo è il tier successivo. *(grande, libreria esterna → valutare con il titolare)*
2. **Timezone puntuale** nello scheduler — **GATED** (richiede conferma; oggi orari UTC-naive).
3. **Audit log** (interceptor centrale sulle mutazioni) e **portale cliente** (RLS `customer` già predisposta, UI assente).
4. **Persistenza cross-device** delle preferenze UI (tema/lingua/sidebar/dashboard) su `app_user.attributes` — oggi solo localStorage; tocca `app_resolve_context`/RLS → farlo con cura, **non in sessione non presidiata**.
5. **Rifiniture**: esternalizzazione i18n completa (oltre alle schermate del demo); notifiche con stato “letto”; terminologia genere/articolo; mobile: edit attività al kit Drawer.

---

## 4. Cosa è stato fatto (riassunto; dettaglio nel doc COMPLETO §4-§9)
Parti 6-7-8 + FASE 3 + correzioni, in 18 commit (`d791678`→`bfa5ce6`):
- **Pianificazione**: fix griglia (scoping settimanale `weekView.ts`), **dipendenze nel motore** (`dependencyPlan.ts`, layer non invasivo), date demo relative.
- **Personalizzazione completa (config over code)**: terminologia per-tenant (`term_override`), palette colori (16, chiaro/scuro) + swatch picker, **campi personalizzati** (field_definition CRUD), **modelli di commessa** (tabella `template`).
- **UI/UX**: sidebar richiudibile/responsive, **tema scuro**, **i18n** (it-IT/en/es-AR), Dettaglio Risorsa (mock 20) con editor orari a intervalli, input data/ora assistiti.
- **Dashboard**: grafici (recharts) + **configurabile** + **marginalità** (budget − costi).
- **Trasversali**: **notifiche** (campanella + feed), **quota AI** (`ai_quota_month`), **3 demo pack** (fiber/software/pools), **mobile** Agenda+Cerca, FASE 3 dipendenze + **fix sicurezza** visibilità.

## 5. Debito tecnico / findings noti (da tenere a mente)
- **Risolti** in migr. 010: doppioni `field_definition` (008) e tabella `engagement_template` ridondante (009 → riconciliata su `template`).
- **Aperti**: scheduler UTC-naive; quota AI misurata come n. catture/mese (proxy, non token reali); notifiche e ricerca mobile di sola lettura; i18n esternalizzato solo per le schermate del demo.

## 6. Mappa file di riferimento
- Stato/analisi: `docs/analisi/2026-06-14_stato_sviluppo_COMPLETO_per_claude_ai.md` · schema `docs/analisi/2026-06-13_schema_db_completo.md`.
- Decisioni/brief: `docs/decisioni/` (BRIEF MASTER + parti 1-8; la parte 9 arriverà).
- Motore: `packages/backend/src/flow/{scheduler,weekView,dependencyPlan}.ts` + `routes/schedule.ts` + `test/*.test.ts`.
- Config: `routes/{fieldDefinitions,settings,templates,lookups}.ts`; FE `pages/admin/*`.
- Demo: `db/demo-packs/{fiber,software,pools}.json` + `src/demo/*`.
- Memoria (ripartenza rapida): `~/.claude/projects/.../memory/project_handoff.md`.

---

*Buon lavoro. Punto di ripartenza pulito: leggere la parte 9, poi pianificare ed eseguire con verifica e commit per unità.*
