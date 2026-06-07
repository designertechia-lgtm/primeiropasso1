-- =============================================================================
-- Fase 0 — Fundação do Axel como Agente de IA
-- Cria as tabelas de memória persistente do Axel:
--   1. axel_conversations  -> histórico de mensagens (substitui sessionStorage)
--   2. axel_user_memory     -> fatos do usuário/relacionamento (substitui localStorage)
--
-- Segue o padrão de RLS do projeto:
--   professional_id IN (SELECT id FROM professionals WHERE user_id = auth.uid())
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Histórico de conversas do Axel
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.axel_conversations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid        NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  role            text        NOT NULL CHECK (role IN ('user', 'axel')),
  content         text        NOT NULL,
  actions         jsonb,      -- botões/ações sugeridas exibidas na UI
  follow_ups      jsonb,      -- chips de continuidade
  tool_calls      jsonb,      -- registro de tools chamadas (fases futuras)
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_axel_conversations_professional
  ON public.axel_conversations (professional_id, created_at);

ALTER TABLE public.axel_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "axel_conversations_manage_own" ON public.axel_conversations;
CREATE POLICY "axel_conversations_manage_own"
  ON public.axel_conversations
  FOR ALL TO authenticated
  USING (
    professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
  )
  WITH CHECK (
    professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 2. Memória de fatos do usuário (relacionamento)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.axel_user_memory (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid        NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  key             text        NOT NULL,   -- ex: 'objetivo', 'especialidade', 'dor', 'preferencia_tom'
  value           text        NOT NULL,
  confidence      numeric     NOT NULL DEFAULT 1,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, key)
);

CREATE INDEX IF NOT EXISTS idx_axel_user_memory_professional
  ON public.axel_user_memory (professional_id);

ALTER TABLE public.axel_user_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "axel_user_memory_manage_own" ON public.axel_user_memory;
CREATE POLICY "axel_user_memory_manage_own"
  ON public.axel_user_memory
  FOR ALL TO authenticated
  USING (
    professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
  )
  WITH CHECK (
    professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 3. Trigger para manter updated_at coerente em axel_user_memory
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.axel_user_memory_touch()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_axel_user_memory_touch ON public.axel_user_memory;
CREATE TRIGGER trg_axel_user_memory_touch
  BEFORE UPDATE ON public.axel_user_memory
  FOR EACH ROW EXECUTE FUNCTION public.axel_user_memory_touch();

COMMENT ON TABLE public.axel_conversations IS
  'Histórico persistente das conversas do profissional com o Axel (assistente IA).';
COMMENT ON TABLE public.axel_user_memory IS
  'Memória de fatos do profissional aprendidos pelo Axel (chave/valor + confiança).';
