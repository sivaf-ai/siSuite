# siSuite — Set di dati per demo + chiave AI sicura — brief per Claude Code (parte 2)

> **Data:** 13/06/2026 · Complemento al documento `2026-06-13_decisioni_e_brief_per_claude_code.md`.
> Verificato contro lo **schema reale** (`2026-06-13_schema_db_completo.md`). Nomi di tabelle/colonne esatti.

---

## 0. Esito del re-check del brief precedente (contro lo schema reale)

Tutto il brief precedente combacia con lo schema reale. In particolare confermati:
- `activity_dependency` (FS/SS/FF/SF, `lag_minutes`, `CHECK(predecessor_id<>successor_id)`,
  `UNIQUE(predecessor_id, successor_id)`, FK `predecessor_id`/`successor_id` → `activity` **ON DELETE CASCADE**);
- `activity` (colonne `engagement_id`, `phase_id`, `status_id` NOT NULL, `estimated_minutes`,
  `scheduled_start`, `earliest_start`, `due_by`, `checklist`, `attributes`);
- `tenant.working_hours` / `tenant.timezone` / `tenant.default_locale` esistono;
- RLS: `activity_dependency` solo isolamento tenant; `activity` con scope fine `own`;
- `activity_resource` con `EXCLUDE ... no_double_booking` (anti-doppia-prenotazione già pronto);
- `resource_availability` esiste; pipeline AI solo in ingresso (nessuna narrazione).

**Incongruenza trovata nei documenti di progetto (NON nel brief), da correggere:**
- `MVP_progetto.md` §9 e `BACKLOG_futuro.md` #13 citano **`app_user.customer_id`**. La colonna reale è
  **`app_user.company_id`** (FK → `company`, `ON DELETE SET NULL`); la RLS del portale usa `app_current_company()`
  e `engagement.company_id`. → **Aggiornare i due documenti** sostituendo `customer_id` con `company_id`.
  (Impatta il portale cliente e i dati demo con scope `customer`.)

---

## 1. Meccanismo "Demo Data Pack" — design

### 1.1 Principio: un tenant demo per ogni set
Ogni set di dati è un **tenant a sé** (es. `Piscine Demo`, `Fibra Demo`, `Software Demo`). Vantaggi:
- i **dati di sistema** (ruoli, `canonical_state`, `lookup_value` con `tenant_id NULL`, `plan`) **non si toccano mai**;
- isolamento naturale (la RLS già separa i tenant); più set possono coesistere;
- "cancella set" = svuota **solo** quel tenant.

### 1.2 Dove vivono i dati: file JSON nel repo
Cartella nuova: `db/demo-packs/` con `pools.json`, `fiber.json`, `software.json`.
Formato a **chiavi logiche** (NON UUID): il loader genera gli UUID e risolve i riferimenti a runtime.
Vedi §4 per il formato esatto e §5/§6/§7 per i contenuti.

### 1.3 Caricamento (loader) — ordine e regole
Script `db/demo-packs/load.ts` (eseguibile via `pnpm demo:load <pack>`), **dentro una transazione**, con connessione admin:
1. crea il **tenant** (`name`, `vertical`, `default_locale`, `timezone`);
2. crea la **subscription** per quel tenant (plan a scelta, es. `pro`, scadenza lontana per la demo);
3. crea il **number_series** `engagement` per quel tenant (`format '{YYYY}-{SEQ:4}'`, `reset_period 'yearly'`);
4. **risolve gli stati di sistema** una volta sola: per ogni `(category, canonical)` →
   `SELECT id FROM lookup_value WHERE category=$1 AND canonical=$2 AND tenant_id IS NULL AND is_default LIMIT 1`
   (categorie usate: `activity_status`, `engagement_status`, `phase_status`, `priority`);
5. crea gli **utenti demo**: per ognuno provisiona l'identità **GoTrue** (riusa `src/auth/gotrueAdmin` e la logica di
   `src/bootstrap.ts`), poi `app_user` (con `auth_user_id`) e `user_role` (ruolo di sistema risolto per nome);
6. inserisce, **nell'ordine FK**: `company` → `company_role` → `company_contact` → `asset` → `resource`
   (+ `resource_availability`) → `material` → `engagement` → `phase` → `activity` → `activity_dependency`
   (+ `activity_resource`) → `capture` → `time_entry` → `material_consumption`;
