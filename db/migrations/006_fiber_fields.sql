-- =====================================================================
--  006 — CAMPI DI SISTEMA per il verticale FIBRA (tenant_id NULL, vertical='fiber')
--  Stesso pattern del seed di 004: righe di SISTEMA (domain pack), non
--  modificabili dai tenant. Servono al demo fibra: l'asset "punto di
--  terminazione" (kind 'connection_point') porta i dati tecnici della linea;
--  la commessa porta il riferimento all'ordine di lavoro del distributore.
--  Le maschere (EntityForm) li disegnano da sole leggendo questo catalogo.
-- =====================================================================

-- ---- ASSET fibra (kind 'connection_point') ----
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, options, unit, group_key, sequence) VALUES
 (NULL, 'fiber', 'asset', 'connection_type', '{"it-IT":"Tipo connessione","en":"Connection type","es-AR":"Tipo de conexión"}', 'select', false,
   '[{"value":"FTTH","label":{"it-IT":"FTTH (fibra fino a casa)","en":"FTTH","es-AR":"FTTH"}},{"value":"FTTB","label":{"it-IT":"FTTB (fibra fino all''edificio)","en":"FTTB","es-AR":"FTTB"}},{"value":"FTTC","label":{"it-IT":"FTTC (fibra fino all''armadio)","en":"FTTC","es-AR":"FTTC"}}]',
   NULL, 'technical', 1),
 (NULL, 'fiber', 'asset', 'socket_id',      '{"it-IT":"ID presa / ROE","en":"Socket/ROE ID","es-AR":"ID de toma"}',                'text',   false, NULL, NULL,  'technical', 2),
 (NULL, 'fiber', 'asset', 'distance_m',     '{"it-IT":"Distanza dalla centrale","en":"Distance from CO","es-AR":"Distancia a central"}', 'number', false, NULL, 'm',  'technical', 3),
 (NULL, 'fiber', 'asset', 'attenuation_db', '{"it-IT":"Attenuazione misurata","en":"Measured attenuation","es-AR":"Atenuación medida"}', 'number', false, NULL, 'dB', 'technical', 4),
 (NULL, 'fiber', 'asset', 'ont_serial',     '{"it-IT":"Seriale ONT","en":"ONT serial","es-AR":"Serie ONT"}',                       'text',   false, NULL, NULL,  'technical', 5);

-- ---- ENGAGEMENT fibra (riferimento ordine di lavoro del distributore) ----
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, group_key, sequence) VALUES
 (NULL, 'fiber', 'engagement', 'work_order_ref', '{"it-IT":"Rif. ordine di lavoro","en":"Work order ref.","es-AR":"Ref. orden de trabajo"}', 'text', false, 'contract', 4);
