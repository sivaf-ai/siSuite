-- DOWN 016 — rimuove il vincolo di contesto. NON auto-eseguito.
ALTER TABLE public.time_entry DROP CONSTRAINT IF EXISTS time_entry_context_check;
