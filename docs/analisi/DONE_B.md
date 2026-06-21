# DONE_B — Material completo + categorie/immagini/fornitori (V042_material_complete.sql)

**Creato:** 23 colonne su `material` (code, item_type, barcode, category_id, description, brand, manufacturer, mpn, default_sale_price, tax_rate_id, reorder_point, safety_stock, min_qty, max_qty, lead_time_days, preferred_vendor_id, weight, weight_unit, dimensions, is_returnable, shelf_life_days, primary_image_url, note) + indici barcode/category + code univoco; tabelle `material_category` (gerarchica), `material_image` (MinIO), `material_supplier` (RLS+GRANT). Backend: routes `materialCatalog.ts` (categorie/fornitori/immagini) + material esteso con codice da number_series.

**Scostamenti:** V042. CLEAN SLATE: i field_definition material di 040 (barcode/supplier/sale_price/vat_rate/image_url/max_stock/reorder_qty/shelf_life_days/weight_kg/dimensions/notes) e 004 software (brand/part_number) rimossi → ora colonne. Restano attributes: abc_class, warranty_months, currency, hs_code, country_origin, default_location.

**AC B:** SUPERATO (ART-00001 con categoria/barcode/prezzo/IVA/reorder; ricerca per barcode OK).
