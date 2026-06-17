-- =====================================================================
--  030_material_fields.sql
--  CAMPI DI SISTEMA (field_definition) per l'entità `material` (brief Blocco C).
--  La tabella material NON ha colonne category/min_stock/item_type/supplier_code:
--  per il principio "campi guidati da metadati" stanno in attributes jsonb e si
--  definiscono qui (EntityForm li disegna, Zod li valida — unica fonte FE+BE).
--  vertical NULL = validi per tutti i verticali. Additiva, dopo 029. PG16.
-- =====================================================================

INSERT INTO public.field_definition
  (tenant_id, vertical, entity, key, label, data_type, required, options, unit, group_key, sequence) VALUES
 (NULL, NULL, 'material', 'item_type',
    '{"it-IT":"Tipo","en":"Type","es-AR":"Tipo"}', 'select', false,
    '[{"value":"article","label":{"it-IT":"Articolo","en":"Article","es-AR":"Artículo"}},{"value":"service","label":{"it-IT":"Servizio","en":"Service","es-AR":"Servicio"}}]',
    NULL, 'catalog', 1),
 (NULL, NULL, 'material', 'category',
    '{"it-IT":"Categoria","en":"Category","es-AR":"Categoría"}', 'text', false, NULL, NULL, 'catalog', 2),
 (NULL, NULL, 'material', 'supplier_code',
    '{"it-IT":"Codice fornitore","en":"Supplier code","es-AR":"Código proveedor"}', 'text', false, NULL, NULL, 'catalog', 3),
 (NULL, NULL, 'material', 'min_stock',
    '{"it-IT":"Scorta minima","en":"Min. stock","es-AR":"Stock mínimo"}', 'number', false, NULL, NULL, 'catalog', 4)
ON CONFLICT (vertical, entity, key) WHERE tenant_id IS NULL DO NOTHING;

INSERT INTO public.sisuite_migrations (filename) VALUES ('030_material_fields.sql')
  ON CONFLICT DO NOTHING;
