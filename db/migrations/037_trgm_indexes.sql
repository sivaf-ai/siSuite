-- 037_trgm_indexes.sql — indici GIN trigram (Blocco 5 igiene) per le ricerche ILIKE
-- delle liste (ricerca testuale + filtro "contiene"). Senza questi, gli ILIKE su volumi
-- fanno seq-scan. Additiva, idempotente.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Soggetti: nome + città (ricerca __any e filtro)
CREATE INDEX IF NOT EXISTS company_displayname_trgm ON public.company USING gin (display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS company_city_trgm        ON public.company USING gin ((attributes->>'city') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS company_vat_trgm         ON public.company USING gin ((attributes->>'vat_number') gin_trgm_ops);

-- Articoli: nome + sku
CREATE INDEX IF NOT EXISTS material_name_trgm ON public.material USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS material_sku_trgm  ON public.material USING gin (sku gin_trgm_ops);

-- Ordini di lavoro: codice + indirizzo + rif. esterno
CREATE INDEX IF NOT EXISTS work_order_code_trgm    ON public.work_order USING gin (code gin_trgm_ops);
CREATE INDEX IF NOT EXISTS work_order_address_trgm ON public.work_order USING gin (address gin_trgm_ops);

-- Commesse: codice + titolo
CREATE INDEX IF NOT EXISTS engagement_code_trgm  ON public.engagement USING gin (code gin_trgm_ops);
CREATE INDEX IF NOT EXISTS engagement_title_trgm ON public.engagement USING gin (title gin_trgm_ops);

INSERT INTO public.sisuite_migrations (filename) VALUES ('037_trgm_indexes.sql')
  ON CONFLICT DO NOTHING;
