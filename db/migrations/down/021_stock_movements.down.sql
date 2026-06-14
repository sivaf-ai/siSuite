-- DOWN 021 — rimuove registro movimenti + saldo. NON auto-eseguito.
DROP VIEW IF EXISTS public.stock_balance_recompute;
DROP TRIGGER IF EXISTS trg_stock_movement_apply ON public.stock_movement;
DROP FUNCTION IF EXISTS public.apply_stock_movement();
DROP TABLE IF EXISTS public.stock_balance;
DROP TRIGGER IF EXISTS trg_stock_movement_no_update ON public.stock_movement;
DROP TRIGGER IF EXISTS trg_stock_movement_no_delete ON public.stock_movement;
DROP FUNCTION IF EXISTS public.stock_movement_is_immutable();
DROP TABLE IF EXISTS public.stock_movement;
DELETE FROM public.lookup_value   WHERE tenant_id IS NULL AND category = 'stock_movement_type';
DELETE FROM public.canonical_state WHERE category = 'stock_movement_type';
