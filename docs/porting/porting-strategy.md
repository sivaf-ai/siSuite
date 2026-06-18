# Porting Strategy — Legacy `DBCompanyManagement` → `siSuite` (AI-first)

> **Stato: ANALISI + STRATEGIA. Nessun dato copiato.** Documento prodotto in sessione brainstorming il 2026-06-18.
> Il DB legacy è e resta **read-only** (verità storica). L'ETL effettivo si lancia solo dopo approvazione esplicita, su questa strategia.

## 0. Decisioni approvate da Sivaf (2026-06-18)

| Decisione | Scelta |
|---|---|
| **Scope** | **Solo Sivaf reale** — tenant `17G2ML76qEsEmV2jCcXazg==`. Esclusi "Sivaf DEMO" e gli altri 13 tenant. |
| **Target** | **Nuovo tenant dedicato** nel DB `sisuite` (5433). La demo Powercom fibra resta intatta. |
| **Alberi** | **Preservare integri** — `phase.parent_phase_id` è ricorsivo, nessuna mutilazione dei dati. Code rare oltre liv. 5 segnalate. |
| **Storico** | Import come `approval_status=approved` + `is_locked=true`, `lock_reason='ETL_HISTORICAL'`. |

## 1. Connessioni

- **Legacy (sorgente, RO):** `localhost:5432/DBCompanyManagement` — `sisuite_user / sisuite2024`. 15 tenant, 144 tabelle.
- **Nuovo (target):** `localhost:5433/sisuite` — admin `sisuite_admin / dev_admin_pwd_change_me` (bypass RLS, per ETL). 53 tabelle. **Già popolato con demo fibra** (4 tenant) → import su tenant nuovo dedicato.

## 2. Numeri reali — tenant Sivaf (censimento 2026-06-18)

| Tabella legacy | Righe Sivaf | Note |
|---|---:|---|
| users | 30 | |
| usersgroups / usersgroupsmembers | 7 / 23 | |
| companies | 36 | |
| contacts | 15 | |
| projects | 15 | radici di 317 nodi `projectsstructures` |
| projectsstructures (Sivaf) | 317 | prof. max **6**, 90% ≤ 4 |
| assetscategories | 17 | albero |
| assets | 35 | prof. max 6 |
| tasks | 5.062 | 13 sotto-tipi |
| tasksusers | 4.472 | relazione task↔utente |
| tasksstatus | 17 | lookup per tenant |
| workorders / workordersassets | 16 / 16 | |
| parts | 8 | catalogo minimo |
| partscategories | 11 | albero (prof. 4) |
| worksummary | **19.370** | il grosso del lavoro |
| worksummarycategories | 20 | lookup |
| workingtime | 27 | orari |

### Split `worksummary` Sivaf (discriminante reale = `workitemobjecttype`)

| Codice / entitytype | Righe | Significato (da constants) | Destinazione nuova |
|---|---:|---|---|
| TH / PS | 15.015 | Ore su struttura progetto | `time_entry` |
| KH / PS + KH / TA | 1.133 | Ore (categoria K) | `time_entry` |
| **PH / SU** | 2.413 | **Giustificativi** (ferie/malattie/permessi) | `absence_entry` |
| **IH / SU** | 778 | **Interruzioni di produzione** (quantity NULL) | `absence_entry` |
| SQ/WH/WQ/PQ/AQ/AH (PS/WO/AS) | ~31 | Quantità/prezzi/prestazioni (code) | `material_consumption` / scarto |

**Conclusione:** Sivaf è un tenant **ore-centrico**. ~16.150 righe ore → `time_entry`, ~3.190 assenze → `absence_entry`, ~30 righe materiali/edge trascurabili.

## 3. Classificazione delle strutture

### 🟢 A — Facilmente trasferibili (mappatura ~1:1)

