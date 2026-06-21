# DONE_A — Localizzazione fiscale base + indirizzi (V041_fiscal_localization.sql)

**Creato:** `field_definition.country` + indice scope + unique di sistema esteso a `(vertical,entity,key,country)`; tabella `tax_rate` (RLS sistema+tenant, GRANT) con seed IT(6)/AR(5); colonne `company` (code, country, tax_id, tax_id_kind, email, phone, website, iban, payment_terms, default_price_list_id, legal_address, operational_address, fiscal_attributes); **DROP company.address**; seed field_definition fiscali IT (sdi_code/pec/regime_fiscale/is_pa/tax_code) e AR (condicion_iva/tipo_documento/punto_venta); `site.address`→jsonb + company_id nullable; `tenant.default_country`.

**Scostamenti:** migrazione V041 (non V038: 038-040 occupate da altre chat). Rimossi i field_definition company legacy di 004 (clean slate).

**Assunzioni:** campi fiscali = field_definition con `country` valorizzato → vivono in `fiscal_attributes`; indirizzi = entity='address' country-driven → AddressField su legal/operational_address.

**AC A:** SUPERATO (smoke company IT SOG-00001 con fiscal_attributes.sdi_code + legal_address IT; company AR con condicion_iva). Vedi DONE_TOTALE.
