-- =====================================================================
--  008 — CAMPI DI SISTEMA per ricavo/costo (parte 8 §4.3) — prerequisito
--  della marginalità. vertical NULL = valgono per TUTTI i verticali; tenant_id
--  NULL = righe di sistema (domain pack), non modificabili dai tenant.
--  Margine commessa ≈ budget − (Σ ore×hourly_cost + Σ consumi×unit_cost).
--  Le maschere (EntityForm) li disegnano da sole leggendo questo catalogo.
-- =====================================================================
INSERT INTO field_definition (tenant_id, vertical, entity, key, label, data_type, required, unit, group_key, sequence) VALUES
 (NULL, NULL, 'engagement', 'budget',      '{"it-IT":"Budget / Preventivo","en":"Budget","es-AR":"Presupuesto"}',     'money', false, '€',   'economics', 50),
 (NULL, NULL, 'resource',   'hourly_cost', '{"it-IT":"Costo orario","en":"Hourly cost","es-AR":"Costo por hora"}',     'money', false, '€/h', 'economics', 50),
 (NULL, NULL, 'material',   'unit_cost',   '{"it-IT":"Costo unitario","en":"Unit cost","es-AR":"Costo unitario"}',     'money', false, '€',   'economics', 50);
