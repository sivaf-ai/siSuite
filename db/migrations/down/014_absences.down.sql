-- DOWN 014 — rimuove assenze e saldi. NON auto-eseguito.
DROP TABLE IF EXISTS public.absence_balance;
DROP TABLE IF EXISTS public.absence_entry;
DELETE FROM public.lookup_value   WHERE tenant_id IS NULL AND category = 'absence_type';
DELETE FROM public.canonical_state WHERE category = 'absence_type';
