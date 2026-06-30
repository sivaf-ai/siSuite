-- =====================================================================
--  061_field_variant.sql — Campi PER VARIANTE/TIPO di record (proposta Asse B)
--  Aggiunge `variant` a field_definition: i campi possono dipendere dal Tipo del
--  record (es. Ordine di lavoro tipo "FTTH" ha campi diversi da "Manutenzione").
--  Scope completo del campo = (entity, country?, vertical?, variant?). variant NULL
--  = universale per tutti i tipi. PostgreSQL 16. Dopo 060. Niente BEGIN/COMMIT.
-- =====================================================================

ALTER TABLE public.field_definition ADD COLUMN IF NOT EXISTS variant text;

-- indice di scope esteso con variant (sostituisce field_definition_scope_idx)
DROP INDEX IF EXISTS public.field_definition_scope_idx;
CREATE INDEX field_definition_scope_idx
  ON public.field_definition (entity, country, vertical, variant) WHERE active;

-- unicità delle righe di SISTEMA estesa con variant
DROP INDEX IF EXISTS public.field_definition_system_uniq;
CREATE UNIQUE INDEX field_definition_system_uniq
  ON public.field_definition (vertical, entity, key, country, variant) WHERE tenant_id IS NULL;

INSERT INTO public.sisuite_migrations (filename) VALUES ('061_field_variant.sql')
  ON CONFLICT DO NOTHING;
