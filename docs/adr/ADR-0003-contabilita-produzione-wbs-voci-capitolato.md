# ADR-0003 — Contabilità di produzione: WBS = fase, tipo dedotto, voci di capitolato, pivot preventivo-consuntivo

- Stato: **Accepted** (15/06/2026, chat 01.03)
- Scelta utente: **opzione B "completo"** sul controllo costi.
- Moduli toccati: Produzione/Contabilità, Commesse/Fasi, Rapportini, Listino

## Contesto
POWERCOM usa di TeamSystem CPM solo la fetta "contabilità di produzione": voci di capitolato × quantità → costi/ricavi, dimensione WBS, rapportino (manodopera/attrezzature/materiali/subappalti/lavorazioni/foto), pivot multicommessa. Non usa SAL/certificati/prezzari DEI/BIM.

## Decisione
1. **WBS = albero delle FASI** esistente (`phase.parent_phase_id`); aggiunto `phase.wbs_code`. Nessuna tabella WBS nuova.
2. **Tipo di costo dedotto dalla fonte** (ore=labor, materiali=material, attrezzature=equipment, subappalti=subcontract, voci=production) → niente data-entry extra.
3. Nuove tabelle: `work_line` (lavorazione), `work_line_measure` (libretto misure), `equipment_usage`, `subcontract_line`.
4. **Vista `job_cost_ledger`** che unisce tutte le fonti per la pivot preventivo-consuntivo (commessa × fase/WBS × tipo × voce × importi).
5. **Non** cloniamo SAL, certificati di pagamento, giornale dei lavori normato, prezzari DEI, BIM. Ponte: export consuntivi → Excel/CPM.

## Opzioni considerate
- **A — semplice (solo fasi)**: pivot per commessa e fase. Meno peso, meno analisi.
- **B — completo (tipo + voce)** (scelta): pivot Commessa × WBS × Categoria × Voce, identica a CPM, ma resa indolore (tipo dedotto, voce da menù). È il pattern Procore/CMiC (budget code = cost code + cost type; WBS come dimensione).

## Conseguenze
- (+) Controllo di gestione vero senza il data-entry di CPM; differenziazione con cattura vocale.
- (~) Il **costo/ricavo manodopera** nella vista è valorizzato dalle tariffe già fotografate sulla riga `time_entry` (`cost_rate`/`bill_rate`); una `rate_card` con validità temporale resta utile in fase 2 solo per pre-compilare quelle tariffe, non per far funzionare la pivot.
