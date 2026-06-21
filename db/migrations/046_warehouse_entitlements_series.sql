-- =====================================================================
--  046_warehouse_entitlements_series.sql  — SPEC v1.1, BLOCCO F
--  Vendibilità standalone del magazzino (entitlement), numeratori per i nuovi
--  codici/documenti, e campi indirizzo (entity='address') country-driven per
--  l'unico componente AddressField.
--  Applicare DOPO 045. PostgreSQL 16.
-- =====================================================================

-- ── F.1 entitlement per vendere il magazzino da solo ────────────────
-- La UI nasconde i moduli per entitlement+RBAC, ma il backend resta la barriera.
UPDATE public.plan
   SET entitlements = entitlements
       || jsonb_build_object('module.warehouse', true, 'module.warehouse.mobile', true);

-- ── F.2 number_series per i nuovi codici/documenti (per ogni tenant) ─
INSERT INTO public.number_series (tenant_id, key, format, reset_period)
SELECT t.id, s.key, s.format, s.reset_period
FROM public.tenant t
CROSS JOIN (VALUES
  ('material',        'ART-{SEQ:5}',        'never'),
  ('company',         'SOG-{SEQ:5}',        'never'),
  ('stock_location',  'MAG-{SEQ:3}',        'never'),
  ('stock_document',  'DDT-{YYYY}-{SEQ:4}', 'yearly'),
  ('purchase_order',  'ODA-{YYYY}-{SEQ:4}', 'yearly'),
  ('pick_list',       'PRL-{YYYY}-{SEQ:4}', 'yearly'),
  ('stock_count',     'INV-{YYYY}-{SEQ:4}', 'yearly')
) AS s(key, format, reset_period)
ON CONFLICT (tenant_id, key) DO NOTHING;

-- ── F (A.5) campi INDIRIZZO country-driven → AddressField ───────────
-- entity='address'; un unico componente li rende secondo il country del soggetto.
INSERT INTO public.field_definition
  (tenant_id, vertical, country, entity, key, label, data_type, required, validation, group_key, sequence) VALUES
 -- IT
 (NULL, NULL, 'IT', 'address', 'street',    '{"it-IT":"Via","en":"Street","es-AR":"Calle"}','text', false, NULL, 'address', 1),
 (NULL, NULL, 'IT', 'address', 'civic',     '{"it-IT":"Civico","en":"No.","es-AR":"Número"}','text', false, NULL, 'address', 2),
 (NULL, NULL, 'IT', 'address', 'cap',       '{"it-IT":"CAP","en":"ZIP","es-AR":"CP"}','text', false, '{"pattern":"^[0-9]{5}$","maxLength":5}', 'address', 3),
 (NULL, NULL, 'IT', 'address', 'comune',    '{"it-IT":"Comune","en":"City","es-AR":"Ciudad"}','text', false, NULL, 'address', 4),
 (NULL, NULL, 'IT', 'address', 'provincia', '{"it-IT":"Provincia","en":"Province","es-AR":"Provincia"}','text', false, '{"maxLength":2}', 'address', 5),
 -- AR
 (NULL, NULL, 'AR', 'address', 'calle',     '{"it-IT":"Calle","en":"Street","es-AR":"Calle"}','text', false, NULL, 'address', 1),
 (NULL, NULL, 'AR', 'address', 'numero',    '{"it-IT":"Número","en":"No.","es-AR":"Número"}','text', false, NULL, 'address', 2),
 (NULL, NULL, 'AR', 'address', 'piso',      '{"it-IT":"Piso","en":"Floor","es-AR":"Piso"}','text', false, NULL, 'address', 3),
 (NULL, NULL, 'AR', 'address', 'depto',     '{"it-IT":"Depto","en":"Apt","es-AR":"Depto"}','text', false, NULL, 'address', 4),
 (NULL, NULL, 'AR', 'address', 'localidad', '{"it-IT":"Localidad","en":"Locality","es-AR":"Localidad"}','text', false, NULL, 'address', 5),
 (NULL, NULL, 'AR', 'address', 'partido',   '{"it-IT":"Partido/Departamento","en":"Partido","es-AR":"Partido/Departamento"}','text', false, NULL, 'address', 6),
 (NULL, NULL, 'AR', 'address', 'provincia', '{"it-IT":"Provincia (ISO)","en":"Province (ISO)","es-AR":"Provincia (ISO)"}','text', false, '{"maxLength":1}', 'address', 7),
 (NULL, NULL, 'AR', 'address', 'cpa',       '{"it-IT":"CPA","en":"CPA","es-AR":"CPA"}','text', false, '{"pattern":"^[A-Z][0-9]{4}[A-Z]{3}$","maxLength":8}', 'address', 8)
ON CONFLICT (vertical, entity, key, country) WHERE tenant_id IS NULL DO NOTHING;

INSERT INTO public.sisuite_migrations (filename) VALUES ('046_warehouse_entitlements_series.sql')
  ON CONFLICT DO NOTHING;
