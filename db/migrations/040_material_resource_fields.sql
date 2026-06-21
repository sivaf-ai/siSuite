-- =====================================================================
--  040_material_resource_fields.sql
--  Arricchimento attributi (field_definition di SISTEMA, tenant_id NULL) per
--  una gestione MAGAZZINO completa (material) e per le RISORSE (sigla/colore/
--  icona/email/recapiti), allineato a cosa gestiscono i leader di mercato
--  (Odoo/Zoho/Cin7/NetSuite; BambooHR/Personio/Odoo HR). Additiva, idempotente.
-- =====================================================================

INSERT INTO public.field_definition
  (tenant_id, vertical, entity, key, label, data_type, required, options, unit, group_key, sequence) VALUES
 -- ── MATERIAL: identificazione/catalogo ──────────────────────────────
 (NULL, NULL, 'material', 'barcode',
    '{"it-IT":"Barcode (EAN/UPC)","en":"Barcode (EAN/UPC)","es-AR":"Código de barras"}', 'text', false, NULL, NULL, 'catalog', 10),
 (NULL, NULL, 'material', 'supplier',
    '{"it-IT":"Fornitore preferito","en":"Preferred supplier","es-AR":"Proveedor preferido"}', 'text', false, NULL, NULL, 'catalog', 11),
 (NULL, NULL, 'material', 'abc_class',
    '{"it-IT":"Classe ABC","en":"ABC class","es-AR":"Clase ABC"}', 'select', false,
    '[{"value":"A","label":{"it-IT":"A","en":"A","es-AR":"A"}},{"value":"B","label":{"it-IT":"B","en":"B","es-AR":"B"}},{"value":"C","label":{"it-IT":"C","en":"C","es-AR":"C"}}]',
    NULL, 'catalog', 12),
 (NULL, NULL, 'material', 'warranty_months',
    '{"it-IT":"Garanzia (mesi)","en":"Warranty (months)","es-AR":"Garantía (meses)"}', 'integer', false, NULL, 'mesi', 'catalog', 13),
 (NULL, NULL, 'material', 'image_url',
    '{"it-IT":"Immagine (URL)","en":"Image (URL)","es-AR":"Imagen (URL)"}', 'url', false, NULL, NULL, 'catalog', 14),
 -- ── MATERIAL: stock control ────────────────────────────────────────
 (NULL, NULL, 'material', 'max_stock',
    '{"it-IT":"Scorta massima","en":"Max. stock","es-AR":"Stock máximo"}', 'number', false, NULL, NULL, 'catalog', 15),
 (NULL, NULL, 'material', 'reorder_qty',
    '{"it-IT":"Quantità di riordino","en":"Reorder qty","es-AR":"Cantidad de reorden"}', 'number', false, NULL, NULL, 'catalog', 16),
 (NULL, NULL, 'material', 'default_location',
    '{"it-IT":"Ubicazione predefinita","en":"Default location","es-AR":"Ubicación predeterminada"}', 'text', false, NULL, NULL, 'catalog', 17),
 -- ── MATERIAL: economia ─────────────────────────────────────────────
 (NULL, NULL, 'material', 'sale_price',
    '{"it-IT":"Prezzo di vendita","en":"Sale price","es-AR":"Precio de venta"}', 'money', false, NULL, NULL, 'economics', 20),
 (NULL, NULL, 'material', 'vat_rate',
    '{"it-IT":"Aliquota IVA (%)","en":"VAT rate (%)","es-AR":"Alícuota IVA (%)"}', 'number', false, NULL, '%', 'economics', 21),
 (NULL, NULL, 'material', 'currency',
    '{"it-IT":"Valuta","en":"Currency","es-AR":"Moneda"}', 'select', false,
    '[{"value":"EUR","label":{"it-IT":"EUR","en":"EUR","es-AR":"EUR"}},{"value":"USD","label":{"it-IT":"USD","en":"USD","es-AR":"USD"}},{"value":"ARS","label":{"it-IT":"ARS","en":"ARS","es-AR":"ARS"}}]',
    NULL, 'economics', 22),
 -- ── MATERIAL: logistica ────────────────────────────────────────────
 (NULL, NULL, 'material', 'weight_kg',
    '{"it-IT":"Peso (kg)","en":"Weight (kg)","es-AR":"Peso (kg)"}', 'number', false, NULL, 'kg', 'logistics', 30),
 (NULL, NULL, 'material', 'dimensions',
    '{"it-IT":"Dimensioni (L×P×H)","en":"Dimensions (L×W×H)","es-AR":"Dimensiones (L×P×A)"}', 'text', false, NULL, NULL, 'logistics', 31),
 (NULL, NULL, 'material', 'shelf_life_days',
    '{"it-IT":"Durata/scadenza (giorni)","en":"Shelf life (days)","es-AR":"Vida útil (días)"}', 'integer', false, NULL, 'gg', 'logistics', 32),
 (NULL, NULL, 'material', 'hs_code',
    '{"it-IT":"Codice doganale (HS)","en":"HS code","es-AR":"Código aduanero (HS)"}', 'text', false, NULL, NULL, 'logistics', 33),
 (NULL, NULL, 'material', 'country_origin',
    '{"it-IT":"Paese di origine","en":"Country of origin","es-AR":"País de origen"}', 'text', false, NULL, NULL, 'logistics', 34),
 (NULL, NULL, 'material', 'notes',
    '{"it-IT":"Note","en":"Notes","es-AR":"Notas"}', 'textarea', false, NULL, NULL, 'notes', 40),

 -- ── RESOURCE: anagrafica (sigla/colore/icona) ──────────────────────
 (NULL, NULL, 'resource', 'code',
    '{"it-IT":"Sigla","en":"Code","es-AR":"Sigla"}', 'text', false, NULL, NULL, 'registry', 1),
 (NULL, NULL, 'resource', 'color',
    '{"it-IT":"Colore","en":"Color","es-AR":"Color"}', 'select', false,
    '[{"value":"teal","label":{"it-IT":"Verde acqua","en":"Teal","es-AR":"Verde agua"}},{"value":"violet","label":{"it-IT":"Viola","en":"Violet","es-AR":"Violeta"}},{"value":"rose","label":{"it-IT":"Rosa","en":"Rose","es-AR":"Rosa"}},{"value":"amber","label":{"it-IT":"Ambra","en":"Amber","es-AR":"Ámbar"}},{"value":"green","label":{"it-IT":"Verde","en":"Green","es-AR":"Verde"}},{"value":"blue","label":{"it-IT":"Blu","en":"Blue","es-AR":"Azul"}},{"value":"orange","label":{"it-IT":"Arancio","en":"Orange","es-AR":"Naranja"}},{"value":"slate","label":{"it-IT":"Grigio","en":"Slate","es-AR":"Gris"}}]',
    NULL, 'registry', 2),
 (NULL, NULL, 'resource', 'icon',
    '{"it-IT":"Icona (nome lucide)","en":"Icon (lucide name)","es-AR":"Ícono (nombre lucide)"}', 'text', false, NULL, NULL, 'registry', 3),
 (NULL, NULL, 'resource', 'role_title',
    '{"it-IT":"Mansione / ruolo","en":"Job title / role","es-AR":"Puesto / rol"}', 'text', false, NULL, NULL, 'registry', 4),
 (NULL, NULL, 'resource', 'department',
    '{"it-IT":"Reparto","en":"Department","es-AR":"Departamento"}', 'text', false, NULL, NULL, 'registry', 5),
 -- ── RESOURCE: recapiti ─────────────────────────────────────────────
 (NULL, NULL, 'resource', 'email',
    '{"it-IT":"Email","en":"Email","es-AR":"Email"}', 'email', false, NULL, NULL, 'contact', 10),
 (NULL, NULL, 'resource', 'phone',
    '{"it-IT":"Telefono","en":"Phone","es-AR":"Teléfono"}', 'phone', false, NULL, NULL, 'contact', 11),
 (NULL, NULL, 'resource', 'notes',
    '{"it-IT":"Note","en":"Notes","es-AR":"Notas"}', 'textarea', false, NULL, NULL, 'notes', 20)
ON CONFLICT (vertical, entity, key) WHERE tenant_id IS NULL DO NOTHING;

INSERT INTO public.sisuite_migrations (filename) VALUES ('040_material_resource_fields.sql')
  ON CONFLICT DO NOTHING;
