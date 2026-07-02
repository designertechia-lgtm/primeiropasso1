-- ============================================================
-- Tier 3 — Teste A/B de título/CTA.
-- Variante B dos elementos de maior alavancagem (hero title/subtitle + CTA) e
-- rótulos de medição em landing_visits (variant + kind) para calcular a taxa de
-- conversão por variante DENTRO do app. Idempotente.
-- ============================================================
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS hero_title_b          text,
  ADD COLUMN IF NOT EXISTS hero_subtitle_b       text,
  ADD COLUMN IF NOT EXISTS contact_cta_message_b text,
  ADD COLUMN IF NOT EXISTS ab_enabled            boolean NOT NULL DEFAULT false;

-- landing_visits já tem RLS (SELECT do dono + INSERT público with_check=true).
-- 'kind' default 'lead' mantém compat com as linhas/insert atuais (que eram sempre leads).
ALTER TABLE public.landing_visits
  ADD COLUMN IF NOT EXISTS variant text,
  ADD COLUMN IF NOT EXISTS kind    text NOT NULL DEFAULT 'lead';

CREATE INDEX IF NOT EXISTS idx_landing_visits_ab
  ON public.landing_visits (professional_id, variant, kind);
