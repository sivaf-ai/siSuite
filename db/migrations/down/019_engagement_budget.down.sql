-- DOWN 019 — rimuove budget previsto. NON auto-eseguito.
ALTER TABLE public.engagement
  DROP COLUMN IF EXISTS budget_amount,
  DROP COLUMN IF EXISTS budget_minutes,
  DROP COLUMN IF EXISTS budget_currency;
