-- DOWN 013 — rimuove approvazione + blocco ore. NON auto-eseguito.
DROP TRIGGER IF EXISTS trg_time_entry_lock ON public.time_entry;
DROP FUNCTION IF EXISTS public.block_locked_time_entry();
DROP INDEX IF EXISTS public.time_entry_approval_status_idx;
ALTER TABLE public.time_entry
  DROP COLUMN IF EXISTS approval_status_id,
  DROP COLUMN IF EXISTS submitted_at,  DROP COLUMN IF EXISTS submitted_by,
  DROP COLUMN IF EXISTS approved_at,   DROP COLUMN IF EXISTS approved_by,
  DROP COLUMN IF EXISTS rejection_reason,
  DROP COLUMN IF EXISTS is_locked, DROP COLUMN IF EXISTS locked_at,
  DROP COLUMN IF EXISTS locked_by, DROP COLUMN IF EXISTS lock_reason;
DELETE FROM public.lookup_value   WHERE tenant_id IS NULL AND category = 'time_entry_status';
DELETE FROM public.canonical_state WHERE category = 'time_entry_status';
