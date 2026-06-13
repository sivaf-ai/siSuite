# siSuite — BRIEF MASTER per Claude Code

> **Data:** 13/06/2026 · **Lingua di lavoro:** italiano.
> Questo file **consolida e mette in ordine di esecuzione** tutte le decisioni prese. È la **fonte unica**:
> se basta un solo file da seguire, è questo. (I documenti "parte 1/2/3" restano come dettaglio esteso.)
> Verificato contro lo **schema reale** del DB (`2026-06-13_schema_db_completo.md`).
>
> **Obiettivo immediato:** portare a un **demo FIBRA** completo e convincente, dimostrabile **su un solo PC**.

---

## 0. Regole permanenti (valgono per ogni sessione)

1. **GitHub:** a fine di ogni sessione (e dopo ogni unità di lavoro) `git add -A && git commit && git push`.
   Verifica il `remote`. Nessuna sessione si chiude con lavoro non committato.
2. **Fedeltà visiva (gate bloccante):** una schermata è "fatta" solo se **combacia a vista** con il mockup in
   `docs/mockup/` (layout, spaziature, tipografia, colori via design token), non solo strutturalmente
   (`docs/FRONTEND_SPEC.md` §7). Il titolare segnala molte differenze: trattalo come blocco.
3. **Scheduler:** prima di modificare `packages/backend/src/flow/scheduler.ts` scrivi una **suite di test** che blocca
   il comportamento attuale (vedi §5.5). Ogni modifica successiva gira contro quei test.
4. **Chiave AI:** `ANTHROPIC_API_KEY` è un **segreto di piattaforma**, **solo lato server**. Mai nel frontend, mai in
   tabelle leggibili dal tenant, mai nei log. `.env` in `.gitignore`.
5. **Dati di sistema:** non modificare/cancellare mai righe con `tenant_id IS NULL` (ruoli, stati, etichette, piani,
   campi di sistema).
6. **Cambi ad alto rischio:** prima di interventi delicati (chirurgia sullo scheduler), fermati e conferma l'approccio.

---

## 1. Principio AI-first (vale ovunque ci sia un conflitto/cambiamento)

Il sistema **non forza mai** e **non sposta mai nulla in automatico di nascosto**. Invece:
1. mostra il problema; 2. **propone una soluzione già calcolata**; 3. l'utente conferma con un tocco; 4. può
**modificarla al volo** prima di confermare. ("L'LLM/solver propone, l'umano dispone.")

---

## 2. Decisioni sulle dipendenze tra attività

Tabella `activity_dependency` già pronta nello schema (FS/SS/FF/SF, `lag_minutes`, anti-self, `UNIQUE(pred,succ)`,
FK → `activity` ON DELETE CASCADE). Permessi `dependency:read|manage` (oggi solo Owner/Planner, scope tenant).

- **2.A** Le dipendenze devono **guidare davvero l'agenda** (obiettivo finale): definizione semplice e forte,
  applicazione molto dinamica.
- **2.B** Quando qualcosa slitta → **AVVISO + SOLUZIONE PROPOSTA** (mai auto-spostamento). Vedi §1.
- **2.C** Sequenza: **adesso** solo la parte semplice (creare/cancellare + etichetta "dopo X" + controlli);
  **dopo** (post risorse) l'integrazione nell'agenda. La parte rimandata va scritta in `BACKLOG_futuro.md` (§9).
- **Dettagli decisi:** solo **FS** in UI; `lag` mostrato in **giorni**; **stessa commessa** obbligatoria
  (`predecessor.engagement_id == successor.engagement_id`); **controllo anti-ciclo** obbligatorio prima dell'insert
  (`WITH RECURSIVE`); creazione da tendina **"Bloccata da"** nel dettaglio attività; **no** drag-to-link per ora.

---

## 3. Ordine di lavoro (priorità orientata al demo fibra)

