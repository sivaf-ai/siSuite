-- =====================================================================
--  032_work_order_generalize.sql  (ADR-0006, brief v2.4 Blocco B-ter)
--  "Ordinativo (FTTH)" → "Ordine di lavoro" generico (standard di mercato).
--  L'entità work_order resta; si generalizzano le colonne troppo specifiche e
--  si aggiunge un TIPO configurabile via lookup_value('work_order_type').
--  Applicare DOPO 031. PostgreSQL 16.
-- =====================================================================

-- 1) rename colonne → committente esterno generico
ALTER TABLE public.work_order RENAME COLUMN operator_company_id TO principal_company_id;
ALTER TABLE public.work_order RENAME COLUMN operator_order_id   TO principal_order_ref;
-- nomi puliti per FK e UNIQUE (le colonne nei vincoli seguono il rename)
ALTER TABLE public.work_order RENAME CONSTRAINT work_order_operator_company_id_fkey TO work_order_principal_company_id_fkey;
ALTER TABLE public.work_order RENAME CONSTRAINT work_order_tenant_id_operator_company_id_operator_order_id_key TO work_order_principal_ref_uk;

-- 2) tipo ordine configurabile
ALTER TABLE public.work_order ADD COLUMN IF NOT EXISTS type_id uuid REFERENCES public.lookup_value(id);
CREATE INDEX IF NOT EXISTS work_order_type_id_idx ON public.work_order (type_id);

-- 3) seed tipi di sistema (tenant_id NULL, rinominabili per tenant via lookup_override)
INSERT INTO public.canonical_state (category, code, sequence) VALUES
  ('work_order_type','activation', 10),
  ('work_order_type','maintenance',20),
  ('work_order_type','fault',      30)
ON CONFLICT (category, code) DO NOTHING;

INSERT INTO public.lookup_value
  (tenant_id, category, canonical, code, label, abbreviation, color_token, icon, sequence, is_default, active) VALUES
  (NULL,'work_order_type','activation','activation',
     '{"it-IT":"Attivazione","en":"Activation","es-AR":"Activación"}','ATT','info','cable',10,true,true),
  (NULL,'work_order_type','maintenance','maintenance',
     '{"it-IT":"Manutenzione","en":"Maintenance","es-AR":"Mantenimiento"}','MAN','brand','wrench',20,false,true),
  (NULL,'work_order_type','fault','fault',
     '{"it-IT":"Guasto","en":"Fault","es-AR":"Falla"}','GST','warning','alert-triangle',30,false,true)
ON CONFLICT (category, code) WHERE tenant_id IS NULL DO NOTHING;

-- 4) commento generico (non più "FTTH")
COMMENT ON TABLE public.work_order IS
  'Ordine di lavoro (work order, oggetto di prima classe). 1 commessa = N ordini. Committente esterno in principal_company_id; tipo in type_id (lookup work_order_type). PII intestatario in work_order_subject.';

INSERT INTO public.sisuite_migrations (filename) VALUES ('032_work_order_generalize.sql')
  ON CONFLICT DO NOTHING;
