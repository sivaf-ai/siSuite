-- DOWN 011 — rimuove tipo ore come lista. NON auto-eseguito.
DROP INDEX IF EXISTS public.time_entry_typology_id_idx;
ALTER TABLE public.time_entry DROP COLUMN IF EXISTS typology_id;
DELETE FROM public.lookup_value   WHERE tenant_id IS NULL AND category = 'time_typology';
DELETE FROM public.canonical_state WHERE category = 'time_typology';