7. per `engagement.code`: generarlo dal `number_series` del tenant (NON inventarlo a mano, così resta coerente).

**Regole importanti:**
- `engagement.code` è **NOT NULL** e **UNIQUE(tenant_id, code)** → usare il numeratore.
- `status_id` è obbligatorio su `engagement`, `phase`, `activity` → risolverlo sempre (punto 4).
- le dipendenze nel JSON sono espresse come `"after": [{"act": <chiave>, "lag_days": N}]` → il loader crea
  `activity_dependency(predecessor=act, successor=corrente, type='FS', lag_minutes = N*1440)`.
- ogni riga con colonna `attributes` riceve anche un marcatore `{"_demo_pack": "<pack>"}` (utile per audit/cleanup).

### 1.4 Cancellazione (unloader) — ordine sicuro
Script `db/demo-packs/wipe.ts` (`pnpm demo:wipe <pack>`), in transazione, **solo** sul tenant demo
(`tenant_id = <demo>`). Alcune FK sono **RESTRICT** (`engagement.company_id`, `asset.company_id`,
`material_consumption.material_id`): quindi **non** basta cancellare il tenant, va fatto in **ordine inverso**:
```
time_entry → material_consumption → capture →
activity_resource → activity_dependency → activity → phase → engagement →
asset → material → company_contact → company_role → company →
resource_availability → resource →
user_role → app_user (+ rimozione identità GoTrue) →
number_series (del tenant) → subscription (del tenant) → tenant
```
(Molte di queste cascano da sole, ma l'ordine esplicito evita ogni errore da FK RESTRICT.)
**Mai** cancellare righe con `tenant_id IS NULL` (sono dati di sistema).

### 1.5 Chi può lanciarlo (gating)
**Solo il proprietario della piattaforma**, mai i tenant. Due opzioni, in ordine di sicurezza:
- **Consigliata per ora: solo CLI** (`pnpm demo:load`/`demo:wipe`), eseguita sul server. Zero superficie d'attacco,
  invisibile ai clienti.
- **Opzionale (futuro): schermata "superadmin" nascosta**, dietro endpoint guardati da `is_platform_admin`
  (es. `POST /platform/demo-packs/:pack/load|wipe`), usando i permessi di piattaforma già previsti
  (`platform:access`). Non comparire mai nel menu dei tenant.

### 1.6 Manutenzione nel tempo
I file JSON e gli script vanno **aggiornati man mano che lo schema cresce** (nuove colonne/tabelle).
Tenerli versionati in `db/demo-packs/` e citati in `BACKLOG_futuro.md` come artefatto vivo.

---

## 2. Chiave AI — meccanismo sicuro (per Claude Code)

**Modello commerciale (deciso dal titolare):** vendiamo il sistema con **consumo AI incluso**; quando il cliente
esaurisce il credito, **acquista altri pacchetti da noi**. Quindi la chiave Anthropic è **sempre nostra**
(della piattaforma) e **il cliente non deve mai vederla**.

**Regole non negoziabili:**
1. `ANTHROPIC_API_KEY` è un **segreto di piattaforma**, **solo lato server**. **Mai** nel frontend, **mai** in una
   tabella leggibile dal tenant, **mai** in log o messaggi d'errore.
2. **Tutte** le chiamate ad Anthropic partono dal **backend** (già così: pipeline in `packages/backend/src/ai/`).
   Il frontend chiama il backend; il backend chiama Anthropic. La chiave non transita mai verso il client.
3. **Dove la mette il proprietario:**
   - **Cloud/single-VPS:** variabile d'ambiente del backend (`.env` in dev; **secrets manager** dell'hosting in
     produzione). Verificare che `.env` sia in **`.gitignore`** (non deve mai finire su GitHub).
   - **On-premise (futuro):** l'AI passa da un **gateway cloud di proprietà della piattaforma** che tiene la chiave;
     l'istanza on-prem si autentica con un **token di licenza** e **non vede mai la chiave** (coerente con
     `MVP_progetto.md` §7 e backlog #8/#22). Documentare, non costruire ora.
4. **Quota/consumo:** il consumo si conta dagli eventi `capture` (già previsto). Far rispettare la quota del piano
   (`plan.entitlements.ai_quota_month`): oltre soglia, **bloccare** le chiamate AI finché non si acquista un altro
   pacchetto. (Questo è il "gating quota AI" oggi mostrato ma non imposto — collegarlo qui.)

