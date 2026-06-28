-- =====================================================================
--  057_lookup_asset_skill.sql — Cataloghi configurabili per classificazioni
--  (regola: niente testo libero per i campi che classificano/filtrano).
--   - asset.kind (Tipo asset) → lookup_value categoria 'asset_kind'
--   - skill.category (Categoria competenza) → lookup_value categoria 'skill_category'
--  Righe di SISTEMA (tenant_id NULL), configurabili/rinominabili dal tenant in
--  Impostazioni › Stati & etichette. canonical_state prima (FK). PostgreSQL 16. Dopo 056.
-- =====================================================================

-- canonical_state (la FK (category,canonical) di lookup_value ci punta)
INSERT INTO canonical_state (category, code, sequence) VALUES
  ('asset_kind','asset',           1),
  ('asset_kind','apparato',        2),
  ('asset_kind','impianto',        3),
  ('asset_kind','connection_point',4),
  ('asset_kind','facility',        5),
  ('asset_kind','veicolo',         6),
  ('asset_kind','immobile',        7),
  ('asset_kind','attrezzatura',    8),
  ('skill_category','tecnica',        1),
  ('skill_category','amministrativa', 2),
  ('skill_category','sicurezza',      3),
  ('skill_category','certificazione', 4),
  ('skill_category','gestionale',     5),
  ('skill_category','commerciale',    6)
ON CONFLICT (category, code) DO NOTHING;

-- lookup_value di sistema (una per canonico)
INSERT INTO lookup_value (tenant_id, category, canonical, code, label, abbreviation, color_token, sequence, is_default) VALUES
  (NULL,'asset_kind','asset',            'asset',            '{"it-IT":"Generico","en":"Generic","es-AR":"Genérico"}',          'GEN','neutral',1,true),
  (NULL,'asset_kind','apparato',         'apparato',         '{"it-IT":"Apparato","en":"Device","es-AR":"Equipo"}',             'APP','info',   2,false),
  (NULL,'asset_kind','impianto',         'impianto',         '{"it-IT":"Impianto","en":"Plant","es-AR":"Instalación"}',         'IMP','info',   3,false),
  (NULL,'asset_kind','connection_point', 'connection_point', '{"it-IT":"Punto di connessione","en":"Connection point","es-AR":"Punto de conexión"}','PDC','teal',4,false),
  (NULL,'asset_kind','facility',         'facility',         '{"it-IT":"Struttura/Sede","en":"Facility","es-AR":"Instalación"}','STR','indigo', 5,false),
  (NULL,'asset_kind','veicolo',          'veicolo',          '{"it-IT":"Veicolo","en":"Vehicle","es-AR":"Vehículo"}',           'VEI','amber',  6,false),
  (NULL,'asset_kind','immobile',         'immobile',         '{"it-IT":"Immobile","en":"Property","es-AR":"Inmueble"}',         'IMM','stone',  7,false),
  (NULL,'asset_kind','attrezzatura',     'attrezzatura',     '{"it-IT":"Attrezzatura","en":"Equipment","es-AR":"Herramienta"}', 'ATT','rose',   8,false),
  (NULL,'skill_category','tecnica',        'tecnica',        '{"it-IT":"Tecnica","en":"Technical","es-AR":"Técnica"}',          'TEC','info',   1,true),
  (NULL,'skill_category','amministrativa', 'amministrativa', '{"it-IT":"Amministrativa","en":"Administrative","es-AR":"Administrativa"}','AMM','indigo',2,false),
  (NULL,'skill_category','sicurezza',      'sicurezza',      '{"it-IT":"Sicurezza","en":"Safety","es-AR":"Seguridad"}',         'SIC','danger', 3,false),
  (NULL,'skill_category','certificazione', 'certificazione', '{"it-IT":"Certificazione","en":"Certification","es-AR":"Certificación"}','CER','teal',4,false),
  (NULL,'skill_category','gestionale',     'gestionale',     '{"it-IT":"Gestionale","en":"Management","es-AR":"Gestión"}',      'GES','amber',  5,false),
  (NULL,'skill_category','commerciale',    'commerciale',    '{"it-IT":"Commerciale","en":"Sales","es-AR":"Comercial"}',        'COM','rose',   6,false)
ON CONFLICT DO NOTHING;

INSERT INTO public.sisuite_migrations (filename) VALUES ('057_lookup_asset_skill.sql')
  ON CONFLICT DO NOTHING;
