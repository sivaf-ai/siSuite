-- =====================================================================
--  016 — MODULO ORE §4.6: irrobustimento contesto.
--  Una riga ore deve appartenere ad almeno una commessa O un'attività.
--  Aggiunta NOT VALID + VALIDATE (verificato a vuoto: 0 righe in violazione
--  al 2026-06-15). Guard idempotente: salta se il constraint esiste già.
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'time_entry_context_check'
       AND conrelid = 'public.time_entry'::regclass
  ) THEN
    ALTER TABLE public.time_entry
      ADD CONSTRAINT time_entry_context_check
      CHECK (engagement_id IS NOT NULL OR activity_id IS NOT NULL) NOT VALID;
    ALTER TABLE public.time_entry VALIDATE CONSTRAINT time_entry_context_check;
  END IF;
END $$;
