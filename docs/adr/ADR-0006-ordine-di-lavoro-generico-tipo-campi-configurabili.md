# ADR-0006 — "Ordine di lavoro" generico: nome neutro, tipo configurabile, campi personalizzabili per tenant

- **Stato:** Accepted
- **Data:** 2026-06-16 · Chat 01.03
- **Correlato:** `BRIEF_MASTER_Claude_Code_POWERCOM` (Parti 4, 6, 8) · tabella `work_order` · `field_definition` · ADR-0001.

## Contesto

L'entità `work_order` era presentata come "Ordinativo (FTTH)": nome troppo specifico per un prodotto **multi-verticale** (manutenzione caldaie, fotovoltaico, installazioni, fibra…). Verifica sullo schema: **la struttura è già generica** — i campi specifici della fibra (`connection_type`, `socket_id`, `attenuation_db`, `ont_serial`, `work_order_ref`) **non sono colonne**, stanno in `attributes` guidati da `field_definition` (migrazione 029). Restavano "telecom" solo: l'etichetta, il commento, e due colonne (`operator_company_id`, `operator_order_id`).

I leader confermano il pattern **entità generica + tipo + campi configurabili**:
- **Salesforce Field Service**: oggetto **Work Order** + **Work Type** (template che pre-compila i campi).
- **Dynamics 365 Field Service**: **Work Order** + **Work Order Type** (ispezione/installazione/manutenzione/chiamata) per ottimizzare report, pianificazione, prezzi.
- **ServiceTitan / Jobber** (PMI): **Job** + Job Type.

In italiano "ordinativo" sa di P.A.; lo standard è **"ordine di lavoro"**.

## Decisione

1. **Nome in codice `work_order`: invariato** (è lo standard di mercato). **Etichetta base IT: "Ordini di lavoro"** (en *Work orders*, es-AR *Órdenes de trabajo*), **sovrascrivibile per-tenant** via il glossario (un tenant fibra può chiamarli "Attivazioni", uno di manutenzione "Interventi"). Tolto il badge "FTTH" dal menù (il verticale è per-tenant). Corretto il commento della tabella.
2. **Rename fisico delle due colonne troppo specifiche** (siamo all'inizio, meglio nomi puliti): `operator_company_id` → **`principal_company_id`** (committente esterno, FK `company`, nullable); `operator_order_id` → **`principal_order_ref`** (riferimento ordine esterno, text, nullable). Migrazione `032`. Aggiornati vincolo UNIQUE, FK, e tutto il codice che le referenzia (Blocco B).
3. **Nuova colonna `work_order.type_id`** → `lookup_value` categoria `work_order_type` (configurabile per verticale/tenant). FTTH seed: `activation` = "Attivazione". Il tipo classifica e potrà pilotare quali campi mostrare.
4. **Configuratore di campi (Field Builder) in Impostazioni**: UI + endpoint per gestire `field_definition` **per tenant ed entità** (e verticale/tipo). I campi FTTH della 029 diventano l'esempio "di sistema" già caricato; l'admin può aggiungerne/sovrascriverne. È il meccanismo che rende il software **parametrizzabile da subito**, senza toccare il codice.

## Conseguenze

**Positive:** un'unica entità serve tutti i verticali (come i leader); i nomi non vincolano a un cliente; i campi specifici si configurano in UI. **Negative/mitigazioni:** il rename colonne tocca il codice del Blocco B già fatto → va fatto **ora** che è piccolo (la ragione per cui non rinominiamo `company`, qui invece il costo è basso). Il Field Builder è lavoro nuovo, ma sblocca tutta la strategia metadata-driven.

## Alternative scartate

- **Lasciare "Ordinativo (FTTH)" e i nomi operator_*:** rifiutato — vincola il prodotto a un verticale.
- **Solo rietichettare senza rename fisico:** rifiutato dall'owner — all'inizio meglio nomi fisici puliti.
- **Un'entità diversa per verticale:** rifiutato — i leader usano un'unica entità + tipo + campi custom.
