-- =====================================================================
--  058_tree_standard.sql — Allineamento delle entità ad albero allo STANDARD
--  Rif: sivaf-standards/tree/STANDARD_entita_albero_v1_0_01_05.md (§1.2, §3), ADR-0001.
--  Tabelle: material_category, site, stock_location.
--  Clean-slate: niente shim. Nessun BEGIN/COMMIT (il runner avvolge già in transazione).
--  PostgreSQL 16. Dopo 057.
-- =====================================================================

-- =====================================================================
-- 1) MATERIAL_CATEGORY — colonne standard + FK RESTRICT esplicita + anti-ciclo + indici
-- =====================================================================
ALTER TABLE public.material_category
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS image_url   text,
  ADD COLUMN IF NOT EXISTS sequence    integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS is_system   boolean DEFAULT false NOT NULL;

-- Normalizza la FK gerarchia a ON DELETE RESTRICT (regola canonica A: un genitore
-- con figli non si elimina; oggi era senza clausola = NO ACTION, la rendiamo esplicita).
ALTER TABLE ONLY public.material_category DROP CONSTRAINT IF EXISTS material_category_parent_id_fkey;
ALTER TABLE ONLY public.material_category
  ADD CONSTRAINT material_category_parent_id_fkey FOREIGN KEY (parent_id)
  REFERENCES public.material_category(id) ON DELETE RESTRICT;

-- Indice fratelli per ordinamento manuale (sequence).
CREATE INDEX IF NOT EXISTS material_category_sibling_idx
  ON public.material_category (tenant_id, parent_id, sequence);

-- Trigger anti-ciclo (generalizzazione di stock_location_no_cycle).
CREATE OR REPLACE FUNCTION public.material_category_no_cycle() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (
      WITH RECURSIVE anc AS (
        SELECT NEW.parent_id AS id
        UNION ALL
        SELECT t.parent_id FROM public.material_category t JOIN anc ON t.id = anc.id
        WHERE t.parent_id IS NOT NULL
      ) SELECT 1 FROM anc WHERE id = NEW.id
    ) THEN
      RAISE EXCEPTION 'material_category: ciclo non ammesso (% non puo stare sotto una propria discendente)', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS material_category_no_cycle_trg ON public.material_category;
CREATE TRIGGER material_category_no_cycle_trg
  BEFORE INSERT OR UPDATE OF parent_id ON public.material_category
  FOR EACH ROW EXECUTE FUNCTION public.material_category_no_cycle();

-- Unicità per livello archived-aware: già presenti (material_category_root_name_uniq /
-- material_category_child_name_uniq). material_category NON ammette righe di sistema
-- globali (tenant_id NOT NULL) → nessun COALESCE necessario (STANDARD §2.4).


-- =====================================================================
-- 2) SITE — FK gerarchia CASCADE -> RESTRICT + sequence + anti-ciclo + indice fratelli
-- =====================================================================
ALTER TABLE public.site
  ADD COLUMN IF NOT EXISTS sequence integer DEFAULT 0 NOT NULL;

-- Correzione critica: da ON DELETE CASCADE a ON DELETE RESTRICT (regola canonica A).
ALTER TABLE ONLY public.site DROP CONSTRAINT IF EXISTS site_parent_id_fkey;
ALTER TABLE ONLY public.site
  ADD CONSTRAINT site_parent_id_fkey FOREIGN KEY (parent_id)
  REFERENCES public.site(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS site_sibling_idx
  ON public.site (tenant_id, parent_id, sequence);

CREATE OR REPLACE FUNCTION public.site_no_cycle() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (
      WITH RECURSIVE anc AS (
        SELECT NEW.parent_id AS id
        UNION ALL
        SELECT t.parent_id FROM public.site t JOIN anc ON t.id = anc.id
        WHERE t.parent_id IS NOT NULL
      ) SELECT 1 FROM anc WHERE id = NEW.id
    ) THEN
      RAISE EXCEPTION 'site: ciclo non ammesso (% non puo stare sotto una propria discendente)', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS site_no_cycle_trg ON public.site;
CREATE TRIGGER site_no_cycle_trg
  BEFORE INSERT OR UPDATE OF parent_id ON public.site
  FOR EACH ROW EXECUTE FUNCTION public.site_no_cycle();


-- =====================================================================
-- 3) STOCK_LOCATION — sequence + indice fratelli (anti-ciclo già presente)
-- =====================================================================
ALTER TABLE public.stock_location
  ADD COLUMN IF NOT EXISTS sequence integer DEFAULT 0 NOT NULL;

CREATE INDEX IF NOT EXISTS stock_location_sibling_idx
  ON public.stock_location (tenant_id, parent_id, sequence);

-- (stock_location_no_cycle già attivo da migrazione precedente: nessuna azione.)

INSERT INTO public.sisuite_migrations (filename) VALUES ('058_tree_standard.sql')
  ON CONFLICT DO NOTHING;
