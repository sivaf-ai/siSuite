-- =====================================================================
--  059_lookup_site_location_kind.sql — Tipi configurabili (regola D-0)
--   - site.kind            → lookup_value categoria 'site_kind'
--   - stock_location.kind  → lookup_value categoria 'stock_location_kind'
--  Righe di SISTEMA (tenant_id NULL), rinominabili in Impostazioni › Stati & etichette.
--  I CANONICI restano le chiavi logiche del codice (es. 'warehouse' = radice magazzino,
--  'van' = furgone): rinominare l'etichetta NON cambia il canonico. canonical_state prima
--  (FK (category,canonical)). PostgreSQL 16. Dopo 058. Niente BEGIN/COMMIT (runner in tx).
-- =====================================================================

INSERT INTO canonical_state (category, code, sequence) VALUES
  ('site_kind','plant',    1),
  ('site_kind','building', 2),
  ('site_kind','floor',    3),
  ('site_kind','room',     4),
  ('site_kind','cabinet',  5),
  ('site_kind','pop',      6),
  ('site_kind','area',     7),
  ('site_kind','other',    8),
  ('stock_location_kind','warehouse',    1),
  ('stock_location_kind','sub_location', 2),
  ('stock_location_kind','van',          3)
ON CONFLICT (category, code) DO NOTHING;

INSERT INTO lookup_value (tenant_id, category, canonical, code, label, abbreviation, color_token, sequence, is_default) VALUES
  (NULL,'site_kind','plant',    'plant',    '{"it-IT":"Stabilimento","en":"Plant","es-AR":"Planta"}',        'STB','indigo', 1,false),
  (NULL,'site_kind','building', 'building', '{"it-IT":"Edificio","en":"Building","es-AR":"Edificio"}',       'EDI','info',   2,true),
  (NULL,'site_kind','floor',    'floor',    '{"it-IT":"Piano","en":"Floor","es-AR":"Piso"}',                'PIA','teal',   3,false),
  (NULL,'site_kind','room',     'room',     '{"it-IT":"Locale","en":"Room","es-AR":"Local"}',               'LOC','sky',    4,false),
  (NULL,'site_kind','cabinet',  'cabinet',  '{"it-IT":"Armadio","en":"Cabinet","es-AR":"Armario"}',         'ARM','amber',  5,false),
  (NULL,'site_kind','pop',      'pop',      '{"it-IT":"POP","en":"POP","es-AR":"POP"}',                     'POP','violet', 6,false),
  (NULL,'site_kind','area',     'area',     '{"it-IT":"Area","en":"Area","es-AR":"Área"}',             'ARE','lime',   7,false),
  (NULL,'site_kind','other',    'other',    '{"it-IT":"Altro","en":"Other","es-AR":"Otro"}',                'ALT','neutral',8,false),
  (NULL,'stock_location_kind','warehouse',    'warehouse',    '{"it-IT":"Magazzino","en":"Warehouse","es-AR":"Depósito"}',  'MAG','info',   1,true),
  (NULL,'stock_location_kind','sub_location', 'sub_location', '{"it-IT":"Ubicazione","en":"Location","es-AR":"Ubicación"}', 'UBI','teal',   2,false),
  (NULL,'stock_location_kind','van',          'van',          '{"it-IT":"Furgone","en":"Van","es-AR":"Furgoneta"}',             'FUR','amber',  3,false)
ON CONFLICT DO NOTHING;

INSERT INTO public.sisuite_migrations (filename) VALUES ('059_lookup_site_location_kind.sql')
  ON CONFLICT DO NOTHING;
