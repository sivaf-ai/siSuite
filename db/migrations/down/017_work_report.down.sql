-- DOWN 017 — rimuove rapportino + billing_mode. NON auto-eseguito.
DROP TABLE IF EXISTS public.work_report_time_entry;
DROP TABLE IF EXISTS public.work_report;
ALTER TABLE public.engagement DROP COLUMN IF EXISTS billing_mode_id;
DELETE FROM public.lookup_value   WHERE tenant_id IS NULL AND category IN ('billing_mode','work_report_status');
DELETE FROM public.canonical_state WHERE category IN ('billing_mode','work_report_status');