| Legacy | → Nuovo | Trasformazione |
|---|---|---|
| `tenants[Sivaf]` | `tenant` (1 riga nuova) | `teamname`→`name`, `vertical` da decidere (es. 'software'), genera UUID nuovo |
| `users` (30) | `app_user` + `resource(kind=person)` | email/nome diretti; **pwdhash NON migrabile** → `auth_user_id` NULL, reset al 1° login |
| `usersgroups`/`members` | `role` + `user_role` | mappa gruppi→ruoli custom o ai 6 ruoli di sistema |
| `companies` (36) | `company` (+ `company_role`) | `type` da natura; P.IVA/CF in `attributes` jsonb |
| `contacts` (15) | `company_contact` | richiede legame azienda (vedi §4.6) |
| `tasksstatus` (17) | `lookup_value` (cat. `activity_status`) | mappa a canonical_state |
| `worksummarycategories` (20) | `lookup_value` (typology) / categorie assenza | |
| `workingtime` (27) | `tenant.working_hours` / `resource.working_hours` | jsonb settimanale |
| `parts` (8) | `material` | catalogo minimo |
| Ore TH/KH (16.150) | `time_entry` | `quantity`(min)→`minutes`, `movementdatetime`→`occurred_on`, marcate approved+locked |
| Assenze PH/IH (3.191) | `absence_entry` | minuti→ore, categoria→`type_id` |

### 🟡 B — Con problematiche (trappole note, gestibili)

1. **`worksummary` polimorfico WO** (poche righe Sivaf, ma regola obbligatoria): `entitytype='WO'` → `entitytypeobjectid` punta a `workordersassets`, **non** `workorders`. Dereferenziare per risalire a engagement/work_order.
2. **`quantity` polisemico**: minuti (H) / pezzi (Q) / valori (P), fino a 93.000. Split per `workitemobjecttype` in colonne tipizzate (`minutes` vs `quantity`).
3. **`projectsstructures` senza `idtenant`**: albero globale, scope Sivaf solo via `projects.idprojectstructure` + discesa ricorsiva `idprojectstructureparent`. L'ETL deve raccogliere i nodi per closure dalla radice di ciascun progetto.
4. **`asset` nuovo richiede `company_id` NOT NULL**: gli asset legacy sono legati a categoria/progetto, non sempre a un'azienda. Serve derivare l'azienda (dal progetto/cliente) o azienda placeholder "interno".
5. **`engagement` richiede `company_id` + `status_id` NOT NULL**: ogni progetto va legato a un'azienda cliente e a uno stato lookup. Progetti interni → azienda "Si.Va.F. (interno)".
6. **`contacts` (15)**: nel legacy possono essere svincolati; nel nuovo `company_contact` esige `company_id`. Contatti orfani → azienda placeholder o tabella ponte `companiescontacts`.
7. **Naming/typo legacy** da normalizzare: `holydays`→holidays, `"Sequence"`→`seq`, ecc. (cosmetico, gestito in mapping).

### 🔴 C — Da lavorare / decisioni di trasformazione

1. **Alberi progetto → engagement/phase/activity** (cuore del porting):
   - `projects` → `engagement` (richiede company + status).
   - Nodi-struttura **intermedi** (con figli) → `phase` (ricorsiva, profondità preservata).
   - Nodi-struttura **foglia / che portano ore** → `activity`.
   - **Nodo che è insieme intermedio E porta ore**: regola da fissare — creare un'`activity` "lavori su <nome>" figlia, OPPURE agganciare le ore all'engagement. ⚠️ `time_entry` **non** ha `phase_id`: si aggancia solo a `engagement_id` o `activity_id`. Quindi ogni nodo con ore deve avere un'`activity` corrispondente.
   - Modelli `structuretype='MO'` (49 globali): trasformare in `template` (scope engagement) o ignorare. **Decisione:** ignorare per Sivaf (pochi/nessuno reale).
