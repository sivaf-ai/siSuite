-- =====================================================================
--  019 — BUDGET/MARGINE §7.1: budget previsto su engagement.
--  Colonne dedicate (spec §7.1). NB: 008 aveva già introdotto un
--  field_definition 'engagement.budget' che scrive in attributes.budget
--  (usato dalla marginalità dashboard). Per non duplicare/derivare male:
--  il rollup §7.2 leggerà COALESCE(budget_amount, (attributes->>'budget')).
--  Vedi log decisioni 2026-06-15. Additivo + idempotente.
-- =====================================================================
ALTER TABLE public.engagement
  ADD COLUMN IF NOT EXISTS budget_amount numeric,
  ADD COLUMN IF NOT EXISTS budget_minutes integer,
  ADD COLUMN IF NOT EXISTS budget_currency text;
