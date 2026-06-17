-- =====================================================================
--  026_price_list.sql
--  LISTINO BASE + RITOCCHI (voci di capitolato con prezzo costo/ricavo).
--
--  Scelta confermata: "listino base con ritocchi" — un catalogo madre di
--  voci + override puntuali per gestore/commessa. Stesso pattern di
--  lookup_value + lookup_override (gia' nello schema), quindi niente
--  meccanica nuova da inventare.
--
--  Differenza importante:
--   - material.default_cost = COSTO di magazzino dell'apparato (valorizzazione).
--   - price_list_item       = listino di PRODUZIONE: voce di capitolato con
--                             prezzo di COSTO e prezzo di RICAVO (es. "B-1.1
--                             Disfacimento pavimentazione" 12 €/m costo, 39 €/m ricavo).
--  Sono due cose diverse: stock vs produzione.
--
--  Applicare DOPO 025. PostgreSQL 16.
-- =====================================================================

-- 1) Listini (il "madre" + eventuali listini dedicati)
CREATE TABLE public.price_list (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    code        text NOT NULL,
    name        text NOT NULL,
    currency    text NOT NULL DEFAULT 'EUR',
    is_default  boolean NOT NULL DEFAULT false,   -- il listino "madre"
    valid_from  date,
    valid_to    date,
    active      boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid,
    updated_by  uuid,
    UNIQUE (tenant_id, code)
);
CREATE INDEX ON public.price_list (tenant_id);
CREATE TRIGGER price_list_set_updated_at
  BEFORE UPDATE ON public.price_list FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.price_list IS 'Listini di produzione. is_default = listino base/madre del tenant.';

-- 2) Voce di capitolato (riga del listino) con doppio prezzo
CREATE TABLE public.price_list_item (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    price_list_id   uuid NOT NULL REFERENCES public.price_list(id) ON DELETE CASCADE,
    code            text NOT NULL,                  -- es. "B-1.1"
    description     text NOT NULL,                  -- es. "Disfacimento di pavimentazione"
    unit            text NOT NULL,                  -- m, m3, cad, ora...
    category        text,                           -- per la pivot (Categoria)
    cost_price      numeric,                        -- prezzo di COSTO
    revenue_price   numeric,                        -- prezzo di RICAVO
    active          boolean NOT NULL DEFAULT true,
    attributes      jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    UNIQUE (tenant_id, price_list_id, code)
);
CREATE INDEX ON public.price_list_item (tenant_id);
CREATE INDEX ON public.price_list_item (price_list_id);
CREATE INDEX ON public.price_list_item (category);
CREATE TRIGGER price_list_item_set_updated_at
  BEFORE UPDATE ON public.price_list_item FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.price_list_item IS 'Voce di capitolato a listino: codice + descrizione + unita'' + prezzo costo/ricavo.';

-- 3) RITOCCHI: override di una voce per uno specifico gestore o commessa
CREATE TABLE public.price_list_override (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    base_item_id    uuid NOT NULL REFERENCES public.price_list_item(id) ON DELETE CASCADE,
    scope_type      text NOT NULL CHECK (scope_type IN ('company','engagement')),
    company_id      uuid REFERENCES public.company(id) ON DELETE CASCADE,     -- gestore
    engagement_id   uuid REFERENCES public.engagement(id) ON DELETE CASCADE, -- commessa
    cost_price      numeric,
    revenue_price   numeric,
    valid_from      date,
    valid_to        date,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_by      uuid,
    -- coerenza: lo scope punta all'oggetto giusto
    CONSTRAINT price_override_scope_ck CHECK (
      (scope_type = 'company'    AND company_id    IS NOT NULL AND engagement_id IS NULL) OR
      (scope_type = 'engagement' AND engagement_id IS NOT NULL AND company_id    IS NULL)
    )
);
CREATE INDEX ON public.price_list_override (tenant_id);
CREATE INDEX ON public.price_list_override (base_item_id);
CREATE INDEX ON public.price_list_override (company_id);
CREATE INDEX ON public.price_list_override (engagement_id);
CREATE TRIGGER price_list_override_set_updated_at
  BEFORE UPDATE ON public.price_list_override FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.price_list_override IS
  'Ritocco di prezzo di una voce per un gestore (company) o una commessa (engagement). Risoluzione: override piu'' specifico, altrimenti la voce base.';

-- 4) RLS
ALTER TABLE public.price_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_list FORCE ROW LEVEL SECURITY;
CREATE POLICY price_list_tenant ON public.price_list
  USING (tenant_id = public.app_current_tenant()) WITH CHECK (tenant_id = public.app_current_tenant());

ALTER TABLE public.price_list_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_list_item FORCE ROW LEVEL SECURITY;
CREATE POLICY price_list_item_tenant ON public.price_list_item
  USING (tenant_id = public.app_current_tenant()) WITH CHECK (tenant_id = public.app_current_tenant());

ALTER TABLE public.price_list_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_list_override FORCE ROW LEVEL SECURITY;
CREATE POLICY price_list_override_tenant ON public.price_list_override
  USING (tenant_id = public.app_current_tenant()) WITH CHECK (tenant_id = public.app_current_tenant());

INSERT INTO public.sisuite_migrations (filename) VALUES ('026_price_list.sql')
  ON CONFLICT DO NOTHING;
