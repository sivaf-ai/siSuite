-- =====================================================================
--  018 — AGENDA VIVA §6.2: aggiunte a schema.
--  schedule_mode (floating/fixed) + pinned_day su activity. La logica vive
--  nel motore esistente (scheduler/dependencyPlan/weekView); qui solo lo
--  schema. floating (default): il pianificatore calcola scheduled_start/end.
--  fixed: scheduled_start è autorevole (appuntamento). pinned_day: l'attività
--  resta nel giorno (trascina-e-inchioda). Additivo + idempotente.
-- =====================================================================

INSERT INTO canonical_state (category, code, sequence) VALUES
  ('schedule_mode','floating',1),('schedule_mode','fixed',2) ON CONFLICT DO NOTHING;
INSERT INTO lookup_value (tenant_id,category,canonical,code,label,abbreviation,color_token,sequence,is_default) VALUES
 (NULL,'schedule_mode','floating','floating','{"it-IT":"Distribuita","en":"Floating","es-AR":"Distribuida"}','DIS','info',1,true),
 (NULL,'schedule_mode','fixed','fixed','{"it-IT":"A orario fisso","en":"Fixed time","es-AR":"Horario fijo"}','FIS','warning',2,false)
ON CONFLICT DO NOTHING;

ALTER TABLE public.activity
  ADD COLUMN IF NOT EXISTS schedule_mode_id uuid REFERENCES public.lookup_value(id),
  ADD COLUMN IF NOT EXISTS pinned_day date;
