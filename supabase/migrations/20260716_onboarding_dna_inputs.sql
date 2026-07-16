-- ============================================================
-- Onboarding (/bem-vindo): respostas ricas do formulário de boas-vindas.
-- O gerador de DNA da Marca (edge generate-brand-bible) JÁ sabe usar estes campos
-- (público-alvo, transformação, método, diferenciais, serviços, tom, anos de
-- experiência), mas o app nunca os capturava — a ficha saía vazia e o DNA genérico.
-- Guardamos tudo num jsonb só, keyado por campo, em vez de N colunas.
-- Chaves esperadas: publico_alvo, transformacao, metodo, diferenciais, servicos,
-- tom, anos_experiencia, objetivo_plataforma. Idempotente.
-- ============================================================
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS dna_inputs jsonb;

COMMENT ON COLUMN public.professionals.dna_inputs IS
  'Respostas do onboarding /bem-vindo que enriquecem o DNA da Marca: publico_alvo, transformacao, metodo, diferenciais, servicos, tom, anos_experiencia, objetivo_plataforma. NULL = ainda não passou pelo formulário guiado.';
