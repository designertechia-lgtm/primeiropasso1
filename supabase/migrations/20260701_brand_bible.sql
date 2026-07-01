-- ============================================================
-- Tier 3 — Bíblia de Marca (fonte única). Guarda as 11 seções geradas
-- (texto/markdown por seção) + _meta (conselho/profissão) + markdown completo.
-- É a base que alimenta a geração da landing (edge generate-landing) e,
-- futuramente, WhatsApp/conteúdo/tráfego. Idempotente.
-- ============================================================
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS brand_bible jsonb;
