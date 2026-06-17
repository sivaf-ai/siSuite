-- =====================================================================
--  029_work_order_fields.sql
--  CAMPI DI SISTEMA (field_definition) per l'entita' work_order, verticale
--  FIBRA. Il brief §6.1 chiede che gli attributi tecnici dell'ordinativo
--  (connection_type, socket_id, attenuation_db, ont_serial, work_order_ref)
--  siano guidati da field_definition, NON hardcodati nella UI.
--
--  Le migrazioni 024-028 sono immutabili: questo aggiustamento e' una
--  migrazione nuova (brief §2). Pattern identico al seed 006_fiber_fields.
--  righe di SISTEMA: tenant_id NULL, vertical 'fiber'. EntityForm le disegna.
--
--  Applicare DOPO 028. PostgreSQL 16.
-- =====================================================================

INSERT INTO public.field_definition
  (tenant_id, vertical, entity, key, label, data_type, required, options, unit, group_key, sequence) VALUES
 (NULL, 'fiber', 'work_order', 'connection_type',
    '{"it-IT":"Tipo connessione","en":"Connection type","es-AR":"Tipo de conexión"}', 'select', false,
    '[{"value":"FTTH","label":{"it-IT":"FTTH (fibra fino a casa)","en":"FTTH","es-AR":"FTTH"}},{"value":"FTTB","label":{"it-IT":"FTTB (fibra fino all''edificio)","en":"FTTB","es-AR":"FTTB"}},{"value":"FTTC","label":{"it-IT":"FTTC (fibra fino all''armadio)","en":"FTTC","es-AR":"FTTC"}}]',
    NULL, 'technical', 1),
 (NULL, 'fiber', 'work_order', 'socket_id',
    '{"it-IT":"ID presa / ROE","en":"Socket/ROE ID","es-AR":"ID de toma"}', 'text', false, NULL, NULL, 'technical', 2),
 (NULL, 'fiber', 'work_order', 'attenuation_db',
    '{"it-IT":"Attenuazione misurata","en":"Measured attenuation","es-AR":"Atenuación medida"}', 'number', false, NULL, 'dB', 'technical', 3),
 (NULL, 'fiber', 'work_order', 'ont_serial',
    '{"it-IT":"Seriale ONT","en":"ONT serial","es-AR":"Serie ONT"}', 'text', false, NULL, NULL, 'technical', 4),
 (NULL, 'fiber', 'work_order', 'work_order_ref',
    '{"it-IT":"Rif. ordine di lavoro","en":"Work order ref.","es-AR":"Ref. orden de trabajo"}', 'text', false, NULL, NULL, 'contract', 5)
ON CONFLICT (vertical, entity, key) WHERE tenant_id IS NULL DO NOTHING;

INSERT INTO public.sisuite_migrations (filename) VALUES ('029_work_order_fields.sql')
  ON CONFLICT DO NOTHING;
