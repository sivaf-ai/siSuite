-- DOWN 015 — rimuove cronometro. NON auto-eseguito.
DROP TABLE IF EXISTS public.time_tracking_session;
ALTER TABLE public.time_entry
  DROP COLUMN IF EXISTS start_at,
  DROP COLUMN IF EXISTS end_at;
