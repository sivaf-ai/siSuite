-- =====================================================================
--  FIELD_DEFINITION — il catalogo che trasforma `attributes jsonb`
--  in CAMPI VERI (etichettati, tipizzati, validati, ordinati).
--
--  Problema risolto: nello schema gli attributi specifici (P.IVA,
--  codice fiscale, PEC, dati tecnici per-verticale...) vivono dentro
--  `entity.attributes jsonb`. Senza un catalogo che li dichiari, né il
--  backend sa validarli né il frontend sa disegnarne il form.
--
--  Questo è lo STESSO pattern di lookup_value: righe di SISTEMA
--  (tenant_id NULL, per verticale = domain pack) + override per tenant.
--
--  Guida DUE cose da un'unica fonte:
--   1) Backend: genera lo schema di validazione (zod) per attributes.
--   2) Frontend: genera automaticamente i campi del form (EntityForm),
--      raggruppati e ordinati, con label nella lingua dell'utente.
--
--  Applicare DOPO schema_core.sql (usa tenant). Migrazione suggerita: 003.
-- =====================================================================

CREATE TABLE field_definition (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid REFERENCES tenant(id) ON DELETE CASCADE,  -- NULL = sistema/domain pack
    vertical    text,                       -- 'software'|'pools'|'solar'|NULL (tutti)
    entity      text NOT NULL,              -- 'company'|'asset'|'engagement'|'activity'|'resource'|'material'|'company_contact'
    key         text NOT NULL,              -- la chiave dentro attributes, es. 'vat_number'
    label       jsonb NOT NULL,             -- per-locale {"it-IT":"P.IVA","en":"VAT no.","es-AR":"CUIT"}
    help        jsonb,                       -- testo d'aiuto per-locale (opzionale)
    data_type   text NOT NULL,              -- text|textarea|number|integer|money|date|boolean|email|phone|url|select|multiselect
    required    boolean NOT NULL DEFAULT false,
    options     jsonb,                       -- per select/multiselect: [{"value":"prod","label":{...}}]
    validation  jsonb,                       -- {"pattern":"^\\d{11}$","min":0,"max":100,"maxLength":255}
    unit        text,                        -- 'm³'|'kWp'|'€'|...
    placeholder jsonb,                       -- per-locale (opzionale)
    group_key   text,                        -- sezione del form: 'fiscal'|'registry'|'technical'|'contract'|...
    sequence    int  NOT NULL DEFAULT 0,     -- ordine dentro il gruppo
    active      boolean NOT NULL DEFAULT true,
    UNIQUE (tenant_id, vertical, entity, key)
);
CREATE INDEX ON field_definition (entity, vertical);
CREATE INDEX ON field_definition (tenant_id);
-- unicità per le righe di sistema (tenant_id NULL non è coperto dall'UNIQUE sopra)
CREATE UNIQUE INDEX field_definition_system_uniq
    ON field_definition (vertical, entity, key) WHERE tenant_id IS NULL;

COMMENT ON TABLE field_definition IS
  'Catalogo dei campi dentro attributes jsonb: guida validazione (API) e rendering form (UI). Sistema (tenant_id NULL) per verticale + override tenant.';

-- =====================================================================
--  SEED — campi di sistema. group_key + sequence pilotano il layout del
--  form. label/options sono per-locale (it-IT primario; en/es-AR pronti).
-- =====================================================================

-- ---- COMPANY (anagrafica: vale per tutti i verticali, vertical = NULL) ----
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, validation, group_key, sequence) VALUES
 (NULL, NULL, 'company', 'vat_number',  '{"it-IT":"P.IVA","en":"VAT number","es-AR":"CUIT"}',            'text',  false, '{"pattern":"^[0-9]{11}$","maxLength":13}', 'fiscal', 1),
 (NULL, NULL, 'company', 'tax_code',    '{"it-IT":"Codice fiscale","en":"Tax code","es-AR":"CUIL"}',     'text',  false, '{"maxLength":16}',                         'fiscal', 2),
 (NULL, NULL, 'company', 'pec',         '{"it-IT":"PEC","en":"Certified email","es-AR":"Email"}',        'email', false, NULL,                                       'fiscal', 3),
 (NULL, NULL, 'company', 'sdi_code',    '{"it-IT":"Codice SDI","en":"SDI code","es-AR":"Punto venta"}',  'text',  false, '{"maxLength":7}',                          'fiscal', 4),
 (NULL, NULL, 'company', 'street',      '{"it-IT":"Indirizzo","en":"Address","es-AR":"Domicilio"}',      'text',  false, NULL,                                       'registry', 1),
 (NULL, NULL, 'company', 'city',        '{"it-IT":"Città","en":"City","es-AR":"Ciudad"}',                'text',  false, NULL,                                       'registry', 2),
 (NULL, NULL, 'company', 'province',    '{"it-IT":"Provincia","en":"Province","es-AR":"Provincia"}',     'text',  false, '{"maxLength":4}',                          'registry', 3),
 (NULL, NULL, 'company', 'postal_code', '{"it-IT":"CAP","en":"Postal code","es-AR":"CP"}',               'text',  false, NULL,                                       'registry', 4),
 (NULL, NULL, 'company', 'website',     '{"it-IT":"Sito web","en":"Website","es-AR":"Sitio web"}',       'url',   false, NULL,                                       'registry', 5),
 (NULL, NULL, 'company', 'notes',       '{"it-IT":"Note","en":"Notes","es-AR":"Notas"}',                 'textarea', false, '{"maxLength":2000}',                    'notes', 1);

