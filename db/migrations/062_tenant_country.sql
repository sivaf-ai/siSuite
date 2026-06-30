-- =====================================================================
--  062_tenant_country.sql — Paese (ISO) del Tenant (Asse A geografia)
--  Il tenant ha un Paese di default: le nuove anagrafiche (Soggetti, Siti) e i form
--  country-driven lo ereditano, mostrando subito i campi giusti (IT vs AR…).
--  I set di campi per Paese sono righe di SISTEMA in field_definition (già seedate,
--  condivise da tutti i tenant): nessun seeding per-tenant necessario. Dopo 061.
-- =====================================================================

ALTER TABLE public.tenant ADD COLUMN IF NOT EXISTS country character(2) NOT NULL DEFAULT 'IT';

INSERT INTO public.sisuite_migrations (filename) VALUES ('062_tenant_country.sql')
  ON CONFLICT DO NOTHING;