**In sintesi per il proprietario:** la chiave si inserisce **una volta sola sul server** (env/secret). Da lì il
backend la usa per tutti i tenant; il consumo è limitato dalla quota del piano di ciascun tenant.

---

## 3. I tre set di dati — note comuni

Ogni pack contiene: 1 tenant; utenti (1 Owner + 1 Planner + 2 tecnici); 2-3 aziende clienti con contatti;
asset; risorse (persone + mezzi/attrezzature); materiali; 2-3 commesse (mix `build`/`maintenance`) con fasi,
attività (mix **fisse**/**dinamiche** e stati misti `done`/`in_progress`/`planned`), dipendenze, alcune ore e
consumi registrati, e 1-2 catture con `raw_text` realistico (per mostrare il loop AI e la narrazione).

**Stati misti voluti:** servono perché la narrazione AI ("scavo e getto fatti, impermeabilizzazione in corso,
14 ore su 40") sia ricca già in demo.

---

## 4. Formato JSON di un pack (spec esatta per il loader)

```json
{
  "pack": "pools",
  "tenant": { "name": "Piscine Demo", "vertical": "pools", "default_locale": "it-IT", "timezone": "Europe/Rome" },
  "subscription": { "plan_code": "pro", "days_valid": 365 },
  "users": [
    { "key": "owner",  "full_name": "Giulia Bianchi", "email": "owner@piscine.demo",  "role": "Owner",   "password": "Demo123!" },
    { "key": "planner","full_name": "Paolo Verdi",    "email": "planner@piscine.demo","role": "Planner", "password": "Demo123!" },
    { "key": "mario",  "full_name": "Mario Rossi",     "email": "mario@piscine.demo",  "role": "Tecnico", "password": "Demo123!" },
    { "key": "luigi",  "full_name": "Luigi Neri",      "email": "luigi@piscine.demo",  "role": "Tecnico", "password": "Demo123!" }
  ],
  "companies": [
    { "key": "rossi", "display_name": "Famiglia Rossi", "type": "private", "address": "Via Garibaldi 12, Monza",
      "roles": [ { "role": "customer", "customer_nature": "episodic" } ],
      "contacts": [ { "full_name": "Anna Rossi", "phone": "333-1112233", "is_primary": true } ] }
  ],
  "assets": [
    { "key": "piscina_rossi", "company": "rossi", "kind": "pool", "label": "Piscina interrata 8x4",
      "attributes": { "volume_m3": 48, "heating": "heat_pump" } }
  ],
  "resources": [
    { "key": "mario_r", "kind": "person", "label": "Mario Rossi", "user": "mario",
      "attributes": { "hourly_cost": 35, "skills": ["costruzione"] } },
    { "key": "escavatore", "kind": "equipment", "label": "Mini-escavatore 1.5t" }
  ],
  "resource_availability": [
    { "resource": "luigi_r", "kind": "unavailable", "starts_at": "2026-06-22T00:00:00+02:00",
      "ends_at": "2026-06-27T00:00:00+02:00", "reason": "Ferie" }
  ],
  "materials": [
    { "key": "cemento", "name": "Cemento R325", "unit": "sacco" },
    { "key": "guaina",  "name": "Guaina impermeabile", "unit": "m2" }
  ],
  "engagements": [
    {
      "key": "comm_rossi", "company": "rossi", "asset": "piscina_rossi", "type": "build",
      "title": "Costruzione piscina Rossi", "manager": "owner", "status": "active", "started_on": "2026-06-01",
      "phases": [ { "key": "strutt", "name": "Struttura e vasca", "seq": 1, "status": "active" } ],
      "activities": [
        { "key": "scavo", "phase": "strutt", "title": "Scavo", "status": "done",
          "estimated_minutes": 480, "resources": ["mario_r", "escavatore"] },
        { "key": "getto", "phase": "strutt", "title": "Getto platea", "status": "in_progress",
          "estimated_minutes": 360, "after": [ { "act": "scavo", "lag_days": 0 } ], "resources": ["mario_r"] },
        { "key": "imper", "phase": "strutt", "title": "Impermeabilizzazione", "status": "planned",
          "estimated_minutes": 240, "after": [ { "act": "getto", "lag_days": 2 } ] },
        { "key": "posa", "phase": "strutt", "title": "Posa rivestimento", "status": "planned",
          "estimated_minutes": 600, "after": [ { "act": "imper", "lag_days": 0 } ] }
      ],
      "time_entries": [
        { "activity": "scavo", "resource": "mario_r", "typology": "costruzione", "minutes": 480, "occurred_on": "2026-06-02" },
        { "activity": "getto", "resource": "mario_r", "typology": "costruzione", "minutes": 180, "occurred_on": "2026-06-05" }
      ],
      "material_consumption": [
        { "activity": "getto", "material": "cemento", "quantity": 12, "unit": "sacco", "occurred_on": "2026-06-05" }
      ],
      "captures": [
        { "user": "mario", "channel": "text", "status": "applied",
          "raw_text": "due ore sullo scavo Rossi, ho usato tre sacchi di cemento" }
      ]
    }
  ]
}
```
Note loader: `after[].lag_days * 1440 = lag_minutes`; `status` risolto su `lookup_value` (canonical) per la categoria
giusta (`activity_status`/`engagement_status`/`phase_status`); le attività senza `scheduled_start` sono **dinamiche**.
Per mostrare anche una **fissa**, aggiungere `"scheduled_start": "2026-06-30T09:00:00+02:00"` su un'attività.

---

## 5. PACK PISCINE (`pools.json`) — contenuto di riferimento

Usare la struttura JSON di §4 ed estenderla così:
- **2ª commessa (maintenance):** "Manutenzione piscina Verdi" su un asset `piscina_verdi` (cliente `verdi`,
  `customer_nature: recurring`): attività ricorrenti tipo *Analisi acqua* (90'), *Trattamento chimico* (60'),
  *Pulizia filtri* (120') — stati misti.
- **Materiali piscine:** Cemento R325 (sacco), Ferro tondino (kg), Guaina impermeabile (m²), Cloro granulare (kg),
  Pompa filtrazione (pz), Skimmer (pz), Faretto LED (pz).
- **Risorse:** Mario Rossi (persona, skill costruzione), Luigi Neri (persona, skill manutenzione),
  Mini-escavatore (attrezzatura), Furgone (mezzo).
- **Catena dipendenze build:** Scavo → Getto platea → (lag 2 gg) Impermeabilizzazione → Posa rivestimento →
  Impianto filtrazione → Riempimento e collaudo.

---

## 6. PACK FIBRA (`fiber.json`) — contenuto di dominio (Claude Code lo rende in JSON come §4 e TESTA)

Terminologia reale verificata (sopralluogo, soffiaggio/posa cavo, giunzione/splicing, borchia ottica + ONT,
collaudo OTDR, attivazione).

- **Tenant:** `Fibra Demo`, vertical `fiber`, locale `it-IT`, timezone `Europe/Rome`.
  *(Nota: per `fiber` non esistono ancora `field_definition`; gli `attributes` funzionano comunque, senza hint UI.)*
- **Aziende clienti:**
  - `distributore` — "FibraItalia Distribuzione SpA" (organization, `customer`, `recurring`): è il committente per cui
    si installano le connessioni. Contatto: responsabile cantieri.
  - `cond_via_dante` — "Condominio Via Dante 8, Milano" (private/organization): sito d'installazione.
  - `azienda_beta` — "Beta Logistica Srl" (organization): sito d'installazione aziendale.
- **Asset:** punti di terminazione, `kind: "connection_point"`: `borchia_dante_int5` ("Borchia Via Dante 8 int.5"),
  `borchia_beta` ("Borchia Beta Logistica - sede").
- **Risorse:** Marco Gallo (persona, giuntista), Davide Conti (persona, installatore), Furgone attrezzato (mezzo),
  Giuntatrice a fusione (attrezzatura), OTDR + power meter (attrezzatura), Macchina soffiacavo (attrezzatura).
- **Materiali:** Cavo fibra ottica drop (m), Borchia ottica (pz), Pigtail SC/APC (pz), Connettore SOC (pz),
  Bretella ottica (pz), Muffola di giunzione (pz).
- **Commessa build — "Allaccio FTTH Via Dante 8" (`type: build`, manager: planner):**
  - Fase "Allaccio". Attività in catena FS:
    1. Sopralluogo (60', dinamica, `done`)
    2. Posa/soffiaggio cavo drop (120', dopo Sopralluogo) — risorse: installatore + soffiacavo
    3. Giunzione/splicing (90', dopo Posa) — risorsa: giuntista + giuntatrice
    4. Installazione borchia ottica + ONT (60', dopo Giunzione)
    5. Collaudo OTDR (45', dopo Installazione) — risorsa: OTDR
    6. Attivazione linea (30', dopo Collaudo)
  - 1-2 `time_entries` + consumo (1 borchia, ~25 m di cavo); 1 capture: *"installata borchia al civico 8 interno 5,
    giunzione ok, collaudo OTDR passato, 90 minuti"*.
- **Commessa maintenance — "Guasto linea Beta Logistica" (`type: maintenance`):**
  attività: *Diagnosi guasto* (45'), *Ri-giunzione* (60'), *Ricollaudo OTDR* (30') — stati misti.

---

## 7. PACK SOFTWARE (`software.json`) — contenuto di dominio (Claude Code lo rende in JSON e TESTA)

Sfrutta i `field_definition` già esistenti per `software` (asset: `version`/`environment`/`repo_url`;
material: `brand`/`part_number`; resource: `skills` backend/frontend/sysadmin/pm).

- **Tenant:** `Software Demo`, vertical `software`.
- **Aziende clienti:** `acme` — "Acme Retail Srl" (`customer`, `recurring`); `gamma` — "Gamma Servizi Srl" (`customer`).
- **Asset:** `crm_acme` — "CRM Acme" (`kind: application`, attributes: version `2.3.0`, environment `prod`,
  repo_url fittizio).
- **Risorse:** Sara Fontana (persona, skill `backend`,`pm`), Luca Marini (persona, skill `frontend`),
  Elena Bruno (persona, skill `sysadmin`).
- **Materiali:** minimi (il software è quasi tutto tempo) — es. "Licenza libreria X" (pz). *(Opzionale.)*
- **Commessa build — "Sviluppo modulo Fatturazione" (`type: build`, manager: owner):**
  - Fasi (seq): Analisi → Design → Sviluppo → Test → Deploy → Formazione.
  - Attività in catena FS (esempi): *Raccolta requisiti* (480', `done`) → *Disegno tecnico* (360', `done`) →
    *Sviluppo backend* (1200', `in_progress`, skill backend) ∥ *Sviluppo frontend* (960', `planned`, skill frontend)
    → *Test integrazione* (480', dopo entrambi) → *Deploy in produzione* (180', fissa con `scheduled_start`) →
    *Formazione utente* (120', dopo Deploy).
    *(Nota: backend e frontend in parallelo = ottimo per mostrare lo scheduling per-risorsa quando arriverà.)*
  - `time_entries` su requisiti/design/backend; 1 capture: *"tre ore sul fix del login del modulo fatturazione,
    ambiente staging"*.
- **Commessa maintenance — "Assistenza CRM Acme" (`type: maintenance`):**
  attività tipo ticket: *Bug fix esportazione* (120'), *Aggiornamento dipendenze* (90'), *Supporto SLA* (60').

---

## 8. Checklist per Claude Code (questa parte)

- [ ] Correggi nei documenti `customer_id` → `company_id` (MVP §9, BACKLOG #13). *(§0)*
- [ ] Crea `db/demo-packs/` con loader (`load.ts`) e unloader (`wipe.ts`), script `pnpm demo:load|demo:wipe <pack>`. *(§1)*
- [ ] Loader: tenant + subscription + number_series + risoluzione stati + utenti GoTrue + insert in ordine FK. *(§1.3)*
- [ ] Unloader: cancellazione nell'**ordine inverso** indicato, solo sul tenant demo, mai i dati di sistema. *(§1.4)*
- [ ] Gating: **solo CLI** per ora (eseguibile dal proprietario sul server); schermata superadmin nascosta opzionale. *(§1.5)*
- [ ] Genera e **testa** i tre file: `pools.json` (completo §5), `fiber.json` (§6), `software.json` (§7). *(§4–7)*
- [ ] Chiave AI: applica le regole di §2 (segreto di piattaforma, solo server, `.env` in `.gitignore`, quota enforcement).
- [ ] Commit + push su **GitHub** a fine sessione. *(regola del brief parte 1)*

---

*Fine parte 2 — 13/06/2026.*
