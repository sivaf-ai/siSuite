-- =====================================================================
--  028_seed_powercom_lookups.sql
--  SEED (dati di sistema) per i nuovi moduli:
--   - stati ordinativo (canonical_state + lookup_value), configurabili per
--     tenant via lookup_override (etichette/colori), come gli altri stati.
--   - tipi di costo (per le etichette/colori della pivot).
--   - numerazione 'work_order' per i tenant esistenti (number_series).
--
--  Applicare DOPO 027. PostgreSQL 16.
-- =====================================================================

-- 1) STATI ORDINATIVO -------------------------------------------------
-- canonical (logica): assigned -> in_progress -> done ; ko = esito negativo
INSERT INTO public.canonical_state (category, code, sequence) VALUES
  ('work_order_status','assigned',    10),
  ('work_order_status','in_progress', 20),
  ('work_order_status','done',        30),
  ('work_order_status','ko',          40)
ON CONFLICT (category, code) DO NOTHING;

-- etichette/colori di SISTEMA (tenant_id NULL); il tenant puo' rinominarle
-- via lookup_override senza toccare la logica (il canonical resta).
INSERT INTO public.lookup_value
  (tenant_id, category, canonical, code, label, abbreviation, color_token, icon, sequence, is_default, active) VALUES
  (NULL,'work_order_status','assigned',   'assigned',
     '{"it-IT":"Assegnato","en":"Assigned","es-AR":"Asignado"}','ASG','info','inbox',10,true,true),
  (NULL,'work_order_status','in_progress','in_progress',
     '{"it-IT":"In lavorazione","en":"In progress","es-AR":"En curso"}','LAV','warning','loader',20,false,true),
  (NULL,'work_order_status','done',       'done',
     '{"it-IT":"Completato","en":"Completed","es-AR":"Completado"}','OK','success','check-circle',30,false,true),
  (NULL,'work_order_status','ko',         'ko',
     '{"it-IT":"KO / da ricontattare","en":"KO / recontact","es-AR":"KO / recontactar"}','KO','danger','x-circle',40,false,true)
ON CONFLICT (category, code) WHERE tenant_id IS NULL DO NOTHING;

-- 2) TIPI DI COSTO (etichette/colori per la pivot preventivo-consuntivo)
INSERT INTO public.canonical_state (category, code, sequence) VALUES
  ('cost_type','labor',       10),
  ('cost_type','material',    20),
  ('cost_type','equipment',   30),
  ('cost_type','subcontract', 40),
  ('cost_type','production',  50)
ON CONFLICT (category, code) DO NOTHING;

INSERT INTO public.lookup_value
  (tenant_id, category, canonical, code, label, abbreviation, color_token, icon, sequence, is_default, active) VALUES
  (NULL,'cost_type','labor',      'labor',      '{"it-IT":"Manodopera","en":"Labor","es-AR":"Mano de obra"}','MO','info','user',10,false,true),
  (NULL,'cost_type','material',   'material',   '{"it-IT":"Materiali","en":"Materials","es-AR":"Materiales"}','MAT','brand','box',20,false,true),
  (NULL,'cost_type','equipment',  'equipment',  '{"it-IT":"Mezzi/Attrezzature","en":"Equipment","es-AR":"Equipos"}','MEZ','warning','truck',30,false,true),
  (NULL,'cost_type','subcontract','subcontract','{"it-IT":"Subappalti","en":"Subcontract","es-AR":"Subcontratos"}','SUB','neutral','handshake',40,false,true),
  (NULL,'cost_type','production', 'production', '{"it-IT":"Produzione (ricavo)","en":"Production","es-AR":"Producción"}','PRD','success','percent',50,false,true)
ON CONFLICT (category, code) WHERE tenant_id IS NULL DO NOTHING;

-- 3) NUMERAZIONE 'work_order' per i tenant gia' esistenti
--    (i nuovi tenant la ricevono al provisioning). Formato 2026-0001.
INSERT INTO public.number_series (tenant_id, key, format, reset_period, current_period, last_number)
  SELECT t.id, 'work_order', '{YYYY}-{SEQ:4}', 'yearly', '', 0
  FROM public.tenant t
ON CONFLICT (tenant_id, key) DO NOTHING;

INSERT INTO public.sisuite_migrations (filename) VALUES ('028_seed_powercom_lookups.sql')
  ON CONFLICT DO NOTHING;
