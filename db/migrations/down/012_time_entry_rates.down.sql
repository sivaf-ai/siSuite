-- DOWN 012 — rimuove tariffe fotografate + listino. NON auto-eseguito.
DROP TABLE IF EXISTS public.rate_card;
ALTER TABLE public.tenant
  DROP COLUMN IF EXISTS default_cost_rate,
  DROP COLUMN IF EXISTS default_bill_rate,
  DROP COLUMN IF EXISTS default_currency;
DELETE FROM public.field_definition
 WHERE tenant_id IS NULL AND key IN ('bill_rate','bill_rate_override')
   AND entity IN ('resource','engagement');
ALTER TABLE public.time_entry
  DROP COLUMN IF EXISTS cost_rate,
  DROP COLUMN IF EXISTS bill_rate,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS billable;