2. **`tasks` (5.062) → `activity`**: 13 `tasktype` (TA 6265, TC, WO, MT, OS, AS, MC, AC, WC, EV). Mappare i tipi al campo `kind` (domain-pack). `tasksparents` (albero) → relazione phase/activity; convenzione `tasksusers.Sequence=999999`=chiuso da decodificare in stato.
3. **`assets` (35) albero → `asset` piatto**: il nuovo `asset` non ha gerarchia. Appiattire: tenere il nodo foglia come asset, conservare il path in `attributes.legacy_path` per non perdere informazione. `assetscategories` → `asset.kind`/`attributes`.
4. **`worksummary` ore su struttura**: dopo aver creato engagement/phase/activity, le 16.150 righe TH/KH vanno agganciate via `entitytypeobjectid`(=idprojectstructure) → activity mappata. Serve la **tabella di mapping `idprojectstructure → activity.id`**.
5. **`absence_entry`**: serve `resource_id` (la persona). Mappare `worksummary.iduser` → resource person. Le categorie giustificativo (`worksummarycategories`) → `lookup_value` categoria assenza (canonical da seminare se mancante).

## 4. Architettura ETL proposta (da implementare DOPO approvazione)

- **Script Node + `pg`**, 2 pool: `legacyPool` (5432, solo SELECT), `newPool` (5433, admin).
- **Tabella di mapping** persistita (es. `etl_idmap(legacy_table, legacy_id, new_id uuid)`) nel DB nuovo o file JSON: risolve le FK cross-tabella in più passate, rende l'ETL **rilanciabile**.
- **Idempotenza**: UUID deterministici da `idlegacy` (es. uuid v5 namespace) → `INSERT ... ON CONFLICT (id) DO NOTHING`. Rilancio = no-op.
- **Transazione per fase**; ordine sotto.
- **client_created_at** / `created_at` ← `insertdatetime` legacy dove utile.

### Ordine di esecuzione (FK-safe)

```
1.  tenant (Sivaf)                          → genera UUID, salva in idmap
2.  lookup_value (status, priority, typology, categorie assenza)  [+ canonical mancanti]
3.  app_user (30) + resource(person)        [pwdhash scartato]
4.  role / user_role (da usersgroups)
5.  company (36) + company_role             [+ azienda "interno" placeholder]
6.  company_contact (15)                    [risolve company_id]
7.  asset (35)                              [albero→piatto, path in attributes, company derivata]
8.  engagement (15 da projects)             [company+status obbligatori]
9.  phase (nodi intermedi projectsstructures, ricorsivo)
10. activity (nodi foglia/con-ore + tasks)  [mapping idprojectstructure/idtask → activity.id]
11. work_order (16) + work_order_item       [via workordersassets]
12. time_entry (~16.150 TH/KH)              [approved+locked, aggancio via idmap]
13. absence_entry (~3.191 PH/IH)            [resource_id da iduser]
14. material_consumption (~30 edge)         [opzionale]
```

## 5. Criteri di validazione (dry-run Sivaf)

- [ ] `count(time_entry)` ≈ righe TH+KH legacy Sivaf (16.150 ± edge).
- [ ] `count(absence_entry)` ≈ PH+IH (3.191).
- [ ] **Somma minuti**: `SUM(quantity) worksummary TH/KH` = `SUM(minutes) time_entry`.
- [ ] Ogni `engagement` ha company + status validi; ogni `asset`/`engagement` ha company.
- [ ] Zero FK orfane; zero violazioni CHECK (`time_entry.minutes>0`).
- [ ] 15 engagement, 30 app_user, 36 company per il tenant Sivaf nuovo.
- [ ] Nodo-struttura con ore → esiste activity collegata (nessuna ora persa).
- [ ] Report differenze < 0,5%.

## 6. Note di sicurezza

- **NON** copiare `AIConfig.apikey` (in chiaro) né chiavi Stripe/SendInBlue (sono nel codice legacy, non nel DB). Eventuali config → placeholder.
- `pwdhash` non migrato: utenti resettano password via magic link GoTrue al 1° accesso.

## 7. Stato del lavoro / artefatti

- Script di analisi read-only: `scratch-porting/analyze.js`, `scratch-porting/census.js` (NON committare `scratch-porting/node_modules`).
- Prossimo passo (su OK): scrivere il piano d'implementazione (writing-plans) e lo script ETL, poi **dry-run Sivaf** + validation report **prima** di qualunque scrittura definitiva.

---
*Si.Va.F. — sessione brainstorming porting, 2026-06-18.*
