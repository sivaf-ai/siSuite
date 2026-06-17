# ADR-0005 — Anagrafica come modello "Party" (Soggetto) e introduzione dell'entità Sito

- **Stato:** Accepted
- **Data:** 2026-06-16 · Chat 01.03
- **Contesto correlato:** `BRIEF_MASTER_Claude_Code_POWERCOM` (Parti 4, 6, 8) · schema `company`, `company_role`, `asset`.

## Contesto

La tabella `company` di siSuite contiene **organizzazioni** (clienti, fornitori, partner, gestori — anche con più ruoli insieme) **e persone fisiche** (`company.type='private'`). I ruoli stanno in `company_role` (`role='customer'|'supplier'|'partner'|…`). Il nome `company` ("Azienda") è quindi **più stretto del significato reale** dell'entità e induce in errore (es.: "un asset deve appartenere a un'azienda?").

Analisi dei leader di mercato (field service / manutenzione, anche per privati):
- **ServiceTitan** (residenziale): gerarchia **Customer → Service Location → Equipment**; l'apparecchiatura è legata alla *location*, non al cliente; il cliente può essere un privato.
- **Microsoft Dynamics 365 Field Service:** **Account → Functional Location (gerarchia) → Customer Asset**; gli asset vivono dentro località annidate (edificio › piano › locale).
- **SAP:** **Business Partner** = unica anagrafica che può essere persona/organizzazione e portare i ruoli "è cliente"/"è fornitore"/entrambi. È il **modello "Party"** della letteratura.

siSuite **già implementa** il modello Party (`company.type` + `company_role`). Mancava: (a) un **nome corretto** del concetto; (b) l'entità **Sito/Località** che i leader interpongono fra soggetto e asset.

## Decisione

1. **`company` è l'anagrafica di un "Soggetto" (modello Party / Business Partner)** — persona fisica o organizzazione — con ruoli in `company_role`. **Il nome tecnico della tabella resta `company`** (referenziata ovunque: `engagement`, `asset`, `work_order.operator_company_id`, `price_list_override`, `stock_serial_unit`, `company_role/contact`, `app_user`, RLS `app_current_company`); **non si rinomina** (churn alto, valore utente nullo). Si cambiano **concetto, etichette e i18n**:
   - Hub di navigazione: **"Anagrafiche"**; singola scheda: **"Soggetto"**; **Clienti / Fornitori / Gestori = viste filtrate** per ruolo.
   - i18n vincolante: Soggetto = *Party* (en) / *Tercero* (es-AR); Anagrafiche = *Master data* (en) / *Maestros* (es-AR); ruoli e Sito come da tabella nel master (Parte 4).
2. **Nuova entità `site` (Sito/Località), gerarchica, legata al soggetto** (migrazione `031`, additiva), con **`asset.site_id`** opzionale. Un soggetto può avere più siti; ogni sito è un albero (`parent_id`: stabilimento › edificio › piano › locale › armadio/POP); l'asset si colloca su un nodo.

## Conseguenze

**Positive:** allineamento ai leader; supporto nativo ai soggetti strutturati (Fiat, Denaris, comuni, condomìni) e alla manutenzione per **privati** (soggetto `type='private'`); nessun rename rischioso; migrazione puramente additiva.
**Negative / mitigazioni:** il nome fisico `company` resta lievemente fuorviante a livello di codice → mitigato da documentazione + etichette UI coerenti. La fibra residenziale **non** usa i siti (resta sull'indirizzo dell'ordinativo): scelta voluta, non un buco.

## Alternative scartate

- **Rinominare la tabella in `party`/`business_partner`:** rifiutato — churn enorme su FK/RLS/codice, invisibile all'utente.
- **Chiamarla "Cliente":** rifiutato — è anche fornitore/partner/gestore.
- **Riusare `stock_location` per i siti cliente:** rifiutato — semantica di magazzino (`holds_stock`, `is_default`) incompatibile.
- **Rinviare il Sito:** rifiutato — piccolo e additivo, e necessario ai soggetti strutturati.
