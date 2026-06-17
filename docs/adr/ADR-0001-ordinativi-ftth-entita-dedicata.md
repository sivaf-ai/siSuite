# ADR-0001 — Ordinativi FTTH come entità dedicata, con PII dell'utente finale isolata

- Stato: **Accepted** (15/06/2026, chat 01.03)
- Decisori: design (in autonomia delegata) · conferma utente: "per il resto come hai proposto tu"
- Moduli toccati: Ordinativi, Privacy/RLS, Agenda, Magazzino

## Contesto
POWERCOM gestisce attivazioni FTTH "a pezzi" (volumi alti). Ogni ordinativo porta: ID univoco del gestore, intestatario (PII), indirizzo, telefoni, apparati da installare, seriali installati, stato pratica, squadra. I gestori fanno causa per violazioni privacy sugli utenti finali.

## Decisione
1. L'**ordinativo è una tabella dedicata** `work_order` (oggetto di prima classe), non un `activity` con campi `field_definition`.
2. I **dati personali dell'utente finale** vivono in una tabella separata `work_order_subject` (1:1), per permettere mascheramento, accesso per permesso (`pii.read`) e retention indipendente.
3. La **visita** resta un `activity` in agenda (lavoro ≠ visita).

## Opzioni considerate
- **A — `activity` + `field_definition`** (zero schema): PII nel jsonb, difficile da mascherare/cancellare in modo selettivo; query su volumi alti meno pulite. Scartata.
- **B — tabella dedicata `work_order` + `work_order_subject`** (scelta): più schema, ma PII gestibile, uniqueness sull'ID gestore, volumi ok. È il modello di tutti i leader del field service (Salesforce/Dynamics/ServiceTitan: Work Order di prima classe con righe figlie e appuntamenti separati).

## Conseguenze
- (+) Privacy by design → leva commerciale verso POWERCOM.
- (+) Allineamento ai pattern di mercato; estendibile a verticali non-fibra.
- (−) Più tabelle e RLS da mantenere. Il gating fine PII è applicativo (RLS isola solo per tenant).
