# ADR-0007 — Localizzazione fiscale multi-paese SENZA emissione documenti

- **Stato:** Accepted
- **Data:** 2026-06-21 · Chat 01.06
- **Correlato:** SPEC_Code_anagrafiche_magazzino_fiscale_v1_1_01_06 (Blocco A) · migrazione 041 · `field_definition` · ADR-0005 (Party/Siti) · ADR-0006 (campi configurabili)

## Contesto
Il prodotto deve gestire soggetti IT e AR (e in prospettiva altri paesi) con set fiscali diversi e modelli di indirizzo incompatibili (l'argentino non entra in colonne piatte: provincia ISO, partido/comuna, CPA alfanumerico). **Non emettiamo documenti fiscali** (niente SdI/XML/ARCA/AFIP): i dati fiscali sono **anagrafica da esportare** verso un gestionale esterno. Cablare i campi italiani su `company` (sdi_code, pec, regime…) avrebbe rotto la multi-paese e sporcato lo schema.

## Decisione
1. **Asse `country` su `field_definition`** (oltre a `vertical`). Un campo può essere solo-paese (fiscale), solo-verticale, entrambi o universale (colonna). Unique di sistema esteso a `(vertical, entity, key, country)`.
2. **Colonne universali su `company`**: code, country (pilota set fiscale + form indirizzo), tax_id, tax_id_kind, email, phone, website, iban, payment_terms, default_price_list_id. **Niente campi paese-specifici come colonne.**
3. **Campi fiscali paese-specifici in `company.fiscal_attributes` (jsonb)**, guidati da `field_definition(country)`: IT (sdi_code, pec, regime_fiscale, is_pa, tax_code), AR (condicion_iva, tipo_documento, punto_venta). Convenzione: entity='company' + country valorizzato → vive in fiscal_attributes; validato da `validateFiscalAttributes()` per il country del soggetto.
4. **Indirizzo strutturato jsonb** (`legal_address`/`operational_address` su company; `address` su site; `address` già jsonb su stock_location), forma canonica con chiave `country` interna, reso da **un unico `AddressField`** pilotato da `field_definition(entity='address', country)`.
5. **Catalogo imposte `tax_rate`** country-scoped (righe di sistema + override tenant), seed IT/AR. Niente percezioni/ritenute/split payment (livello documento, fuori scope).
6. **`tenant.default_country`** come default del paese di casa.

## Conseguenze
**Positive:** un'unica anagrafica copre più paesi; aggiungere un paese = seed di field_definition + tax_rate, zero codice; lo schema resta pulito; pronti all'export verso gestionale. **Negative/mitigazioni:** la UI deve splittare i campi per country (gestito in ClienteDetailPage + AddressField); CLEAN SLATE ha richiesto di rimuovere i vecchi field_definition company di 004 e di droppare `company.address` (nessun dato in produzione → costo nullo).

## Alternative scartate
- **Colonne fiscali italiane su company:** rifiutato — rompe la multi-paese.
- **Indirizzo in colonne piatte:** rifiutato — il modello AR non ci entra.
- **Costruire un motore di emissione fatture:** fuori scope esplicito (non fatturiamo).
