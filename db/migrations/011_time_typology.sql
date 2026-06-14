-- =====================================================================
--  011 — MODULO ORE §4.1: tipo di ore come LISTA + natura (orchestratore)
--  La "natura" del tipo di ora è un canonical_state ('time_typology'); le
--  etichette rinominabili stanno in lookup_value. time_entry.typology_id
--  punta al lookup scelto; dal suo canonical (natura) la UI pilota i campi
--  visibili via field_definition. Il vecchio time_entry.typology (text)
--  resta DEPRECATO (non rimosso).  Additivo + idempotente.
-- =====================================================================

-- natura del tipo di ora (codici di sistema)
INSERT INTO canonical_state (category, code, sequence) VALUES
  ('time_typology','work',1),('time_typology','absence',2),('time_typology','material',3),
  ('time_typology','performance',4),('time_typology','cost',5)
ON CONFLICT DO NOTHING;

-- etichette di sistema (tenant_id NULL); performance/cost senza etichetta (futuro)
INSERT INTO lookup_value (tenant_id,category,canonical,code,label,abbreviation,color_token,sequence,is_default) VALUES
 (NULL,'time_typology','work',    'ordinary','{"it-IT":"Ordinarie","en":"Regular","es-AR":"Normales"}','ORD','info',   1,true),
 (NULL,'time_typology','work',    'overtime','{"it-IT":"Straordinario","en":"Overtime","es-AR":"Extra"}','STR','warning',2,false),
 (NULL,'time_typology','work',    'travel',  '{"it-IT":"Viaggio","en":"Travel","es-AR":"Viaje"}','VIA','neutral',3,false),
 (NULL,'time_typology','absence', 'absence', '{"it-IT":"Assenza","en":"Absence","es-AR":"Ausencia"}','ASS','neutral',4,false),
 (NULL,'time_typology','material','material','{"it-IT":"Materiale","en":"Material","es-AR":"Material"}','MAT','success',5,false)
ON CONFLICT DO NOTHING;

ALTER TABLE public.time_entry
  ADD COLUMN IF NOT EXISTS typology_id uuid REFERENCES public.lookup_value(id);
CREATE INDEX IF NOT EXISTS time_entry_typology_id_idx ON public.time_entry(typology_id);

-- BACKFILL (vedi log decisioni 2026-06-15): le righe storiche (demo) hanno
-- typology testuale di dominio senza mappa 1:1 ai canonici → tutte → 'ordinary'
-- (natura work). typology testo invariato. Idempotente (solo dove NULL).
UPDATE public.time_entry te
   SET typology_id = lv.id
  FROM public.lookup_value lv
 WHERE te.typology_id IS NULL
   AND lv.tenant_id IS NULL AND lv.category = 'time_typology' AND lv.code = 'ordinary';
