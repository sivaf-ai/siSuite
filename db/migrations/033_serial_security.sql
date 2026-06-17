-- 033_serial_security.sql — Sicurezza seriali (debito Blocco C):
--   1) data_scope 'own' imposto in RLS (non solo nella query) su stock_serial_unit
--      → il Tecnico vede SOLO le unità del suo furgone o sui suoi ordini di lavoro.
--   2) tabella audit dei REVEAL del segreto seriale (chi/quale/quando — MAI il valore).

-- ── 1) RLS data_scope su stock_serial_unit ─────────────────────────────
-- La policy unica preesistente era solo tenant; la sostituiamo con policy per-comando
-- (stesso pattern di time_entry) così lo scope 'own' si applica solo in SELECT.
DROP POLICY IF EXISTS stock_serial_unit_tenant ON public.stock_serial_unit;

CREATE POLICY ssu_select ON public.stock_serial_unit FOR SELECT USING (
  (app_is_platform_admin() OR tenant_id = app_current_tenant())
  AND (
    app_sees_whole_tenant()
    OR (app_data_scope() = 'own' AND (
         holder_resource_id IN (SELECT id FROM public.resource WHERE user_id = app_current_user())
         OR work_order_id IN (
              SELECT id FROM public.work_order
              WHERE assigned_resource_id IN (SELECT id FROM public.resource WHERE user_id = app_current_user()))
       ))
  )
);
CREATE POLICY ssu_insert ON public.stock_serial_unit FOR INSERT
  WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY ssu_update ON public.stock_serial_unit FOR UPDATE
  USING (app_is_platform_admin() OR tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY ssu_delete ON public.stock_serial_unit FOR DELETE
  USING (app_is_platform_admin() OR tenant_id = app_current_tenant());

-- ── 2) Audit dei reveal del segreto seriale ────────────────────────────
CREATE TABLE IF NOT EXISTS public.serial_secret_reveal_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  serial_unit_id uuid NOT NULL REFERENCES public.stock_serial_unit(id) ON DELETE CASCADE,
  user_id        uuid,
  revealed_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS serial_secret_reveal_log_unit_idx   ON public.serial_secret_reveal_log (serial_unit_id);
CREATE INDEX IF NOT EXISTS serial_secret_reveal_log_tenant_idx ON public.serial_secret_reveal_log (tenant_id, revealed_at DESC);

COMMENT ON TABLE public.serial_secret_reveal_log IS
  'Audit degli sblocchi (reveal) della password apparato di un seriale: chi/quale/quando. Il valore in chiaro NON è mai loggato.';

ALTER TABLE public.serial_secret_reveal_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.serial_secret_reveal_log FORCE ROW LEVEL SECURITY;
CREATE POLICY ssrl_tenant ON public.serial_secret_reveal_log FOR ALL
  USING (app_is_platform_admin() OR tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

INSERT INTO public.sisuite_migrations (filename) VALUES ('033_serial_security.sql')
  ON CONFLICT DO NOTHING;
