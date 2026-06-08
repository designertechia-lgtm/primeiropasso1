-- Preferências do agente (whatsapp-agent) por profissional — 2026-06-08
-- Estrutura esperada (ausência de chave = default LIGADO):
--   { "enabled": bool, "reminders": bool, "satisfaction": bool,
--     "tone": text, "preferred_phrases": text }
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS agent_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.professionals.agent_preferences IS
  'Preferências do agente de atendimento (whatsapp-agent): master enabled + reminders + satisfaction + tone + preferred_phrases. Chave ausente = default ligado.';
