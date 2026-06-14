-- DOWN 022 — rimuove documenti magazzino. NON auto-eseguito.
ALTER TABLE public.stock_movement DROP CONSTRAINT IF EXISTS stock_movement_document_fkey;
DROP TABLE IF EXISTS public.stock_document_line;
DROP TABLE IF EXISTS public.stock_document;
DELETE FROM public.lookup_value   WHERE tenant_id IS NULL AND category = 'stock_document_type';
DELETE FROM public.canonical_state WHERE category = 'stock_document_type';
