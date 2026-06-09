-- =============================================================================
-- landing_published — fonte de verdade derivada de "o profissional personalizou a landing?"
--
-- Problema corrigido: o onboarding/Axel detectava "landing publicada" com
--   !!(hero_title || pain_title). Como hero_title tem DEFAULT
--   ('Dê o primeiro passo para uma mente equilibrada'), TODA conta nova nascia
--   com a landing "publicada" aos olhos do Axel — ele dizia "sua landing já está
--   publicada" para quem acabou de entrar.
--
-- Solução: coluna GENERATED (calculada pelo banco em qualquer escrita, presente
-- ou futura — editor por seção, tools do Axel, etc.). Ignora de propósito o
-- hero_title (campo com DEFAULT) e só considera sinais de personalização REAL.
-- NÃO setar manualmente: é derivada. Backfill é automático (STORED recalcula
-- todas as linhas existentes ao criar a coluna).
-- =============================================================================

-- DROP + ADD (idempotente): não dá pra ALTERar a expressão de uma coluna GENERATED;
-- recriar é seguro (a coluna é derivada, não guarda dado de origem).
ALTER TABLE public.professionals DROP COLUMN IF EXISTS landing_published;

ALTER TABLE public.professionals
  ADD COLUMN landing_published boolean
  GENERATED ALWAYS AS (
    -- COALESCE(..., false): jsonb_typeof/jsonb_array_length sobre coluna NULL
    -- retornam NULL e envenenariam o OR (false OR NULL = NULL). Garante false.
    COALESCE(
      (hero_subtitle IS NOT NULL AND hero_subtitle <> '')
      OR (pain_title IS NOT NULL AND pain_title <> '')
      OR (solution_title IS NOT NULL AND solution_title <> '')
      OR (pain_items IS NOT NULL AND jsonb_typeof(pain_items) = 'array' AND jsonb_array_length(pain_items) > 0)
      OR (solution_items IS NOT NULL AND jsonb_typeof(solution_items) = 'array' AND jsonb_array_length(solution_items) > 0)
      OR (hero_image_url IS NOT NULL AND hero_image_url <> ''),
      false
    )
  ) STORED;

COMMENT ON COLUMN public.professionals.landing_published IS
  'Derivada (GENERATED): true quando o profissional personalizou a landing além do template padrão. hero_title é ignorado de propósito (tem DEFAULT). Lida pelo onboarding/Axel (ler_estado_perfil + useAxelMemory). NÃO setar manualmente.';