### FASE 0 — Sicurezza e preparazione (subito)
- Commit + push del lavoro attuale su GitHub (configura il remote). *(§0.1)*
- Correggi nei documenti `app_user.customer_id` → **`company_id`** (`MVP_progetto.md` §9, `BACKLOG_futuro.md` #13):
  la colonna reale è `company_id`; la RLS del portale usa `app_current_company()`/`engagement.company_id`.
- Scrivi la suite di test dello scheduler **prima** di toccarlo. *(§5.5)*

### FASE 1 — Demo fibra end-to-end (priorità assoluta)
1. **AI che racconta (lato uscita):** verifica se esiste in `packages/backend/src/ai/`; se manca, costruisci un
   endpoint **di sola lettura** (es. `GET /engagements/:id/narrative`) che raccoglie i dati **sotto RLS** e li fa
   riassumere all'LLM nella lingua dell'utente. Mostralo nel dettaglio commessa **e** nella vista mobile del tecnico.
2. **Assegnazione risorse da UI:** backend e vincolo anti-doppia-prenotazione (`activity_resource` EXCLUDE) già pronti;
   manca lo schermo. Mostra il blocco quando la risorsa è già occupata.
3. **Vista tecnico mobile demo-ready su PC:** è un'app web (Ionic/React) → gira nel browser a larghezza telefono,
   accanto al pannello pianificatore, **sullo stesso PC** (vedi §4). Rendi perfette: oggi + cattura voce/testo +
   racconto AI, fedeli ai mockup 21/22.
4. **Sistema "Demo Data Pack" + pack fibra completo** (vedi §6): loader/unloader via CLI, tenant `Fibra Demo`,
   **utenti con login reali** (incluso il tecnico), asset con i **campi su misura fibra** valorizzati.
5. **Seed campi di sistema fibra** (vedi §8.4).
6. **Chiave AI** gestita in sicurezza (§7) e presente nell'ambiente del demo.

### FASE 2 — Credibilità del prodotto
7. Sottrazione `resource_availability` nello scheduler (non pianificare chi è in ferie).
8. Scheduling **per-risorsa** (oggi è una timeline unica).
9. **Agenda a griglia** risorse × giorni (mock 03/21).

### FASE 3 — Profondità
10. **Dipendenze parte semplice** (§2.C). *Prerequisito: fix sicurezza §5.1.*
11. **Gestione campi personalizzati** (UI + endpoint di scrittura + RLS) — §8.3. *(non blocca il demo fibra)*
12. **Modelli di lavoro** (template commessa).
13. Pack **software** e **piscine** finalizzati e testati (§6).

### RIMANDATO — da scrivere in `BACKLOG_futuro.md`, non dimenticare (§9)
- Integrazione dipendenze nello scheduler + **soluzione proposta** (§1).
- Miglioramento qualità della proposta quando arriva il **solver** (Timefold/OR-Tools).
- Gateway AI cloud per l'on-premise.

---

## 4. App del tecnico + demo su PC

Frontend = **Ionic + Capacitor + React** → **app web**: le viste mobile girano in qualsiasi browser. Per il demo
online (un solo PC): finestra del browser a **larghezza telefono** (~390px) accanto al pannello pianificatore; per
resa scenica, **cornice "telefono"** in CSS attorno alla vista tecnico. **Nessun secondo dispositivo.**
Sviluppo: prima le 2-3 schermate che reggono la promessa (oggi + cattura + racconto), fedeli ai mockup; il resto dopo.
Promemoria: le funzioni AI richiedono `ANTHROPIC_API_KEY` nell'ambiente del demo.

---

## 5. I cinque interventi tecnici (dettaglio)

### 5.1 Buco di sicurezza sulla scrittura dipendenze (prima del POST /dependencies)
La RLS su `activity_dependency` controlla **solo** `tenant_id`. Oggi non è sfruttabile (solo Owner/Planner, scope
tenant, hanno `dependency:manage`), ma è **latente**: un ruolo custom `own` + `dependency:manage` aprirebbe il buco.
→ Nel handler `POST /dependencies`, verifica la **visibilità di entrambe le attività** con `SELECT` su `activity`
attraverso la connessione RLS (`withRls()`); se una non torna, rifiuta. Verifica anche **stessa commessa**.

### 5.2 AI che racconta — vedi §3 Fase 1 punto 1.

### 5.3 Fedeltà visiva — vedi §0.2 (gate bloccante; priorità alle schermate del demo fibra).

### 5.4 GitHub — vedi §0.1.

### 5.5 Test dello scheduler (prima di modificarlo)
Suite che blocca il comportamento attuale di `flow/scheduler.ts` + `routes/schedule.ts`. Casi minimi:
attività fisse (`scheduled_start`) come occupazioni e dinamiche versate nei buchi; `earliest_start` rispettato;
`due_by` non raggiungibile → segnalato (non violato); ordinamento dinamiche per priorità poi `created_at`.
Aggiungere nuovi test quando si introducono disponibilità / per-risorsa / dipendenze.

---

## 6. Demo Data Pack — meccanismo

**Un tenant demo per pack** (`Fibra Demo`, `Software Demo`, `Piscine Demo`): i dati di sistema non si toccano mai;
più pack possono coesistere; "cancella pack" = svuota solo quel tenant.

**Dove:** file JSON in `db/demo-packs/` (`fiber.json`, `software.json`, `pools.json`), a **chiavi logiche** (no UUID).
**Loader** (`pnpm demo:load <pack>`, in transazione, connessione admin):
1. crea `tenant` → `subscription` → `number_series` `engagement`;
2. risolve gli stati di sistema: `SELECT id FROM lookup_value WHERE category=$1 AND canonical=$2 AND tenant_id IS NULL AND is_default`;
3. crea gli **utenti demo** con identità **GoTrue** (riusa `src/auth/gotrueAdmin` + `src/bootstrap.ts`) + `app_user` + `user_role`;
4. inserisce in ordine FK: `company`→`company_role`→`company_contact`→`asset`→`resource`(+`resource_availability`)
   →`material`→`engagement`→`phase`→`activity`→`activity_dependency`(+`activity_resource`)→`capture`→`time_entry`→`material_consumption`;
5. `engagement.code` dal `number_series` (NOT NULL, UNIQUE); `status_id` sempre risolto (obbligatorio su engagement/phase/activity);
6. dipendenze nel JSON come `"after":[{"act":<chiave>,"lag_days":N}]` → `activity_dependency(type='FS', lag_minutes=N*1440)`.

**Unloader** (`pnpm demo:wipe <pack>`, solo sul tenant demo, ordine inverso per via delle FK RESTRICT
`engagement.company_id`/`asset.company_id`/`material_consumption.material_id`):
```
time_entry → material_consumption → capture → activity_resource → activity_dependency → activity → phase →
engagement → asset → material → company_contact → company_role → company → resource_availability → resource →
user_role → app_user (+ rimozione GoTrue) → number_series → subscription → tenant
```
Mai toccare righe `tenant_id IS NULL`.

**Gating:** per ora **solo CLI** (eseguita dal proprietario sul server, invisibile ai clienti). Schermata superadmin
nascosta (endpoint guardati da `is_platform_admin`) opzionale in futuro.

**Formato JSON (esempio):**
```json
{
  "pack": "fiber",
  "tenant": { "name": "Fibra Demo", "vertical": "fiber", "default_locale": "it-IT", "timezone": "Europe/Rome" },
  "subscription": { "plan_code": "pro", "days_valid": 365 },
  "users": [
    { "key":"owner","full_name":"Giulia Bianchi","email":"owner@fibra.demo","role":"Owner","password":"Demo123!" },
    { "key":"planner","full_name":"Paolo Verdi","email":"planner@fibra.demo","role":"Planner","password":"Demo123!" },
    { "key":"marco","full_name":"Marco Gallo","email":"marco@fibra.demo","role":"Tecnico","password":"Demo123!" },
    { "key":"davide","full_name":"Davide Conti","email":"davide@fibra.demo","role":"Tecnico","password":"Demo123!" }
  ],
  "companies": [
    { "key":"distributore","display_name":"FibraItalia Distribuzione SpA","type":"organization",
      "roles":[{"role":"customer","customer_nature":"recurring"}],
      "contacts":[{"full_name":"Resp. Cantieri","phone":"02-1234567","is_primary":true}] },
    { "key":"cond_dante","display_name":"Condominio Via Dante 8, Milano","type":"organization",
      "roles":[{"role":"customer","customer_nature":"episodic"}] }
  ],
  "assets": [
    { "key":"borchia_dante_int5","company":"cond_dante","kind":"connection_point","label":"Borchia Via Dante 8 int.5",
      "attributes":{"connection_type":"FTTH","socket_id":"ROE-MI-00482","distance_m":320,"attenuation_db":0.42,"ont_serial":"ONT-7H2K9"} }
  ],
  "resources": [
    { "key":"marco_r","kind":"person","label":"Marco Gallo","user":"marco","attributes":{"hourly_cost":32} },
    { "key":"davide_r","kind":"person","label":"Davide Conti","user":"davide" },
    { "key":"furgone","kind":"vehicle","label":"Furgone attrezzato" },
    { "key":"giuntatrice","kind":"equipment","label":"Giuntatrice a fusione" },
    { "key":"otdr","kind":"equipment","label":"OTDR + power meter" },
    { "key":"soffiacavo","kind":"equipment","label":"Macchina soffiacavo" }
  ],
  "resource_availability": [
    { "resource":"davide_r","kind":"unavailable","starts_at":"2026-06-22T00:00:00+02:00","ends_at":"2026-06-27T00:00:00+02:00","reason":"Ferie" }
  ],
  "materials": [
    { "key":"cavo","name":"Cavo fibra ottica drop","unit":"m" },
    { "key":"borchia","name":"Borchia ottica","unit":"pz" },
    { "key":"pigtail","name":"Pigtail SC/APC","unit":"pz" },
    { "key":"soc","name":"Connettore SOC","unit":"pz" }
  ],
  "engagements": [
    {
      "key":"comm_dante","company":"cond_dante","asset":"borchia_dante_int5","type":"build",
      "title":"Allaccio FTTH Via Dante 8","manager":"planner","status":"active","started_on":"2026-06-08",
      "attributes":{"work_order_ref":"WO-2026-7781"},
      "phases":[{"key":"allaccio","name":"Allaccio","seq":1,"status":"active"}],
      "activities":[
        {"key":"sopr","phase":"allaccio","title":"Sopralluogo","status":"done","estimated_minutes":60,"resources":["davide_r"]},
        {"key":"posa","phase":"allaccio","title":"Posa/soffiaggio cavo drop","status":"done","estimated_minutes":120,"after":[{"act":"sopr","lag_days":0}],"resources":["davide_r","soffiacavo"]},
        {"key":"giunz","phase":"allaccio","title":"Giunzione (splicing)","status":"in_progress","estimated_minutes":90,"after":[{"act":"posa","lag_days":0}],"resources":["marco_r","giuntatrice"]},
        {"key":"borchia_act","phase":"allaccio","title":"Installazione borchia + ONT","status":"planned","estimated_minutes":60,"after":[{"act":"giunz","lag_days":0}]},
        {"key":"collaudo","phase":"allaccio","title":"Collaudo OTDR","status":"planned","estimated_minutes":45,"after":[{"act":"borchia_act","lag_days":0}],"resources":["otdr"]},
        {"key":"attiv","phase":"allaccio","title":"Attivazione linea","status":"planned","estimated_minutes":30,"after":[{"act":"collaudo","lag_days":0}]}
      ],
      "time_entries":[
        {"activity":"sopr","resource":"davide_r","typology":"installazione","minutes":60,"occurred_on":"2026-06-08"},
        {"activity":"posa","resource":"davide_r","typology":"installazione","minutes":120,"occurred_on":"2026-06-09"},
        {"activity":"giunz","resource":"marco_r","typology":"giunzione","minutes":45,"occurred_on":"2026-06-10"}
      ],
      "material_consumption":[
        {"activity":"posa","material":"cavo","quantity":25,"unit":"m","occurred_on":"2026-06-09"},
        {"activity":"borchia_act","material":"borchia","quantity":1,"unit":"pz","occurred_on":"2026-06-10"}
      ],
      "captures":[
        {"user":"davide","channel":"text","status":"applied","raw_text":"posato 25 metri di cavo al civico 8 interno 5, due ore"},
        {"user":"marco","channel":"text","status":"applied","raw_text":"giunzione fatta su via Dante, 45 minuti"}
      ]
    }
  ]
}
```
**Seconda commessa fibra (maintenance):** "Guasto linea Beta Logistica" — *Diagnosi guasto* (45'), *Ri-giunzione* (60'),
*Ricollaudo OTDR* (30'), stati misti. (Aggiunge varietà al demo.)

I pack **software** e **piscine**: contenuto di dominio in "parte 2" §5/§7 — generare e **testare** dopo la fibra.

---

## 7. Chiave AI — regole di sicurezza
1. Segreto di piattaforma, **solo server**; mai frontend/tabelle-tenant/log; `.env` in `.gitignore`.
2. Tutte le chiamate ad Anthropic partono dal backend (già così). Il frontend non vede mai la chiave.
3. Dove la mette il proprietario: env/secret del backend (single-VPS: `.env`; produzione: secrets manager).
   On-prem (futuro): gateway cloud della piattaforma che tiene la chiave; l'on-prem usa un token di licenza.
4. **Quota:** conta il consumo dagli eventi `capture`; oltre `plan.entitlements.ai_quota_month` blocca finché non si
   acquista un altro pacchetto.

---

## 8. Campi dinamici (form guidati da metadati)

### 8.1 Come funziona (esiste già)
I valori extra vivono in `entity.attributes` (JSONB); il **catalogo** `field_definition` descrive i campi
(chiave, label per-locale, tipo, obbligatorietà, gruppo, ordine, validazione). Da lì il backend genera la validazione
e il frontend (`EntityForm`) **disegna i campi da solo**. Due livelli: **sistema** (`tenant_id NULL`, per `vertical`) e
**per tenant** (`tenant_id` valorizzato = personalizzazione del singolo cliente, con override).

### 8.2 Chiavi codificate vs personalizzate (regola d'oro)
- **Chiavi di sistema (codificate):** l'app ci fa logica; righe di sistema, **non sovrascrivibili** dal tenant.
- **Chiavi personalizzate:** dato puro; l'app le tratta in modo generico (mostra/valida/salva), **mai logica**.
- Un tenant **non può ridefinire** una chiave di sistema (garantito da unicità + RLS + flag di sistema).
  È lo stesso pattern di `canonical_state` (codificato) + `lookup_value` (configurabile).

### 8.3 Da costruire — gestione senza codice (non blocca il demo fibra)
- Backend: `POST/PATCH/DELETE /field-definitions`, permesso `settings:manage`, validazione input
  (`key` `^[a-z][a-z0-9_]*$`, `options` se select/multiselect, `label` col locale di default).
- RLS: scrittura **solo** su righe `tenant_id = app_current_tenant()`; sistema (`NULL`) immodificabile dal tenant.
- Risoluzione "campi effettivi": unione righe di sistema (`vertical` del tenant **o** NULL) + righe del tenant
  (override per `(entity,key)`), ordine per `group_key` poi `sequence`. Verificare che `GET /field-definitions` lo faccia.
- Frontend: pagina admin **"Campi personalizzati"** (stile `CrudList`, `settings:manage`). `EntityForm` mostra i nuovi
  campi automaticamente: si configura il dato, non si programma il campo.
- Cancellazione campo con dati esistenti → preferire `active=false` (soft).

### 8.4 Campi di sistema FIBRA (seminare ora — servono al demo)
Migrazione `006_fiber_fields.sql` (o append al seed di `004`), `tenant_id NULL`, `vertical='fiber'`:
```sql
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, options, unit, group_key, sequence) VALUES
 (NULL,'fiber','asset','connection_type','{"it-IT":"Tipo connessione","en":"Connection type","es-AR":"Tipo de conexión"}','select',false,
   '[{"value":"FTTH","label":{"it-IT":"FTTH","en":"FTTH","es-AR":"FTTH"}},{"value":"FTTB","label":{"it-IT":"FTTB","en":"FTTB","es-AR":"FTTB"}},{"value":"FTTC","label":{"it-IT":"FTTC","en":"FTTC","es-AR":"FTTC"}}]',NULL,'technical',1),
 (NULL,'fiber','asset','socket_id','{"it-IT":"ID presa / ROE","en":"Socket/ROE ID","es-AR":"ID de toma"}','text',false,NULL,NULL,'technical',2),
 (NULL,'fiber','asset','distance_m','{"it-IT":"Distanza dalla centrale","en":"Distance from CO","es-AR":"Distancia a central"}','number',false,NULL,'m','technical',3),
 (NULL,'fiber','asset','attenuation_db','{"it-IT":"Attenuazione misurata","en":"Measured attenuation","es-AR":"Atenuación medida"}','number',false,NULL,'dB','technical',4),
 (NULL,'fiber','asset','ont_serial','{"it-IT":"Seriale ONT","en":"ONT serial","es-AR":"Serie ONT"}','text',false,NULL,NULL,'technical',5);
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, group_key, sequence) VALUES
 (NULL,'fiber','engagement','work_order_ref','{"it-IT":"Rif. ordine di lavoro","en":"Work order ref.","es-AR":"Ref. orden de trabajo"}','text',false,'contract',4);
```

---

## 9. Da scrivere in `BACKLOG_futuro.md` (non dimenticare)
- **Integrazione dipendenze nello scheduler + soluzione proposta** (ordinamento topologico FS,
  `earliest(succ)=max(earliest_start, fine(pred)+lag)`, conflitto → riprogrammazione proposta da confermare). Retrofit: Medio.
- **Qualità della proposta** migliora con il solver (Timefold/OR-Tools, già in backlog).
- **Gateway AI cloud per on-prem** (la chiave non risiede mai sul cliente).
- **Aggiornare i demo-pack e i campi dinamici** man mano che lo schema cresce.

---

## 10. Checklist finale (ordine di esecuzione)
- [ ] FASE 0: push GitHub · fix `customer_id`→`company_id` · test scheduler.
- [ ] FASE 1: AI racconta · UI assegnazione risorse · vista tecnico mobile su PC (fedele ai mockup) ·
      sistema demo-pack + `fiber.json` completo con login reali · seed campi fibra · chiave AI sicura.
- [ ] FASE 2: `resource_availability` · scheduling per-risorsa · agenda a griglia.
- [ ] FASE 3: dipendenze (parte semplice, dopo fix sicurezza) · gestione campi personalizzati · template · pack software/piscine.
- [ ] BACKLOG: aggiungi le voci di §9.

---

*Fine brief master — 13/06/2026.*
