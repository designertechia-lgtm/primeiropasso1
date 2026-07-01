-- ============================================================
-- Landing de alta conversão (modelo Daiane Cenci) — seções novas
-- Adiciona as colunas das seções Vilão, Para quem é/não é, FAQ e
-- Oferta única em `professionals`, mais a seção de Prova social com
-- fluxo de depoimento enviado pelo lead (tabela `testimonials`).
-- Idempotente: pode ser reaplicada sem erro.
-- ============================================================

-- 1. Colunas das novas seções de texto em `professionals`
ALTER TABLE public.professionals
  -- Vilão (por que nada funcionou)
  ADD COLUMN IF NOT EXISTS villain_title       text,
  ADD COLUMN IF NOT EXISTS villain_body        text,
  ADD COLUMN IF NOT EXISTS villain_image_url   text,
  -- Para quem é / para quem não é
  ADD COLUMN IF NOT EXISTS audience_title      text,
  ADD COLUMN IF NOT EXISTS audience_for        jsonb,   -- ["texto", ...] ou [{text}]
  ADD COLUMN IF NOT EXISTS audience_not_for    jsonb,
  -- FAQ
  ADD COLUMN IF NOT EXISTS faq_title           text,
  ADD COLUMN IF NOT EXISTS faq_items           jsonb,   -- [{q, a}, ...]
  -- Oferta única / como funciona (preço reusa price_* / promo_packages)
  ADD COLUMN IF NOT EXISTS offer_title         text,
  ADD COLUMN IF NOT EXISTS offer_description   text,
  ADD COLUMN IF NOT EXISTS offer_steps         jsonb,   -- [{title, desc}, ...]
  ADD COLUMN IF NOT EXISTS offer_price_note    text,
  -- Prova social (cabeçalho + liga/desliga; os depoimentos vão na tabela abaixo)
  ADD COLUMN IF NOT EXISTS testimonials_title    text,
  ADD COLUMN IF NOT EXISTS testimonials_subtitle text,
  ADD COLUMN IF NOT EXISTS testimonials_enabled  boolean NOT NULL DEFAULT false;

-- 2. Tabela de depoimentos (Prova social)
-- Fluxo: o lead envia pela landing (edge submit-testimonial, service role) → entra
-- como 'pending'. O profissional aprova/rejeita em /admin/landing. Só 'approved'
-- aparece na página pública. INSERT anônimo NÃO é permitido (só via edge).
CREATE TABLE IF NOT EXISTS public.testimonials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  author_name     TEXT NOT NULL,
  author_context  TEXT,                     -- opcional: "cliente há 1 ano", "atendimento online"
  text            TEXT NOT NULL,
  rating          INTEGER CHECK (rating BETWEEN 1 AND 5),   -- opcional (estrelas)
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
  source          TEXT NOT NULL DEFAULT 'lead'
                    CHECK (source IN ('lead','professional')),
  consent         BOOLEAN NOT NULL DEFAULT false,   -- consentimento do autor p/ publicar
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at     TIMESTAMPTZ
);

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_testimonials_owner
  ON public.testimonials (professional_id, status, sort_order);

-- 3. RLS
-- Público lê SÓ os aprovados (para a landing).
DROP POLICY IF EXISTS "Approved testimonials are viewable by everyone" ON public.testimonials;
CREATE POLICY "Approved testimonials are viewable by everyone"
  ON public.testimonials FOR SELECT USING (status = 'approved');

-- O profissional gerencia SÓ os seus (ver pendentes, aprovar, editar, excluir, criar manual).
-- Espelha professional_products. INSERT do lead não passa por aqui (vai pela edge com service role).
DROP POLICY IF EXISTS "Professionals can manage own testimonials" ON public.testimonials;
CREATE POLICY "Professionals can manage own testimonials"
  ON public.testimonials FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_id AND p.user_id = auth.uid()
    )
  );
