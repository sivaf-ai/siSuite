-- =====================================================================
--  013 — MODULO ORE §4.3: approvazione + blocco duro delle ore.
--  Stati via canonical_state 'time_entry_status' (draft/submitted/approved/
--  rejected). Colonne di workflow + lock su time_entry. Trigger di blocco:
--  una riga is_locked non è più modificabile (eccetto sblocco controllato:
--  NEW.is_locked=false AND NEW.lock_reason IS NULL). Additivo + idempotente.
-- =====================================================================

INSERT INTO canonical_state (category, code, sequence) VALUES
  ('time_entry_status','draft',1),('time_entry_status','submitted',2),
  ('time_entry_status','approved',3),('time_entry_status','rejected',4)
ON CONFLICT DO NOTHING;

INSERT INTO lookup_value (tenant_id,category,canonical,code,label,abbreviation,color_token,sequence,is_default) VALUES
 (NULL,'time_entry_status','draft','draft','{"it-IT":"Bozza","en":"Draft","es-AR":"Borrador"}','BOZ','neutral',1,true),
 (NULL,'time_entry_status','submitted','submitted','{"it-IT":"Inviata","en":"Submitted","es-AR":"Enviada"}','INV','info',2,false),
 (NULL,'time_entry_status','approved','approved','{"it-IT":"Approvata","en":"Approved","es-AR":"Aprobada"}','APP','success',3,false),
 (NULL,'time_entry_status','rejected','rejected','{"it-IT":"Respinta","en":"Rejected","es-AR":"Rechazada"}','RES','danger',4,false)
ON CONFLICT DO NOTHING;

ALTER TABLE public.time_entry
  ADD COLUMN IF NOT EXISTS approval_status_id uuid REFERENCES public.lookup_value(id),
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES public.app_user(id),
  ADD COLUMN IF NOT EXISTS approved_at  timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by  uuid REFERENCES public.app_user(id),
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS is_locked   boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS locked_at   timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by   uuid REFERENCES public.app_user(id),
  ADD COLUMN IF NOT EXISTS lock_reason text;  -- 'PAYROLL'|'INVOICED'|'PERIOD_CLOSE'|'MANUAL'

-- nuova riga senza stato esplicito = bozza (default applicativo); l'indice aiuta
-- la coda di approvazione.
CREATE INDEX IF NOT EXISTS time_entry_approval_status_idx ON public.time_entry(approval_status_id);

-- blocco duro: riga bloccata non modificabile (eccetto sblocco controllato)
CREATE OR REPLACE FUNCTION public.block_locked_time_entry()
RETURNS trigger AS $$
BEGIN
  IF OLD.is_locked = true THEN
    IF NEW.is_locked = false AND NEW.lock_reason IS NULL THEN RETURN NEW; END IF;  -- sblocco controllato
    RAISE EXCEPTION 'time_entry % bloccata (%): modifica non consentita', OLD.id, OLD.lock_reason;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_time_entry_lock ON public.time_entry;
CREATE TRIGGER trg_time_entry_lock BEFORE UPDATE ON public.time_entry
  FOR EACH ROW EXECUTE FUNCTION public.block_locked_time_entry();