-- ---- ENGAGEMENT (commessa) ----
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, unit, validation, options, group_key, sequence) VALUES
 (NULL, NULL, 'engagement', 'budget',       '{"it-IT":"Budget","en":"Budget","es-AR":"Presupuesto"}',         'money',   false, '€', '{"min":0}', NULL, 'contract', 1),
 (NULL, NULL, 'engagement', 'contract_ref', '{"it-IT":"Rif. contratto","en":"Contract ref.","es-AR":"Ref. contrato"}', 'text', false, NULL, NULL, NULL, 'contract', 2),
 (NULL, NULL, 'engagement', 'sla',          '{"it-IT":"SLA","en":"SLA","es-AR":"SLA"}',                       'select',  false, NULL, NULL,
   '[{"value":"none","label":{"it-IT":"Nessuno","en":"None","es-AR":"Ninguno"}},{"value":"8x5","label":{"it-IT":"8x5","en":"8x5","es-AR":"8x5"}},{"value":"24x7","label":{"it-IT":"24x7","en":"24x7","es-AR":"24x7"}}]', 'contract', 3);

-- ---- ACTIVITY ----
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, group_key, sequence) VALUES
 (NULL, NULL, 'activity', 'billable',     '{"it-IT":"Fatturabile","en":"Billable","es-AR":"Facturable"}', 'boolean', false, 'general', 1),
 (NULL, NULL, 'activity', 'external_ref', '{"it-IT":"Rif. esterno","en":"External ref.","es-AR":"Ref. externa"}', 'text', false, 'general', 2);

-- ---- RESOURCE ----
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, unit, options, group_key, sequence) VALUES
 (NULL, NULL, 'resource', 'hourly_cost', '{"it-IT":"Costo orario","en":"Hourly cost","es-AR":"Costo por hora"}', 'money', false, '€', NULL, 'economics', 1),
 (NULL, NULL, 'resource', 'skills',      '{"it-IT":"Competenze","en":"Skills","es-AR":"Competencias"}',          'multiselect', false, NULL,
   '[{"value":"backend","label":{"it-IT":"Backend","en":"Backend","es-AR":"Backend"}},{"value":"frontend","label":{"it-IT":"Frontend","en":"Frontend","es-AR":"Frontend"}},{"value":"sysadmin","label":{"it-IT":"Sistemista","en":"Sysadmin","es-AR":"Sysadmin"}},{"value":"pm","label":{"it-IT":"PM","en":"PM","es-AR":"PM"}}]', 'skills', 1),
 (NULL, NULL, 'resource', 'plate',       '{"it-IT":"Targa","en":"Plate","es-AR":"Patente"}',                    'text', false, NULL, NULL, 'vehicle', 1);

-- ---- MATERIAL (vertical software) ----
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, group_key, sequence) VALUES
 (NULL, 'software', 'material', 'brand',       '{"it-IT":"Marca","en":"Brand","es-AR":"Marca"}',          'text', false, 'catalog', 1),
 (NULL, 'software', 'material', 'part_number', '{"it-IT":"Codice prod.","en":"Part number","es-AR":"Código"}', 'text', false, 'catalog', 2);

-- ---- ASSET — per VERTICALE (qui si vede il domain pack) ----
-- software
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, options, group_key, sequence) VALUES
 (NULL, 'software', 'asset', 'version',     '{"it-IT":"Versione","en":"Version","es-AR":"Versión"}',     'text',   false, NULL, 'technical', 1),
 (NULL, 'software', 'asset', 'environment', '{"it-IT":"Ambiente","en":"Environment","es-AR":"Entorno"}', 'select', false,
   '[{"value":"prod","label":{"it-IT":"Produzione","en":"Production","es-AR":"Producción"}},{"value":"staging","label":{"it-IT":"Staging","en":"Staging","es-AR":"Staging"}},{"value":"dev","label":{"it-IT":"Sviluppo","en":"Development","es-AR":"Desarrollo"}}]', 'technical', 2),
 (NULL, 'software', 'asset', 'repo_url',    '{"it-IT":"Repository","en":"Repository","es-AR":"Repositorio"}', 'url', false, NULL, 'technical', 3);
-- piscine (esempio multi-verticale)
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, unit, options, group_key, sequence) VALUES
 (NULL, 'pools', 'asset', 'volume_m3', '{"it-IT":"Volume","en":"Volume","es-AR":"Volumen"}',     'number', false, 'm³', NULL, 'technical', 1),
 (NULL, 'pools', 'asset', 'heating',   '{"it-IT":"Riscaldamento","en":"Heating","es-AR":"Calefacción"}', 'select', false, NULL,
   '[{"value":"none","label":{"it-IT":"Nessuno","en":"None","es-AR":"Ninguno"}},{"value":"heat_pump","label":{"it-IT":"Pompa di calore","en":"Heat pump","es-AR":"Bomba de calor"}}]', 'technical', 2);
-- fotovoltaico (esempio multi-verticale)
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, unit, group_key, sequence) VALUES
 (NULL, 'solar', 'asset', 'kwp',     '{"it-IT":"Potenza","en":"Power","es-AR":"Potencia"}',  'number',  false, 'kWp', 'technical', 1),
 (NULL, 'solar', 'asset', 'panels',  '{"it-IT":"N. pannelli","en":"Panels","es-AR":"Paneles"}', 'integer', false, NULL, 'technical', 2),
 (NULL, 'solar', 'asset', 'inverter','{"it-IT":"Inverter","en":"Inverter","es-AR":"Inversor"}', 'text',   false, NULL, 'technical', 3);
