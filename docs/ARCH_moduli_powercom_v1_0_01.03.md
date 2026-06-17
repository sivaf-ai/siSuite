# siSuite — Moduli POWERCOM (Ordinativi FTTH · Magazzino seriali · Produzione)

> Documento **architetturale** (living). Owner: design. Chat: 01.03 · 15/06/2026.
> Stato schema di partenza: migrazioni 001→023. Questo doc descrive le aggiunte 024→028.
> ADR collegati: ADR-0001…0004.

## 1. Perche'
Nuovo cliente **POWERCOM** (infrastrutturazione FTTH). Tre bisogni, in ordine di priorita':
1. **Magazzino cloud** (gia' coperto) **+ seriali** degli apparati installati.
2. **Ordinativi/ticket di attivazione FTTH** (il gancio reale).
3. **Contabilita' di produzione** "tipo CPM" (voci di capitolato × quantita' → costi/ricavi, pivot). Modulo parallelo.

Principio guida invariato: *l'AI propone, il deterministico dispone*; tutto poggia sulla spina esistente `engagement → phase → activity → resource/time/material`, multi-tenant con RLS.

## 2. I tre moduli, in breve

### 2.1 Magazzino a seriali  *(ADR-0002 · migr. 024)*
- `material.tracked_by_serial` + tabella **`stock_serial_unit`** (un record per pezzo: seriale, stato, ubicazione/detentore, eventuali segreti cifrati).
- Ciclo: `in_stock → assigned → installed → faulty/returned/retired`. Quando "installed", l'unita' entra nel **parco installato** del cliente (collegabile ad `asset`).
- Seriale ≠ lotto: il lotto (`tracked_by_lot`/`lot_id`) resta hook per i consumabili a batch, non urgente.

### 2.2 Ordinativi FTTH  *(ADR-0001 · migr. 025)*
- **`work_order`** = oggetto di prima classe (come i leader del field service). 1 commessa (gestore/area) = N ordinativi (attivazioni).
- **`work_order_subject`** = PII dell'utente finale **isolata** (mascheramento + permesso `pii.read` + retention a livello app). RLS = tenant.
- **`work_order_item`** = apparati pianificati; i **seriali installati** stanno in `stock_serial_unit` (link `work_order_id`).
- La **visita** e' un `activity` in agenda (separazione lavoro/visita, come Salesforce Service Appointment).
- Stato pratica via `lookup_value` (`work_order_status`: Assegnato/In lavorazione/Completato/KO), numerazione via `number_series` (`work_order`).

### 2.3 Produzione / contabilita' di commessa  *(ADR-0003/0004 · migr. 026-027)*
- **Listino base + ritocchi**: `price_list` + `price_list_item` (voce di capitolato con **prezzo costo e ricavo**) + `price_list_override` (ritocco per gestore/commessa). Stesso pattern di `lookup_value`/`lookup_override`.
- **WBS = la fase**: aggiunto `phase.wbs_code`. Nessuna tabella WBS nuova.
- **Lavorazioni** (`work_line`, + `work_line_measure` per il libretto misure), **attrezzature** (`equipment_usage`), **subappalti** (`subcontract_line`). Manodopera/materiali/foto gia' esistono (`time_entry`/`material_consumption`/`capture`).
- **Pivot preventivo-consuntivo**: vista **`job_cost_ledger`** che unisce tutte le fonti in commessa × fase/WBS × **tipo** (dedotto) × voce × importi.

## 3. Distinzione prezzi (importante)
- `material.default_cost` → **costo di magazzino** dell'apparato (valorizzazione media mobile).
- `price_list_item.cost_price/revenue_price` → **listino di produzione** (voce di capitolato).
Sono assi diversi: lo stock vale i pezzi, la produzione misura costi/ricavi delle lavorazioni.

## 4. Cosa NON facciamo  *(ADR-0003)*
Non cloniamo SAL, certificati di pagamento, giornale dei lavori normato, prezzari DEI, BIM (cuore maturo/normato di TeamSystem CPM, che POWERCOM non usa). Ponte: **export consuntivi → Excel/CPM**.

## 5. Mappa migrazioni
| Migr. | Contenuto |
|---|---|
| 024 | `material.tracked_by_serial`, `stock_serial_unit` (+RLS) |
| 025 | `work_order`, `work_order_subject`, `work_order_item`; link seriali/movimenti (+RLS) |
| 026 | `price_list`, `price_list_item`, `price_list_override` (+RLS) |
| 027 | `phase.wbs_code`, `work_line`, `work_line_measure`, `equipment_usage`, `subcontract_line`, vista `job_cost_ledger` (+RLS) |
| 028 | seed stati ordinativo + tipi costo + numerazione `work_order` |

## 6. Punti aperti / nota onesta
- **Costo/ricavo manodopera nella vista**: `job_cost_ledger` ora valorizza la manodopera con le tariffe gia' fotografate sulla riga `time_entry` (`cost_rate` per il costo, `bill_rate` per il ricavo se `billable`), e i materiali con `material.default_cost`. Una `rate_card` con validita' temporale resta utile in fase 2 solo per **pre-compilare** quelle tariffe in cattura, non per far funzionare la pivot.
- **Naming migrazioni**: seguo la convenzione del repo (`NNN_nome.sql`, tracciata in `sisuite_migrations`), non il prefisso `V__` di Flyway puro, per non rompere il runner esistente.
- **Connettore portali gestori**: l'accesso e' in 2FA → import **manuale/CSV** ora; API solo caso per caso.
