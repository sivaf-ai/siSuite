-- DOWN 018 — rimuove schedule_mode/pinned_day. NON auto-eseguito.
ALTER TABLE public.activity
  DROP COLUMN IF EXISTS schedule_mode_id,
  DROP COLUMN IF EXISTS pinned_day;
DELETE FROM public.lookup_value   WHERE tenant_id IS NULL AND category = 'schedule_mode';
DELETE FROM public.canonical_state WHERE category = 'schedule_mode';
